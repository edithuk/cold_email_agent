import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import LoginPage from './components/auth/LoginPage';
import Header from './components/layout/Header';
import CredentialsPanel from './components/panels/CredentialsPanel';
import ContactsPanel from './components/panels/ContactsPanel';
import ResumePanel from './components/panels/ResumePanel';
import TemplateEditor from './components/editor/TemplateEditor';
import TemplateSidebar from './components/editor/TemplateSidebar';
import PreviewPanel from './components/preview/PreviewPanel';
import SendControls from './components/controls/SendControls';
import { formatTime } from './utils/template';

// ── Loading splash ────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-brand">
        <div className="header-dot" style={{ width: 12, height: 12 }} />
        <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
          Cold Email Agent
        </span>
      </div>
      <span className="spinner" style={{ width: 20, height: 20, marginTop: 16 }} />
    </div>
  );
}

// ── Activity Log display (auto-scroll) ─────────────────────────────────────
function ActivityLog({ logs }) {
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);
  return (
    <div className="console">
      {logs.length === 0 && (
        <div className="log-line log-info">
          <span className="log-time">--:--:--</span>
          <span className="log-msg">Waiting to start…</span>
        </div>
      )}
      {logs.map((l, i) => (
        <div key={i} className={`log-line log-${l.type}`}>
          <span className="log-time">{l.time}</span>
          <span className="log-msg">{l.msg}</span>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  // ── SMTP creds (managed by CredentialsPanel, lifted here for sharing) ────
  const [credState, setCredState] = useState({ email: '', appPassword: '', credStatus: 'idle' });

  // ── Contacts ──────────────────────────────────────────────────────────────
  const [contacts,        setContacts]        = useState([]);
  const [headers,         setHeaders]         = useState([]);
  const [colMap,          setColMap]          = useState({ name: '', email: '', company: '', role: '' });
  const [contactFileName, setContactFileName] = useState('');

  // ── Resume ────────────────────────────────────────────────────────────────
  const [resume, setResume] = useState(null);

  // ── Template ──────────────────────────────────────────────────────────────
  const [subject,    setSubject]    = useState('');
  const [body,       setBody]       = useState('');
  const [customTags, setCustomTags] = useState([]);

  // ── Sidebar ───────────────────────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Sending state ─────────────────────────────────────────────────────────
  const [rowStatuses, setRowStatuses] = useState([]);
  const [currentIdx,  setCurrentIdx]  = useState(0);
  const [sending,     setSending]     = useState(false);
  const [paused,      setPaused]      = useState(false);
  const [delay,       setDelay]       = useState(15);
  const [logs,        setLogs]        = useState([]);

  // ── Logging helper ────────────────────────────────────────────────────────
  const addLog = useCallback((msg, type = 'info') => {
    setLogs(prev => [...prev, { msg, type, time: formatTime() }]);
  }, []);

  // ── Auth gate ─────────────────────────────────────────────────────────────
  if (loading)  return <LoadingScreen />;
  if (!user)    return <LoginPage />;

  // ── Contact file loaded ───────────────────────────────────────────────────
  function handleContactsLoaded({ contacts: c, headers: h, colMap: m, contactFileName: f }) {
    setContacts(c);
    setHeaders(h);
    setColMap(m);
    setContactFileName(f);
    setRowStatuses(new Array(c.length).fill('pending'));
    setCurrentIdx(0);
  }

  // ── Template loaded from sidebar ──────────────────────────────────────────
  function handleTemplateLoad(tmpl) {
    setSubject(tmpl.subject || '');
    setBody(tmpl.body || '');
    setCustomTags(tmpl.customTags || []);
    addLog(`Template "${tmpl.name}" loaded.`, 'system');
  }

  // ── New campaign – clears everything except Gmail credentials ─────────────
  function newCampaign() {
    if (sending) return; // don't allow mid-send
    setContacts([]);
    setHeaders([]);
    setColMap({ name: '', email: '', company: '', role: '' });
    setContactFileName('');
    setResume(null);
    setSubject('');
    setBody('');
    setCustomTags([]);
    setRowStatuses([]);
    setCurrentIdx(0);
    setSending(false);
    setPaused(false);
    setLogs([]);
    setSidebarOpen(false);
  }

  return (
    <div className="app">
      <Header
        credStatus={credState.credStatus}
        email={credState.email}
        onNewCampaign={newCampaign}
        isSending={sending}
      />

      <main className="main">
        {/* ══ LEFT PANEL ══ */}
        <div className="panel panel-left">
          <CredentialsPanel
            onCredChange={setCredState}
          />
          <div className="divider" />
          <ContactsPanel
            contacts={contacts}
            headers={headers}
            colMap={colMap}
            contactFileName={contactFileName}
            onLoaded={handleContactsLoaded}
            onColMapChange={setColMap}
            onRemove={() => {
              setContacts([]); setHeaders([]); setContactFileName('');
              setColMap({ name: '', email: '', company: '', role: '' });
            }}
            addLog={addLog}
          />
          <div className="divider" />
          <ResumePanel
            resume={resume}
            onLoad={setResume}
            onRemove={() => setResume(null)}
          />
        </div>

        {/* ══ RIGHT COLUMN ══ */}
        <div className="panel-right-col">

          {/* Template Editor */}
          <TemplateEditor
            subject={subject}
            body={body}
            onSubjectChange={setSubject}
            onBodyChange={setBody}
            headers={headers}
            colMap={colMap}
            customTags={customTags}
            onCustomTagsChange={setCustomTags}
            onOpenSidebar={() => setSidebarOpen(true)}
          />

          {/* Middle row: Controls + Preview */}
          <div className="panel panel-right-middle">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, height: '100%' }}>
              <SendControls
                email={credState.email}
                appPassword={credState.appPassword}
                contacts={contacts}
                colMap={colMap}
                subject={subject}
                body={body}
                resume={resume}
                customTags={customTags}
                sending={sending}   setSending={setSending}
                paused={paused}     setPaused={setPaused}
                delay={delay}       setDelay={setDelay}
                rowStatuses={rowStatuses} setRowStatuses={setRowStatuses}
                currentIdx={currentIdx}   setCurrentIdx={setCurrentIdx}
                setLogs={setLogs}
                addLog={addLog}
              />
              <PreviewPanel
                contacts={contacts}
                headers={headers}
                colMap={colMap}
                subject={subject}
                body={body}
                customTags={customTags}
                credStatus={credState.credStatus}
                sending={sending}
                rowStatuses={rowStatuses}
              />
            </div>
          </div>

          {/* ── Bottom row: Activity Log (left) + Contacts table (right) ── */}
          <div className="panel panel-right-bottom" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

            {/* Activity Log */}
            <div style={{ minWidth: 0 }}>
              <div className="section-header">
                <span className="section-title">Activity Log</span>
                {logs.length > 0 && (
                  <button className="btn btn-secondary btn-sm" onClick={() => setLogs([])}>Clear</button>
                )}
              </div>
              <ActivityLog logs={logs} />
            </div>

            {/* Contacts table */}
            <div style={{ minWidth: 0 }}>
              <div className="section-header">
                <span className="section-title">Contacts</span>
              </div>
              {contacts.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 12, paddingTop: 8 }}>
                  No contacts loaded yet.
                </div>
              ) : (
                <div className="contacts-table-wrap" style={{ maxHeight: 200 }}>
                  <table className="contacts-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Status</th>
                        {colMap.name    && <th>Name</th>}
                        {colMap.email   && <th>Email</th>}
                        {colMap.company && <th>Company</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {contacts.map((row, i) => (
                        <tr
                          key={i}
                          className={
                            rowStatuses[i] === 'active'  ? 'row-active'  :
                            rowStatuses[i] === 'success' ? 'row-success' :
                            rowStatuses[i] === 'error'   ? 'row-error'   : ''
                          }
                        >
                          <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                          <td><span className={`row-status-dot ${rowStatuses[i] || ''}`} /></td>
                          {colMap.name    && <td>{row[colMap.name]}</td>}
                          {colMap.email   && <td>{row[colMap.email]}</td>}
                          {colMap.company && <td>{row[colMap.company]}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Template Vault Sidebar (overlay) */}
      <TemplateSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        subject={subject}
        body={body}
        customTags={customTags}
        onLoad={handleTemplateLoad}
      />
    </div>
  );
}
