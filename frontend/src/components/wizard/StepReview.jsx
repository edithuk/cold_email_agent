/**
 * Step 3: Review – Campaign summary, pre-flight checklist, and send controls.
 * The "Send Emails" button lives in the wizard nav bar (bottom-right), not here.
 */
import SendControls from '../controls/SendControls';

const STAGE_LABELS = ['Initial Email', 'Follow-up 1', 'Follow-up 2', 'Follow-up 3'];

export default function StepReview({
  campaignName,
  credState,
  contacts,
  colMap,
  stages,
  resume,
  customTags,
  sending, setSending,
  paused, setPaused,
  delay, setDelay,
  rowStatuses, setRowStatuses,
  currentIdx, setCurrentIdx,
  setLogs,
  addLog,
  onLaunch,
  onSendComplete,
}) {
  const stageCount = stages.filter(s => s.subject && s.body).length;
  const hasFollowUps = stageCount > 1;

  // Pre-flight checks
  const checks = [
    { label: 'SMTP Connected',     ok: credState.credStatus === 'ok', detail: credState.credStatus === 'ok' ? 'Verified' : 'Not verified' },
    { label: 'Contacts Loaded',    ok: contacts.length > 0,           detail: contacts.length > 0 ? `${contacts.length} contacts ready` : 'No contacts' },
    { label: 'Email Column Mapped',ok: !!colMap.email,                detail: colMap.email ? `Using column "${colMap.email}"` : 'Not mapped' },
    { label: 'Template Set',       ok: stageCount > 0,                detail: `${stageCount} stage${stageCount !== 1 ? 's' : ''} configured` },
  ];

  return (
    <div className="review-grid">
      {/* Left: Campaign summary + pre-flight */}
      <div className="review-summary">
        <h3>Campaign Summary</h3>
        <div className="review-row">
          <span className="review-label">Campaign Name</span>
          <span className="review-value">{campaignName || 'Untitled Campaign'}</span>
        </div>
        <div className="review-row">
          <span className="review-label">Sender</span>
          <span className="review-value">{credState.email || '—'}</span>
        </div>
        <div className="review-row">
          <span className="review-label">Contacts</span>
          <span className="review-value">{contacts.length}</span>
        </div>
        <div className="review-row">
          <span className="review-label">Stages</span>
          <span className="review-value">{stageCount}</span>
        </div>
        {stages.map((s, i) => (
          s.subject && (
            <div className="review-row" key={i}>
              <span className="review-label" style={{ paddingLeft: 12, fontSize: 12 }}>{STAGE_LABELS[i] || `Stage ${i + 1}`}</span>
              <span className="review-value" style={{ fontSize: 12, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.subject}</span>
            </div>
          )
        ))}
        {hasFollowUps && (
          <div className="review-row">
            <span className="review-label">Follow-up Strategy</span>
            <span className="review-value">Automated drip</span>
          </div>
        )}
        {resume && (
          <div className="review-row">
            <span className="review-label">Attachment</span>
            <span className="review-value">{resume.name}</span>
          </div>
        )}

        <h3 style={{ marginTop: 24 }}>Pre-Flight Checklist</h3>
        {checks.map((c, i) => (
          <div className="review-row" key={i}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: c.ok ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                {c.ok ? '✓' : '✗'}
              </span>
              <span className="review-label">{c.label}</span>
            </span>
            <span className="review-value" style={{ fontSize: 12, color: c.ok ? 'var(--text-muted)' : 'var(--red)' }}>
              {c.detail}
            </span>
          </div>
        ))}
      </div>

      {/* Right: Mode + delay settings — no Send button here */}
      <div className="review-summary">
        <h3>Send Settings</h3>
        <SendControls
          email={credState.email}
          appPassword={credState.appPassword}
          contacts={contacts}
          colMap={colMap}
          stages={stages}
          resume={resume}
          customTags={customTags}
          sending={sending} setSending={setSending}
          paused={paused} setPaused={setPaused}
          delay={delay} setDelay={setDelay}
          rowStatuses={rowStatuses} setRowStatuses={setRowStatuses}
          currentIdx={currentIdx} setCurrentIdx={setCurrentIdx}
          setLogs={setLogs}
          addLog={addLog}
          onLaunch={onLaunch}
          onSendComplete={onSendComplete}
          hideSendButton
        />
      </div>
    </div>
  );
}
