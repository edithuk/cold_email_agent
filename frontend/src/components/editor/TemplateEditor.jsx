import { useRef, useState, useCallback } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { makeStage } from '../../App';
import AiCopilotPanel from './AiCopilotPanel';

const CORE_TAGS = ['name', 'email', 'company', 'role'];
const MAX_STAGES = 4;

const STAGE_LABELS = ['Initial Email', 'Follow-up 1', 'Follow-up 2', 'Follow-up 3'];

export default function TemplateEditor({
  stages,
  activeStageIdx,
  onActiveStageIdxChange,
  onStagesChange,
  headers,
  colMap,
  customTags,
  onCustomTagsChange,
  onOpenSidebar,
  hideSavedTemplatesButton,
}) {
  const quillRef = useRef(null);
  const [newTag, setNewTag] = useState('');
  const [addingTag, setAddingTag] = useState(false);

  const activeStage = stages[activeStageIdx] || stages[0];

  // ── Stage management helpers ──────────────────────────────────────────────
  function updateStageField(field, value) {
    onStagesChange(prev => prev.map((s, i) => i === activeStageIdx ? { ...s, [field]: value } : s));
  }

  function addStage() {
    if (stages.length >= MAX_STAGES) return;
    const newStages = [...stages, makeStage({ delayDays: 3 })];
    onStagesChange(newStages);
    onActiveStageIdxChange(newStages.length - 1);
  }

  function removeStage(idx) {
    if (stages.length <= 1) return;
    const newStages = stages.filter((_, i) => i !== idx);
    onStagesChange(newStages);
    onActiveStageIdxChange(Math.min(activeStageIdx, newStages.length - 1));
  }

  // ── Derived tag lists ─────────────────────────────────────────────────────
  const csvTags = headers.filter(h => {
    const norm = h.toLowerCase().replace(/\s+/g, '_');
    return !CORE_TAGS.includes(norm) && !CORE_TAGS.some(c => colMap[c] === h);
  }).map(h => ({ label: h, tag: h.toLowerCase().replace(/\s+/g, '_') }));

  // ── Insert tag into Quill at cursor ──────────────────────────────────────
  const insertTag = useCallback((tag) => {
    const editor = quillRef.current?.getEditor();
    if (!editor) return;
    const range = editor.getSelection(true);
    const idx = range ? range.index : editor.getLength();
    editor.insertText(idx, `<${tag}>`, 'user');
    editor.setSelection(idx + tag.length + 2, 0);
    editor.focus();
  }, []);

  // ── Add custom tag ────────────────────────────────────────────────────────
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
    <div className="template-editor-inner">
      {/* ── Panel Header ── */}
      <div className="section-header">
        <span className="section-title">04 · Email Template</span>
        {!hideSavedTemplatesButton && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              id="open-templates-btn"
              className="btn btn-secondary btn-sm"
              onClick={onOpenSidebar}
            >
              📂 Saved Templates
            </button>
          </div>
        )}
      </div>

      {/* ── Sequence Timeline ── */}
      <div className="sequence-timeline">
        {stages.map((stage, idx) => {
          // Determine if this stage is "scheduled" (has a non-zero/absolute delay)
          const isStage0Sched = idx === 0 && (
            (stage.delayMode === 'absolute' && stage.sendAt) ||
            (stage.delayMode !== 'absolute' && ((stage.delayDays ?? 0) > 0 || (stage.delayHours ?? 0) > 0))
          );
          return (
            <div key={stage.id} className="timeline-step">
              {/* Connecting arrow between stages */}
              {idx > 0 && (
                <div className="timeline-arrow">
                  <span className="timeline-arrow-line" />
                  <span className="timeline-delay-badge"
                    title={
                      stage.delayMode === 'absolute' && stage.sendAt
                        ? `Fires on ${new Date(stage.sendAt).toLocaleString()}`
                        : `Fires after ${stage.delayDays ?? 3}d ${stage.delayHours ?? 0}h`
                    }
                  >
                    {stage.delayMode === 'absolute' && stage.sendAt
                      ? new Date(stage.sendAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                      : `+${stage.delayDays ?? 3}d${(stage.delayHours ?? 0) > 0 ? ` ${stage.delayHours}h` : ''}`
                    }
                  </span>
                </div>
              )}
              <div className="timeline-tab-wrap" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                <button
                  className={`timeline-stage-tab ${activeStageIdx === idx ? 'active' : ''}`}
                  onClick={() => onActiveStageIdxChange(idx)}
                >
                  <span className="timeline-tab-num">{idx + 1}</span>
                  <span className="timeline-tab-label">{STAGE_LABELS[idx] || `Stage ${idx + 1}`}</span>
                </button>
                {/* Scheduled badge under Stage 0 tab */}
                {isStage0Sched && (
                  <span style={{ fontSize: 10, color: 'var(--accent)', marginTop: 2, paddingLeft: 2, whiteSpace: 'nowrap' }}>
                    📅 Scheduled
                  </span>
                )}
                {/* Remove button — only for follow-up stages */}
                {idx > 0 && (
                  <button
                    className="timeline-remove-btn"
                    onClick={() => removeStage(idx)}
                    title={`Remove ${STAGE_LABELS[idx]}`}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Add follow-up button */}
        {stages.length < MAX_STAGES && (
          <div className="timeline-step">
            <div className="timeline-arrow">
              <span className="timeline-arrow-line" />
            </div>
            <button
              id="add-stage-btn"
              className="timeline-add-btn"
              onClick={addStage}
              title="Add a follow-up email stage"
            >
              ＋ Add Follow-up
            </button>
          </div>
        )}
      </div>

      {/* ── Scheduling configurator (shown for ALL stages) ── */}
      <div className="sequence-delay-block">
        {/* Mode toggle */}
        <div className="delay-mode-toggle">
          <span className="sequence-delay-icon">⏱</span>
          <span className="sequence-delay-label">
            {activeStageIdx === 0 ? 'Send initial email:' : 'Send follow-up:'}
          </span>
          <button
            className={`delay-mode-btn ${activeStage.delayMode !== 'absolute' ? 'active' : ''}`}
            onClick={() => updateStageField('delayMode', 'relative')}
          >
            Relative
          </button>
          <button
            className={`delay-mode-btn ${activeStage.delayMode === 'absolute' ? 'active' : ''}`}
            onClick={() => updateStageField('delayMode', 'absolute')}
          >
            Specific Date
          </button>
        </div>

        {/* Relative mode: days + hours */}
        {activeStage.delayMode !== 'absolute' && (
          <div className="sequence-delay-row" style={{ marginTop: 6 }}>
            <span className="sequence-delay-label" style={{ flex: 'unset' }}>
              {activeStageIdx === 0 ? 'Delay by' : 'After no reply for'}
            </span>
            <input
              className="sequence-delay-input"
              type="number"
              min={0}
              max={90}
              value={activeStageIdx === 0 ? (activeStage.delayDays ?? 0) : (activeStage.delayDays ?? 3)}
              onChange={e => updateStageField('delayDays', Math.max(0, Math.min(90, Number(e.target.value))))}
            />
            <span className="sequence-delay-unit">day{(activeStageIdx === 0 ? (activeStage.delayDays ?? 0) : (activeStage.delayDays ?? 3)) !== 1 ? 's' : ''}</span>
            <input
              className="sequence-delay-input"
              type="number"
              min={0}
              max={23}
              value={activeStage.delayHours ?? 0}
              onChange={e => updateStageField('delayHours', Math.max(0, Math.min(23, Number(e.target.value))))}
            />
            <span className="sequence-delay-unit">hr{(activeStage.delayHours ?? 0) !== 1 ? 's' : ''}</span>
            {activeStageIdx === 0 && (activeStage.delayDays ?? 0) === 0 && (activeStage.delayHours ?? 0) === 0 && (
              <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                (sends immediately)
              </span>
            )}
          </div>
        )}

        {/* Absolute mode: datetime picker */}
        {activeStage.delayMode === 'absolute' && (
          <div className="sequence-delay-row" style={{ marginTop: 6 }}>
            <span className="sequence-delay-label" style={{ flex: 'unset' }}>Send on</span>
            <input
              className="sequence-datetime-input"
              type="datetime-local"
              value={activeStage.sendAt || ''}
              min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
              onChange={e => updateStageField('sendAt', e.target.value)}
            />
          </div>
        )}
      </div>

      {/* ── Tag chips row ── */}
      <div className="tag-section" style={{ marginTop: activeStageIdx > 0 ? 8 : 10 }}>
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

      {/* ── AI Copilot ── */}
      <AiCopilotPanel
        activeStage={activeStage}
        updateStageField={updateStageField}
        customTags={customTags}
        headers={headers}
        stageLabel={STAGE_LABELS[activeStageIdx] || `Stage ${activeStageIdx + 1}`}
      />

      {/* ── Subject ── */}
      <div className="form-group" style={{ marginTop: 12 }}>
        <label htmlFor={`subject-input-${activeStageIdx}`}>
          {activeStageIdx === 0 ? 'Subject Line' : `${STAGE_LABELS[activeStageIdx]} Subject`}
        </label>
        <input
          id={`subject-input-${activeStageIdx}`}
          className="input"
          type="text"
          placeholder={
            activeStageIdx === 0
              ? 'Application for Software Engineer role at <company>'
              : 'Re: My application at <company>'
          }
          value={activeStage.subject}
          onChange={e => updateStageField('subject', e.target.value)}
        />
      </div>

      {/* ── Body (Quill) ── */}
      <div className="form-group">
        <label>
          {activeStageIdx === 0 ? 'Body' : `${STAGE_LABELS[activeStageIdx]} Body`}
        </label>
        <div className="quill-wrap">
          <ReactQuill
            key={activeStageIdx}  // re-mount editor when tab changes
            ref={quillRef}
            id={`body-editor-${activeStageIdx}`}
            theme="snow"
            value={activeStage.body}
            onChange={val => updateStageField('body', val)}
            placeholder={
              activeStageIdx === 0
                ? 'Hi <name>, I came across an opening at <company>…'
                : 'Hi <name>, just following up on my previous email…'
            }
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
