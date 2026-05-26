import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function LoginPage() {
  const { signIn, signUp, signInWithGoogle } = useAuth();

  const [tab, setTab]               = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (tab === 'signin') {
        await signIn(email, password);
      } else {
        if (!displayName.trim()) { setError('Please enter your name.'); setLoading(false); return; }
        await signUp(email, password, displayName.trim());
      }
    } catch (err) {
      setError(friendlyError(err.code));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError('');
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(friendlyError(err.code));
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <div className="auth-page">
      {/* Animated background orbs */}
      <div className="auth-orb auth-orb-1" />
      <div className="auth-orb auth-orb-2" />
      <div className="auth-orb auth-orb-3" />

      <div className="auth-card">
        {/* Brand */}
        <div className="auth-brand">
          <div className="auth-logo">
            <span className="auth-logo-dot" />
            <span className="auth-logo-dot auth-logo-dot-2" />
          </div>
          <h1 className="auth-title">DripFlow</h1>
          <p className="auth-subtitle">Your personalized outreach assistant</p>
        </div>

        {/* Tabs */}
        <div className="auth-tabs">
          <button
            className={`auth-tab ${tab === 'signin' ? 'active' : ''}`}
            onClick={() => { setTab('signin'); setError(''); }}
          >
            Sign In
          </button>
          <button
            className={`auth-tab ${tab === 'signup' ? 'active' : ''}`}
            onClick={() => { setTab('signup'); setError(''); }}
          >
            Create Account
          </button>
        </div>

        {/* Google */}
        <button
          className="auth-google-btn"
          onClick={handleGoogle}
          disabled={googleLoading || loading}
          id="google-signin-btn"
        >
          {googleLoading ? (
            <span className="spinner" />
          ) : (
            <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
              <path d="M44.5 20H24v8.5h11.8C34.7 33.9 29.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6-6C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.5 20-21 0-1.3-.2-2.7-.5-4z" fill="#FFC107"/>
              <path d="M6.3 14.7l7 5.1C15.2 16.1 19.2 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6-6C34.6 5.1 29.6 3 24 3 16.3 3 9.7 7.9 6.3 14.7z" fill="#FF3D00"/>
              <path d="M24 45c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.5 35.8 26.9 37 24 37c-5.1 0-9.5-3.1-11.4-7.6l-7 5.4C9.6 41.3 16.3 45 24 45z" fill="#4CAF50"/>
              <path d="M44.5 20H24v8.5h11.8c-.9 2.9-2.9 5.3-5.5 6.8l6.6 5.6C41.3 37.2 45 31.1 45 24c0-1.3-.2-2.7-.5-4z" fill="#1976D2"/>
            </svg>
          )}
          Continue with Google
        </button>

        <div className="auth-divider">
          <span>or</span>
        </div>

        {/* Form */}
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {tab === 'signup' && (
            <div className="auth-field">
              <label htmlFor="auth-name">Full Name</label>
              <input
                id="auth-name"
                type="text"
                className="input"
                placeholder="Jane Smith"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
          )}
          <div className="auth-field">
            <label htmlFor="auth-email">Email Address</label>
            <input
              id="auth-email"
              type="email"
              className="input"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="auth-field">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              className="input"
              placeholder={tab === 'signup' ? 'At least 6 characters' : '••••••••'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
            />
          </div>

          {error && <p className="auth-error">{error}</p>}

          <button
            id="auth-submit-btn"
            type="submit"
            className="btn btn-primary btn-full"
            disabled={loading || googleLoading}
          >
            {loading ? <span className="spinner" /> : tab === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p className="auth-footer">
          {tab === 'signin'
            ? 'Don\'t have an account? '
            : 'Already have an account? '}
          <button
            className="auth-link-btn"
            onClick={() => { setTab(tab === 'signin' ? 'signup' : 'signin'); setError(''); }}
          >
            {tab === 'signin' ? 'Create one' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}

function friendlyError(code) {
  const map = {
    'auth/invalid-email':            'Please enter a valid email address.',
    'auth/user-not-found':           'No account found for this email.',
    'auth/wrong-password':           'Incorrect password. Please try again.',
    'auth/invalid-credential':       'Incorrect email or password.',
    'auth/email-already-in-use':     'An account with this email already exists.',
    'auth/weak-password':            'Password must be at least 6 characters.',
    'auth/too-many-requests':        'Too many failed attempts. Please try again later.',
    'auth/popup-closed-by-user':     'Sign-in window was closed. Please try again.',
    'auth/network-request-failed':   'Network error. Check your connection.',
  };
  return map[code] || 'An unexpected error occurred. Please try again.';
}
