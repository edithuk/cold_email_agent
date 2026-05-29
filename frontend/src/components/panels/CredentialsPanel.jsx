import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { encryptField, decryptField } from '../../utils/crypto';

const API_BASE = '';

export default function CredentialsPanel({ onCredChange }) {
  const { user } = useAuth();

  const [email, setEmail] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [credStatus, setCredStatus] = useState('idle');   // idle|verifying|ok|error
  const [credMsg, setCredMsg] = useState('');
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── Load from Firestore on mount ──────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid, 'profile', 'smtp'));
        if (snap.exists()) {
          const data = snap.data();
          const decrypted = await decryptField(data.encryptedPassword, user.uid);
          if (data.gmailAddress) setEmail(data.gmailAddress);
          if (decrypted) setAppPassword(decrypted);
          if (data.gmailAddress && decrypted) {
            setCloudLoaded(true);
            setCredStatus('ok');
            setCredMsg('Credentials loaded from your account ☁');

            // ── Migration: older docs only have 'gmailAddress', not 'email'.
            // The Cloud Function reads 'email', so patch it silently if missing.
            if (!data.email && data.gmailAddress) {
              try {
                await setDoc(
                  doc(db, 'users', user.uid, 'profile', 'smtp'),
                  { email: data.gmailAddress },
                  { merge: true }
                );
              } catch (patchErr) {
                console.warn('[CredentialsPanel] Migration patch failed:', patchErr.message);
              }
            }
          }
        }
      } catch (err) {
        console.warn('[CredentialsPanel] Firestore load failed:', err.message);
      }
    }
    load();
  }, [user]);

  // Keep parent App in sync
  useEffect(() => {
    onCredChange?.({ email, appPassword, credStatus });
  }, [email, appPassword, credStatus, onCredChange]);

  // ── Verify + save ─────────────────────────────────────────────────────────
  async function verifyCredentials() {
    setCredStatus('verifying');
    setCredMsg('');
    try {
      const res = await fetch(`${API_BASE}/api/validate-credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderEmail: email, senderPassword: appPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setCredStatus('ok');
        setCredMsg('Gmail connection verified.');
        await saveToFirestore();
      } else {
        setCredStatus('error');
        setCredMsg(data.error);
      }
    } catch {
      setCredStatus('error');
      setCredMsg('Cannot reach backend. Is it running on port 3001?');
    }
  }

  const saveToFirestore = useCallback(async () => {
    if (!user || !email || !appPassword) return;
    setSaving(true);
    try {
      const encrypted = await encryptField(appPassword, user.uid);
      // Write both 'gmailAddress' (canonical) and 'email' (backwards-compat)
      // so both frontend loads and the Cloud Function scheduler can read it.
      await setDoc(doc(db, 'users', user.uid, 'profile', 'smtp'), {
        gmailAddress: email,
        email: email,          // Cloud Function reads this field
        encryptedPassword: encrypted,
        savedAt: new Date(),
        updatedAt: new Date(),
      });
      setCloudLoaded(true);
      setCredMsg('Gmail connection verified ✓ Credentials saved to your account.');
    } catch (err) {
      console.warn('[CredentialsPanel] Firestore save failed:', err.message);
    } finally {
      setSaving(false);
    }
  }, [user, email, appPassword]);

  async function forgetCredentials() {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'profile', 'smtp'), {
        gmailAddress: '',
        email: '',     // clear both fields
        encryptedPassword: '',
      });
    } catch { }
    setEmail('');
    setAppPassword('');
    setCredStatus('idle');
    setCredMsg('');
    setCloudLoaded(false);
  }

  return (
    <div>
      <div className="section-header">
        <span className="section-title">01 · Gmail Account</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {cloudLoaded && <span className="section-badge badge-info">☁ Cloud</span>}
          {credStatus === 'ok' && <span className="section-badge badge-success">Verified</span>}
          {credStatus === 'error' && <span className="section-badge badge-error">Failed</span>}
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="email-input">Gmail Address</label>
        <input
          id="email-input"
          className="input"
          type="email"
          placeholder="you@gmail.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label htmlFor="apppassword-input">App Password</label>
        <div className="input-with-btn">
          <input
            id="apppassword-input"
            className="input"
            type="password"
            placeholder="xxxx xxxx xxxx xxxx"
            value={appPassword}
            onChange={e => setAppPassword(e.target.value)}
          />
          <button
            id="verify-btn"
            className="btn btn-secondary btn-sm"
            disabled={credStatus === 'verifying' || !email || !appPassword}
            onClick={verifyCredentials}
          >
            {credStatus === 'verifying' ? <span className="spinner" /> : saving ? '💾' : 'Verify'}
          </button>
        </div>
      </div>

      {credMsg && (
        <p style={{ fontSize: 12, color: credStatus === 'ok' ? 'var(--green)' : 'var(--red)', marginTop: 4 }}>
          {credMsg}
        </p>
      )}

      {cloudLoaded && (
        <button
          className="btn btn-secondary btn-sm"
          style={{ marginTop: 8 }}
          onClick={forgetCredentials}
        >
          🗑 Forget saved credentials
        </button>
      )}

      {/* Help callout */}
      <div style={{ marginTop: 10 }}>
        <span className="collapsible-trigger" onClick={() => setShowHelp(h => !h)}>
          <span className={`chevron ${showHelp ? 'open' : ''}`}>▶</span>
          How to get an App Password
        </span>
        {showHelp && (
          <div className="help-callout" style={{ marginTop: 8 }}>
            <strong>Requires 2-Step Verification enabled on your Google account.</strong>
            <ol className="help-steps">
              <li>Go to <a href="https://myaccount.google.com" target="_blank" rel="noreferrer">myaccount.google.com</a></li>
              <li>Search &ldquo;App Passwords&rdquo; in the search bar</li>
              <li>Create a new one — name it &ldquo;Cold Email Agent&rdquo;</li>
              <li>Copy the 16-character code and paste it above</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
