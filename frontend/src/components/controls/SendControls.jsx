import { useRef } from 'react';
import { compileTemplate, sleep } from '../../utils/template';

const API_BASE = '';

export default function SendControls({
  email,
  appPassword,
  contacts,
  colMap,
  subject,
  body,
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
  const pausedRef = useRef(false);
  const stopRef   = useRef(false);

  // ── Derived stats ─────────────────────────────────────────────────────────
  const total   = contacts.length;
  const success = rowStatuses.filter(s => s === 'success').length;
  const failed  = rowStatuses.filter(s => s === 'error').length;
  const pending = rowStatuses.filter(s => s === 'pending').length;
  const pct     = total ? Math.round(((success + failed) / total) * 100) : 0;

  // ── Sending loop ──────────────────────────────────────────────────────────
  async function startSending() {
    if (!email || !appPassword) { addLog('Enter Gmail credentials first.', 'warn'); return; }
    if (!contacts.length)       { addLog('Upload a contacts file first.', 'warn'); return; }
    if (!colMap.email)          { addLog('Map the Email column first.', 'warn'); return; }
    if (!subject || !body)      { addLog('Enter subject and body template.', 'warn'); return; }

    stopRef.current   = false;
    pausedRef.current = false;
    setPaused(false);
    setSending(true);
    addLog(`Starting — ${contacts.length} recipients, ${delay}s delay between emails.`, 'system');

    const statuses = [...rowStatuses];
    for (let i = currentIdx; i < contacts.length; i++) {
      if (stopRef.current) { addLog('Stopped by user.', 'warn'); break; }

      while (pausedRef.current) {
        await sleep(300);
        if (stopRef.current) break;
      }
      if (stopRef.current) { addLog('Stopped by user.', 'warn'); break; }

      const row             = contacts[i];
      const recipientEmail  = row[colMap.email]?.toString().trim();
      const recipientName   = colMap.name ? row[colMap.name]?.toString().trim() : '';
      const compiledBody    = compileTemplate(body,    row, colMap, customTags);
      const compiledSubject = compileTemplate(subject, row, colMap, customTags);

      setCurrentIdx(i);
      statuses[i] = 'active';
      setRowStatuses([...statuses]);
      addLog(`[${i + 1}/${contacts.length}] Sending to ${recipientEmail}${recipientName ? ` (${recipientName})` : ''}…`, 'info');

      try {
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
        const data = await res.json();
        if (data.success) {
          statuses[i] = 'success';
          addLog(`✓ Sent to ${recipientEmail}`, 'success');
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

    setSending(false);
    if (!stopRef.current) {
      const s = statuses.filter(x => x === 'success').length;
      const f = statuses.filter(x => x === 'error').length;
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

      {/* Progress bar */}
      <div className="progress-bar-wrap">
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
        <span className="delay-label">Delay between emails</span>
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
            disabled={!contacts.length || !subject || !body || !email || !appPassword}
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
