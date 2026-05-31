import { useTheme } from '../../context/ThemeContext';
import UserMenu from '../auth/UserMenu';
import { useNavigate, useLocation } from 'react-router-dom';

export default function Header({ credStatus, email: connectedEmail, isSending }) {
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const isDashboard = location.pathname === '/';
  const isQueue = location.pathname === '/queue';
  const isNewCampaign = location.pathname === '/campaign/new';
  const isCampaignMonitor = location.pathname.startsWith('/campaign/') && !isNewCampaign;
  const isWizard = isNewCampaign || isCampaignMonitor;

  return (
    <header className="header">
      {/* Brand */}
      <div className="header-brand">
        <div className="header-dot" />
        <span
          className="header-title"
          style={{ cursor: !isDashboard ? 'pointer' : 'default' }}
          onClick={!isDashboard ? () => navigate('/') : undefined}
        >
          DripFlow
        </span>
        {isDashboard && (
          <span className="header-subtitle">/ Campaigns</span>
        )}
        {isQueue && (
          <span
            className="header-subtitle"
            style={{ cursor: 'pointer' }}
            onClick={() => navigate('/')}
          >
            / <span style={{ textDecoration: 'underline', textUnderlineOffset: 2 }}>Campaigns</span> / Send Queue
          </span>
        )}
        {isNewCampaign && (
          <span
            className="header-subtitle"
            style={{ cursor: 'pointer' }}
            onClick={() => navigate('/')}
          >
            / <span style={{ textDecoration: 'underline', textUnderlineOffset: 2 }}>Campaigns</span> / New Campaign
          </span>
        )}
        {isCampaignMonitor && (
          <span
            className="header-subtitle"
            style={{ cursor: 'pointer' }}
            onClick={() => navigate('/')}
          >
            / <span style={{ textDecoration: 'underline', textUnderlineOffset: 2 }}>Campaigns</span> / Campaign Monitor
          </span>
        )}
        {/* Running indicator — visible from any page when a campaign is sending */}
        {isSending && !isWizard && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            marginLeft: 12,
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--accent)',
            background: 'var(--accent)15',
            border: '1px solid var(--accent)33',
            borderRadius: 20,
            padding: '2px 8px',
          }}>
            <span className="spinner" style={{ width: 7, height: 7 }} />
            Sending
          </span>
        )}
      </div>

      {/* Right side controls */}
      <div className="header-right">
        {/* SMTP Connection status */}
        {credStatus && (
          <div className="header-status">
            <div className={`status-dot ${credStatus === 'ok' ? 'connected' : credStatus === 'error' ? 'error' : ''}`} />
            <span>
              {credStatus === 'ok' ? `Connected · ${connectedEmail}` :
                credStatus === 'error' ? 'Auth failed' :
                  credStatus === 'verifying' ? 'Verifying…' : 'Not connected'}
            </span>
          </div>
        )}

        {/* Theme Toggle */}
        <button
          id="theme-toggle-btn"
          className="theme-toggle"
          onClick={toggleTheme}
          title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          aria-label="Toggle theme"
        >
          <span className={`theme-toggle-track ${theme === 'dark' ? 'dark' : ''}`}>
            <span className="theme-toggle-thumb">
              {theme === 'light' ? '☀️' : '🌙'}
            </span>
          </span>
        </button>

        {/* User Avatar + Menu */}
        <UserMenu />
      </div>
    </header>
  );
}
