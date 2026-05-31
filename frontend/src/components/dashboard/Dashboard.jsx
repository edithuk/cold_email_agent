/**
 * Dashboard – Campaign history grid with quick stats.
 */
export default function Dashboard({ campaigns, onNewCampaign, onOpenCampaign, onOpenQueue }) {
  // Aggregate stats across all campaigns
  const totalSent   = campaigns.reduce((s, c) => s + (c.sent || 0), 0);
  const totalFailed = campaigns.reduce((s, c) => s + (c.failed || 0), 0);
  const successRate = totalSent > 0
    ? Math.round(((totalSent - totalFailed) / totalSent) * 100)
    : 0;
  const totalContacts = campaigns.reduce((s, c) => s + (c.contacts || 0), 0);

  function formatDate(ts) {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return (
    <div className="dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <div className="dashboard-title">Campaigns</div>
          <div className="dashboard-subtitle">
            Manage and track all your outreach campaigns
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onOpenQueue}>
            📬 Send Queue
          </button>
          <button className="btn btn-primary" onClick={onNewCampaign}>
            + New Campaign
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {campaigns.length > 0 && (
        <div className="stats-bar">
          <div className="stat-card">
            <div className="stat-value">{campaigns.length}</div>
            <div className="stat-label">Campaigns</div>
          </div>
          <div className="stat-card">
            <div className="stat-value green">{totalSent}</div>
            <div className="stat-label">Emails Sent</div>
          </div>
          <div className="stat-card">
            <div className="stat-value accent">{successRate}%</div>
            <div className="stat-label">Success Rate</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{totalContacts}</div>
            <div className="stat-label">Total Contacts</div>
          </div>
        </div>
      )}

      {/* Campaign cards grid */}
      {campaigns.length === 0 ? (
        <div className="dashboard-empty">
          <div className="dashboard-empty-icon">📬</div>
          <h3>No campaigns yet</h3>
          <p>Create your first outreach campaign to start sending personalized cold emails at scale.</p>
          <button className="btn btn-primary" onClick={onNewCampaign}>
            + New Campaign
          </button>
        </div>
      ) : (
        <div className="campaign-grid">
          {campaigns.map(c => (
            <div key={c.id} className="campaign-card" onClick={() => onOpenCampaign(c)}>
              <div className="campaign-card-header">
                <span className="campaign-card-name">{c.name || 'Untitled Campaign'}</span>
                <span className={`campaign-status-badge ${c.status || 'draft'}`}>
                  {c.status || 'draft'}
                </span>
              </div>
              <div className="campaign-card-date">{formatDate(c.createdAt)}</div>
              <div className="campaign-card-stats">
                <span className="campaign-stat"><strong>{c.contacts || 0}</strong> contacts</span>
                <span className="campaign-stat"><strong>{c.sent || 0}</strong> sent</span>
                <span className="campaign-stat"><strong>{c.failed || 0}</strong> failed</span>
                <span className="campaign-stat"><strong>{c.stages || 1}</strong> stage{(c.stages || 1) > 1 ? 's' : ''}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
