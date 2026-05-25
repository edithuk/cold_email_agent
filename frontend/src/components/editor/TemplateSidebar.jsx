import { useState, useEffect } from 'react';
import {
  collection, addDoc, getDocs, doc, updateDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';

export default function TemplateSidebar({ open, onClose, stages, customTags, onLoad }) {
  const { user } = useAuth();
  const [templates,     setTemplates]     = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [saveName,      setSaveName]      = useState('');
  const [saveIsPublic,  setSaveIsPublic]  = useState(false);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [deletingId,    setDeletingId]    = useState(null);

  // Status banner: { type: 'success'|'error'|'info', msg: string }
  const [status, setStatus] = useState(null);

  function showStatus(type, msg, durationMs = 3500) {
    setStatus({ type, msg });
    setTimeout(() => setStatus(null), durationMs);
  }

  // ── Fetch templates ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!open || !user) return;
    fetchTemplates();
  }, [open, user]);

  async function fetchTemplates() {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'users', user.uid, 'templates'));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
      setTemplates(list);
    } catch (err) {
      console.error('[TemplateSidebar] fetch error:', err);
      showStatus('error', `Could not load templates: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  // ── Save current template ─────────────────────────────────────────────────
  async function saveTemplate() {
    const name       = saveName.trim();
    const hasContent = stages && stages.some(s => s.subject || s.body);
    if (!name)       { showStatus('error', 'Please enter a template name.'); return; }
    if (!user)       { showStatus('error', 'You must be signed in to save templates.'); return; }
    if (!hasContent) { showStatus('error', 'Nothing to save — write a subject or body first.'); return; }

    setSaving(true);
    try {
      await addDoc(collection(db, 'users', user.uid, 'templates'), {
        name,
        stages:     stages || [],
        // Legacy compat: store first stage subject/body at root level too
        subject:    stages?.[0]?.subject || '',
        body:       stages?.[0]?.body    || '',
        customTags: customTags || [],
        stageCount: stages?.length || 1,
        isPublic:   saveIsPublic,
        updatedAt:  serverTimestamp(),
      });
      setSaveName('');
      setSaveIsPublic(false);
      setShowSaveInput(false);
      showStatus('success', `✓ Template "${name}" saved${saveIsPublic ? ' (Public)' : ' (Private)'}!`);
      await fetchTemplates();
    } catch (err) {
      console.error('[TemplateSidebar] save error:', err);
      // Surface the actual Firestore error — most likely missing security rules
      showStatus('error', `Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  // ── Toggle public/private on existing template ────────────────────────────
  async function toggleVisibility(tmpl) {
    const next = !tmpl.isPublic;
    // Optimistic update
    setTemplates(prev => prev.map(t => t.id === tmpl.id ? { ...t, isPublic: next } : t));
    try {
      await updateDoc(doc(db, 'users', user.uid, 'templates', tmpl.id), {
        isPublic:  next,
        updatedAt: serverTimestamp(),
      });
      showStatus('info', `"${tmpl.name}" is now ${next ? '🌍 Public' : '🔒 Private'}.`);
    } catch (err) {
      // Revert optimistic update
      setTemplates(prev => prev.map(t => t.id === tmpl.id ? { ...t, isPublic: tmpl.isPublic } : t));
      showStatus('error', `Could not update visibility: ${err.message}`);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function deleteTemplate(id, name) {
    setDeletingId(id);
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'templates', id));
      setTemplates(prev => prev.filter(t => t.id !== id));
      showStatus('info', `"${name}" deleted.`);
    } catch (err) {
      showStatus('error', `Delete failed: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="sidebar-backdrop" onClick={onClose} />

      {/* Sliding panel */}
      <div className="sidebar-panel" role="dialog" aria-label="Saved Templates">

        {/* Header */}
        <div className="sidebar-header">
          <span className="section-title" style={{ fontSize: 12 }}>📂 Saved Templates</span>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕ Close</button>
        </div>

        {/* Status banner */}
        {status && (
          <div className={`sidebar-status sidebar-status-${status.type}`}>
            {status.msg}
          </div>
        )}

        {/* Save section */}
        <div className="sidebar-save-section">
          {showSaveInput ? (
            <div className="sidebar-save-form">
              <input
                id="template-name-input"
                className="input"
                type="text"
                placeholder="Give this template a name…"
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveTemplate();
                  if (e.key === 'Escape') setShowSaveInput(false);
                }}
                autoFocus
              />

              {/* Visibility picker */}
              <div className="visibility-picker">
                <span className="visibility-picker-label">Visibility:</span>
                <button
                  className={`visibility-btn ${!saveIsPublic ? 'active' : ''}`}
                  onClick={() => setSaveIsPublic(false)}
                  type="button"
                >
                  🔒 Private
                </button>
                <button
                  className={`visibility-btn ${saveIsPublic ? 'active public' : ''}`}
                  onClick={() => setSaveIsPublic(true)}
                  type="button"
                >
                  🌍 Public
                </button>
              </div>

              <div className="sidebar-save-row">
                <button
                  id="confirm-save-template-btn"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  onClick={saveTemplate}
                  disabled={saving || !saveName.trim()}
                >
                  {saving ? <><span className="spinner" style={{ marginRight: 6 }} />Saving…</> : '💾 Save Template'}
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => { setShowSaveInput(false); setSaveName(''); setSaveIsPublic(false); }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              id="save-template-btn"
              className="btn btn-primary btn-full"
              onClick={() => setShowSaveInput(true)}
            >
              💾 Save Current Template
            </button>
          )}
        </div>

        {/* Template list */}
        <div className="sidebar-list">
          {loading && (
            <div className="sidebar-empty">
              <span className="spinner" style={{ width: 18, height: 18 }} />
              Loading your templates…
            </div>
          )}

          {!loading && templates.length === 0 && (
            <div className="sidebar-empty">
              <span style={{ fontSize: 24 }}>📝</span>
              No saved templates yet.
              <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                Write an email above and click<br />"Save Current Template" to store it.
              </span>
            </div>
          )}

          {templates.map(tmpl => (
            <div key={tmpl.id} className="sidebar-card">
              <div className="sidebar-card-body">
                <div className="sidebar-card-name-row">
                  <div className="sidebar-card-name">{tmpl.name}</div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {(tmpl.stageCount || (tmpl.stages?.length) || 0) > 1 && (
                      <span className="sidebar-stage-badge">
                        ⚡ {tmpl.stageCount || tmpl.stages?.length} Stages
                      </span>
                    )}
                    <span className={`sidebar-visibility-badge ${tmpl.isPublic ? 'public' : 'private'}`}>
                      {tmpl.isPublic ? '🌍' : '🔒'}
                    </span>
                  </div>
                </div>
                <div className="sidebar-card-subject">{tmpl.subject || '(no subject)'}</div>
                <div className="sidebar-card-meta">
                  {tmpl.updatedAt?.seconds
                    ? new Date(tmpl.updatedAt.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : 'Just now'}
                </div>
              </div>

              <div className="sidebar-card-actions">
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ flex: 1 }}
                  onClick={() => { onLoad(tmpl); onClose(); }}
                  title="Load into editor"
                >
                  ↩ Load
                </button>

                <button
                  className={`btn btn-sm ${tmpl.isPublic ? 'btn-warning' : 'btn-ghost'}`}
                  onClick={() => toggleVisibility(tmpl)}
                  title={tmpl.isPublic ? 'Switch to Private' : 'Switch to Public'}
                >
                  {tmpl.isPublic ? '🌍 Public' : '🔒 Private'}
                </button>

                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => deleteTemplate(tmpl.id, tmpl.name)}
                  disabled={deletingId === tmpl.id}
                  title="Delete template"
                >
                  {deletingId === tmpl.id ? <span className="spinner" /> : '🗑'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
