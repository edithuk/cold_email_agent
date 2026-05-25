import { useRef, useState } from 'react';
import {
  collection, addDoc, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { compileTemplate, sleep } from '../../utils/template';

const API_BASE   = '';
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
  paused,  setPaused,
  delay,   setDelay,
  rowStatuses, setRowStatuses,
  currentIdx,  setCurrentIdx,
  setLogs,
  addLog,
}) {
  const { user }  = useAuth();
  const pausedRef = useRef(false);
  const stopRef   = useRef(false);

  // Campaign mode: 'drip' | 'selective'
  const [campaignMode,  setCampaignMode]  = useState('drip');
  const [selectedStage, setSelectedStage] = useState(0);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const total   = contacts.length;
  const success = rowStatuses.filter(s => s === 'success').length;
  const failed  = rowStatuses.filter(s => s === 'error').length;
  const pending = rowStatuses.filter(s => s === 'pending').length;
  const pct     = total ? Math.round(((success + failed) / total) * 100) : 0;
  const hasTemplate = stages.some(s => s.subject && s.body);

  // ── Single email dispatch via Express backend ─────────────────────────────
  async function sendEmailNow({ recipientEmail, recipientName, subject, body, row }) {
    const compiledBody    = compileTemplate(body,    row, colMap, customTags);
    const compiledSubject = compileTemplate(subject, row, colMap, customTags);
    const res = await fetch(`${API_BASE}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderEmail:    email,
        senderPassword: appPassword,
        recipientEmail,
        recipientName,
        subject:    compiledSubject,
        body:       compiledBody,
        attachment: resume || null,
      }),
    });
    return res.json();
  }

  // ── Queue a follow-up job to Firestore ────────────────────────────────────
  async function queueFollowUp({ row, stage, stageIdx }) {
    if (!user) return;

    // Compute sendAfter timestamp based on scheduling mode
    let sendAfterMs;
    if (stage.delayMode === 'absolute' && stage.sendAt) {
      sendAfterMs = new Date(stage.sendAt).getTime();
      if (isNaN(sendAfterMs) || sendAfterMs <= Date.now()) {
        throw new Error(`Invalid or past date for ${STAGE_LABELS[stageIdx]}`);
      }
    } else {
      // Relative: days + hours from now
      const days  = (stage.delayDays  ?? 3) * 24 * 60 * 60 * 1000;
      const hours = (stage.delayHours ?? 0) * 60 * 60 * 1000;
      sendAfterMs = Date.now() + days + hours;
    }

    await addDoc(collection(db, 'users', user.uid, 'scheduled_jobs'), {
      userId:        user.uid,
      contactEmail:  row[colMap.email]?.toString().trim() || '',
      contactName:   colMap.name ? row[colMap.name]?.toString().trim() : '',
      contactRow:    row,
      stageIdx,
      stageLabel:    STAGE_LABELS[stageIdx] || `Stage ${stageIdx + 1}`,
      subject:       stage.subject || '',
      body:          stage.body    || '',
      colMap,
      customTags:    customTags || [],
      resumeBase64:  resume?.base64 || null,
      resumeFilename: resume?.name  || null,
      sendAfter:     Timestamp.fromMillis(sendAfterMs),
      status:        'pending',
      error:         null,
      sentAt:        null,
      createdAt:     serverTimestamp(),
      updatedAt:     serverTimestamp(),
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

  // ── DRIP mode: send Stage 1 now → queue Stages 2+ to Firestore ───────────
  async function runDripLoop() {
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

      // Stage 0 (Initial Email) — send right now
      const stage0 = stages[0];
      if (!stage0.subject || !stage0.body) {
        addLog(`[${i + 1}/${total}] Skipped — Stage 1 has no template.`, 'warn');
        statuses[i] = 'error';
        setRowStatuses([...statuses]);
        continue;
      }

      addLog(`[${i + 1}/${total}] Sending ${STAGE_LABELS[0]} → ${recipientEmail}…`, 'info');

      let stage0Success = false;
      try {
        const data = await sendEmailNow({
          recipientEmail, recipientName, row,
          subject: stage0.subject,
          body:    stage0.body,
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

      // Only queue follow-ups if Stage 1 succeeded
      if (stage0Success && stages.length > 1) {
        for (let sIdx = 1; sIdx < stages.length; sIdx++) {
          const stage = stages[sIdx];
          if (!stage.subject || !stage.body) continue;
          try {
            const sendAfterMs = await queueFollowUp({ row, stage, stageIdx: sIdx });
            const fireTime = new Date(sendAfterMs).toLocaleString(undefined, {
              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
            });
            const delayLabel = stage.delayMode === 'absolute' && stage.sendAt
              ? `on ${fireTime}`
              : (() => {
                  const d = stage.delayDays  ?? 3;
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


      // Inter-contact delay
      if (i < contacts.length - 1 && !stopRef.current) {
        addLog(`Waiting ${delay}s before next contact…`, 'info');
        await sleep(delay * 1000);
      }
    }
  }

  // ── SELECTIVE mode: send one specific stage now ───────────────────────────
  async function runSelectiveLoop(stageIdx) {
    const stage   = stages[stageIdx];
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
  }

  // ── Entry point ───────────────────────────────────────────────────────────
  async function startSending() {
    if (!email || !appPassword)  { addLog('Enter Gmail credentials first.', 'warn'); return; }
    if (!contacts.length)         { addLog('Upload a contacts file first.', 'warn'); return; }
    if (!colMap.email)            { addLog('Map the Email column first.', 'warn'); return; }
    if (!hasTemplate)             { addLog('Enter subject and body in at least Stage 1.', 'warn'); return; }

    stopRef.current   = false;
    pausedRef.current = false;
    setPaused(false);
    setSending(true);

    const modeLabel = campaignMode === 'drip'
      ? `Drip (Stage 1 now + ${stages.length - 1} follow-up${stages.length > 2 ? 's' : ''} scheduled)`
      : `Selective: ${STAGE_LABELS[selectedStage]}`;

    addLog(`Starting — ${contacts.length} contacts · ${modeLabel} · ${delay}s delay between contacts.`, 'system');

    if (campaignMode === 'drip') {
      await runDripLoop();
    } else {
      await runSelectiveLoop(selectedStage);
    }

    setSending(false);
    if (!stopRef.current) {
      const s = rowStatuses.filter(x => x === 'success').length;
      const f = rowStatuses.filter(x => x === 'error').length;
      addLog(`Done! ${s} sent, ${f} failed.`, 'system');
    }
  }

  function togglePause() {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
    addLog(pausedRef.current ? 'Paused.' : 'Resumed.', 'warn');
  }

  function stopSending() {
    stopRef.current   = true;
    pausedRef.current = false;
    setPaused(false);
  }

  function resetAll() {
    stopRef.current   = true;
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
      'Outreach Status': rowStatuses[i] === 'success' ? 'Sent' : rowStatuses[i] === 'error' ? 'Failed' : 'Pending',
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
        {sending && paused   && <span className="section-badge badge-warn">Paused</span>}
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
      {campaignMode === 'drip' && stages.length > 1 && !sending && (
        <div className="drip-summary">
          {stages.map((stage, idx) => (
            <span key={idx} className="drip-summary-step">
              {idx > 0 && <span className="drip-summary-arrow">→ +{stage.delayDays}d →</span>}
              <span className="drip-summary-stage">{STAGE_LABELS[idx]}</span>
            </span>
          ))}
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
        {!sending ? (
          <button
            id="send-btn"
            className="btn btn-primary"
            disabled={!contacts.length || !hasTemplate || !email || !appPassword}
            onClick={startSending}
          >
            ▶ Send Emails
          </button>
        ) : (
          <>
            <button id="pause-btn" className="btn btn-secondary" onClick={togglePause}>
              {paused ? '▶ Resume' : '⏸ Pause'}
            </button>
            <button id="stop-btn" className="btn btn-danger" onClick={stopSending}>
              ⏹ Stop
            </button>
          </>
        )}

        {!sending && (success > 0 || failed > 0) && (
          <button id="reset-btn" className="btn btn-secondary" onClick={resetAll}>↺ Reset</button>
        )}

        {(success > 0 || failed > 0) && (
          <button id="export-btn" className="btn btn-secondary" onClick={exportReport} title="Download campaign report as CSV">
            ⬇ Export
          </button>
        )}
      </div>
    </div>
  );
}
