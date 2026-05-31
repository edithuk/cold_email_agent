import { useState, useCallback, useEffect, useRef } from 'react';
import {
  collection, query, orderBy, getDocs, addDoc, updateDoc, doc,
  serverTimestamp, getDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './context/AuthContext';
import LoginPage    from './components/auth/LoginPage';
import Header       from './components/layout/Header';
import Dashboard    from './components/dashboard/Dashboard';
import CampaignWizard from './components/wizard/CampaignWizard';
import SendQueuePage  from './components/queue/SendQueuePage';
import { formatTime } from './utils/template';

// ── Default blank stage factory ─────────────────────────────────────────────
export function makeStage(overrides = {}) {
  return {
    id:        Date.now() + Math.random(),
    subject:   '',
    body:      '',
    delayMode: 'relative',
    delayDays:  3,
    delayHours: 0,
    sendAt:     '',
    ...overrides,
  };
}

// ── Loading splash ───────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-brand">
        <div className="header-dot" style={{ width: 12, height: 12 }} />
        <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
          DripFlow
        </span>
      </div>
      <span className="spinner" style={{ width: 20, height: 20, marginTop: 16 }} />
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  // ── View routing ─────────────────────────────────────────────────────────
  const [view, setView]             = useState('dashboard');   // 'dashboard' | 'wizard' | 'queue'
  const [wizardStep, setWizardStep] = useState(1);

  // ── Campaign list (loaded from Firestore) ─────────────────────────────────
  const [campaigns, setCampaigns]           = useState([]);
  const [activeCampaignId, setActiveCampaignId] = useState(null);  // Firestore doc ID

  // ── Campaign name ─────────────────────────────────────────────────────────
  const [campaignName, setCampaignName] = useState('');

  // ── SMTP creds ────────────────────────────────────────────────────────────
  const [credState, setCredState] = useState({ email: '', appPassword: '', credStatus: 'idle' });

  // ── Contacts ──────────────────────────────────────────────────────────────
  const [contacts,        setContacts]        = useState([]);
  const [headers,         setHeaders]         = useState([]);
  const [colMap,          setColMap]          = useState({ name: '', email: '', company: '', role: '' });
  const [contactFileName, setContactFileName] = useState('');

  // ── Resume ────────────────────────────────────────────────────────────────
  const [resume, setResume] = useState(null);

  // ── Multi-stage sequences ─────────────────────────────────────────────────
  const [stages,         setStages]         = useState([makeStage({ delayDays: 0 })]);
  const [activeStageIdx, setActiveStageIdx] = useState(0);
  const [customTags,     setCustomTags]     = useState([]);

  // ── Sidebar ───────────────────────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Sending state ─────────────────────────────────────────────────────────
  const [rowStatuses, setRowStatuses] = useState([]);
  const [currentIdx,  setCurrentIdx]  = useState(0);
  const [sending,     setSending]     = useState(false);
  const [paused,      setPaused]      = useState(false);
  const [delay,       setDelay]       = useState(15);
  const [logs,        setLogs]        = useState([]);

  // ── Final send stats ──────────────────────────────────────────────────────
  const [finalSendStats, setFinalSendStats] = useState({ sent: 0, failed: 0 });

  // ── Refs for pause/stop (browser-side modes) ──────────────────────────────
  const pausedRef = useRef(false);
  const stopRef   = useRef(false);

  // ── Logging helper ────────────────────────────────────────────────────────
  const addLog = useCallback((msg, type = 'info') => {
    setLogs(prev => [...prev, { msg, type, time: formatTime() }]);
  }, []);

  // ── Pause / Stop handlers (browser-side selective/scheduled modes) ─────────
  const handleTogglePause = useCallback(() => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
    addLog(pausedRef.current ? 'Paused.' : 'Resumed.', 'warn');
  }, [addLog]);

  const handleStop = useCallback(() => {
    stopRef.current   = true;
    pausedRef.current = false;
    setPaused(false);
    addLog('Stopped by user.', 'warn');
  }, [addLog]);

  // ── Load campaigns from Firestore ─────────────────────────────────────────
  const loadCampaigns = useCallback(async () => {
    if (!user) return;
    try {
      const q    = query(collection(db, 'users', user.uid, 'campaigns'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setCampaigns(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.warn('Failed to load campaigns:', err);
    }
  }, [user]);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  // ── Page-reload recovery: re-attach to any in-progress campaign ───────────
  useEffect(() => {
    if (!user) return;
    const savedId  = localStorage.getItem('activeCampaignId');
    const savedUid = localStorage.getItem('activeCampaignUid');
    if (!savedId || savedUid !== user.uid) return;

    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid, 'campaigns', savedId));
        if (!snap.exists()) {
          localStorage.removeItem('activeCampaignId');
          localStorage.removeItem('activeCampaignUid');
          return;
        }
        const data   = snap.data();
        const status = data.status;

        if (['running', 'queued', 'paused', 'stop_requested'].includes(status)) {
          // Re-open the wizard at step 4 and restore all data from Firestore
          openCampaign({ id: savedId, ...data });
          addLog(`↩ Reconnected to campaign "${data.name}" (${status}).`, 'system');
        } else {
          // Campaign finished while tab was closed — clean up
          localStorage.removeItem('activeCampaignId');
          localStorage.removeItem('activeCampaignUid');
        }
      } catch (err) {
        console.warn('Recovery check failed:', err);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ── Auth gate ─────────────────────────────────────────────────────────────
  if (loading) return <LoadingScreen />;
  if (!user)   return <LoginPage />;

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
    if (tmpl.stages && Array.isArray(tmpl.stages) && tmpl.stages.length > 0) {
      setStages(tmpl.stages);
    } else {
      setStages([makeStage({ subject: tmpl.subject || '', body: tmpl.body || '', delayDays: 0 })]);
    }
    setActiveStageIdx(0);
    setCustomTags(tmpl.customTags || []);
    addLog(`Template "${tmpl.name}" loaded (${tmpl.stages?.length || 1} stage${(tmpl.stages?.length || 1) > 1 ? 's' : ''}).`, 'system');
  }

  // ── New campaign wizard ────────────────────────────────────────────────────
  function startNewCampaign() {
    setActiveCampaignId(null);
    setCampaignName('');
    setContacts([]);
    setHeaders([]);
    setColMap({ name: '', email: '', company: '', role: '' });
    setContactFileName('');
    setResume(null);
    setStages([makeStage({ delayDays: 0 })]);
    setActiveStageIdx(0);
    setCustomTags([]);
    setRowStatuses([]);
    setCurrentIdx(0);
    setSending(false);
    setPaused(false);
    setLogs([]);
    setSidebarOpen(false);
    setWizardStep(1);
    setView('wizard');
  }

  // ── Open existing campaign — restores full data from Firestore doc ─────────
  function openCampaign(campaign) {
    setActiveCampaignId(campaign.id);
    setCampaignName(campaign.name || '');
    setFinalSendStats({ sent: campaign.sent || 0, failed: campaign.failed || 0 });

    setLogs([{
      msg:  `Viewing campaign "${campaign.name}" — ${campaign.sent || 0} sent, ${campaign.failed || 0} failed.`,
      type: 'system',
      time: formatTime(),
    }]);

    // Restore full contact data if stored in the campaign doc (new schema)
    if (campaign.contacts?.length) {
      setContacts(campaign.contacts);
      setHeaders(Object.keys(campaign.contacts[0] || {}));
      setColMap(campaign.colMap || { name: '', email: '', company: '', role: '' });

      // Rebuild rowStatuses from the results map
      const statuses = campaign.contacts.map((_, i) => {
        const r = campaign.results?.[String(i)];
        if (!r) return 'pending';
        if (r.status === 'success') return 'success';
        if (r.status === 'error')   return 'error';
        if (r.status === 'active')  return 'active';
        return 'pending';
      });
      setRowStatuses(statuses);

      // Find the last active/processed index
      const lastSent = statuses.lastIndexOf('success');
      setCurrentIdx(Math.max(0, lastSent));
    } else {
      // Old schema — no contact data stored in campaign doc
      setContacts([]);
      setRowStatuses([]);
      setCurrentIdx(0);
    }

    // Restore stages and tags if stored
    if (campaign.stages?.length) setStages(campaign.stages);
    if (campaign.customTags)     setCustomTags(campaign.customTags);

    // Sending state
    const isActive = ['running', 'queued', 'paused', 'stop_requested'].includes(campaign.status);
    setSending(isActive);
    setPaused(campaign.status === 'paused');

    setWizardStep(4);
    setView('wizard');
  }

  // ── Called by SendControls when a server-side campaign is created ──────────
  function handleCampaignStarted(campaignId) {
    setActiveCampaignId(campaignId);
  }

  // ── Save campaign and return to dashboard ─────────────────────────────────
  async function handleDone() {
    if (user) {
      try {
        const success = finalSendStats.sent;
        const failed  = finalSendStats.failed;
        const pending = Math.max(0, contacts.length - success - failed);
        const wasStopped = stopRef.current && pending > 0;
        const data = {
          name:      campaignName || `Campaign – ${new Date().toLocaleDateString()}`,
          contacts:  contacts.length,
          sent:      success,
          failed,
          pending,
          stages:    stages.length,
          status:    wasStopped ? 'stopped' : success > 0 ? 'completed' : 'draft',
          updatedAt: serverTimestamp(),
        };

        if (activeCampaignId) {
          // For new-schema campaigns, the doc already has all the data — just update summary fields
          await updateDoc(doc(db, 'users', user.uid, 'campaigns', activeCampaignId), {
            name:      data.name,
            updatedAt: serverTimestamp(),
          });
        } else {
          data.createdAt = serverTimestamp();
          const ref = await addDoc(collection(db, 'users', user.uid, 'campaigns'), data);
          setActiveCampaignId(ref.id);
        }

        await loadCampaigns();
      } catch (err) {
        console.warn('Failed to save campaign:', err);
      }
    }
    setView('dashboard');
  }

  // ── Back to dashboard ─────────────────────────────────────────────────────
  function backToDashboard() {
    if (sending) return;
    setView('dashboard');
  }

  return (
    <div className="app">
      <Header
        credStatus={credState.credStatus}
        email={credState.email}
        isSending={sending}
        view={view}
        onBackToDashboard={backToDashboard}
      />

      <div className="app-content">
        {view === 'dashboard' && (
          <Dashboard
            campaigns={campaigns}
            onNewCampaign={startNewCampaign}
            onOpenCampaign={openCampaign}
            onOpenQueue={() => setView('queue')}
          />
        )}

        {view === 'queue' && (
          <SendQueuePage
            onBack={() => setView('dashboard')}
            onOpenCampaign={(campaign) => {
              setView('dashboard');
              setTimeout(() => openCampaign(campaign), 50);
            }}
          />
        )}

        {view === 'wizard' && (
          <CampaignWizard
            step={wizardStep}
            setStep={setWizardStep}
            campaignName={campaignName}
            setCampaignName={setCampaignName}
            credState={credState}
            setCredState={setCredState}
            contacts={contacts}
            headers={headers}
            colMap={colMap}
            contactFileName={contactFileName}
            onContactsLoaded={handleContactsLoaded}
            onColMapChange={setColMap}
            onContactsRemove={() => {
              setContacts([]); setHeaders([]); setContactFileName('');
              setColMap({ name: '', email: '', company: '', role: '' });
            }}
            resume={resume}
            onResumeLoad={setResume}
            onResumeRemove={() => setResume(null)}
            stages={stages}
            setStages={setStages}
            activeStageIdx={activeStageIdx}
            setActiveStageIdx={setActiveStageIdx}
            customTags={customTags}
            setCustomTags={setCustomTags}
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
            onTemplateLoad={handleTemplateLoad}
            sending={sending} setSending={setSending}
            paused={paused}   setPaused={setPaused}
            delay={delay}     setDelay={setDelay}
            rowStatuses={rowStatuses} setRowStatuses={setRowStatuses}
            currentIdx={currentIdx}   setCurrentIdx={setCurrentIdx}
            logs={logs} setLogs={setLogs}
            addLog={addLog}
            onDone={handleDone}
            onSendComplete={stats => setFinalSendStats(stats)}
            savedStats={finalSendStats}
            onTogglePause={handleTogglePause}
            onStop={handleStop}
            pausedRef={pausedRef}
            stopRef={stopRef}
            onCampaignStarted={handleCampaignStarted}
          />
        )}
      </div>
    </div>
  );
}
