import { useRef, useState, useCallback } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

const CORE_TAGS = ['name', 'email', 'company', 'role'];

export default function TemplateEditor({
  subject,
  body,
  onSubjectChange,
  onBodyChange,
  headers,         // All CSV column headers
  colMap,          // Standard mapped cols {name, email, company, role}
  customTags,      // string[] – user-defined tags not in CSV
  onCustomTagsChange,
  onOpenSidebar,
}) {
  const quillRef     = useRef(null);
  const [newTag, setNewTag]   = useState('');
  const [addingTag, setAddingTag] = useState(false);

  // ── Derived tag lists ─────────────────────────────────────────────────────
  // CSV-derived tags: all headers that are NOT already a standard core tag alias
  const csvTags = headers.filter(h => {
    const norm = h.toLowerCase().replace(/\s+/g, '_');
    return !CORE_TAGS.includes(norm) && !CORE_TAGS.some(c => colMap[c] === h);
  }).map(h => ({ label: h, tag: h.toLowerCase().replace(/\s+/g, '_') }));

  // ── Insert tag into Quill at cursor ──────────────────────────────────────
  const insertTag = useCallback((tag) => {
    const editor = quillRef.current?.getEditor();
    if (!editor) return;
    const range = editor.getSelection(true);
    const idx   = range ? range.index : editor.getLength();
    editor.insertText(idx, `<${tag}>`, 'user');
    editor.setSelection(idx + tag.length + 2, 0);
    editor.focus();
  }, []);

  // ── Add custom tag ─────────────────────────────────────────────────────
  function addCustomTag() {
    const tag = newTag.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (!tag) return;
    if (customTags.includes(tag)) { setNewTag(''); setAddingTag(false); return; }
    onCustomTagsChange([...customTags, tag]);
    setNewTag('');
    setAddingTag(false);
  }

  function removeCustomTag(tag) {
    onCustomTagsChange(customTags.filter(t => t !== tag));
  }

  return (
    <div className="panel panel-right-top">
      <div className="section-header">
        <span className="section-title">04 · Email Template</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            id="open-templates-btn"
            className="btn btn-secondary btn-sm"
            onClick={onOpenSidebar}
          >
            📂 Saved Templates
          </button>
        </div>
      </div>

      {/* ── Tag chips row ── */}
      <div className="tag-section">
        {/* Core tags */}
        <div className="tag-group">
          <span className="tag-group-label">Core:</span>
          {CORE_TAGS.map(tag => (
            <span key={tag} className="tag-chip tag-chip-core" onClick={() => insertTag(tag)}>
              &lt;{tag}&gt;
            </span>
          ))}
        </div>

        {/* CSV-derived tags */}
        {csvTags.length > 0 && (
          <div className="tag-group">
            <span className="tag-group-label">From CSV:</span>
            {csvTags.map(({ label, tag }) => (
              <span
                key={tag}
                className="tag-chip tag-chip-csv"
                onClick={() => insertTag(tag)}
                title={`Column: "${label}"`}
              >
                &lt;{tag}&gt;
              </span>
            ))}
          </div>
        )}

        {/* Custom tags */}
        {customTags.length > 0 && (
          <div className="tag-group">
            <span className="tag-group-label">Custom:</span>
            {customTags.map(tag => (
              <span key={tag} className="tag-chip tag-chip-custom" onClick={() => insertTag(tag)}>
                &lt;{tag}&gt;
                <button
                  className="tag-chip-remove"
                  onClick={e => { e.stopPropagation(); removeCustomTag(tag); }}
                  title="Remove tag"
                >×</button>
              </span>
            ))}
          </div>
        )}

        {/* Add custom tag */}
        <div className="tag-group">
          {addingTag ? (
            <div className="tag-add-row">
              <input
                id="custom-tag-input"
                className="input tag-add-input"
                type="text"
                placeholder="tag_name"
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addCustomTag(); if (e.key === 'Escape') setAddingTag(false); }}
                autoFocus
              />
              <button className="btn btn-secondary btn-sm" onClick={addCustomTag}>Add</button>
              <button className="btn btn-secondary btn-sm" onClick={() => { setAddingTag(false); setNewTag(''); }}>✕</button>
            </div>
          ) : (
            <span
              id="add-custom-tag-btn"
              className="tag-chip tag-chip-add"
              onClick={() => setAddingTag(true)}
            >
              + Custom Tag
            </span>
          )}
        </div>
      </div>

      {/* Subject */}
      <div className="form-group" style={{ marginTop: 12 }}>
        <label htmlFor="subject-input">Subject Line</label>
        <input
          id="subject-input"
          className="input"
          type="text"
          placeholder="Application for Software Engineer role at <company>"
          value={subject}
          onChange={e => onSubjectChange(e.target.value)}
        />
      </div>

      {/* Body (Quill) */}
      <div className="form-group">
        <label>Body</label>
        <div className="quill-wrap">
          <ReactQuill
            ref={quillRef}
            id="body-editor"
            theme="snow"
            value={body}
            onChange={onBodyChange}
            placeholder="Hi <name>, I came across an opening at <company>…"
            modules={{
              toolbar: [
                ['bold', 'italic', 'underline', 'strike'],
                [{ header: [1, 2, 3, false] }],
                [{ list: 'ordered' }, { list: 'bullet' }],
                ['link'],
                ['clean'],
              ],
            }}
          />
        </div>
      </div>
    </div>
  );
}
