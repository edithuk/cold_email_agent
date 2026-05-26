import { useTheme } from '../../context/ThemeContext';
import UserMenu from '../auth/UserMenu';

export default function Header({ credStatus, email: connectedEmail, onNewCampaign, isSending, view, onBackToDashboard }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="header">
      {/* Brand */}
      <div className="header-brand">
        <div className="header-dot" />
        <span className="header-title" style={{ cursor: view === 'wizard' ? 'pointer' : 'default' }} onClick={view === 'wizard' && !isSending ? onBackToDashboard : undefined}>
          Cold Email Agent
        </span>
        {view === 'dashboard' && (
          <span className="header-subtitle">/ Campaigns</span>
        )}
        {view === 'wizard' && (
          <span className="header-subtitle" style={{ cursor: 'pointer' }} onClick={!isSending ? onBackToDashboard : undefined}>
            / <span style={{ textDecoration: 'underline', textUnderlineOffset: 2 }}>Campaigns</span> / New Campaign
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
