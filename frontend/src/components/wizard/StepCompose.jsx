/**
 * Step 2: Compose – Template editor with Edit / Preview tab toggle.
 * Both modes share the same full-width space — no side-by-side overflow.
 */
import { useState } from 'react';
import TemplateEditor from '../editor/TemplateEditor';
import TemplateSidebar from '../editor/TemplateSidebar';
import PreviewPanel from '../preview/PreviewPanel';

export default function StepCompose({
  stages, setStages, activeStageIdx, setActiveStageIdx,
  headers, colMap, contacts,
  customTags, setCustomTags,
  sidebarOpen, setSidebarOpen, onTemplateLoad,
  credStatus, sending, rowStatuses,
}) {
  const [mode, setMode] = useState('edit'); // 'edit' | 'preview'

  return (
    <>
      {/* Mode toggle bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
      }}>
        <div style={{
          display: 'inline-flex',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
          background: 'var(--bg-card)',
        }}>
          <button
            onClick={() => setMode('edit')}
            style={{
              padding: '7px 20px',
              border: 'none',
              background: mode === 'edit' ? 'var(--accent)' : 'transparent',
              color: mode === 'edit' ? 'white' : 'var(--text-muted)',
              fontFamily: 'inherit',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            ✏️ Edit
          </button>
          <button
            onClick={() => setMode('preview')}
            style={{
              padding: '7px 20px',
              border: 'none',
              background: mode === 'preview' ? 'var(--accent)' : 'transparent',
              color: mode === 'preview' ? 'white' : 'var(--text-muted)',
              fontFamily: 'inherit',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            👁 Preview
          </button>
        </div>

        {/* Saved templates button — always visible */}
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => setSidebarOpen(true)}
        >
          📂 Saved Templates
        </button>
      </div>

      {/* Content area — single panel, full width */}
      <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
        {mode === 'edit' ? (
          <TemplateEditor
            stages={stages}
            activeStageIdx={activeStageIdx}
            onActiveStageIdxChange={setActiveStageIdx}
            onStagesChange={setStages}
            headers={headers}
            colMap={colMap}
            customTags={customTags}
            onCustomTagsChange={setCustomTags}
            onOpenSidebar={() => setSidebarOpen(true)}
            hideSavedTemplatesButton  /* we show it in the bar above */
          />
        ) : (
          <PreviewPanel
            contacts={contacts}
            headers={headers}
            colMap={colMap}
            stages={stages}
            customTags={customTags}
            credStatus={credStatus}
            sending={sending}
            rowStatuses={rowStatuses}
          />
        )}
      </div>

      {/* Template Vault Sidebar */}
      <TemplateSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        stages={stages}
        customTags={customTags}
        onLoad={onTemplateLoad}
      />
    </>
  );
}
