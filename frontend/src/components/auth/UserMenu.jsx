import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function UserMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen]   = useState(false);
  const menuRef           = useRef(null);

  // Close on outside click
  useEffect(() => {
    function handler(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const initials = user?.displayName
    ? user.displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? '?';

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        id="user-avatar-btn"
        className="user-avatar"
        onClick={() => setOpen(o => !o)}
        title={user?.displayName || user?.email}
      >
        {user?.photoURL ? (
          <img src={user.photoURL} alt="avatar" className="user-avatar-img" />
        ) : (
          <span className="user-avatar-initials">{initials}</span>
        )}
      </button>

      {open && (
        <div className="user-dropdown">
          <div className="user-dropdown-header">
            <div className="user-dropdown-name">{user?.displayName || 'User'}</div>
            <div className="user-dropdown-email">{user?.email}</div>
          </div>
          <div className="user-dropdown-divider" />
          <button
            id="signout-btn"
            className="user-dropdown-item user-dropdown-item-danger"
            onClick={() => { setOpen(false); signOut(); }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
