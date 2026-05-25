import { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import UserMenu from '../auth/UserMenu';

export default function Header({ credStatus, email: connectedEmail, onNewCampaign, isSending }) {
  const { theme, toggleTheme } = useTheme();
  const [confirming, setConfirming] = useState(false);

  function handleNewCampaign() {
    if (confirming) {
      onNewCampaign();
      setConfirming(false);
    } else {
      setConfirming(true);
      // Auto-cancel after 3s if user doesn't confirm
      setTimeout(() => setConfirming(false), 3000);
    }
  }

  return (
    <header className="header">
      {/* Brand */}
      <div className="header-brand">
        <div className="header-dot" />
        <span className="header-title">Cold Email Agent</span>
        <span className="header-subtitle">/ Recruiter Outreach</span>
      </div>

      {/* Right side controls */}
      <div className="header-right">
        {/* SMTP Connection status */}
        <div className="header-status">
          <div className={`status-dot ${credStatus === 'ok' ? 'connected' : credStatus === 'error' ? 'error' : ''}`} />
          <span>
            {credStatus === 'ok'        ? `Connected · ${connectedEmail}` :
             credStatus === 'error'     ? 'Auth failed' :
             credStatus === 'verifying' ? 'Verifying…' : 'Not connected'}
          </span>
        </div>

        {/* New Campaign button */}
        <button
          id="new-campaign-btn"
          className={`btn btn-sm new-campaign-btn ${confirming ? 'confirming' : ''}`}
          onClick={handleNewCampaign}
          disabled={isSending}
          title={isSending ? 'Cannot reset while sending is in progress' : 'Clear template, contacts & resume — keep Gmail credentials'}
        >
          {confirming ? '⚠ Confirm clear?' : '＋ New Campaign'}
        </button>

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
