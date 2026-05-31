/**
 * SendQueuePage – Real-time view of all active and queued campaigns,
 * scoped to the logged-in user. Shows email preview and per-queue
 * contact list in a modal. Campaigns are account-scoped per sender email.
 */
import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { compileTemplate } from '../../utils/template';

// ── Status utilities ──────────────────────────────────────────────────────────

const STATUS_META = {
  running:        { label: 'Running',      color: 'var(--accent)',      icon: '⚡' },
  paused:         { label: 'Paused',       color: 'var(--yellow)',      icon: '⏸' },
  queued:         { label: 'Queued',       color: 'var(--text-muted)',  icon: '🕐' },
  stop_requested: { label: 'Stopping…',   color: 'var(--orange, #f97316)', icon: '⏹' },
  completed:      { label: 'Completed',    color: 'var(--green)',       icon: '✅' },
  stopped:        { label: 'Stopped',      color: 'var(--red)',         icon: '⏹' },
  failed:         { label: 'Failed',       color: 'var(--red)',         icon: '❌' },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status, color: 'var(--text-muted)', icon: '•' };
  return (
    <span style={{
      display:       'inline-flex',
      alignItems:    'center',
      gap:           4,
      padding:       '2px 8px',
      borderRadius:  20,
      fontSize:      11,
      fontWeight:    600,
      background:    `${meta.color}22`,
      color:         meta.color,
      border:        `1px solid ${meta.color}44`,
    }}>
      {['running', 'stop_requested'].includes(status) && (
        <span className="spinner" style={{ width: 8, height: 8 }} />
      )}
      {!['running', 'stop_requested'].includes(status) && meta.icon}
      {meta.label}
    </span>
  );
}

// ── Email preview modal ───────────────────────────────────────────────────────

function CampaignDetailModal({ campaign, onClose }) {
  const [activeTab, setActiveTab] = useState('contacts');
  const contacts   = campaign.contacts || [];
  const colMap     = campaign.colMap   || {};
  const stages     = campaign.stages   || [];
  const customTags = campaign.customTags || [];
  const results    = campaign.results  || {};

  const contactStatuses = contacts.map((_, i) => {
    const r = results[String(i)];
    if (!r) return 'pending';
    return r.status; // 'active' | 'success' | 'error' | 'pending'
  });

  const success = contactStatuses.filter(s => s === 'success').length;
  const failed  = contactStatuses.filter(s => s === 'error').length;
  const pending = contactStatuses.filter(s => s === 'pending' || s === 'active').length;

  // Generate a preview of the Stage 1 email for the first unprocessed contact
  const previewContact = contacts.find((_, i) => contactStatuses[i] === 'pending') || contacts[0];
  const stage0  = stages[0];
  const subject = previewContact && stage0 ? compileTemplate(stage0.subject, previewContact, colMap, customTags) : '';
  const body    = previewContact && stage0 ? compileTemplate(stage0.body,    previewContact, colMap, customTags) : '';

  return (
    <div
      style={{
        position:        'fixed',
        inset:           0,
        background:      'rgba(0,0,0,0.65)',
        backdropFilter:  'blur(4px)',
        zIndex:          1000,
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        padding:         20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background:   'var(--bg-card)',
        border:       '1px solid var(--border)',
        borderRadius: 16,
        width:        '100%',
        maxWidth:     860,
        maxHeight:    '88vh',
        display:      'flex',
        flexDirection:'column',
        overflow:     'hidden',
        boxShadow:    '0 24px 64px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{
          padding:       '20px 24px',
          borderBottom:  '1px solid var(--border)',
          display:       'flex',
          alignItems:    'center',
          justifyContent:'space-between',
          gap:           12,
          flexShrink:    0,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', marginBottom: 4 }}>
              {campaign.name || 'Untitled Campaign'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {campaign.senderEmail} · {contacts.length} contacts ·&nbsp;
              <span style={{ color: 'var(--green)'       }}>{success} sent</span> ·&nbsp;
              <span style={{ color: 'var(--red)'         }}>{failed} failed</span> ·&nbsp;
              <span style={{ color: 'var(--text-muted)'  }}>{pending} pending</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <StatusBadge status={campaign.status} />
            <button
              className="btn btn-secondary btn-sm"
              onClick={onClose}
              style={{ borderRadius: '50%', width: 32, height: 32, padding: 0, fontSize: 18 }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          display:      'flex',
          borderBottom: '1px solid var(--border)',
          flexShrink:   0,
        }}>
          {[['contacts', '📋 Contacts'], ['preview', '📧 Email Preview']].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              style={{
                padding:         '12px 20px',
                background:      'none',
                border:          'none',
                borderBottom:    activeTab === id ? '2px solid var(--accent)' : '2px solid transparent',
                color:           activeTab === id ? 'var(--accent)' : 'var(--text-muted)',
                fontWeight:      activeTab === id ? 600 : 400,
                cursor:          'pointer',
                fontSize:        13,
                transition:      'all 0.15s',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>

          {/* ── Contacts Tab ── */}
          {activeTab === 'contacts' && (
            contacts.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
                <p>No contact data stored for this campaign.</p>
              </div>
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
                    {contacts.map((row, i) => {
                      const st = contactStatuses[i];
                      return (
                        <tr
                          key={i}
                          className={
                            st === 'active'  ? 'row-active'  :
                            st === 'success' ? 'row-success' :
                            st === 'error'   ? 'row-error'   : ''
                          }
                        >
                          <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                          <td><span className={`row-status-dot ${st || ''}`} /></td>
                          {colMap.name    && <td>{row[colMap.name]}</td>}
                          {colMap.email   && <td>{row[colMap.email]}</td>}
                          {colMap.company && <td>{row[colMap.company]}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* ── Email Preview Tab ── */}
          {activeTab === 'preview' && (
            !previewContact || !stage0?.subject ? (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>✉️</div>
                <p>No email template found for this campaign.</p>
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                  Previewing Stage 1 email for:{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>
                    {previewContact[colMap.name] || previewContact[colMap.email]}
                  </strong>
                </div>
                <div className="email-preview-box">
                  <div className="email-preview-meta">
                    <div className="email-preview-meta-row">
                      <span className="email-preview-meta-label">To</span>
                      <span className="email-preview-meta-value">
                        <strong>{previewContact[colMap.name] || ''}</strong>
                        {previewContact[colMap.company] && (
                          <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
                            · {previewContact[colMap.company]}
                          </span>
                        )}
                        <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
                          ‹{previewContact[colMap.email]}›
                        </span>
                      </span>
                    </div>
                    <div className="email-preview-meta-row">
                      <span className="email-preview-meta-label">Subject</span>
                      <span className="email-preview-meta-value" style={{ fontWeight: 600 }}>
                        {subject}
                      </span>
                    </div>
                    {stages.length > 1 && (
                      <div className="email-preview-meta-row">
                        <span className="email-preview-meta-label">Follow-ups</span>
                        <span className="email-preview-meta-value" style={{ color: 'var(--text-muted)' }}>
                          {stages.length - 1} follow-up{stages.length > 2 ? 's' : ''} queued via Cloud Scheduler
                        </span>
                      </div>
                    )}
                  </div>
                  <div
                    className="email-preview-body"
                    dangerouslySetInnerHTML={{ __html: body || '<em style="color:var(--text-muted)">No body content</em>' }}
                  />
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main SendQueuePage ────────────────────────────────────────────────────────

export default function SendQueuePage({ onBack, onOpenCampaign }) {
  const { user } = useAuth();
  const [queues,   setQueues]   = useState([]);   // account_queues docs
  const [campaigns, setCampaigns] = useState({}); // campaignId → campaign data
  const [selected, setSelected] = useState(null); // campaign to show in modal
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!user) return;

    // Subscribe to account_queues collection
    const queueUnsub = onSnapshot(
      collection(db, 'users', user.uid, 'account_queues'),
      snap => {
        setQueues(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
    );

    // Subscribe to all campaigns, ordered by createdAt desc
    const campUnsub = onSnapshot(
      query(
        collection(db, 'users', user.uid, 'campaigns'),
        orderBy('createdAt', 'desc')
      ),
      snap => {
        const map = {};
        snap.docs.forEach(d => { map[d.id] = { id: d.id, ...d.data() }; });
        setCampaigns(map);
        setLoading(false);
      }
    );

    return () => { queueUnsub(); campUnsub(); };
  }, [user]);

  // Gather all active/queued/paused campaigns across all account queues
  const activeCampaignIds = new Set();
  queues.forEach(q => {
    if (q.activeCampaignId) activeCampaignIds.add(q.activeCampaignId);
    (q.pendingQueue || []).forEach(id => activeCampaignIds.add(id));
  });

  // Build ordered queue rows per sender account
  const queueRows = queues
    .filter(q => q.activeCampaignId || (q.pendingQueue || []).length > 0)
    .sort((a, b) => a.senderEmail?.localeCompare(b.senderEmail));

  // Also include recently completed / stopped campaigns from last 24h
  const recentCampaigns = Object.values(campaigns)
    .filter(c => {
      if (activeCampaignIds.has(c.id)) return false;
      if (!['completed', 'stopped', 'failed'].includes(c.status)) return false;
      // Show if updated within last 24h
      const ts = c.updatedAt?.toMillis?.() || 0;
      return Date.now() - ts < 24 * 60 * 60 * 1000;
    })
    .slice(0, 10);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
        <span className="spinner" style={{ width: 24, height: 24 }} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 20px 40px' }}>
      {/* Page header */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        gap:            16,
        marginBottom:   32,
        paddingTop:     8,
      }}>
        <button
          className="btn btn-secondary btn-sm"
          onClick={onBack}
          style={{ minWidth: 'auto', padding: '6px 12px' }}
        >
          ← Back
        </button>
        <div>
          <h2 style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)' }}>
            📬 Send Queue
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            Live view of active and queued campaigns across all sender accounts.
          </p>
        </div>
      </div>

      {/* ── Active Queues ── */}
      {queueRows.length === 0 && recentCampaigns.length === 0 ? (
        <div style={{
          background:   'var(--bg-card)',
          border:       '1px solid var(--border)',
          borderRadius: 16,
          padding:      '60px 20px',
          textAlign:    'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
          <h3 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>No Active Campaigns</h3>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>
            Start a campaign from the wizard and it will appear here in real time.
          </p>
        </div>
      ) : (
        <>
          {queueRows.map(queue => {
            const orderedIds = [
              queue.activeCampaignId,
              ...(queue.pendingQueue || []),
            ].filter(Boolean);

            return (
              <div key={queue.id} style={{ marginBottom: 32 }}>
                {/* Sender account header */}
                <div style={{
                  display:       'flex',
                  alignItems:    'center',
                  gap:           10,
                  marginBottom:  12,
                }}>
                  <div style={{
                    width:        32,
                    height:       32,
                    borderRadius: '50%',
                    background:   'var(--accent)',
                    display:      'flex',
                    alignItems:   'center',
                    justifyContent:'center',
                    color:        '#fff',
                    fontWeight:   700,
                    fontSize:     13,
                    flexShrink:   0,
                  }}>
                    {queue.senderEmail?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>
                      {queue.senderEmail}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {orderedIds.length} campaign{orderedIds.length !== 1 ? 's' : ''} in queue
                    </div>
                  </div>
                </div>

                {/* Queue cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {orderedIds.map((id, position) => {
                    const c = campaigns[id];
                    if (!c) return null;

                    const total   = c.total   || (c.contacts?.length ?? 0);
                    const sent    = c.sent    || 0;
                    const failed  = c.failed  || 0;
                    const pct     = total ? Math.round(((sent + failed) / total) * 100) : 0;
                    const isFirst = position === 0;

                    return (
                      <div
                        key={id}
                        style={{
                          background:   'var(--bg-card)',
                          border:       `1px solid ${isFirst ? 'var(--accent)44' : 'var(--border)'}`,
                          borderRadius: 12,
                          padding:      '16px 20px',
                          cursor:       'pointer',
                          transition:   'border-color 0.15s, box-shadow 0.15s',
                          position:     'relative',
                          overflow:     'hidden',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = 'var(--accent)';
                          e.currentTarget.style.boxShadow  = '0 0 0 1px var(--accent)22';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = isFirst ? 'var(--accent)44' : 'var(--border)';
                          e.currentTarget.style.boxShadow  = 'none';
                        }}
                        onClick={() => setSelected(c)}
                      >
                        {/* Queue position indicator */}
                        <div style={{
                          position:    'absolute',
                          top:         0,
                          left:        0,
                          bottom:      0,
                          width:       4,
                          background:  isFirst ? 'var(--accent)' : 'var(--border)',
                          borderRadius:'12px 0 0 12px',
                        }} />

                        <div style={{ paddingLeft: 12 }}>
                          <div style={{
                            display:        'flex',
                            alignItems:     'center',
                            justifyContent: 'space-between',
                            marginBottom:   8,
                            flexWrap:       'wrap',
                            gap:            8,
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{
                                fontWeight: 600,
                                color:      'var(--text-primary)',
                                fontSize:   14,
                              }}>
                                {c.name || 'Untitled Campaign'}
                              </span>
                              <StatusBadge status={c.status} />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {position > 0 && (
                                <span style={{
                                  fontSize:   11,
                                  color:      'var(--text-muted)',
                                  background: 'var(--bg-inset)',
                                  padding:    '2px 8px',
                                  borderRadius: 20,
                                }}>
                                  #{position + 1} in queue
                                </span>
                              )}
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={e => {
                                  e.stopPropagation();
                                  if (onOpenCampaign) onOpenCampaign(c);
                                }}
                                style={{ fontSize: 11 }}
                              >
                                Open →
                              </button>
                            </div>
                          </div>

                          {/* Progress bar */}
                          <div style={{
                            height:       4,
                            borderRadius: 2,
                            background:   'var(--bg-inset)',
                            marginBottom: 8,
                          }}>
                            <div style={{
                              height:       '100%',
                              borderRadius: 2,
                              background:   c.status === 'paused' ? 'var(--yellow)' : 'var(--accent)',
                              width:        `${pct}%`,
                              transition:   'width 0.4s ease',
                            }} />
                          </div>

                          <div style={{ display: 'flex', gap: 20, fontSize: 12, color: 'var(--text-muted)' }}>
                            <span><strong style={{ color: 'var(--text-primary)' }}>{total}</strong> total</span>
                            <span style={{ color: 'var(--green)' }}><strong>{sent}</strong> sent</span>
                            <span style={{ color: 'var(--red)'   }}><strong>{failed}</strong> failed</span>
                            <span><strong>{pct}%</strong> done</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* ── Recent completed campaigns ── */}
          {recentCampaigns.length > 0 && (
            <div>
              <h3 style={{
                fontSize:     13,
                fontWeight:   600,
                color:        'var(--text-muted)',
                marginBottom: 12,
                textTransform:'uppercase',
                letterSpacing:'0.06em',
              }}>
                Recently Completed
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recentCampaigns.map(c => (
                  <div
                    key={c.id}
                    style={{
                      background:   'var(--bg-card)',
                      border:       '1px solid var(--border)',
                      borderRadius: 12,
                      padding:      '12px 20px',
                      display:      'flex',
                      alignItems:   'center',
                      gap:          12,
                      cursor:       'pointer',
                      opacity:      0.8,
                    }}
                    onClick={() => setSelected(c)}
                  >
                    <StatusBadge status={c.status} />
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
                      {c.name || 'Untitled Campaign'}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {c.sent || 0} sent · {c.failed || 0} failed
                    </span>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={e => { e.stopPropagation(); if (onOpenCampaign) onOpenCampaign(c); }}
                      style={{ fontSize: 11 }}
                    >
                      Open →
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail modal */}
      {selected && (
        <CampaignDetailModal
          campaign={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
