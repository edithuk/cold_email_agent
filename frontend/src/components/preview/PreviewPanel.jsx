import { useState } from 'react';
import { compileTemplate } from '../../utils/template';

/** Validates basic email format */
function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e).trim());
}

export default function PreviewPanel({
  contacts,
  headers,
  colMap,
  subject,
  body,
  customTags,
  credStatus,
  sending,
  rowStatuses,
}) {
  const [device,       setDevice]       = useState('desktop');  // 'desktop' | 'mobile'
  const [previewIndex, setPreviewIndex] = useState(0);

  const total = contacts.length;
  const safeIdx = Math.max(0, Math.min(previewIndex, total - 1));
  const previewRow = contacts[safeIdx] || {};

  const previewSubject = compileTemplate(subject || '', previewRow, colMap, customTags);
  const previewBody    = compileTemplate(body    || '', previewRow, colMap, customTags);
  const previewEmail   = colMap.email ? previewRow[colMap.email] : '';

  // ── Pre-flight checks ────────────────────────────────────────────────────
  const invalidEmails = contacts.filter(row => {
    const e = colMap.email ? row[colMap.email] : '';
    return e && !isValidEmail(e);
  });

  const usedTags = [...(subject || '').matchAll(/<(\w+)>/g), ...(body || '').matchAll(/<(\w+)>/g)]
    .map(m => m[1]);
  const unmappedCoreTags = ['name', 'company', 'role'].filter(tag =>
    usedTags.includes(tag) && !colMap[tag]
  );

  const checks = [
    {
      id: 'smtp',
      label: 'SMTP Connected',
      ok: credStatus === 'ok',
      warn: false,
      detail: credStatus === 'ok' ? 'Verified' : 'Verify your Gmail credentials first',
    },
    {
      id: 'contacts',
      label: 'Contacts Loaded',
      ok: total > 0,
      warn: false,
      detail: total > 0 ? `${total} contacts ready` : 'Upload a contacts spreadsheet',
    },
    {
      id: 'email-col',
      label: 'Email Column Mapped',
      ok: !!colMap.email,
      warn: false,
      detail: colMap.email ? `Using column "${colMap.email}"` : 'Map the Email column in the Contacts panel',
    },
    {
      id: 'template',
      label: 'Template Set',
      ok: !!(subject && body),
      warn: false,
      detail: (subject && body) ? 'Subject and body present' : 'Write a subject line and body',
    },
    ...(unmappedCoreTags.length > 0 ? [{
      id: 'tags',
      label: 'Template Tags',
      ok: false,
      warn: true,
      detail: `Tag(s) <${unmappedCoreTags.join('>, <')}> used but column not mapped`,
    }] : []),
    ...(invalidEmails.length > 0 ? [{
      id: 'invalid-emails',
      label: 'Email Format',
      ok: false,
      warn: true,
      detail: `${invalidEmails.length} contact(s) have malformed email addresses`,
    }] : []),
  ];

  const allGood = checks.every(c => c.ok || c.warn);
  const blocking = checks.filter(c => !c.ok && !c.warn);

  return (
    <div style={{ minWidth: 0 }}>
      {/* ── Header ── */}
      <div className="section-header" style={{ marginBottom: 10 }}>
        <span className="section-title">Preview</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {/* Device toggle */}
          <div className="device-toggle">
            <button
              id="device-desktop-btn"
              className={`device-toggle-btn ${device === 'desktop' ? 'active' : ''}`}
              onClick={() => setDevice('desktop')}
              title="Desktop view"
            >🖥</button>
            <button
              id="device-mobile-btn"
              className={`device-toggle-btn ${device === 'mobile' ? 'active' : ''}`}
              onClick={() => setDevice('mobile')}
              title="Mobile view"
            >📱</button>
          </div>
          {total > 0 && (
            <span className="section-badge badge-muted">{safeIdx + 1}/{total}</span>
          )}
        </div>
      </div>

      {/* ── Contact navigator ── */}
      {total > 0 && (
        <div className="preview-nav">
          <button
            id="preview-prev-btn"
            className="preview-nav-btn"
            onClick={() => setPreviewIndex(i => Math.max(0, i - 1))}
            disabled={safeIdx === 0}
          >←</button>
          <span className="preview-nav-label">
            {previewEmail || `Contact ${safeIdx + 1}`}
          </span>
          <button
            id="preview-next-btn"
            className="preview-nav-btn"
            onClick={() => setPreviewIndex(i => Math.min(total - 1, i + 1))}
            disabled={safeIdx === total - 1}
          >→</button>
        </div>
      )}

      {/* ── Email preview ── */}
      {previewSubject && (
        <div className="preview-subject">
          <span className="preview-subject-label">Subject:</span> {previewSubject}
        </div>
      )}

      {device === 'mobile' ? (
        <div className="device-frame-wrap">
          <div className="device-frame">
            <div className="device-notch" />
            <div className="device-status-bar">
              <span>9:41</span>
              <span>●●●</span>
            </div>
            <div className="device-screen">
              <div className="device-email-chrome">
                <div className="device-email-from">✉ {colMap.email ? previewRow[colMap.email] : 'Preview'}</div>
              </div>
              <div
                className="preview-box device-preview-body"
                dangerouslySetInnerHTML={{
                  __html: previewBody || '<span style="color:var(--text-muted)">Your email body will appear here…</span>',
                }}
              />
            </div>
            <div className="device-home-bar" />
          </div>
        </div>
      ) : (
        <div
          className="preview-box"
          dangerouslySetInnerHTML={{
            __html: previewBody || '<span style="color:var(--text-muted)">Your email body will appear here…</span>',
          }}
        />
      )}

      {/* ── Pre-flight checklist ── */}
      <div className="preflight-section">
        <div className="preflight-header">
          <span className="section-title" style={{ fontSize: 9 }}>Pre-Flight Checklist</span>
          {blocking.length === 0
            ? <span className="section-badge badge-success" style={{ fontSize: 10 }}>✓ Ready</span>
            : <span className="section-badge badge-error" style={{ fontSize: 10 }}>{blocking.length} issue{blocking.length > 1 ? 's' : ''}</span>
          }
        </div>
        <div className="preflight-list">
          {checks.map(check => (
            <div key={check.id} className={`preflight-item ${check.ok ? 'ok' : check.warn ? 'warn' : 'fail'}`}>
              <span className="preflight-icon">
                {check.ok ? '✓' : check.warn ? '⚠' : '✕'}
              </span>
              <span className="preflight-label">{check.label}</span>
              <span className="preflight-detail">{check.detail}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
