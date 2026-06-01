import { useState, useCallback, useEffect, useRef } from 'react';
import {
  collection, query, orderBy, getDocs, addDoc, updateDoc, doc,
  serverTimestamp, getDoc, onSnapshot,
} from 'firebase/firestore';
import { Routes, Route, useNavigate, useParams, Navigate } from 'react-router-dom';
import { db } from './firebase';
import { useAuth } from './context/AuthContext';
import LoginPage from './components/auth/LoginPage';
import Header from './components/layout/Header';
import Dashboard from './components/dashboard/Dashboard';
import CampaignWizard from './components/wizard/CampaignWizard';
import SendQueuePage from './components/queue/SendQueuePage';
import { formatTime } from './utils/template';

// ── Default blank stage factory ─────────────────────────────────────────────
export function makeStage(overrides = {}) {
  return {
    id: Date.now() + Math.random(),
    subject: '',
    body: '',
    delayMode: 'relative',
    delayDays: 3,
    delayHours: 0,
    sendAt: '',
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

// ── Campaign Monitor Wrapper for Deep Linking / Page Refresh ────────────────
function CampaignMonitorWrapper({
  user,
  activeCampaignId,
  openCampaign,
  campaignWizardProps,
}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !id) return;

    if (activeCampaignId === id) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    async function fetchCampaign() {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid, 'campaigns', id));
        if (!snap.exists()) {
          console.warn(`Campaign ${id} not found.`);
          if (isMounted) navigate('/');
          return;
        }
        if (isMounted) {
          openCampaign({ id: snap.id, ...snap.data() }, false);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to fetch campaign:', err);
        if (isMounted) navigate('/');
      }
    }

    fetchCampaign();

    return () => {
      isMounted = false;
    };
  }, [user, id, activeCampaignId, openCampaign, navigate]);

  if (loading) {
    return (
      <div className="loading-screen" style={{ height: '50vh' }}>
        <span className="spinner" style={{ width: 24, height: 24 }} />
      </div>
    );
  }

  return (
    <CampaignWizard
      {...campaignWizardProps}
      step={4}
      setStep={() => { }}
    />
  );
}

export default function App() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  // ── Stepper step state (new campaign wizard) ────────────────────────────────
  const [wizardStep, setWizardStep] = useState(1);

  // ── Campaign list (loaded from Firestore) ─────────────────────────────────
  const [campaigns, setCampaigns] = useState([]);
  const [activeCampaignId, setActiveCampaignId] = useState(null);  // Firestore doc ID

  // ── Campaign name ─────────────────────────────────────────────────────────
  const [campaignName, setCampaignName] = useState('');

  // ── SMTP creds ────────────────────────────────────────────────────────────
  const [credState, setCredState] = useState({ email: '', appPassword: '', credStatus: 'idle' });

  // ── Contacts ──────────────────────────────────────────────────────────────
  const [contacts, setContacts] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [colMap, setColMap] = useState({ name: '', email: '', company: '', role: '' });
  const [contactFileName, setContactFileName] = useState('');

  // ── Resume ────────────────────────────────────────────────────────────────
  const [resume, setResume] = useState(null);

  // ── Multi-stage sequences ─────────────────────────────────────────────────
  const [stages, setStages] = useState([makeStage({ delayDays: 0 })]);
  const [activeStageIdx, setActiveStageIdx] = useState(0);
  const [customTags, setCustomTags] = useState([]);

  // ── Sidebar ───────────────────────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Sending state ─────────────────────────────────────────────────────────
  const [rowStatuses, setRowStatuses] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [sending, setSending] = useState(false);
  const [paused, setPaused] = useState(false);
  const [delay, setDelay] = useState(15);
  const [logs, setLogs] = useState([]);

  // ── Final send stats ──────────────────────────────────────────────────────
  const [finalSendStats, setFinalSendStats] = useState({ sent: 0, failed: 0 });

  // ── Refs for pause/stop (browser-side modes) ──────────────────────────────
  const pausedRef = useRef(false);
  const stopRef = useRef(false);

  // ── Firestore campaign snapshot (persists across navigation) ─────────────
  const snapshotUnsubRef = useRef(null);
  // Keep a stable ref to contacts so the snapshot callback always has the latest
  const contactsRef = useRef(contacts);
  useEffect(() => { contactsRef.current = contacts; }, [contacts]);

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
    stopRef.current = true;
    pausedRef.current = false;
    setPaused(false);
    addLog('Stopped by user.', 'warn');
  }, [addLog]);

  // ── Load campaigns from Firestore ─────────────────────────────────────────
  const loadCampaigns = useCallback(async () => {
    if (!user) return;
    try {
      const q = query(collection(db, 'users', user.uid, 'campaigns'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setCampaigns(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.warn('Failed to load campaigns:', err);
    }
  }, [user]);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  // ── Subscribe to real-time campaign updates ───────────────────────────────
  // Fires whenever activeCampaignId is set — survives navigation between views.
  useEffect(() => {
    if (!user || !activeCampaignId) return;

    // Tear down any existing subscription first
    if (snapshotUnsubRef.current) {
      snapshotUnsubRef.current();
      snapshotUnsubRef.current = null;
    }

    const unsub = onSnapshot(
      doc(db, 'users', user.uid, 'campaigns', activeCampaignId),
      (snap) => {
        if (!snap.exists()) return;
        const d = snap.data();
        const currentContacts = contactsRef.current;

        // Rebuild rowStatuses from the results map
        if (currentContacts.length > 0) {
          const statuses = currentContacts.map((_, i) => {
            const r = d.results?.[String(i)];
            if (!r) return 'pending';
            return r.status; // 'active' | 'success' | 'error' | 'pending'
          });
          setRowStatuses(statuses);

          const activeIdx = statuses.findIndex(s => s === 'active');
          if (activeIdx >= 0) setCurrentIdx(activeIdx);
        }

        setPaused(d.status === 'paused');
        const isActive = ['running', 'queued', 'paused', 'stop_requested'].includes(d.status);
        setSending(isActive);

        // Handle terminal states
        if (['completed', 'stopped', 'failed'].includes(d.status)) {
          if (snapshotUnsubRef.current) {
            snapshotUnsubRef.current();
            snapshotUnsubRef.current = null;
          }
          localStorage.removeItem('activeCampaignId');
          localStorage.removeItem('activeCampaignUid');
          setSending(false);

          const sent = d.sent || 0;
          const failed = d.failed || 0;
          setFinalSendStats({ sent, failed });

          const icon = d.status === 'completed' ? '✅' : d.status === 'stopped' ? '⏹' : '❌';
          addLog(
            `${icon} Campaign ${d.status}. ${sent} sent, ${failed} failed.`,
            d.status === 'completed' ? 'success' : 'warn'
          );
          loadCampaigns(); // Refresh dashboard list
        }
      },
      (err) => console.error('[App] Campaign snapshot error:', err)
    );

    snapshotUnsubRef.current = unsub;
    return () => { unsub(); snapshotUnsubRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeCampaignId]);

  // ── Auth gate ─────────────────────────────────────────────────────────────
  if (loading) return <LoadingScreen />;
  if (!user) return <LoginPage />;

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
    navigate('/campaign/new');
  }

  // ── Open existing campaign — restores full data from Firestore doc ─────────
  function openCampaign(campaign, shouldNavigate = false) {
    setActiveCampaignId(campaign.id);
    setCampaignName(campaign.name || '');
    setFinalSendStats({ sent: campaign.sent || 0, failed: campaign.failed || 0 });

    setLogs([{
      msg: `Viewing campaign "${campaign.name}" — ${campaign.sent || 0} sent, ${campaign.failed || 0} failed.`,
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
        if (r.status === 'error') return 'error';
        if (r.status === 'active') return 'active';
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
    if (campaign.customTags) setCustomTags(campaign.customTags);

    // Sending state
    const isActive = ['running', 'queued', 'paused', 'stop_requested'].includes(campaign.status);
    setSending(isActive);
    setPaused(campaign.status === 'paused');

    if (shouldNavigate) {
      navigate(`/campaign/${campaign.id}`);
    }
  }

  // ── Called by SendControls when a server-side campaign is created ──────────
  function handleCampaignStarted(campaignId) {
    setActiveCampaignId(campaignId);
    navigate(`/campaign/${campaignId}`);
  }

  // ── Save campaign and return to dashboard ─────────────────────────────────
  // When a server-side campaign is still running, just navigate home — Cloud
  // Functions own the campaign doc and the snapshot will reconnect when the
  // user returns. Only write to Firestore when the campaign has actually finished.
  async function handleDone() {
    if (user) {
      try {
        // If a server-side campaign is still running, don't touch the doc —
        // Cloud Functions are writing to it. Just navigate home.
        const serverSideActive = activeCampaignId && sending;

        if (!serverSideActive) {
          const success = finalSendStats.sent;
          const failed = finalSendStats.failed;
          const pending = Math.max(0, contacts.length - success - failed);
          const wasStopped = stopRef.current && pending > 0;
          const data = {
            name: campaignName || `Campaign – ${new Date().toLocaleDateString()}`,
            contacts: contacts.length,
            sent: success,
            failed,
            pending,
            stages: stages.length,
            status: wasStopped ? 'stopped' : success > 0 ? 'completed' : 'draft',
            updatedAt: serverTimestamp(),
          };

          if (activeCampaignId) {
            await updateDoc(doc(db, 'users', user.uid, 'campaigns', activeCampaignId), {
              name: data.name,
              updatedAt: serverTimestamp(),
            });
          } else {
            data.createdAt = serverTimestamp();
            const ref = await addDoc(collection(db, 'users', user.uid, 'campaigns'), data);
            setActiveCampaignId(ref.id);
          }
        }

        await loadCampaigns();
      } catch (err) {
        console.warn('Failed to save campaign:', err);
      }
    }
    navigate('/');
  }

  const campaignWizardProps = {
    campaignName,
    setCampaignName,
    credState,
    setCredState,
    contacts,
    headers,
    colMap,
    contactFileName,
    onContactsLoaded: handleContactsLoaded,
    onColMapChange: setColMap,
    onContactsRemove: () => {
      setContacts([]); setHeaders([]); setContactFileName('');
      setColMap({ name: '', email: '', company: '', role: '' });
    },
    resume,
    onResumeLoad: setResume,
    onResumeRemove: () => setResume(null),
    stages,
    setStages,
    activeStageIdx,
    setActiveStageIdx,
    customTags,
    setCustomTags,
    sidebarOpen,
    setSidebarOpen,
    onTemplateLoad: handleTemplateLoad,
    sending,
    setSending,
    paused,
    setPaused,
    delay,
    setDelay,
    rowStatuses,
    setRowStatuses,
    currentIdx,
    setCurrentIdx,
    logs,
    setLogs,
    addLog,
    onDone: handleDone,
    onSendComplete: stats => setFinalSendStats(stats),
    savedStats: finalSendStats,
    onTogglePause: handleTogglePause,
    onStop: handleStop,
    pausedRef,
    stopRef,
    onCampaignStarted: handleCampaignStarted,
  };

  return (
    <div className="app">
      <Header
        credStatus={credState.credStatus}
        email={credState.email}
        isSending={sending}
      />

      <div className="app-content">
        <Routes>
          <Route
            path="/"
            element={
              <Dashboard
                campaigns={campaigns}
                onNewCampaign={startNewCampaign}
                onOpenCampaign={(campaign) => openCampaign(campaign, true)}
                onOpenQueue={() => navigate('/queue')}
              />
            }
          />

          <Route
            path="/queue"
            element={
              <SendQueuePage
                onBack={() => navigate('/')}
                onOpenCampaign={(campaign) => openCampaign(campaign, true)}
              />
            }
          />

          <Route
            path="/campaign/new"
            element={
              <CampaignWizard
                {...campaignWizardProps}
                step={wizardStep}
                setStep={setWizardStep}
              />
            }
          />

          <Route
            path="/campaign/:id"
            element={
              <CampaignMonitorWrapper
                user={user}
                activeCampaignId={activeCampaignId}
                openCampaign={openCampaign}
                campaignWizardProps={campaignWizardProps}
              />
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}
