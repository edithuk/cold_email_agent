import { useRef, useState } from 'react';
import {
  collection, addDoc, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { compileTemplate, sleep } from '../../utils/template';
import { isStageScheduled } from '../../utils/stageUtils';

const API_BASE = '';
const STAGE_LABELS = ['Initial Email', 'Follow-up 1', 'Follow-up 2', 'Follow-up 3'];

export default function SendControls({
  email,
  appPassword,
  contacts,
  colMap,
  stages,
  resume,
  customTags,
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
  // Optional: external refs from App.jsx for shared pause/stop state
  pausedRef: externalPausedRef,
  stopRef: externalStopRef,
  // Optional: external handlers for monitor-level controls
  onTogglePause: externalTogglePause,
  onStop: externalStop,
}) {
  const { user } = useAuth();
  const internalPausedRef = useRef(false);
  const internalStopRef = useRef(false);
  const pausedRef = externalPausedRef || internalPausedRef;
  const stopRef = externalStopRef || internalStopRef;

  // Campaign mode: 'drip' | 'selective'
  const [campaignMode, setCampaignMode] = useState('drip');
  const [selectedStage, setSelectedStage] = useState(0);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const total = contacts.length;
  const success = rowStatuses.filter(s => s === 'success').length;
  const queued  = rowStatuses.filter(s => s === 'queued').length;
  const failed  = rowStatuses.filter(s => s === 'error').length;
  const pending = rowStatuses.filter(s => s === 'pending').length;
  // 'queued' rows are not yet sent — exclude from progress %
  const pct = total ? Math.round(((success + failed) / total) * 100) : 0;
  const hasTemplate = stages.some(s => s.subject && s.body);

  // ── Single email dispatch via Express backend ─────────────────────────────
  async function sendEmailNow({ recipientEmail, recipientName, subject, body, row }) {
    const compiledBody = compileTemplate(body, row, colMap, customTags);
    const compiledSubject = compileTemplate(subject, row, colMap, customTags);
    const res = await fetch(`${API_BASE}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderEmail: email,
        senderPassword: appPassword,
        recipientEmail,
        recipientName,
        subject: compiledSubject,
        body: compiledBody,
        attachment: resume || null,
      }),
    });
    return res.json();
  }

  // ── Queue any stage job to Firestore ─────────────────────────────────────
  // baseTimeMs: optional base timestamp for relative follow-ups (chains off Stage 0 if scheduled)
  async function queueJob({ row, stage, stageIdx, baseTimeMs }) {
    if (!user) return;

    // Compute sendAfter timestamp based on scheduling mode
    let sendAfterMs;
    if (stage.delayMode === 'absolute' && stage.sendAt) {
      sendAfterMs = new Date(stage.sendAt).getTime();
      if (isNaN(sendAfterMs) || sendAfterMs <= Date.now()) {
        throw new Error(`Invalid or past date for ${STAGE_LABELS[stageIdx]}`);
      }
    } else {
      // Relative: days + hours from baseTimeMs (defaults to now for follow-ups)
      const base = baseTimeMs ?? Date.now();
      const defaultDays = stageIdx === 0 ? 0 : 3;
      const days = (stage.delayDays ?? defaultDays) * 24 * 60 * 60 * 1000;
      const hours = (stage.delayHours ?? 0) * 60 * 60 * 1000;
      sendAfterMs = base + days + hours;
    }

    await addDoc(collection(db, 'users', user.uid, 'scheduled_jobs'), {
      userId: user.uid,
      contactEmail: row[colMap.email]?.toString().trim() || '',
      contactName: colMap.name ? row[colMap.name]?.toString().trim() : '',
      contactRow: row,
      stageIdx,
      stageLabel: STAGE_LABELS[stageIdx] || `Stage ${stageIdx + 1}`,
      subject: stage.subject || '',
      body: stage.body || '',
      colMap,
      customTags: customTags || [],
      resumeBase64: resume?.base64 || null,
      resumeFilename: resume?.name || null,
      sendAfter: Timestamp.fromMillis(sendAfterMs),
      status: 'pending',
      error: null,
      sentAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return sendAfterMs;
  }


  // ── Pause-safe sleep helper ───────────────────────────────────────────────
  async function waitWhilePaused() {
    while (pausedRef.current) {
      await sleep(300);
      if (stopRef.current) return;
    }
  }

  // ── DRIP mode ─────────────────────────────────────────────────────────────
  // If Stage 0 has a scheduled delay → queue it + follow-ups to Firestore.
  // If Stage 0 has 0 delay → send immediately + queue follow-ups from now.
  async function runDripLoop() {
    const statuses = [...rowStatuses];
    const stage0 = stages[0];
    const isScheduled = isStageScheduled(stage0);

    for (let i = currentIdx; i < contacts.length; i++) {
      if (stopRef.current) { addLog('Stopped by user.', 'warn'); break; }
      await waitWhilePaused();
      if (stopRef.current) break;

      const row = contacts[i];
      const recipientEmail = row[colMap.email]?.toString().trim();
      const recipientName = colMap.name ? row[colMap.name]?.toString().trim() : '';

      setCurrentIdx(i);
      statuses[i] = 'active';
      setRowStatuses([...statuses]);

      if (!stage0.subject || !stage0.body) {
        addLog(`[${i + 1}/${total}] Skipped — Stage 1 has no template.`, 'warn');
        statuses[i] = 'error';
        setRowStatuses([...statuses]);
        continue;
      }

      // ── Path A: Stage 0 is SCHEDULED → queue it, chain follow-ups off it ──
      if (isScheduled) {
        let stage0SendAfterMs = null;
        try {
          stage0SendAfterMs = await queueJob({ row, stage: stage0, stageIdx: 0 });
          const fireTime = new Date(stage0SendAfterMs).toLocaleString(undefined, {
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
          addLog(`[${i + 1}/${total}] ⚠ Failed to schedule ${STAGE_LABELS[0]} for ${recipientEmail}: ${qErr.message}`, 'warn');
          statuses[i] = 'error';
          setRowStatuses([...statuses]);
        }

        // Queue follow-ups chained off Stage 0's scheduled time.
        // Defer the row's final status write until here so a follow-up
        // failure is reflected in the UI (row goes 'error' instead of 'success').
        if (stage0SendAfterMs) {
          let followUpsFailed = false;
          if (stages.length > 1) {
            for (let sIdx = 1; sIdx < stages.length; sIdx++) {
              const stage = stages[sIdx];
              if (!stage.subject || !stage.body) continue;
              try {
                const sendAfterMs = await queueJob({ row, stage, stageIdx: sIdx, baseTimeMs: stage0SendAfterMs });
                const fireTime = new Date(sendAfterMs).toLocaleString(undefined, {
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                });
                const delayLabel = stage.delayMode === 'absolute' && stage.sendAt
                  ? `on ${fireTime}`
                  : (() => {
                    const d = stage.delayDays ?? 3;
                    const h = stage.delayHours ?? 0;
                    return `+${d}d${h > 0 ? ` ${h}h` : ''} after initial (${fireTime})`;
                  })();
                addLog(
                  `📅 ${STAGE_LABELS[sIdx]} queued → ${recipientEmail} — fires ${delayLabel}`,
                  'system'
                );
              } catch (qErr) {
                followUpsFailed = true;
                addLog(`⚠ Failed to queue ${STAGE_LABELS[sIdx]} for ${recipientEmail}: ${qErr.message}`, 'warn');
              }
            }
          }
          // 'queued' = Stage 0 written to Firestore but not yet sent
          statuses[i] = followUpsFailed ? 'error' : 'queued';
          setRowStatuses([...statuses]);
        }
      } else {
        // ── Path B: Stage 0 sends IMMEDIATELY ────────────────────────────────
        addLog(`[${i + 1}/${total}] Sending ${STAGE_LABELS[0]} → ${recipientEmail}…`, 'info');

        let stage0Success = false;
        try {
          const data = await sendEmailNow({
            recipientEmail, recipientName, row,
            subject: stage0.subject,
            body: stage0.body,
          });
          if (data.success) {
            stage0Success = true;
            addLog(`✓ ${STAGE_LABELS[0]} sent → ${recipientEmail}`, 'success');
          } else {
            addLog(`✗ ${STAGE_LABELS[0]} failed (${recipientEmail}): ${data.error}`, 'error');
          }
        } catch (err) {
          addLog(`✗ Network error (${recipientEmail}): ${err.message}`, 'error');
        }

        statuses[i] = stage0Success ? 'success' : 'error';
        setRowStatuses([...statuses]);

        // Queue follow-ups relative to now (original behaviour)
        if (stage0Success && stages.length > 1) {
          for (let sIdx = 1; sIdx < stages.length; sIdx++) {
            const stage = stages[sIdx];
            if (!stage.subject || !stage.body) continue;
            try {
              const sendAfterMs = await queueJob({ row, stage, stageIdx: sIdx });
              const fireTime = new Date(sendAfterMs).toLocaleString(undefined, {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
              });
              const delayLabel = stage.delayMode === 'absolute' && stage.sendAt
                ? `on ${fireTime}`
                : (() => {
                  const d = stage.delayDays ?? 3;
                  const h = stage.delayHours ?? 0;
                  return `in ${d}d${h > 0 ? ` ${h}h` : ''} (${fireTime})`;
                })();
              addLog(
                `📅 ${STAGE_LABELS[sIdx]} queued → ${recipientEmail} — fires ${delayLabel}`,
                'system'
              );
            } catch (qErr) {
              addLog(`⚠ Failed to queue ${STAGE_LABELS[sIdx]} for ${recipientEmail}: ${qErr.message}`, 'warn');
            }
          }
        }
      }

      // Inter-contact delay
      if (i < contacts.length - 1 && !stopRef.current) {
        addLog(`Waiting ${delay}s before next contact…`, 'info');
        await sleep(delay * 1000);
      }
    }
    return statuses;
  }

  // ── SELECTIVE mode: send one specific stage now ───────────────────────────
  async function runSelectiveLoop(stageIdx) {
    const stage = stages[stageIdx];
    const statuses = [...rowStatuses];

    for (let i = currentIdx; i < contacts.length; i++) {
      if (stopRef.current) { addLog('Stopped by user.', 'warn'); break; }
      await waitWhilePaused();
      if (stopRef.current) break;

      const row = contacts[i];
      const recipientEmail = row[colMap.email]?.toString().trim();
      const recipientName = colMap.name ? row[colMap.name]?.toString().trim() : '';

      setCurrentIdx(i);
      statuses[i] = 'active';
      setRowStatuses([...statuses]);
      addLog(`[${i + 1}/${total}] ${STAGE_LABELS[stageIdx]} → ${recipientEmail}…`, 'info');

      try {
        const data = await sendEmailNow({
          recipientEmail, recipientName, row,
          subject: stage.subject,
          body: stage.body,
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

  // ── Entry point ───────────────────────────────────────────────────────────
  async function startSending() {
    if (!email || !appPassword) { addLog('Enter Gmail credentials first.', 'warn'); return; }
    if (!contacts.length) { addLog('Upload a contacts file first.', 'warn'); return; }
    if (!colMap.email) { addLog('Map the Email column first.', 'warn'); return; }
    if (!hasTemplate) { addLog('Enter subject and body in at least Stage 1.', 'warn'); return; }

    stopRef.current = false;
    pausedRef.current = false;
    setPaused(false);
    setSending(true);
    if (onLaunch) onLaunch();

    const modeLabel = campaignMode === 'drip'
      ? `Drip (Stage 1 now + ${stages.length - 1} follow-up${stages.length > 2 ? 's' : ''} scheduled)`
      : `Selective: ${STAGE_LABELS[selectedStage]}`;

    addLog(`Starting — ${contacts.length} contacts · ${modeLabel} · ${delay}s delay between contacts.`, 'system');

    const finalStatuses = campaignMode === 'drip'
      ? await runDripLoop()
      : await runSelectiveLoop(selectedStage);

    setSending(false);
    if (!stopRef.current) {
      const s = (finalStatuses || []).filter(x => x === 'success').length;
      const f = (finalStatuses || []).filter(x => x === 'error').length;
      addLog(`Done! ${s} sent, ${f} failed.`, 'system');
      if (onSendComplete) onSendComplete({ sent: s, failed: f });
    }
  }

  function togglePause() {
    if (externalTogglePause) { externalTogglePause(); return; }
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
    addLog(pausedRef.current ? 'Paused.' : 'Resumed.', 'warn');
  }

  function stopSending() {
    if (externalStop) { externalStop(); return; }
    stopRef.current = true;
    pausedRef.current = false;
    setPaused(false);
  }

  function resetAll() {
    stopRef.current = true;
    pausedRef.current = false;
    setSending(false);
    setPaused(false);
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
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaign_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ minWidth: 0 }}>
      <div className="section-header">
        <span className="section-title">05 · Send Controls</span>
        {sending && !paused && <span className="section-badge badge-info"><span className="spinner" style={{ marginRight: 4 }} />Running</span>}
        {sending && paused && <span className="section-badge badge-warn">Paused</span>}
        {!sending && success > 0 && <span className="section-badge badge-success">{pct}% done</span>}
      </div>

      {/* ── Campaign Mode selector ── */}
      {!sending && (
        <div className="campaign-mode-selector">
          <span className="campaign-mode-label">Mode:</span>
          <button
            className={`campaign-mode-btn ${campaignMode === 'drip' ? 'active' : ''}`}
            onClick={() => setCampaignMode('drip')}
            title="Send Stage 1 now — follow-ups auto-fire via Cloud Function on real schedule"
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
                : `+${stage.delayDays ?? 0}d`)
              : (idx > 0
                ? (stage.delayMode === 'absolute' && stage.sendAt
                  ? new Date(stage.sendAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                  : `+${stage.delayDays ?? 3}d`)
                : null);
            return (
              <span key={idx} className="drip-summary-step">
                {idx > 0 && <span className="drip-summary-arrow">→ {delayLabel} →</span>}
                {idx === 0 && isStage0Sched && <span className="drip-summary-arrow">📅 {delayLabel} →</span>}
                <span className="drip-summary-stage">{STAGE_LABELS[idx]}</span>
              </span>
            );
          })}
          <span className="drip-real-badge">⏰ real-time cloud schedule</span>
        </div>
      )}

      {/* Progress bar */}
      <div className="progress-bar-wrap" style={{ marginTop: 10 }}>
        <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>

      {/* Stats */}
      <div className="progress-stats" style={{ marginTop: 10 }}>
        <div className="stat-box">
          <div className="stat-value accent">{total}</div>
          <div className="stat-label">Total</div>
        </div>
        <div className="stat-box">
          <div className="stat-value success">{success}</div>
          <div className="stat-label">Sent</div>
        </div>
        <div className="stat-box">
          <div className="stat-value error">{failed}</div>
          <div className="stat-label">Failed</div>
        </div>
        <div className="stat-box">
          <div className="stat-value neutral">{pending}</div>
          <div className="stat-label">Pending</div>
        </div>
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
