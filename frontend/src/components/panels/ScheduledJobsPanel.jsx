import { useState, useEffect, useCallback } from 'react';
import {
  collection, query, orderBy, limit, getDocs, deleteDoc, doc, onSnapshot,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';

const STAGE_LABELS = ['Initial Email', 'Follow-up 1', 'Follow-up 2', 'Follow-up 3'];

function formatDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function timeUntil(ts) {
  if (!ts) return '';
  const d    = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = d - Date.now();
  if (diff <= 0) return 'Due now';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h >= 24) return `in ${Math.floor(h / 24)}d ${h % 24}h`;
  return `in ${h}h ${m}m`;
}

export default function ScheduledJobsPanel() {
  const { user } = useAuth();
  const [jobs,     setJobs]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState('pending');  // 'pending' | 'sent' | 'failed' | 'all'
  const [cancellingId, setCancellingId] = useState(null);

  // ── Real-time listener ───────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    setLoading(true);
    const q = query(
      collection(db, 'users', user.uid, 'scheduled_jobs'),
      orderBy('sendAfter', 'asc'),
      limit(100),
    );

    const unsub = onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setJobs(list);
      setLoading(false);
    }, err => {
      console.error('[ScheduledJobsPanel]', err);
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  // ── Cancel (delete) a pending job ────────────────────────────────────────
  async function cancelJob(jobId) {
    if (!user) return;
    setCancellingId(jobId);
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'scheduled_jobs', jobId));
    } catch (err) {
      console.error('[ScheduledJobsPanel] cancel error:', err);
    } finally {
      setCancellingId(null);
    }
  }

  // ── Filter ───────────────────────────────────────────────────────────────
  const filtered = jobs.filter(j => {
    if (filter === 'all') return true;
    if (filter === 'pending') return j.status === 'pending' || j.status === 'sending';
    return j.status === filter;
  });

  const counts = {
    pending: jobs.filter(j => j.status === 'pending' || j.status === 'sending').length,
    sent:    jobs.filter(j => j.status === 'sent').length,
    failed:  jobs.filter(j => j.status === 'failed').length,
  };

  return (
    <div className="scheduled-jobs-panel">
      <div className="section-header">
        <span className="section-title">📅 Scheduled Emails</span>
        {counts.pending > 0 && (
          <span className="section-badge badge-info">{counts.pending} pending</span>
        )}
      </div>

      {/* ── Filter tabs ── */}
      <div className="jobs-filter-row">
        {[
          { key: 'pending', label: `Pending (${counts.pending})` },
          { key: 'sent',    label: `Sent (${counts.sent})` },
          { key: 'failed',  label: `Failed (${counts.failed})` },
          { key: 'all',     label: `All (${jobs.length})` },
        ].map(f => (
          <button
            key={f.key}
            className={`jobs-filter-btn ${filter === f.key ? 'active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      {loading && (
        <div className="jobs-loading">
          <span className="spinner" style={{ width: 14, height: 14 }} />
          Loading jobs…
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="jobs-empty">
          {filter === 'pending'
            ? <>
                <span style={{ fontSize: 20 }}>📭</span>
                No pending scheduled emails.<br />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Schedule a Drip campaign to queue emails for later.
                </span>
              </>
            : `No ${filter} jobs.`
          }
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="jobs-list">
          {filtered.map(job => (
            <div key={job.id} className={`job-card job-card-${job.status}`}>
              <div className="job-card-row">
                <span className="job-status-dot-wrap">
                  {job.status === 'pending' && <span className="job-dot dot-pending" title="Pending" />}
                  {job.status === 'sending' && <span className="spinner" style={{ width: 10, height: 10 }} />}
                  {job.status === 'sent'    && <span className="job-dot dot-sent"    title="Sent" />}
                  {job.status === 'failed'  && <span className="job-dot dot-failed"  title="Failed" />}
                </span>
                <div className="job-card-main">
                  <div className="job-card-title">
                    <span className="job-stage-badge">{STAGE_LABELS[job.stageIdx] || job.stageLabel || `Stage ${job.stageIdx + 1}`}</span>
                    <span className="job-email">{job.contactEmail}</span>
                    {job.contactName && (
                      <span className="job-name"> · {job.contactName}</span>
                    )}
                  </div>
                  <div className="job-card-meta">
                    {job.status === 'pending' || job.status === 'sending' ? (
                      <>
                        <span className="job-meta-label">Fires:</span>
                        <span className="job-send-time">{formatDate(job.sendAfter)}</span>
                        <span className="job-time-until">{timeUntil(job.sendAfter)}</span>
                      </>
                    ) : job.status === 'sent' ? (
                      <>
                        <span className="job-meta-label">Sent:</span>
                        <span className="job-send-time">{formatDate(job.sentAt)}</span>
                      </>
                    ) : (
                      <>
                        <span className="job-meta-label" style={{ color: 'var(--red)' }}>Error:</span>
                        <span className="job-error">{job.error}</span>
                      </>
                    )}
                  </div>
                  <div className="job-subject-preview">
                    {job.subject?.replace(/<[^>]+>/g, '') || '(no subject)'}
                  </div>
                </div>

                {/* Cancel button (pending only) */}
                {(job.status === 'pending') && (
                  <button
                    className="job-cancel-btn"
                    onClick={() => cancelJob(job.id)}
                    disabled={cancellingId === job.id}
                    title="Cancel this scheduled follow-up"
                  >
                    {cancellingId === job.id ? '…' : '✕'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
