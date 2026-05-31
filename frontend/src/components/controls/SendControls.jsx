import { useRef, useState } from 'react';
import {
  collection, addDoc, serverTimestamp, Timestamp,
  doc, onSnapshot,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { compileTemplate, sleep } from '../../utils/template';
import { isStageScheduled } from '../../utils/stageUtils';

const API_BASE    = '';
const STAGE_LABELS = ['Initial Email', 'Follow-up 1', 'Follow-up 2', 'Follow-up 3'];

export default function SendControls({
  email,
  appPassword,
  contacts,
  colMap,
  stages,
  resume,
  customTags,
  campaignName,
  // State passed from parent
  sending, setSending,
  paused, setPaused,
  delay, setDelay,
  rowStatuses, setRowStatuses,
  currentIdx, setCurrentIdx,
  setLogs,
  addLog,
  onLaunch,
  hideSendButton,
  onSendComplete,
  onCampaignStarted,   // NEW: callback(campaignId) → App.jsx stores it for recovery
  // Optional: external refs from App.jsx for shared pause/stop state (legacy)
  pausedRef: externalPausedRef,
  stopRef: externalStopRef,
  // Optional: external handlers for monitor-level controls (selective mode)
  onTogglePause: externalTogglePause,
  onStop: externalStop,
}) {
  const { user } = useAuth();
  const internalPausedRef = useRef(false);
  const internalStopRef   = useRef(false);
  const pausedRef = externalPausedRef || internalPausedRef;
  const stopRef   = externalStopRef   || internalStopRef;

  // Track the active server-side campaign ID (for drip mode pause/stop)
  const [serverCampaignId, setServerCampaignId] = useState(null);
  const snapshotUnsubRef = useRef(null);

  // Campaign mode: 'drip' | 'selective'
  const [campaignMode, setCampaignMode] = useState('drip');
  const [selectedStage, setSelectedStage] = useState(0);

  // ── Derived stats ────────────────────────────────────────────────────────
  const total   = contacts.length;
  const success = rowStatuses.filter(s => s === 'success').length;
  const queued  = rowStatuses.filter(s => s === 'queued').length;
  const failed  = rowStatuses.filter(s => s === 'error').length;
  const pending = rowStatuses.filter(s => s === 'pending').length;
  const pct     = total ? Math.round(((success + failed) / total) * 100) : 0;
  const hasTemplate = stages.some(s => s.subject && s.body);

  // ── Single email dispatch via Express backend (selective mode) ────────────
  async function sendEmailNow({ recipientEmail, recipientName, subject, body, row }) {
    const compiledBody    = compileTemplate(body,    row, colMap, customTags);
    const compiledSubject = compileTemplate(subject, row, colMap, customTags);
    const res = await fetch(`${API_BASE}/api/send-email`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        senderEmail:    email,
        senderPassword: appPassword,
        recipientEmail,
        recipientName,
        subject: compiledSubject,
        body:    compiledBody,
        attachment: resume || null,
      }),
    });
    return res.json();
  }

  // ── Queue a follow-up job to Firestore (selective mode) ──────────────────
  async function queueJob({ row, stage, stageIdx, baseTimeMs }) {
    if (!user) return;

    let sendAfterMs;
    if (stage.delayMode === 'absolute' && stage.sendAt) {
      sendAfterMs = new Date(stage.sendAt).getTime();
      if (isNaN(sendAfterMs) || sendAfterMs <= Date.now()) {
        throw new Error(`Invalid or past date for ${STAGE_LABELS[stageIdx]}`);
      }
    } else {
      const base        = baseTimeMs ?? Date.now();
      const defaultDays = stageIdx === 0 ? 0 : 3;
      const days        = (stage.delayDays  ?? defaultDays) * 24 * 60 * 60 * 1000;
      const hours       = (stage.delayHours ?? 0) * 60 * 60 * 1000;
      sendAfterMs       = base + days + hours;
    }

    await addDoc(collection(db, 'users', user.uid, 'scheduled_jobs'), {
      userId:         user.uid,
      contactEmail:   row[colMap.email]?.toString().trim() || '',
      contactName:    colMap.name ? row[colMap.name]?.toString().trim() : '',
      contactRow:     row,
      stageIdx,
      stageLabel:     STAGE_LABELS[stageIdx] || `Stage ${stageIdx + 1}`,
      subject:        stage.subject || '',
      body:           stage.body    || '',
      colMap,
      customTags:     customTags || [],
      resumeBase64:   resume?.base64 || null,
      resumeFilename: resume?.name   || null,
      sendAfter:      Timestamp.fromMillis(sendAfterMs),
      status:         'pending',
      error:          null,
      sentAt:         null,
      createdAt:      serverTimestamp(),
      updatedAt:      serverTimestamp(),
    });

    return sendAfterMs;
  }

  // ── Pause-safe sleep (selective mode) ────────────────────────────────────
  async function waitWhilePaused() {
    while (pausedRef.current) {
      await sleep(300);
      if (stopRef.current) return;
    }
  }

  // ── SERVER-SIDE DRIP MODE ─────────────────────────────────────────────────
  // Sends campaign data to /api/start-campaign, then subscribes to the
  // campaign doc in Firestore for real-time progress updates.
  async function startDripServerSide() {
    if (!user) { addLog('Not authenticated.', 'warn'); return; }

    setSending(true);
    if (onLaunch) onLaunch();

    try {
      const token = await user.getIdToken();
      const res   = await fetch(`${API_BASE}/api/start-campaign`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          contacts,
          stages,
          colMap,
          customTags:     customTags    || [],
          delaySeconds:   delay,
          campaignName:   campaignName  || '',
          resumeBase64:   resume?.base64 || null,
          resumeFilename: resume?.name   || null,
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to start campaign');

      const { campaignId, queued: isQueued, queuePosition } = data;

      // Persist for page-reload recovery
      localStorage.setItem('activeCampaignId', campaignId);
      localStorage.setItem('activeCampaignUid', user.uid);
      setServerCampaignId(campaignId);
      if (onCampaignStarted) onCampaignStarted(campaignId);

      if (isQueued) {
        addLog(
          `⏳ Campaign queued at position ${queuePosition} — will start when the current campaign finishes.`,
          'system'
        );
      } else {
        addLog(
          `🚀 Campaign started server-side! Processing ${contacts.length} contact${contacts.length !== 1 ? 's' : ''} in ${Math.ceil(contacts.length / 25)} chunk(s).`,
          'system'
        );
      }

      // Initialise all rows as pending in UI
      const initStatuses = new Array(contacts.length).fill('pending');
      setRowStatuses(initStatuses);

      // Subscribe to real-time updates from the campaign document
      if (snapshotUnsubRef.current) snapshotUnsubRef.current();
      snapshotUnsubRef.current = onSnapshot(
        doc(db, 'users', user.uid, 'campaigns', campaignId),
        (snap) => {
          if (!snap.exists()) return;
          const d = snap.data();

          // Derive rowStatuses array from the results map
          const statuses = contacts.map((_, i) => {
            const r = d.results?.[String(i)];
            if (!r) return 'pending';
            return r.status; // 'active' | 'success' | 'error' | 'pending'
          });
          setRowStatuses(statuses);

          // Track current active contact
          const activeIdx = statuses.findIndex(s => s === 'active');
          if (activeIdx >= 0) setCurrentIdx(activeIdx);

          // Sync paused state
          setPaused(d.status === 'paused');

          // Update sending flag
          const isActive = ['running', 'queued', 'paused', 'stop_requested'].includes(d.status);
          setSending(isActive);

          // Handle terminal states
          if (['completed', 'stopped', 'failed'].includes(d.status)) {
            if (snapshotUnsubRef.current) {
              snapshotUnsubRef.current();
              snapshotUnsubRef.current = null;
            }
            localStorage.removeItem('activeCampaignId');
            localStorage.removeItem('activeCampaignUid');
            setSending(false);
            setServerCampaignId(null);

            const sent   = d.sent   || 0;
            const failed = d.failed || 0;
            if (onSendComplete) onSendComplete({ sent, failed });

            const icon = d.status === 'completed' ? '✅' : d.status === 'stopped' ? '⏹' : '❌';
            addLog(
              `${icon} Campaign ${d.status}. ${sent} sent, ${failed} failed.`,
              d.status === 'completed' ? 'success' : 'warn'
            );
          }
        },
        (err) => {
          console.error('[SendControls] Snapshot error:', err);
          addLog(`Snapshot error: ${err.message}`, 'error');
        }
      );

    } catch (err) {
      addLog(`✗ Failed to start campaign: ${err.message}`, 'error');
      setSending(false);
    }
  }

  // ── SERVER-SIDE PAUSE / STOP (drip mode) ─────────────────────────────────
  async function pauseServerCampaign(id) {
    try {
      const token = await user.getIdToken();
      await fetch(`${API_BASE}/api/pause-campaign`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body:    JSON.stringify({ campaignId: id }),
      });
      addLog('⏸ Pause requested — will pause after current email.', 'warn');
    } catch (err) {
      addLog(`Failed to pause: ${err.message}`, 'error');
    }
  }

  async function resumeServerCampaign(id) {
    try {
      const token = await user.getIdToken();
      await fetch(`${API_BASE}/api/resume-campaign`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body:    JSON.stringify({ campaignId: id }),
      });
      addLog('▶ Resumed.', 'system');
    } catch (err) {
      addLog(`Failed to resume: ${err.message}`, 'error');
    }
  }

  async function stopServerCampaign(id) {
    try {
      const token = await user.getIdToken();
      await fetch(`${API_BASE}/api/stop-campaign`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body:    JSON.stringify({ campaignId: id }),
      });
      addLog('⏹ Stop requested — will stop after current email.', 'warn');
    } catch (err) {
      addLog(`Failed to stop: ${err.message}`, 'error');
    }
  }

  // ── SELECTIVE MODE loop (browser-side, unchanged) ─────────────────────────
  async function runSelectiveLoop(stageIdx) {
    const stage    = stages[stageIdx];
    const statuses = [...rowStatuses];

    for (let i = currentIdx; i < contacts.length; i++) {
      if (stopRef.current) { addLog('Stopped by user.', 'warn'); break; }
      await waitWhilePaused();
      if (stopRef.current) break;

      const row            = contacts[i];
      const recipientEmail = row[colMap.email]?.toString().trim();
      const recipientName  = colMap.name ? row[colMap.name]?.toString().trim() : '';

      setCurrentIdx(i);
      statuses[i] = 'active';
      setRowStatuses([...statuses]);
      addLog(`[${i + 1}/${total}] ${STAGE_LABELS[stageIdx]} → ${recipientEmail}…`, 'info');

      try {
        const data = await sendEmailNow({
          recipientEmail, recipientName, row,
          subject: stage.subject,
          body:    stage.body,
        });
        if (data.success) {
          statuses[i] = 'success';
          addLog(`✓ Sent → ${recipientEmail}`, 'success');
        } else {
          statuses[i] = 'error';
          addLog(`✗ Failed (${recipientEmail}): ${data.error}`, 'error');
        }
      } catch (err) {
        statuses[i] = 'error';
        addLog(`✗ Network error (${recipientEmail}): ${err.message}`, 'error');
      }

      setRowStatuses([...statuses]);

      if (i < contacts.length - 1 && !stopRef.current) {
        addLog(`Waiting ${delay}s before next email…`, 'info');
        await sleep(delay * 1000);
      }
    }
    return statuses;
  }

  // ── DRIP LOOP – scheduled mode (browser-side, for when Stage 0 is scheduled) ──
  // Only used for the "Stage 0 is scheduled to future date" path.
  // The "send immediately" drip path now goes server-side.
  async function runDripScheduledLoop() {
    const statuses = [...rowStatuses];
    const stage0   = stages[0];

    for (let i = currentIdx; i < contacts.length; i++) {
      if (stopRef.current) { addLog('Stopped by user.', 'warn'); break; }
      await waitWhilePaused();
      if (stopRef.current) break;

      const row            = contacts[i];
      const recipientEmail = row[colMap.email]?.toString().trim();
      const recipientName  = colMap.name ? row[colMap.name]?.toString().trim() : '';

      setCurrentIdx(i);
      statuses[i] = 'active';
      setRowStatuses([...statuses]);

      if (!stage0.subject || !stage0.body) {
        addLog(`[${i + 1}/${total}] Skipped — Stage 1 has no template.`, 'warn');
        statuses[i] = 'error';
        setRowStatuses([...statuses]);
        continue;
      }

      let stage0SendAfterMs = null;
      try {
        stage0SendAfterMs = await queueJob({ row, stage: stage0, stageIdx: 0 });
        const fireTime  = new Date(stage0SendAfterMs).toLocaleString(undefined, {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        });
        const delayLabel = stage0.delayMode === 'absolute' && stage0.sendAt
          ? `on ${fireTime}`
          : (() => {
            const d = stage0.delayDays ?? 0;
            const h = stage0.delayHours ?? 0;
            return `in ${d}d${h > 0 ? ` ${h}h` : ''} (${fireTime})`;
          })();
        addLog(
          `[${i + 1}/${total}] 📅 ${STAGE_LABELS[0]} scheduled → ${recipientEmail} — fires ${delayLabel}`,
          'system'
        );
      } catch (qErr) {
        addLog(`[${i + 1}/${total}] ⚠ Failed to schedule for ${recipientEmail}: ${qErr.message}`, 'warn');
        statuses[i] = 'error';
        setRowStatuses([...statuses]);
        continue;
      }

      if (stage0SendAfterMs) {
        let followUpsFailed = false;
        for (let sIdx = 1; sIdx < stages.length; sIdx++) {
          const stage = stages[sIdx];
          if (!stage.subject || !stage.body) continue;
          try {
            const sendAfterMs = await queueJob({ row, stage, stageIdx: sIdx, baseTimeMs: stage0SendAfterMs });
            const fireTime    = new Date(sendAfterMs).toLocaleString(undefined, {
              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
            });
            const delayLabel = stage.delayMode === 'absolute' && stage.sendAt
              ? `on ${fireTime}`
              : (() => {
                const d = stage.delayDays ?? 3;
                const h = stage.delayHours ?? 0;
                return `+${d}d${h > 0 ? ` ${h}h` : ''} after initial (${fireTime})`;
              })();
            addLog(`📅 ${STAGE_LABELS[sIdx]} queued → ${recipientEmail} — fires ${delayLabel}`, 'system');
          } catch (qErr) {
            followUpsFailed = true;
            addLog(`⚠ Failed to queue ${STAGE_LABELS[sIdx]} for ${recipientEmail}: ${qErr.message}`, 'warn');
          }
        }
        statuses[i] = followUpsFailed ? 'error' : 'queued';
        setRowStatuses([...statuses]);
      }

      if (i < contacts.length - 1 && !stopRef.current) {
        addLog(`Waiting ${delay}s before next contact…`, 'info');
        await sleep(delay * 1000);
      }
    }
    return statuses;
  }

  // ── Entry point ──────────────────────────────────────────────────────────
  async function startSending() {
    if (!email || !appPassword) { addLog('Enter Gmail credentials first.', 'warn'); return; }
    if (!contacts.length)       { addLog('Upload a contacts file first.', 'warn'); return; }
    if (!colMap.email)          { addLog('Map the Email column first.', 'warn'); return; }
    if (!hasTemplate)           { addLog('Enter subject and body in at least Stage 1.', 'warn'); return; }

    stopRef.current   = false;
    pausedRef.current = false;

    if (campaignMode === 'drip') {
      const stage0       = stages[0];
      const isScheduled  = isStageScheduled(stage0);

      if (!isScheduled) {
        // Stage 0 sends immediately → use server-side processing (page-close-safe)
        await startDripServerSide();
        return;
      }

      // Stage 0 is scheduled to a future time → use browser-side loop (queues to Firestore)
      setPaused(false);
      setSending(true);
      if (onLaunch) onLaunch();
      addLog(`Starting scheduled drip — ${contacts.length} contacts · ${delay}s delay.`, 'system');
      const finalStatuses = await runDripScheduledLoop();
      setSending(false);
      if (!stopRef.current) {
        const s = (finalStatuses || []).filter(x => x === 'success' || x === 'queued').length;
        const f = (finalStatuses || []).filter(x => x === 'error').length;
        addLog(`Done! ${s} scheduled, ${f} failed.`, 'system');
        if (onSendComplete) onSendComplete({ sent: s, failed: f });
      }
      return;
    }

    // Selective mode — browser-side
    setPaused(false);
    setSending(true);
    if (onLaunch) onLaunch();
    addLog(`Starting — ${contacts.length} contacts · ${STAGE_LABELS[selectedStage]} · ${delay}s delay.`, 'system');
    const finalStatuses = await runSelectiveLoop(selectedStage);
    setSending(false);
    if (!stopRef.current) {
      const s = (finalStatuses || []).filter(x => x === 'success').length;
      const f = (finalStatuses || []).filter(x => x === 'error').length;
      addLog(`Done! ${s} sent, ${f} failed.`, 'system');
      if (onSendComplete) onSendComplete({ sent: s, failed: f });
    }
  }

  // ── Unified pause/stop — routes to API or legacy ref depending on mode ──
  function togglePause() {
    if (serverCampaignId) {
      // Server-side drip campaign
      if (paused) {
        resumeServerCampaign(serverCampaignId);
      } else {
        pauseServerCampaign(serverCampaignId);
      }
      return;
    }
    // Legacy browser-side (selective / scheduled drip)
    if (externalTogglePause) { externalTogglePause(); return; }
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
    addLog(pausedRef.current ? 'Paused.' : 'Resumed.', 'warn');
  }

  function stopSending() {
    if (serverCampaignId) {
      stopServerCampaign(serverCampaignId);
      return;
    }
    // Legacy browser-side
    if (externalStop) { externalStop(); return; }
    stopRef.current   = true;
    pausedRef.current = false;
    setPaused(false);
  }

  function resetAll() {
    stopRef.current   = true;
    pausedRef.current = false;
    if (snapshotUnsubRef.current) { snapshotUnsubRef.current(); snapshotUnsubRef.current = null; }
    setSending(false);
    setPaused(false);
    setServerCampaignId(null);
    setRowStatuses(new Array(contacts.length).fill('pending'));
    setCurrentIdx(0);
    setLogs([]);
  }

  // ── Export campaign report ────────────────────────────────────────────────
  function exportReport() {
    if (!contacts.length) return;
    const rows = contacts.map((row, i) => ({
      ...row,
      'Outreach Status': rowStatuses[i] === 'success' ? 'Sent'
        : rowStatuses[i] === 'queued'  ? 'Scheduled'
        : rowStatuses[i] === 'error'   ? 'Failed'
        : 'Pending',
    }));
    const csv = [
      Object.keys(rows[0]).join(','),
      ...rows.map(r =>
        Object.values(r).map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `campaign_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ minWidth: 0 }}>
      <div className="section-header">
        <span className="section-title">05 · Send Controls</span>
        {sending && !paused && <span className="section-badge badge-info"><span className="spinner" style={{ marginRight: 4 }} />Running</span>}
        {sending && paused  && <span className="section-badge badge-warn">Paused</span>}
        {!sending && success > 0 && <span className="section-badge badge-success">{pct}% done</span>}
      </div>

      {/* ── Campaign Mode selector ── */}
      {!sending && (
        <div className="campaign-mode-selector">
          <span className="campaign-mode-label">Mode:</span>
          <button
            className={`campaign-mode-btn ${campaignMode === 'drip' ? 'active' : ''}`}
            onClick={() => setCampaignMode('drip')}
            title="Send Stage 1 now (server-side) — follow-ups auto-fire via Cloud Function on real schedule"
          >
            ⚡ Drip Sequence
          </button>
          <button
            className={`campaign-mode-btn ${campaignMode === 'selective' ? 'active' : ''}`}
            onClick={() => setCampaignMode('selective')}
            title="Send only one specific stage to all contacts right now"
          >
            🎯 Selective Stage
          </button>
        </div>
      )}

      {/* Stage picker (selective mode only) */}
      {campaignMode === 'selective' && !sending && (
        <div className="selective-stage-picker">
          <span className="campaign-mode-label">Send:</span>
          {stages.map((_, idx) => (
            <button
              key={idx}
              className={`campaign-mode-btn ${selectedStage === idx ? 'active' : ''}`}
              onClick={() => setSelectedStage(idx)}
            >
              {STAGE_LABELS[idx] || `Stage ${idx + 1}`}
            </button>
          ))}
        </div>
      )}

      {/* Drip mode info strip */}
      {campaignMode === 'drip' && !sending && (
        <div className="drip-summary">
          {stages.map((stage, idx) => {
            const isStage0Sched = idx === 0 && isStageScheduled(stage);
            const delayLabel = isStage0Sched
              ? (stage.delayMode === 'absolute' && stage.sendAt
                ? new Date(stage.sendAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                : (stage.delayHours ?? 0) > 0 && !(stage.delayDays ?? 0)
                  ? `+${stage.delayHours}h`
                  : `+${stage.delayDays ?? 0}d${(stage.delayHours ?? 0) > 0 ? ` ${stage.delayHours}h` : ''}`)
              : (idx > 0
                ? (stage.delayMode === 'absolute' && stage.sendAt
                  ? new Date(stage.sendAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                  : (stage.delayDays != null || (stage.delayHours ?? 0) > 0)
                    ? `+${stage.delayDays ?? 0}d${(stage.delayHours ?? 0) > 0 ? ` ${stage.delayHours}h` : ''}`
                    : '+3d')
                : null);
            return (
              <span key={idx} className="drip-summary-step">
                {idx > 0 && <span className="drip-summary-arrow">→ {delayLabel} →</span>}
                {idx === 0 && isStage0Sched && <span className="drip-summary-arrow">📅 {delayLabel} →</span>}
                <span className="drip-summary-stage">{STAGE_LABELS[idx]}</span>
              </span>
            );
          })}
          {!isStageScheduled(stages[0]) && (
            <span className="drip-real-badge">☁️ server-side · page-close safe</span>
          )}
          {isStageScheduled(stages[0]) && (
            <span className="drip-real-badge">⏰ real-time cloud schedule</span>
          )}
        </div>
      )}

      {/* Progress bar */}
      <div className="progress-bar-wrap" style={{ marginTop: 10 }}>
        <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>

      {/* Stats */}
      <div className="progress-stats" style={{ marginTop: 10 }}>
        <div className="stat-box"><div className="stat-value accent">{total}</div><div className="stat-label">Total</div></div>
        <div className="stat-box"><div className="stat-value success">{success}</div><div className="stat-label">Sent</div></div>
        <div className="stat-box"><div className="stat-value error">{failed}</div><div className="stat-label">Failed</div></div>
        <div className="stat-box"><div className="stat-value neutral">{pending}</div><div className="stat-label">Pending</div></div>
      </div>

      {/* Delay slider */}
      <div className="delay-row">
        <span className="delay-label">Delay between contacts</span>
        <input
          id="delay-slider"
          type="range"
          min="5"
          max="120"
          step="5"
          value={delay}
          onChange={e => setDelay(Number(e.target.value))}
          disabled={sending}
        />
        <span className="delay-value">{delay}s</span>
      </div>

      {/* Action buttons */}
      <div className="controls-row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
        {!sending && !hideSendButton ? (
          <button
            id="send-btn"
            className="btn btn-primary"
            disabled={!contacts.length || !hasTemplate || !email || !appPassword}
            onClick={startSending}
          >
            ▶ Send Emails
          </button>
        ) : sending ? (
          <>
            <button id="pause-btn" className="btn btn-secondary" onClick={togglePause}>
              {paused ? '▶ Resume' : '⏸ Pause'}
            </button>
            <button id="stop-btn" className="btn btn-danger" onClick={stopSending}>
              ⏹ Stop
            </button>
          </>
        ) : null}

        {!sending && (success > 0 || failed > 0) && (
          <button id="reset-btn" className="btn btn-secondary" onClick={resetAll}>↺ Reset</button>
        )}

        {(success > 0 || failed > 0) && (
          <button id="export-btn" className="btn btn-secondary" onClick={exportReport} title="Download campaign report as CSV">
            ⬇ Export
          </button>
        )}
      </div>

      {/* Hidden trigger — lets the wizard nav bar fire startSending remotely */}
      <button
        id="send-controls-trigger"
        style={{ display: 'none' }}
        onClick={startSending}
        aria-hidden="true"
      />
    </div>
  );
}
