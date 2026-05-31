import { useTheme } from '../../context/ThemeContext';
import UserMenu from '../auth/UserMenu';

export default function Header({ credStatus, email: connectedEmail, onNewCampaign, isSending, view, onBackToDashboard }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="header">
      {/* Brand */}
      <div className="header-brand">
        <div className="header-dot" />
        <span className="header-title" style={{ cursor: view === 'wizard' ? 'pointer' : 'default' }} onClick={view === 'wizard' ? onBackToDashboard : undefined}>
          DripFlow
        </span>
        {view === 'dashboard' && (
          <span className="header-subtitle">/ Campaigns</span>
        )}
        {view === 'wizard' && (
          <span className="header-subtitle" style={{ cursor: 'pointer' }} onClick={onBackToDashboard}>
            / <span style={{ textDecoration: 'underline', textUnderlineOffset: 2 }}>Campaigns</span> / New Campaign
          </span>
        )}
        {/* Running indicator — visible from any page when a campaign is sending */}
        {isSending && view !== 'wizard' && (
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
              {credStatus === 'ok'        ? `Connected · ${connectedEmail}` :
               credStatus === 'error'     ? 'Auth failed' :
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
