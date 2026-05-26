/**
 * Step 1: Setup – Campaign name, Credentials, Contacts, Resume
 */
import CredentialsPanel from '../panels/CredentialsPanel';
import ContactsPanel from '../panels/ContactsPanel';
import ResumePanel from '../panels/ResumePanel';

export default function StepSetup({
  campaignName, setCampaignName,
  credState, setCredState,
  contacts, headers, colMap, contactFileName,
  onContactsLoaded, onColMapChange, onContactsRemove,
  resume, onResumeLoad, onResumeRemove,
  addLog,
}) {
  return (
    <>
      {/* Campaign name */}
      <div className="setup-card full-width" style={{ marginBottom: 24 }}>
        <div className="setup-card-title">📋 Campaign Name</div>
        <input
          className="campaign-name-input"
          type="text"
          placeholder="e.g. Software Engineer Outreach – May 2026"
          value={campaignName}
          onChange={e => setCampaignName(e.target.value)}
          autoFocus
        />
      </div>

      <div className="setup-grid">
        {/* Credentials */}
        <div className="setup-card">
          <div className="setup-card-title">🔐 SMTP Credentials</div>
          <CredentialsPanel onCredChange={setCredState} />
        </div>

        {/* Resume */}
        <div className="setup-card">
          <div className="setup-card-title">📄 Resume / Attachment</div>
          <ResumePanel
            resume={resume}
            onLoad={onResumeLoad}
            onRemove={onResumeRemove}
          />
        </div>

        {/* Contacts — full width so the preview table has room */}
        <div className="setup-card full-width">
          <div className="setup-card-title">📁 Contacts</div>
          <ContactsPanel
            contacts={contacts}
            headers={headers}
            colMap={colMap}
            contactFileName={contactFileName}
            onLoaded={onContactsLoaded}
            onColMapChange={onColMapChange}
            onRemove={onContactsRemove}
            addLog={addLog}
          />
        </div>
      </div>
    </>
  );
}
