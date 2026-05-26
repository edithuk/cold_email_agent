/**
 * Step 4: Monitor – Full-width activity log, contacts status table, scheduled jobs.
 * Now includes inline pause/stop controls and a live email preview panel.
 */
import { useRef, useEffect, useMemo } from 'react';
import ScheduledJobsPanel from '../panels/ScheduledJobsPanel';
import { compileTemplate } from '../../utils/template';

function ActivityLog({ logs, setLogs }) {
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="section-header" style={{ marginBottom: 10 }}>
        <span className="section-title">Activity Log</span>
        {logs.length > 0 && (
          <button className="btn btn-secondary btn-sm" onClick={() => setLogs([])}>Clear</button>
        )}
      </div>
      <div className="console" style={{ flex: 1 }}>
        {logs.length === 0 && (
          <div className="log-line log-info">
            <span className="log-time">--:--:--</span>
            <span className="log-msg">Waiting to start…</span>
          </div>
        )}
        {logs.map((l, i) => (
          <div key={i} className={`log-line log-${l.type}`}>
            <span className="log-time">{l.time}</span>
            <span className="log-msg">{l.msg}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}

function EmailPreview({ stages, contacts, colMap, currentIdx, customTags, sending, paused }) {
  const contact = contacts[currentIdx];

  const { subject, body } = useMemo(() => {
    if (!contact || !stages?.[0]?.subject) {
      return { subject: '', body: '' };
    }
    const stage = stages[0];
    return {
      subject: compileTemplate(stage.subject, contact, colMap, customTags),
      body: compileTemplate(stage.body, contact, colMap, customTags),
    };
  }, [contact, stages, colMap, customTags]);

  const recipientName  = contact && colMap.name    ? contact[colMap.name]    : '—';
  const recipientEmail = contact && colMap.email   ? contact[colMap.email]   : '—';
  const company        = contact && colMap.company ? contact[colMap.company] : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="section-header" style={{ marginBottom: 10 }}>
        <span className="section-title">📧 Email Preview</span>
        {sending && !paused && (
          <span className="section-badge badge-info" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span className="spinner" style={{ width: 10, height: 10 }} /> Sending
          </span>
        )}
        {sending && paused && (
          <span className="section-badge badge-warn">Paused</span>
        )}
        {!sending && contacts.length > 0 && (
          <span className="section-badge badge-muted">Preview</span>
        )}
      </div>

      {!contact ? (
        <div className="email-preview-empty">
          <span style={{ fontSize: 28, opacity: 0.3 }}>✉️</span>
          <p>Email preview will appear here once sending begins.</p>
        </div>
      ) : (
        <div className="email-preview-box">
          {/* Recipient meta */}
          <div className="email-preview-meta">
            <div className="email-preview-meta-row">
              <span className="email-preview-meta-label">To</span>
              <span className="email-preview-meta-value">
                <strong>{recipientName}</strong>
                {company && <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>· {company}</span>}
                <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>‹{recipientEmail}›</span>
              </span>
            </div>
            <div className="email-preview-meta-row">
              <span className="email-preview-meta-label">Subject</span>
              <span className="email-preview-meta-value" style={{ fontWeight: 600 }}>
                {subject || <em style={{ color: 'var(--text-muted)' }}>No subject</em>}
              </span>
            </div>
            <div className="email-preview-meta-row">
              <span className="email-preview-meta-label">Contact</span>
              <span className="email-preview-meta-value" style={{ color: 'var(--text-muted)' }}>
                {currentIdx + 1} / {contacts.length}
              </span>
            </div>
          </div>
          {/* Body */}
          <div
            className="email-preview-body"
            dangerouslySetInnerHTML={{ __html: body || '<em style="color:var(--text-muted)">No body content</em>' }}
          />
        </div>
      )}
    </div>
  );
}

export default function StepMonitor({
  logs, setLogs,
  contacts, colMap, rowStatuses,
  stages, currentIdx, customTags,
  sending, paused,
  onTogglePause, onStop,
  savedStats,
}) {
  const hasLiveData = rowStatuses.length > 0;
  const total   = hasLiveData ? contacts.length                                    : (savedStats?.sent || 0) + (savedStats?.failed || 0);
  const success = hasLiveData ? rowStatuses.filter(s => s === 'success').length    : (savedStats?.sent   || 0);
  const failed  = hasLiveData ? rowStatuses.filter(s => s === 'error').length      : (savedStats?.failed || 0);
  const pending = hasLiveData ? rowStatuses.filter(s => s === 'pending').length    : 0;
  const pct     = total ? Math.round((success + failed) / total * 100) : 0;

  return (
    <>
      {/* ── Top bar: Progress + inline Pause/Stop controls ── */}
      <div style={{ marginBottom: 20, display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Progress */}
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
            <span style={{ color: 'var(--text-muted)' }}>
              {sending && !paused ? 'Sending…' :
               sending && paused  ? 'Paused' :
               pct === 100 && total > 0 ? 'Campaign Complete' : 'Ready'}
            </span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{pct}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-inset)' }}>
            <div style={{
              height: '100%', borderRadius: 3,
              background: paused ? 'var(--yellow)' : 'var(--accent)',
              width: `${pct}%`, transition: 'width 0.3s',
            }} />
          </div>
          <div style={{ display: 'flex', gap: 20, marginTop: 10, fontSize: 12 }}>
            <span style={{ color: 'var(--green)' }}><strong>{success}</strong> sent</span>
            <span style={{ color: 'var(--red)' }}><strong>{failed}</strong> failed</span>
            <span style={{ color: 'var(--text-muted)' }}><strong>{pending}</strong> pending</span>
          </div>
        </div>

        {/* Pause / Stop controls — only visible while running */}
        {sending && onTogglePause && onStop && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingTop: 2 }}>
            <button
              id="monitor-pause-btn"
              className={`btn ${paused ? 'btn-primary' : 'btn-secondary'}`}
              onClick={onTogglePause}
              style={{ minWidth: 100 }}
            >
              {paused ? '▶ Resume' : '⏸ Pause'}
            </button>
            <button
              id="monitor-stop-btn"
              className="btn btn-danger"
              onClick={onStop}
            >
              ⏹ Stop
            </button>
          </div>
        )}
      </div>

      <div className="monitor-grid">
        {/* ── Activity Log ── */}
        <div className="monitor-panel monitor-full" style={{ display: 'flex', flexDirection: 'column' }}>
          <ActivityLog logs={logs} setLogs={setLogs} />
        </div>

        {/* ── Email Preview ── */}
        <div className="monitor-panel monitor-preview" style={{ display: 'flex', flexDirection: 'column' }}>
          <EmailPreview
            stages={stages}
            contacts={contacts}
            colMap={colMap}
            currentIdx={currentIdx ?? 0}
            customTags={customTags}
            sending={sending}
            paused={paused}
          />
        </div>

        {/* ── Contacts table ── */}
        <div className="monitor-panel">
          <div className="section-header" style={{ marginBottom: 10 }}>
            <span className="section-title">Contacts</span>
          </div>
          {contacts.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No contacts.</div>
          ) : (
            <div className="contacts-table-wrap">
              <table className="contacts-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Status</th>
                    {colMap.name    && <th>Name</th>}
                    {colMap.email   && <th>Email</th>}
                    {colMap.company && <th>Company</th>}
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((row, i) => (
                    <tr
                      key={i}
                      className={
                        rowStatuses[i] === 'active'  ? 'row-active'  :
                        rowStatuses[i] === 'success' ? 'row-success' :
                        rowStatuses[i] === 'error'   ? 'row-error'   : ''
                      }
                    >
                      <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                      <td><span className={`row-status-dot ${rowStatuses[i] || ''}`} /></td>
                      {colMap.name    && <td>{row[colMap.name]}</td>}
                      {colMap.email   && <td>{row[colMap.email]}</td>}
                      {colMap.company && <td>{row[colMap.company]}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Scheduled Follow-ups ── */}
        <div className="monitor-panel">
          <ScheduledJobsPanel />
        </div>
      </div>
    </>
  );
}
