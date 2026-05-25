import { useState, useRef, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

const API_BASE = '';

function formatTime(date = new Date()) {
  return date.toTimeString().slice(0, 8);
}

function compileTemplate(template, row, colMap) {
  let out = template;
  // Support both raw <name> typed in plain inputs and HTML-encoded &lt;name&gt; from Quill
  const replace = (raw, encoded, val) => {
    out = out.replaceAll(raw, val).replaceAll(encoded, val);
  };
  if (colMap.name    && row[colMap.name])    replace('<name>',    '&lt;name&gt;',    row[colMap.name]);
  if (colMap.company && row[colMap.company]) replace('<company>', '&lt;company&gt;', row[colMap.company]);
  if (colMap.role    && row[colMap.role])    replace('<role>',    '&lt;role&gt;',    row[colMap.role]);
  return out;
}

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

export default function App() {
  // ── Credentials ──────────────────────────────────────────────────────────
  const [email, setEmail] = useState(() => localStorage.getItem('cea_email') || '');
  const [appPassword, setAppPassword] = useState(() => localStorage.getItem('cea_apppw') || '');
  const [credStatus, setCredStatus] = useState('idle'); // idle | verifying | ok | error
  const [credMsg, setCredMsg] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  // ── Contacts file ─────────────────────────────────────────────────────────
  const [contacts, setContacts] = useState([]);          // parsed rows
  const [headers, setHeaders] = useState([]);            // column names
  const [colMap, setColMap] = useState({ name: '', email: '', company: '', role: '' });
  const [contactFileName, setContactFileName] = useState('');
  const contactDragRef = useRef(false);
  const [contactDragging, setContactDragging] = useState(false);

  // ── Resume ─────────────────────────────────────────────────────────────────
  const [resume, setResume] = useState(null); // { filename, content (base64), contentType }
  const [resumeDragging, setResumeDragging] = useState(false);

  // ── Template ──────────────────────────────────────────────────────────────
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const quillRef = useRef(null);

  // ── Sending state ─────────────────────────────────────────────────────────
  const [rowStatuses, setRowStatuses] = useState([]); // 'pending'|'active'|'success'|'error'
  const [currentIdx, setCurrentIdx] = useState(0);
  const [sending, setSending] = useState(false);
  const [paused, setPaused] = useState(false);
  const [delay, setDelay] = useState(15);
  const [logs, setLogs] = useState([]);
  const pausedRef = useRef(false);
  const stopRef = useRef(false);
  const logsEndRef = useRef(null);

  // ── Persist credentials ───────────────────────────────────────────────────
  useEffect(() => {
    if (email) localStorage.setItem('cea_email', email);
  }, [email]);
  useEffect(() => {
    if (appPassword) localStorage.setItem('cea_apppw', appPassword);
  }, [appPassword]);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // ── Logging helper ─────────────────────────────────────────────────────────
  const addLog = useCallback((msg, type = 'info') => {
    setLogs(prev => [...prev, { msg, type, time: formatTime() }]);
  }, []);

  // ── Verify credentials ────────────────────────────────────────────────────
  async function verifyCredentials() {
    setCredStatus('verifying');
    setCredMsg('');
    try {
      const res = await fetch(`${API_BASE}/api/validate-credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderEmail: email, senderPassword: appPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setCredStatus('ok');
        setCredMsg('Gmail connection verified.');
        addLog('Gmail SMTP verified successfully.', 'system');
      } else {
        setCredStatus('error');
        setCredMsg(data.error);
        addLog(`Credential error: ${data.error}`, 'error');
      }
    } catch {
      setCredStatus('error');
      setCredMsg('Cannot reach backend. Is it running on port 3001?');
      addLog('Backend unreachable on port 3001.', 'error');
    }
  }

  // ── Parse contacts file ───────────────────────────────────────────────────
  function parseFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!json.length) { addLog('File appears empty.', 'warn'); return; }
      const hdrs = Object.keys(json[0]);
      setHeaders(hdrs);
      setContacts(json);
      setRowStatuses(new Array(json.length).fill('pending'));
      setCurrentIdx(0);
      // Auto-detect columns
      const detect = (keys) => hdrs.find(h => keys.includes(h.toLowerCase())) || '';
      setColMap({
        name:    detect(['name', 'full name', 'contact name', 'firstname', 'first name']),
        email:   detect(['email', 'email address', 'e-mail', 'mail']),
        company: detect(['company', 'organization', 'org', 'employer']),
        role:    detect(['role', 'title', 'job title', 'position']),
      });
      setContactFileName(file.name);
      addLog(`Loaded ${json.length} contacts from "${file.name}".`, 'system');
    };
    reader.readAsArrayBuffer(file);
  }

  function onContactDrop(e) {
    e.preventDefault(); setContactDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }

  function onResumeLoad(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const b64 = btoa(
        new Uint8Array(e.target.result).reduce((d, b) => d + String.fromCharCode(b), '')
      );
      setResume({ filename: file.name, content: b64, contentType: file.type || 'application/octet-stream' });
      addLog(`Resume loaded: "${file.name}".`, 'system');
    };
    reader.readAsArrayBuffer(file);
  }

  // ── Insert tag into Quill at cursor ──────────────────────────────────────
  function insertTag(tag) {
    const editor = quillRef.current?.getEditor();
    if (!editor) return;
    const range = editor.getSelection(true);
    const idx = range ? range.index : editor.getLength();
    editor.insertText(idx, tag, 'user');
    editor.setSelection(idx + tag.length, 0);
    editor.focus();
  }

  // ── Sending loop ──────────────────────────────────────────────────────────
  async function startSending() {
    if (!email || !appPassword) { addLog('Enter Gmail credentials first.', 'warn'); return; }
    if (!contacts.length) { addLog('Upload a contacts file first.', 'warn'); return; }
    if (!colMap.email) { addLog('Map the Email column first.', 'warn'); return; }
    if (!subject || !body) { addLog('Enter subject and body template.', 'warn'); return; }

    stopRef.current = false;
    pausedRef.current = false;
    setPaused(false);
    setSending(true);
    addLog(`Starting — ${contacts.length} recipients, ${delay}s delay between emails.`, 'system');

    const statuses = [...rowStatuses];
    for (let i = currentIdx; i < contacts.length; i++) {
      if (stopRef.current) { addLog('Stopped by user.', 'warn'); break; }

      while (pausedRef.current) {
        await sleep(300);
        if (stopRef.current) break;
      }
      if (stopRef.current) { addLog('Stopped by user.', 'warn'); break; }

      const row = contacts[i];
      const recipientEmail = row[colMap.email]?.toString().trim();
      const recipientName  = colMap.name    ? row[colMap.name]?.toString().trim()    : '';
      const compiledBody   = compileTemplate(body, row, colMap);
      const compiledSubject = compileTemplate(subject, row, colMap);

      setCurrentIdx(i);
      statuses[i] = 'active';
      setRowStatuses([...statuses]);
      addLog(`[${i + 1}/${contacts.length}] Sending to ${recipientEmail}${recipientName ? ` (${recipientName})` : ''}…`, 'info');

      try {
        const res = await fetch(`${API_BASE}/api/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            senderEmail: email,
            senderPassword: appPassword,
            recipientEmail,
            recipientName,
            subject: compiledSubject,
            body: compiledBody,
            attachment: resume || null,
          }),
        });
        const data = await res.json();
        if (data.success) {
          statuses[i] = 'success';
          addLog(`✓ Sent to ${recipientEmail}`, 'success');
        } else {
          statuses[i] = 'error';
          addLog(`✗ Failed (${recipientEmail}): ${data.error}`, 'error');
        }
      } catch (err) {
        statuses[i] = 'error';
        addLog(`✗ Network error (${recipientEmail}): ${err.message}`, 'error');
      }

      setRowStatuses([...statuses]);

      if (i < contacts.length - 1 && !stopRef.current) {
        addLog(`Waiting ${delay}s before next email…`, 'info');
        await sleep(delay * 1000);
      }
    }

    setSending(false);
    if (!stopRef.current) {
      const s = statuses.filter(x => x === 'success').length;
      const f = statuses.filter(x => x === 'error').length;
      addLog(`Done! ${s} sent, ${f} failed.`, 'system');
    }
  }

  function togglePause() {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
    addLog(pausedRef.current ? 'Paused.' : 'Resumed.', 'warn');
  }

  function stopSending() {
    stopRef.current = true;
    pausedRef.current = false;
    setPaused(false);
  }

  function resetAll() {
    stopRef.current = true;
    pausedRef.current = false;
    setSending(false);
    setPaused(false);
    setRowStatuses(new Array(contacts.length).fill('pending'));
    setCurrentIdx(0);
    setLogs([]);
  }

  // ── Derived stats ─────────────────────────────────────────────────────────
  const total   = contacts.length;
  const success = rowStatuses.filter(s => s === 'success').length;
  const failed  = rowStatuses.filter(s => s === 'error').length;
  const pending = rowStatuses.filter(s => s === 'pending').length;
  const pct     = total ? Math.round(((success + failed) / total) * 100) : 0;

  // ── Preview ───────────────────────────────────────────────────────────────
  const previewRow  = contacts[currentIdx] || {};
  const previewBody = compileTemplate(body || 'Your email body will appear here…', previewRow, colMap);

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <div className="header-brand">
          <div className="header-dot" />
          <span className="header-title">Cold Email Agent</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 12, marginLeft: 4 }}>/ Recruiter Outreach</span>
        </div>
        <div className="header-status">
          <div className={`status-dot ${credStatus === 'ok' ? 'connected' : credStatus === 'error' ? 'error' : ''}`} />
          <span>
            {credStatus === 'ok' ? `Connected · ${email}` :
             credStatus === 'error' ? 'Auth failed' :
             credStatus === 'verifying' ? 'Verifying…' : 'Not connected'}
          </span>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="main">

        {/* ══ LEFT PANEL ══ */}
        <div className="panel panel-left">

          {/* 1 · Gmail Credentials */}
          <div>
            <div className="section-header">
              <span className="section-title">01 · Gmail Account</span>
              {credStatus === 'ok'    && <span className="section-badge badge-success">Verified</span>}
              {credStatus === 'error' && <span className="section-badge badge-error">Failed</span>}
            </div>
            <div className="form-group">
              <label htmlFor="email-input">Gmail Address</label>
              <input id="email-input" className="input" type="email" placeholder="you@gmail.com"
                value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="apppassword-input">App Password</label>
              <div className="input-with-btn">
                <input id="apppassword-input" className="input" type="password"
                  placeholder="xxxx xxxx xxxx xxxx"
                  value={appPassword} onChange={e => setAppPassword(e.target.value)} />
                <button id="verify-btn" className="btn btn-secondary btn-sm"
                  disabled={credStatus === 'verifying' || !email || !appPassword}
                  onClick={verifyCredentials}>
                  {credStatus === 'verifying' ? <span className="spinner" /> : 'Verify'}
                </button>
              </div>
            </div>
            {credMsg && (
              <p style={{ fontSize: 12, color: credStatus === 'ok' ? 'var(--green)' : 'var(--red)', marginTop: 4 }}>
                {credMsg}
              </p>
            )}

            {/* Help callout */}
            <div style={{ marginTop: 10 }}>
              <span className="collapsible-trigger" onClick={() => setShowHelp(h => !h)}>
                <span className={`chevron ${showHelp ? 'open' : ''}`}>▶</span>
                How to get an App Password
              </span>
              {showHelp && (
                <div className="help-callout" style={{ marginTop: 8 }}>
                  <strong>Requires 2-Step Verification enabled on your Google account.</strong>
                  <ol className="help-steps">
                    <li>Go to <a href="https://myaccount.google.com" target="_blank" rel="noreferrer">myaccount.google.com</a></li>
                    <li>Search &ldquo;App Passwords&rdquo; in the search bar</li>
                    <li>Create a new one — name it &ldquo;Cold Email Agent&rdquo;</li>
                    <li>Copy the 16-character code and paste it above</li>
                  </ol>
                </div>
              )}
            </div>
          </div>

          <div className="divider" />

          {/* 2 · Contacts File */}
          <div>
            <div className="section-header">
              <span className="section-title">02 · Contacts File</span>
              {contacts.length > 0 && (
                <span className="section-badge badge-info">{contacts.length} rows</span>
              )}
            </div>
            {contactFileName ? (
              <div className="file-loaded">
                <div>
                  <div className="file-loaded-name">📄 {contactFileName}</div>
                  <div className="file-loaded-meta">{contacts.length} contacts · {headers.length} columns</div>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => {
                  setContacts([]); setHeaders([]); setContactFileName('');
                  setColMap({ name:'', email:'', company:'', role:'' });
                }}>Remove</button>
              </div>
            ) : (
              <div
                id="contacts-drop-zone"
                className={`drop-zone ${contactDragging ? 'dragging' : ''}`}
                onClick={() => document.getElementById('contacts-file-input').click()}
                onDragOver={e => { e.preventDefault(); setContactDragging(true); }}
                onDragLeave={() => setContactDragging(false)}
                onDrop={onContactDrop}>
                <span className="drop-zone-icon">📊</span>
                <p className="drop-zone-text">Drop your CSV or Excel file here</p>
                <p className="drop-zone-hint">.csv, .xlsx, .xls supported</p>
              </div>
            )}
            <input id="contacts-file-input" type="file" accept=".csv,.xlsx,.xls"
              style={{ display: 'none' }}
              onChange={e => { if (e.target.files[0]) parseFile(e.target.files[0]); e.target.value=''; }} />

            {headers.length > 0 && (
              <div>
                <label style={{ display:'block', marginTop:12, marginBottom:8 }}>Map Columns</label>
                <div className="col-mapper">
                  {['name','email','company','role'].map(field => (
                    <div key={field} className="form-group" style={{ marginBottom:0 }}>
                      <label style={{ textTransform:'capitalize' }}>{field}</label>
                      <select id={`col-${field}`} className="select input"
                        value={colMap[field]}
                        onChange={e => setColMap(m => ({ ...m, [field]: e.target.value }))}>
                        <option value="">— none —</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="divider" />

          {/* 3 · Resume Attachment */}
          <div>
            <div className="section-header">
              <span className="section-title">03 · Resume (optional)</span>
              {resume && <span className="section-badge badge-success">Loaded</span>}
            </div>
            {resume ? (
              <div className="file-loaded">
                <div>
                  <div className="file-loaded-name">📎 {resume.filename}</div>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => setResume(null)}>Remove</button>
              </div>
            ) : (
              <div
                id="resume-drop-zone"
                className={`drop-zone ${resumeDragging ? 'dragging' : ''}`}
                onClick={() => document.getElementById('resume-file-input').click()}
                onDragOver={e => { e.preventDefault(); setResumeDragging(true); }}
                onDragLeave={() => setResumeDragging(false)}
                onDrop={e => { e.preventDefault(); setResumeDragging(false); if (e.dataTransfer.files[0]) onResumeLoad(e.dataTransfer.files[0]); }}>
                <span className="drop-zone-icon">📄</span>
                <p className="drop-zone-text">Drop your resume here</p>
                <p className="drop-zone-hint">.pdf, .docx, .doc</p>
              </div>
            )}
            <input id="resume-file-input" type="file" accept=".pdf,.docx,.doc"
              style={{ display: 'none' }}
              onChange={e => { if (e.target.files[0]) onResumeLoad(e.target.files[0]); e.target.value=''; }} />
          </div>
        </div>

        {/* ══ RIGHT COLUMN ══ */}
        <div className="panel-right-col">

        {/* ── Template Editor ── */}
        <div className="panel panel-right-top">
          <div className="section-header">
            <span className="section-title">04 · Email Template</span>
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              <span style={{ fontSize:11, color:'var(--text-muted)', marginRight:2 }}>Insert:</span>
              {['<name>','<company>','<role>'].map(tag => (
                <span key={tag} className="tag-chip" onClick={() => insertTag(tag)}>{tag}</span>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="subject-input">Subject Line</label>
            <input id="subject-input" className="input" type="text"
              placeholder="Application for Software Engineer role at <company>"
              value={subject} onChange={e => setSubject(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Body</label>
            <div className="quill-wrap">
              <ReactQuill
                ref={quillRef}
                id="body-editor"
                theme="snow"
                value={body}
                onChange={setBody}
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

        {/* ══ MIDDLE-RIGHT: Controls + Preview ══ */}
        <div className="panel panel-right-middle">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, height:'100%' }}>
            {/* Controls */}
            <div style={{ minWidth: 0 }}>
              <div className="section-header">
                <span className="section-title">05 · Send Controls</span>
                {sending && !paused && <span className="section-badge badge-info"><span className="spinner" style={{marginRight:4}} />Running</span>}
                {sending && paused  && <span className="section-badge badge-warn">Paused</span>}
                {!sending && success > 0 && <span className="section-badge badge-success">{pct}% done</span>}
              </div>

              <div className="progress-bar-wrap">
                <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
              </div>

              <div className="progress-stats" style={{ marginTop: 10 }}>
                <div className="stat-box">
                  <div className="stat-value accent">{total}</div>
                  <div className="stat-label">Total</div>
                </div>
                <div className="stat-box">
                  <div className="stat-value success">{success}</div>
                  <div className="stat-label">Sent</div>
                </div>
                <div className="stat-box">
                  <div className="stat-value error">{failed}</div>
                  <div className="stat-label">Failed</div>
                </div>
                <div className="stat-box">
                  <div className="stat-value neutral">{pending}</div>
                  <div className="stat-label">Pending</div>
                </div>
              </div>

              <div className="delay-row">
                <span className="delay-label">Delay between emails</span>
                <input id="delay-slider" type="range" min="5" max="120" step="5"
                  value={delay} onChange={e => setDelay(Number(e.target.value))}
                  disabled={sending} />
                <span className="delay-value">{delay}s</span>
              </div>

              <div className="controls-row" style={{ marginTop: 12 }}>
                {!sending ? (
                  <button id="send-btn" className="btn btn-primary"
                    disabled={!contacts.length || !subject || !body || !email || !appPassword}
                    onClick={startSending}>
                    ▶ Send Emails
                  </button>
                ) : (
                  <>
                    <button id="pause-btn" className="btn btn-secondary" onClick={togglePause}>
                      {paused ? '▶ Resume' : '⏸ Pause'}
                    </button>
                    <button id="stop-btn" className="btn btn-danger" onClick={stopSending}>
                      ⏹ Stop
                    </button>
                  </>
                )}
                {!sending && (success > 0 || failed > 0) && (
                  <button id="reset-btn" className="btn btn-secondary" onClick={resetAll}>
                    ↺ Reset
                  </button>
                )}
              </div>
            </div>

            {/* Live Preview */}
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <div className="section-header">
                <span className="section-title">Preview</span>
                {contacts.length > 0 && (
                  <span className="section-badge badge-muted">
                    {currentIdx + 1}/{total}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                {colMap.email && contacts[currentIdx] ? contacts[currentIdx][colMap.email] : 'No contact selected'}
              </div>
              <div className="preview-box" dangerouslySetInnerHTML={{ __html: previewBody || '<span style="color:var(--text-muted)">Your email body will appear here…</span>' }} />
            </div>
          </div>
        </div>

        {/* ── Bottom: Logs + Table ── */}
        <div className="panel panel-right-bottom" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>

          {/* Live log console */}
          <div style={{ minWidth: 0 }}>
            <div className="section-header">
              <span className="section-title">Activity Log</span>
              {logs.length > 0 && (
                <button className="btn btn-secondary btn-sm" onClick={() => setLogs([])}>Clear</button>
              )}
            </div>
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
              <div ref={logsEndRef} />
            </div>
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
              <div className="contacts-table-wrap" style={{ maxHeight: 220 }}>
                <table className="contacts-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Status</th>
                      {colMap.name  && <th>Name</th>}
                      {colMap.email && <th>Email</th>}
                      {colMap.company && <th>Company</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map((row, i) => (
                      <tr key={i}
                        className={
                          rowStatuses[i] === 'active'  ? 'row-active'  :
                          rowStatuses[i] === 'success' ? 'row-success' :
                          rowStatuses[i] === 'error'   ? 'row-error'   : ''
                        }>
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

        </div> {/* end .panel-right-col */}
      </main>
    </div>
  );
}
