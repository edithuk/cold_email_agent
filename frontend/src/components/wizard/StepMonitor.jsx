/**
 * Step 4: Monitor – Full-width activity log, contacts status table, scheduled jobs.
 */
import { useRef, useEffect } from 'react';
import ScheduledJobsPanel from '../panels/ScheduledJobsPanel';

function ActivityLog({ logs }) {
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);
  return (
    <div className="console">
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
  );
}

export default function StepMonitor({
  logs, setLogs,
  contacts, colMap, rowStatuses,
  sending,
  savedStats,   // fallback when viewing a historical campaign
}) {
  // If rowStatuses has live data, use it. Otherwise fall back to savedStats.
  const hasLiveData = rowStatuses.length > 0;
  const total   = hasLiveData ? contacts.length                                     : (savedStats?.sent || 0) + (savedStats?.failed || 0);
  const success = hasLiveData ? rowStatuses.filter(s => s === 'success').length     : (savedStats?.sent   || 0);
  const failed  = hasLiveData ? rowStatuses.filter(s => s === 'error').length       : (savedStats?.failed || 0);
  const pending = hasLiveData ? rowStatuses.filter(s => s === 'pending').length     : 0;
  const pct     = total ? Math.round((success + failed) / total * 100) : 0;

  return (
    <>
      {/* Progress bar */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
          <span style={{ color: 'var(--text-muted)' }}>
            {sending ? 'Sending…' : pct === 100 && total > 0 ? 'Campaign Complete' : 'Ready'}
          </span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{pct}%</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-inset)' }}>
          <div style={{ height: '100%', borderRadius: 3, background: 'var(--accent)', width: `${pct}%`, transition: 'width 0.3s' }} />
        </div>
        <div style={{ display: 'flex', gap: 20, marginTop: 10, fontSize: 12 }}>
          <span style={{ color: 'var(--green)' }}><strong>{success}</strong> sent</span>
          <span style={{ color: 'var(--red)' }}><strong>{failed}</strong> failed</span>
          <span style={{ color: 'var(--text-muted)' }}><strong>{pending}</strong> pending</span>
        </div>
      </div>

      <div className="monitor-grid">
        {/* Activity Log */}
        <div className="monitor-panel monitor-full">
          <div className="section-header" style={{ marginBottom: 10 }}>
            <span className="section-title">Activity Log</span>
            {logs.length > 0 && (
              <button className="btn btn-secondary btn-sm" onClick={() => setLogs([])}>Clear</button>
            )}
          </div>
          <ActivityLog logs={logs} />
        </div>

        {/* Contacts */}
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

        {/* Scheduled Follow-ups */}
        <div className="monitor-panel">
          <ScheduledJobsPanel />
        </div>
      </div>
    </>
  );
}
