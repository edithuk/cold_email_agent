/**
 * CampaignWizard – Multi-step wizard shell with stepper + step routing.
 */
import StepSetup from './StepSetup';
import StepCompose from './StepCompose';
import StepReview from './StepReview';
import StepMonitor from './StepMonitor';

const STEPS = [
  { num: 1, label: 'Setup' },
  { num: 2, label: 'Compose' },
  { num: 3, label: 'Review' },
  { num: 4, label: 'Monitor' },
];

export default function CampaignWizard({
  step, setStep,
  campaignName, setCampaignName,
  credState, setCredState,
  contacts, headers, colMap, contactFileName,
  onContactsLoaded, onColMapChange, onContactsRemove,
  resume, onResumeLoad, onResumeRemove,
  stages, setStages, activeStageIdx, setActiveStageIdx,
  customTags, setCustomTags,
  sidebarOpen, setSidebarOpen, onTemplateLoad,
  sending, setSending, paused, setPaused,
  delay, setDelay,
  rowStatuses, setRowStatuses,
  currentIdx, setCurrentIdx,
  logs, setLogs, addLog,
  onDone,
  onSendComplete,
  savedStats,
  onTogglePause,
  onStop,
  pausedRef,
  stopRef,
}) {
  const hasTemplate = stages.some(s => s.subject && s.body);
  const canSend = credState.credStatus === 'ok'
    && contacts.length > 0
    && !!colMap.email
    && hasTemplate
    && !sending;

  const canGoNext = () => {
    if (step === 1) return credState.credStatus === 'ok' && contacts.length > 0 && colMap.email;
    if (step === 2) return hasTemplate;
    return true;
  };

  return (
    <div className="wizard">
      {/* ── Stepper ── */}
      <div className="wizard-stepper">
        {STEPS.map((s, idx) => (
          <div key={s.num} style={{ display: 'flex', alignItems: 'center' }}>
            <div className={`wizard-step-item ${step === s.num ? 'active' : step > s.num ? 'done' : ''}`}>
              <span className="wizard-step-num">
                {step > s.num ? '✓' : s.num}
              </span>
              {s.label}
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`wizard-step-connector ${step > s.num ? 'done' : ''}`} />
            )}
          </div>
        ))}
      </div>

      {/* ── Step content ── */}
      <div className="wizard-content">
        <div className="wizard-content-inner">
          {step === 1 && (
            <StepSetup
              campaignName={campaignName}
              setCampaignName={setCampaignName}
              credState={credState}
              setCredState={setCredState}
              contacts={contacts}
              headers={headers}
              colMap={colMap}
              contactFileName={contactFileName}
              onContactsLoaded={onContactsLoaded}
              onColMapChange={onColMapChange}
              onContactsRemove={onContactsRemove}
              resume={resume}
              onResumeLoad={onResumeLoad}
              onResumeRemove={onResumeRemove}
              addLog={addLog}
            />
          )}
          {step === 2 && (
            <StepCompose
              stages={stages}
              setStages={setStages}
              activeStageIdx={activeStageIdx}
              setActiveStageIdx={setActiveStageIdx}
              headers={headers}
              colMap={colMap}
              contacts={contacts}
              customTags={customTags}
              setCustomTags={setCustomTags}
              sidebarOpen={sidebarOpen}
              setSidebarOpen={setSidebarOpen}
              onTemplateLoad={onTemplateLoad}
              credStatus={credState.credStatus}
              sending={sending}
              rowStatuses={rowStatuses}
            />
          )}
          {step === 3 && (
            <StepReview
              campaignName={campaignName}
              credState={credState}
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
              onLaunch={() => setStep(4)}
              onSendComplete={onSendComplete}
              pausedRef={pausedRef}
              stopRef={stopRef}
              onTogglePause={onTogglePause}
              onStop={onStop}
            />
          )}
          {step === 4 && (
            <StepMonitor
              logs={logs}
              setLogs={setLogs}
              contacts={contacts}
              colMap={colMap}
              rowStatuses={rowStatuses}
              stages={stages}
              currentIdx={currentIdx}
              customTags={customTags}
              sending={sending}
              paused={paused}
              onTogglePause={onTogglePause}
              onStop={onStop}
              savedStats={savedStats}
            />
          )}
        </div>
      </div>

      {/* ── Bottom nav ── */}
      <div className="wizard-nav">
        {/* Left group: Back */}
        <div className="wizard-nav-group">
          {step > 1 && step < 4 && !sending && (
            <button className="btn btn-secondary" onClick={() => setStep(step - 1)}>
              ← Back
            </button>
          )}
        </div>

        {/* Right group: context-aware primary action */}
        <div className="wizard-nav-group">
          {/* Steps 1 & 2: Next */}
          {step < 3 && (
            <button
              className="btn btn-primary"
              disabled={!canGoNext()}
              onClick={() => setStep(step + 1)}
            >
              Next →
            </button>
          )}

          {/* Step 3: Send Emails — the real launch button */}
          {step === 3 && !sending && (
            <button
              id="send-btn"
              className="btn btn-primary"
              disabled={!canSend}
              onClick={() => {
                // Dispatch a custom event that SendControls listens for,
                // so the button can live in the nav while the logic stays in SendControls.
                document.getElementById('send-controls-trigger')?.click();
              }}
            >
              ▶ Send Emails
            </button>
          )}
          {step === 3 && sending && (
            <span style={{ fontSize: 12, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="spinner" style={{ width: 14, height: 14 }} /> Sending…
            </span>
          )}

          {/* Step 4: Save & Close */}
          {step === 4 && !sending && (
            <button className="btn btn-primary" onClick={onDone}>
              ✓ Save &amp; Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
