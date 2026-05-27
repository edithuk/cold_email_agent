/**
 * AiCopilotPanel.jsx — AI-powered cold email writing assistant.
 * Embedded inside TemplateEditor, visible on every stage.
 *
 * Sections:
 *  A. Email Generator   — context + role + tone → full draft
 *  B. Rewrite & Polish  — make punchier / shorter / fix grammar
 *  C. Subject Lines     — generate 5 high-converting options
 */
import { useState } from 'react';
import {
  generateEmail,
  rewriteEmail,
  generateSubjectLines,
  getProviderLabel,
  isAiConfigured,
} from '../../utils/aiCopilot';

const TONES = ['Professional', 'Casual', 'Bold & Creative'];

export default function AiCopilotPanel({
  activeStage,
  updateStageField,
  customTags,
  headers,
  stageLabel,
}) {
  // Panel open/collapsed state
  const [open, setOpen] = useState(false);

  // Section A — Email Generator
  const [context,    setContext]    = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [tone,       setTone]       = useState('Professional');
  const [genLoading, setGenLoading] = useState(false);
  const [genError,   setGenError]   = useState('');

  // Section B — Rewrite
  const [rewriteLoading, setRewriteLoading] = useState(false);
  const [rewriteMode,    setRewriteMode]    = useState('');
  const [rewriteError,   setRewriteError]   = useState('');

  // Section C — Subject Lines
  const [subLoading, setSubLoading] = useState(false);
  const [subLines,   setSubLines]   = useState([]);
  const [subError,   setSubError]   = useState('');

  const configured = isAiConfigured();
  const provider   = getProviderLabel();
  const hasBody    = activeStage?.body?.replace(/<[^>]*>/g, '').trim().length > 10;

  // ── Section A: Generate full email ───────────────────────────────────────
  async function handleGenerate() {
    if (!context.trim()) { setGenError('Please describe your campaign goal or context.'); return; }
    setGenLoading(true);
    setGenError('');
    try {
      const result = await generateEmail({
        context: context.trim(),
        targetRole: targetRole.trim() || 'professional',
        tone,
        customTags,
        headers,
        stageLabel,
      });
      updateStageField('subject', result.subject);
      updateStageField('body',    result.body);
    } catch (err) {
      setGenError(err.message || 'Failed to generate email. Check your API key.');
    } finally {
      setGenLoading(false);
    }
  }

  // ── Section B: Rewrite ───────────────────────────────────────────────────
  async function handleRewrite(mode) {
    setRewriteLoading(true);
    setRewriteMode(mode);
    setRewriteError('');
    try {
      const result = await rewriteEmail({
        subject: activeStage.subject,
        body:    activeStage.body,
        mode,
      });
      updateStageField('subject', result.subject);
      updateStageField('body',    result.body);
    } catch (err) {
      setRewriteError(err.message || 'Rewrite failed. Try again.');
    } finally {
      setRewriteLoading(false);
      setRewriteMode('');
    }
  }

  // ── Section C: Subject lines ─────────────────────────────────────────────
  async function handleGenerateSubjects() {
    setSubLoading(true);
    setSubLines([]);
    setSubError('');
    try {
      const lines = await generateSubjectLines({
        body: activeStage.body,
        targetRole: targetRole.trim(),
      });
      setSubLines(Array.isArray(lines) ? lines : []);
    } catch (err) {
      setSubError(err.message || 'Subject generation failed.');
    } finally {
      setSubLoading(false);
    }
  }

  return (
    <div className="ai-copilot-panel">
      {/* ── Header / Toggle ── */}
      <button
        className="ai-copilot-header"
        onClick={() => setOpen(o => !o)}
        title={configured ? `AI powered by ${provider}` : 'AI not configured — add API key to .env.local'}
      >
        <span className="ai-copilot-header-left">
          <span className="ai-copilot-icon">✨</span>
          <span className="ai-copilot-title">AI Copilot</span>
          <span className="ai-provider-badge">{provider}</span>
        </span>
        <span className={`ai-copilot-chevron ${open ? 'open' : ''}`}>▾</span>
      </button>

      {/* ── Panel body (animated expand) ── */}
      {open && (
        <div className="ai-copilot-body">

          {!configured && (
            <div className="ai-config-warning">
              ⚠️ No API key found for the active provider. Add <code>VITE_GEMINI_API_KEY</code> or <code>VITE_GROQ_API_KEY</code> to your <code>.env.local</code>.
            </div>
          )}

          {/* ── Section A: Email Generator ── */}
          <div className="ai-section">
            <div className="ai-section-label">🤖 Generate Email</div>

            <div className="ai-field">
              <label className="ai-label">Campaign Goal / Context</label>
              <textarea
                className="ai-textarea"
                placeholder="e.g. Invite top engineering leaders to an exclusive virtual roundtable on AI in product delivery"
                value={context}
                rows={3}
                onChange={e => setContext(e.target.value)}
              />
            </div>

            <div className="ai-row">
              <div className="ai-field" style={{ flex: 1 }}>
                <label className="ai-label">Target Role</label>
                <input
                  className="ai-input"
                  type="text"
                  placeholder="e.g. VP of Engineering"
                  value={targetRole}
                  onChange={e => setTargetRole(e.target.value)}
                />
              </div>

              <div className="ai-field" style={{ flex: 1 }}>
                <label className="ai-label">Tone</label>
                <div className="tone-pills">
                  {TONES.map(t => (
                    <button
                      key={t}
                      className={`tone-pill ${tone === t ? 'active' : ''}`}
                      onClick={() => setTone(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              className="btn btn-ai-primary"
              onClick={handleGenerate}
              disabled={genLoading || !configured}
            >
              {genLoading
                ? <><span className="ai-spinner" /> Generating…</>
                : '✨ Generate Email'}
            </button>

            {genError && <div className="ai-error">{genError}</div>}
          </div>

          {/* ── Section B: Rewrite & Polish ── */}
          {hasBody && (
            <div className="ai-section">
              <div className="ai-section-label">✏️ Rewrite & Polish</div>
              <div className="ai-rewrite-row">
                {[
                  { mode: 'punchier', label: '💥 Make it Punchier' },
                  { mode: 'shorter',  label: '📱 Shorten for Mobile' },
                  { mode: 'grammar',  label: '🔤 Fix Grammar' },
                ].map(({ mode, label }) => (
                  <button
                    key={mode}
                    className={`btn btn-ai-secondary ${rewriteMode === mode && rewriteLoading ? 'loading' : ''}`}
                    onClick={() => handleRewrite(mode)}
                    disabled={rewriteLoading || !configured}
                  >
                    {rewriteMode === mode && rewriteLoading
                      ? <><span className="ai-spinner" /> Working…</>
                      : label}
                  </button>
                ))}
              </div>
              {rewriteError && <div className="ai-error">{rewriteError}</div>}
            </div>
          )}

          {/* ── Section C: Subject Line Generator ── */}
          {hasBody && (
            <div className="ai-section">
              <div className="ai-section-label">📬 Subject Line Ideas</div>

              <button
                className="btn btn-ai-secondary"
                onClick={handleGenerateSubjects}
                disabled={subLoading || !configured}
                style={{ marginBottom: 10 }}
              >
                {subLoading
                  ? <><span className="ai-spinner" /> Generating…</>
                  : '🎯 Generate Subject Lines'}
              </button>

              {subError && <div className="ai-error">{subError}</div>}

              {subLines.length > 0 && (
                <div className="ai-result-card">
                  <div className="ai-result-label">Click a subject line to use it:</div>
                  <div className="ai-subject-list">
                    {subLines.map((line, i) => (
                      <button
                        key={i}
                        className="ai-subject-option"
                        onClick={() => updateStageField('subject', line)}
                        title="Click to use this subject line"
                      >
                        <span className="ai-subject-num">{i + 1}</span>
                        <span className="ai-subject-text">{line}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
