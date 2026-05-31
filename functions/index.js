/**
 * Cold Email Agent – Firebase Cloud Functions
 *
 * dispatchScheduledFollowUps:
 *   Runs every hour via Cloud Scheduler.
 *   Processes pending scheduled_jobs (follow-ups) where sendAfter <= now.
 *
 * processCampaignChunk:
 *   Firestore onDocumentWritten trigger on users/{uid}/campaigns/{campaignId}.
 *   Processes one chunk of contacts (up to 25) per invocation, enforcing a
 *   configurable delay between each send. Self-chains by writing the next
 *   currentChunkIdx, which fires this trigger again automatically.
 *   One campaign per Gmail account runs at a time (account_queues collection).
 *
 * Express HTTP endpoints (/api/...):
 *   POST /api/start-campaign    – Create campaign doc + acquire queue slot
 *   POST /api/stop-campaign     – Request graceful stop (or cancel if queued)
 *   POST /api/pause-campaign    – Pause between contacts
 *   POST /api/resume-campaign   – Resume a paused campaign
 *   POST /api/validate-credentials
 *   POST /api/send-email        – Single email (selective mode / legacy)
 *   GET  /api/health
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const nodemailer = require('nodemailer');
const express = require('express');
const cors = require('cors');
const { subtle } = require('crypto').webcrypto;   // Node 20 built-in

initializeApp();
const db = getFirestore();

// Secret shared with the frontend crypto.js
const ENCRYPTION_SALT = defineSecret('ENCRYPTION_SALT');

// ── Crypto helpers (mirrors frontend/src/utils/crypto.js exactly) ───────────

const enc = new TextEncoder();
const dec = new TextDecoder();

async function deriveKey(userId, salt) {
  const keyMaterial = await subtle.importKey(
    'raw',
    enc.encode(userId),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function decryptField(cipherBase64, userId, salt) {
  try {
    const key = await deriveKey(userId, salt);
    const combined = Buffer.from(cipherBase64, 'base64');
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const decrypted = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return dec.decode(decrypted);
  } catch (err) {
    console.error('[decrypt] Failed:', err.message);
    return null;
  }
}

// ── Template compiler (mirrors frontend/src/utils/template.js) ──────────────

function compileTemplate(template, row, colMap, customTags = []) {
  if (!template) return '';
  let result = template;

  const replaceTag = (tagName, value) => {
    if (value === undefined || value === null) return;
    const strVal = String(value);
    result = result
      .replace(new RegExp(`<${tagName}>`, 'gi'), strVal)
      .replace(new RegExp(`&lt;${tagName}&gt;`, 'gi'), strVal);
  };

  if (colMap) {
    Object.entries(colMap).forEach(([field, col]) => {
      if (col && row[col] !== undefined) replaceTag(field, row[col]);
    });
  }
  if (row) {
    Object.entries(row).forEach(([col, val]) => {
      const tag = col.toLowerCase().replace(/\s+/g, '_');
      replaceTag(tag, val ?? '');
      replaceTag(col, val ?? '');
    });
  }
  if (customTags && customTags.length) {
    customTags.forEach(tag => replaceTag(tag, ''));
  }

  const HTML_ELEMENTS = new Set([
    'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'cite', 'code', 'col',
    'colgroup', 'dd', 'del', 'details', 'dfn', 'fn', 'div', 'dl', 'dt', 'em',
    'figcaption', 'figure', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'head', 'header', 'hr', 'html', 'i', 'img', 'ins', 'kbd', 'label', 'li',
    'link', 'main', 'mark', 'meta', 'nav', 'ol', 'p', 'pre', 'q', 's',
    'samp', 'section', 'small', 'span', 'strong', 'style', 'sub', 'summary',
    'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'time', 'title',
    'tr', 'u', 'ul', 'var',
  ]);
  result = result.replace(/&lt;(\w+)&gt;/g, '');
  result = result.replace(/<(\w+)>/g, (match, tag) =>
    HTML_ELEMENTS.has(tag.toLowerCase()) ? match : ''
  );
  return result;
}

// ── Strip HTML to plain text ────────────────────────────────────────────────

function htmlToText(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

// ── Auth helper ─────────────────────────────────────────────────────────────

async function verifyIdToken(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    const err = new Error('Missing or invalid Authorization header.');
    err.status = 401;
    throw err;
  }
  return getAuth().verifyIdToken(token);
}

// ── SMTP credentials helper ─────────────────────────────────────────────────

async function fetchSmtpCredentials(uid, salt) {
  const credDoc = await db.doc(`users/${uid}/profile/smtp`).get();
  if (!credDoc.exists) throw new Error('SMTP credentials not found. Please save your credentials first.');
  const credData = credDoc.data();
  const senderEmail = credData.gmailAddress || credData.email;
  const senderName = credData.displayName || senderEmail?.split('@')[0] || 'Sender';
  const encPw = credData.encryptedPassword;
  if (!senderEmail || !encPw) throw new Error('Incomplete SMTP credentials (missing gmailAddress or encryptedPassword).');
  const senderPassword = await decryptField(encPw, uid, salt);
  if (!senderPassword) throw new Error('Failed to decrypt SMTP password (key mismatch or corrupted data).');
  return { senderEmail, senderPassword, senderName };
}

// ── Account queue: advance to next campaign ─────────────────────────────────
// Called when a campaign finishes (completed / stopped).
// Uses a transaction to atomically pop the next campaignId and start it.

async function advanceAccountQueue(uid, senderEmail, finishedCampaignId) {
  if (!senderEmail) return;
  const queueRef = db.doc(`users/${uid}/account_queues/${senderEmail}`);

  await db.runTransaction(async (tx) => {
    const queueSnap = await tx.get(queueRef);
    const queueData = queueSnap.exists ? queueSnap.data() : {};
    const pending = queueData.pendingQueue || [];
    const nextId = pending.length > 0 ? pending[0] : null;
    const newPending = pending.slice(1);

    tx.set(queueRef, {
      senderEmail,
      activeCampaignId: nextId,
      pendingQueue: newPending,
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (nextId) {
      const nextRef = db.doc(`users/${uid}/campaigns/${nextId}`);
      // Updating status to 'running' fires the onDocumentWritten trigger for the next campaign
      tx.update(nextRef, {
        status: 'running',
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log(`[queue] ${finishedCampaignId} done → ${nextId} now running.`);
    } else {
      console.log(`[queue] Queue empty for ${senderEmail}. Idle.`);
    }
  });
}

// ── Scheduled follow-ups ─────────────────────────────────────────────────────

exports.dispatchScheduledFollowUps = onSchedule(
  {
    schedule: 'every 1 hours',
    timeZone: 'UTC',
    secrets: [ENCRYPTION_SALT],
    memory: '256MiB',
    timeoutSeconds: 540,
  },
  async () => {
    const salt = ENCRYPTION_SALT.value();
    const now = Timestamp.now();
    console.log(`[scheduler] Running at ${now.toDate().toISOString()}`);

    const snapshot = await db
      .collectionGroup('scheduled_jobs')
      .where('status', '==', 'pending')
      .where('sendAfter', '<=', now)
      .limit(200)
      .get();

    if (snapshot.empty) { console.log('[scheduler] No pending jobs due.'); return; }
    console.log(`[scheduler] Found ${snapshot.size} due job(s).`);

    const jobsByUser = {};
    snapshot.docs.forEach(docSnap => {
      const data = docSnap.data();
      const userId = data.userId;
      if (!jobsByUser[userId]) jobsByUser[userId] = [];
      jobsByUser[userId].push({ ref: docSnap.ref, data });
    });

    for (const [userId, jobs] of Object.entries(jobsByUser)) {
      let senderEmail, senderPassword, senderName;
      try {
        ({ senderEmail, senderPassword, senderName } = await fetchSmtpCredentials(userId, salt));
      } catch (credErr) {
        console.error(`[scheduler] Credential error for ${userId}:`, credErr.message);
        for (const job of jobs) {
          await job.ref.update({ status: 'failed', error: credErr.message, updatedAt: FieldValue.serverTimestamp() });
        }
        continue;
      }

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: senderEmail, pass: senderPassword },
      });

      for (const job of jobs) {
        const { data, ref } = job;
        await ref.update({ status: 'sending', updatedAt: FieldValue.serverTimestamp() });

        try {
          const compiledSubject = compileTemplate(data.subject, data.contactRow, data.colMap, data.customTags);
          const compiledBody = compileTemplate(data.body, data.contactRow, data.colMap, data.customTags);
          const plainText = htmlToText(compiledBody);

          const mailOptions = {
            from: `"${senderName}" <${senderEmail}>`,
            to: `${data.contactName ? data.contactName + ' <' : ''}${data.contactEmail}${data.contactName ? '>' : ''}`,
            subject: compiledSubject,
            html: compiledBody,
            text: plainText,
          };

          if (data.resumeBase64) {
            const buffer = Buffer.from(data.resumeBase64.split(',')[1] || data.resumeBase64, 'base64');
            mailOptions.attachments = [{ filename: data.resumeFilename || 'resume.pdf', content: buffer }];
          }

          await transporter.sendMail(mailOptions);
          await ref.update({
            status: 'sent',
            sentAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            error: null,
          });
          console.log(`[scheduler] ✓ Sent Stage ${data.stageIdx + 1} → ${data.contactEmail}`);
        } catch (sendErr) {
          console.error(`[scheduler] ✗ Failed → ${data.contactEmail}:`, sendErr.message);
          await ref.update({ status: 'failed', error: sendErr.message, updatedAt: FieldValue.serverTimestamp() });
        }

        await new Promise(r => setTimeout(r, 800));
      }
    }
    console.log('[scheduler] Run complete.');
  }
);

// ── Campaign chunk processor ─────────────────────────────────────────────────
// Fires on every write to users/{uid}/campaigns/{campaignId}.
// Critical guard clause prevents re-entrant execution from per-contact updates.

exports.processCampaignChunk = onDocumentWritten(
  {
    document:        'users/{uid}/campaigns/{campaignId}',
    region:          'asia-south2',
    secrets:         [ENCRYPTION_SALT],
    timeoutSeconds:  540,
    memory:          '512MiB',
  },
  async (event) => {
    const before = event.data.before.data() ?? {};
    const after = event.data.after.data();

    // ── Guard 1: ignore deletes and non-running states ──────────────────────
    if (!after) return;
    if (after.status !== 'running') return;

    // ── Guard 2: only act on meaningful state transitions ───────────────────
    // Per-contact result writes (results.5.status = 'success') must NOT
    // trigger a new chunk — they don't change currentChunkIdx or status.
    const isNew = !event.data.before.exists;
    const chunkAdvanced = after.currentChunkIdx !== before.currentChunkIdx;
    const statusOpened = before.status !== 'running' && after.status === 'running';

    if (!isNew && !chunkAdvanced && !statusOpened) {
      // Spurious write (e.g. result update, counter increment) — skip silently
      return;
    }

    const { uid, campaignId } = event.params;
    const campaignRef = db.doc(`users/${uid}/campaigns/${campaignId}`);
    const salt = ENCRYPTION_SALT.value();

    const chunkIdx = after.currentChunkIdx ?? 0;
    const chunkSize = after.chunkSize ?? 25;
    const total = after.total ?? 0;
    const start = chunkIdx * chunkSize;
    const end = Math.min(start + chunkSize, total);

    if (start >= total) {
      console.log(`[chunk] ${campaignId}: start(${start}) >= total(${total}). Skipping.`);
      return;
    }

    console.log(`[chunk] ${campaignId}: chunk ${chunkIdx}, contacts[${start}..${end - 1}] of ${total}`);

    // ── Fetch & decrypt SMTP credentials ────────────────────────────────────
    let senderEmail, senderPassword, senderName;
    try {
      ({ senderEmail, senderPassword, senderName } = await fetchSmtpCredentials(uid, salt));
    } catch (credErr) {
      console.error('[chunk] Credential error:', credErr.message);
      await campaignRef.update({
        status: 'failed', error: credErr.message, updatedAt: FieldValue.serverTimestamp(),
      });
      await advanceAccountQueue(uid, after.senderEmail, campaignId);
      return;
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: senderEmail, pass: senderPassword },
    });

    const contacts = after.contacts || [];
    const stages = after.stages || [];
    const colMap = after.colMap || {};
    const customTags = after.customTags || [];
    const stage0 = stages[0] || {};
    const delayMs = (after.delaySeconds ?? 15) * 1000;

    let stopped = false;
    let paused = false;

    // ── Process each contact in this chunk ───────────────────────────────────
    for (let i = start; i < end; i++) {

      // Re-check stop/pause every 5 contacts (fresh Firestore read)
      if ((i - start) > 0 && (i - start) % 5 === 0) {
        const fresh = await campaignRef.get();
        const s = fresh.data()?.status;
        if (s === 'stop_requested') { stopped = true; break; }
        if (s === 'paused') { paused = true; break; }
      }

      const row = contacts[i];
      const recipientEmail = row[colMap.email]?.toString().trim() || '';
      const recipientName = colMap.name ? row[colMap.name]?.toString().trim() : '';

      // Mark contact as active (doesn't advance chunkIdx → guard filters re-entry)
      await campaignRef.update({
        [`results.${i}`]: { status: 'active' },
        updatedAt: FieldValue.serverTimestamp(),
      });

      try {
        const compiledSubject = compileTemplate(stage0.subject || '', row, colMap, customTags);
        const compiledBody = compileTemplate(stage0.body || '', row, colMap, customTags);
        const plainText = htmlToText(compiledBody);

        const mailOptions = {
          from: `"${senderName}" <${senderEmail}>`,
          to: `${recipientName ? recipientName + ' <' : ''}${recipientEmail}${recipientName ? '>' : ''}`,
          subject: compiledSubject,
          html: compiledBody,
          text: plainText,
        };

        if (after.resumeBase64) {
          const buf = Buffer.from(
            after.resumeBase64.split(',')[1] || after.resumeBase64,
            'base64'
          );
          mailOptions.attachments = [{ filename: after.resumeFilename || 'resume.pdf', content: buf }];
        }

        await transporter.sendMail(mailOptions);

        await campaignRef.update({
          [`results.${i}`]: { status: 'success', sentAt: FieldValue.serverTimestamp() },
          sent: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        });
        console.log(`[chunk] ✓ Sent → ${recipientEmail}`);

        // Queue follow-up stages (1+) for this contact
        for (let sIdx = 1; sIdx < stages.length; sIdx++) {
          const stage = stages[sIdx];
          if (!stage.subject || !stage.body) continue;

          let sendAfterMs;
          if (stage.delayMode === 'absolute' && stage.sendAt) {
            sendAfterMs = new Date(stage.sendAt).getTime();
            if (isNaN(sendAfterMs) || sendAfterMs <= Date.now()) continue;
          } else {
            const days = (stage.delayDays ?? 3) * 24 * 60 * 60 * 1000;
            const hours = (stage.delayHours ?? 0) * 60 * 60 * 1000;
            sendAfterMs = Date.now() + days + hours;
          }

          await db.collection(`users/${uid}/scheduled_jobs`).add({
            userId: uid,
            contactEmail: recipientEmail,
            contactName: recipientName,
            contactRow: row,
            stageIdx: sIdx,
            stageLabel: `Follow-up ${sIdx}`,
            subject: stage.subject,
            body: stage.body,
            colMap,
            customTags,
            resumeBase64: after.resumeBase64 || null,
            resumeFilename: after.resumeFilename || null,
            sendAfter: Timestamp.fromMillis(sendAfterMs),
            status: 'pending',
            error: null,
            sentAt: null,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

      } catch (sendErr) {
        console.error(`[chunk] ✗ Failed → ${recipientEmail}:`, sendErr.message);
        await campaignRef.update({
          [`results.${i}`]: { status: 'error', error: sendErr.message },
          failed: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      // Inter-contact delay (skip after last contact in chunk)
      if (i < end - 1 && !stopped && !paused) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }

    // ── Determine next state after chunk loop ────────────────────────────────
    if (stopped) {
      console.log(`[chunk] Stopped by user. Campaign ${campaignId} stopped.`);
      await campaignRef.update({ status: 'stopped', updatedAt: FieldValue.serverTimestamp() });
      await advanceAccountQueue(uid, after.senderEmail, campaignId);

    } else if (paused) {
      console.log(`[chunk] Paused by user. Campaign ${campaignId} paused.`);
      // Don't advance queue — paused campaign holds its slot
      await campaignRef.update({ status: 'paused', updatedAt: FieldValue.serverTimestamp() });

    } else if (end >= total) {
      console.log(`[chunk] All ${total} contacts done. Campaign ${campaignId} completed!`);
      await campaignRef.update({ status: 'completed', updatedAt: FieldValue.serverTimestamp() });
      await advanceAccountQueue(uid, after.senderEmail, campaignId);

    } else {
      // Advance to next chunk — this write triggers the next invocation
      console.log(`[chunk] Chunk ${chunkIdx} done. Triggering chunk ${chunkIdx + 1}...`);
      await campaignRef.update({
        currentChunkIdx: chunkIdx + 1,
        status: 'running',
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }
);

// ── Express App ──────────────────────────────────────────────────────────────

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '25mb' }));

const swaggerUi = require('swagger-ui-express');
const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'DripFlow API Documentation',
    version: '1.0.0',
    description: 'Interactive API documentation for DripFlow cold email outreach CRM.',
  },
  servers: [{ url: '/', description: 'API Server' }],
  paths: {
    '/api/health': {
      get: { summary: 'Health Check', responses: { 200: { description: 'OK' } } },
    },
    '/api/start-campaign': {
      post: {
        summary: 'Start Background Campaign',
        description: 'Creates a campaign document in Firestore and acquires a queue slot. Returns immediately — actual sending happens via server-side Cloud Function.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object', required: ['contacts', 'stages', 'colMap'],
                properties: {
                  contacts: { type: 'array', description: 'Array of contact row objects' },
                  stages: { type: 'array', description: 'Array of stage objects' },
                  colMap: { type: 'object', description: 'Column mapping { name, email, company, role }' },
                  customTags: { type: 'array' },
                  delaySeconds: { type: 'number', example: 15 },
                  campaignName: { type: 'string' },
                  resumeBase64: { type: 'string' },
                  resumeFilename: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Campaign created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    campaignId: { type: 'string' },
                    queued: { type: 'boolean' },
                    queuePosition: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/stop-campaign': { post: { summary: 'Stop Campaign', description: 'Graceful stop (or immediate cancel if queued).' } },
    '/api/pause-campaign': { post: { summary: 'Pause Campaign', description: 'Pauses sending between contacts.' } },
    '/api/resume-campaign': { post: { summary: 'Resume Campaign', description: 'Resumes a paused campaign.' } },
    '/api/validate-credentials': {
      post: {
        summary: 'Validate SMTP Credentials',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object', required: ['senderEmail', 'senderPassword'],
                properties: {
                  senderEmail: { type: 'string', example: 'user@gmail.com' },
                  senderPassword: { type: 'string', description: 'Gmail App Password' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Credentials valid' },
          401: { description: 'Authentication failed' },
        },
      },
    },
    '/api/send-email': {
      post: {
        summary: 'Send Single Email',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object', required: ['senderEmail', 'senderPassword', 'recipientEmail', 'subject', 'body'],
                properties: {
                  senderEmail: { type: 'string' },
                  senderPassword: { type: 'string' },
                  recipientEmail: { type: 'string' },
                  recipientName: { type: 'string' },
                  subject: { type: 'string' },
                  body: { type: 'string' },
                  attachment: { type: 'object', properties: { filename: { type: 'string' }, content: { type: 'string' }, contentType: { type: 'string' } } },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Email sent successfully' },
          500: { description: 'SMTP error' },
        },
      },
    },
  },
};

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Campaign management endpoints ────────────────────────────────────────────

app.post('/api/start-campaign', async (req, res) => {
  let decoded;
  try { decoded = await verifyIdToken(req); }
  catch (e) { return res.status(401).json({ success: false, error: e.message }); }

  const uid = decoded.uid;
  const {
    contacts, stages, colMap, customTags,
    delaySeconds, campaignName, resumeBase64, resumeFilename,
  } = req.body;

  if (!contacts?.length || !stages?.length || !colMap?.email) {
    return res.status(400).json({ success: false, error: 'contacts, stages, and colMap.email are required.' });
  }

  // Look up the sender email from the user's SMTP profile
  let senderEmail;
  try {
    const credDoc = await db.doc(`users/${uid}/profile/smtp`).get();
    if (!credDoc.exists) {
      return res.status(400).json({ success: false, error: 'No SMTP credentials found. Please save your credentials in Settings first.' });
    }
    senderEmail = credDoc.data().gmailAddress || credDoc.data().email;
    if (!senderEmail) {
      return res.status(400).json({ success: false, error: 'Sender email not found in SMTP profile.' });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }

  const chunkSize = 25;
  const campaignRef = db.collection(`users/${uid}/campaigns`).doc();
  const campaignId = campaignRef.id;
  const queueRef = db.doc(`users/${uid}/account_queues/${senderEmail}`);

  let queued = false;
  let queuePosition = 0;

  try {
    await db.runTransaction(async (tx) => {
      const queueSnap = await tx.get(queueRef);
      const queueData = queueSnap.exists ? queueSnap.data() : {};
      const isIdle = !queueData.activeCampaignId;
      const pending = queueData.pendingQueue || [];

      const campaignData = {
        userId: uid,
        senderEmail,
        name: campaignName || `Campaign – ${new Date().toLocaleDateString()}`,
        contacts,
        stages,
        colMap,
        customTags: customTags || [],
        delaySeconds: delaySeconds ?? 15,
        resumeBase64: resumeBase64 || null,
        resumeFilename: resumeFilename || null,
        total: contacts.length,
        sent: 0,
        failed: 0,
        currentChunkIdx: 0,
        chunkSize,
        results: {},
        // Start immediately if queue is idle, otherwise wait in line
        status: isIdle ? 'running' : 'queued',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      tx.set(campaignRef, campaignData);

      if (isIdle) {
        // Acquire the queue slot and start immediately
        tx.set(queueRef, {
          senderEmail,
          activeCampaignId: campaignId,
          pendingQueue: [],
          updatedAt: FieldValue.serverTimestamp(),
        });
        queued = false;
      } else {
        // Append to pending queue
        queuePosition = pending.length + 1;
        tx.set(queueRef, {
          senderEmail,
          activeCampaignId: queueData.activeCampaignId,
          pendingQueue: [...pending, campaignId],
          updatedAt: FieldValue.serverTimestamp(),
        });
        queued = true;
      }
    });
  } catch (err) {
    console.error('[start-campaign] Transaction error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }

  console.log(`[start-campaign] ${campaignId} for ${senderEmail} (${queued ? `queued #${queuePosition}` : 'running now'})`);
  return res.json({ success: true, campaignId, queued, queuePosition });
});

app.post('/api/stop-campaign', async (req, res) => {
  let decoded;
  try { decoded = await verifyIdToken(req); }
  catch (e) { return res.status(401).json({ success: false, error: e.message }); }

  const { campaignId } = req.body;
  if (!campaignId) return res.status(400).json({ success: false, error: 'campaignId is required.' });

  try {
    const ref = db.doc(`users/${decoded.uid}/campaigns/${campaignId}`);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ success: false, error: 'Campaign not found.' });

    const data = snap.data();

    if (data.status === 'queued') {
      // Cancel immediately — remove from pendingQueue
      await ref.update({ status: 'stopped', updatedAt: FieldValue.serverTimestamp() });
      if (data.senderEmail) {
        const queueRef = db.doc(`users/${decoded.uid}/account_queues/${data.senderEmail}`);
        const queueSnap = await queueRef.get();
        if (queueSnap.exists) {
          const newPending = (queueSnap.data().pendingQueue || []).filter(id => id !== campaignId);
          await queueRef.update({ pendingQueue: newPending, updatedAt: FieldValue.serverTimestamp() });
        }
      }
    } else {
      // Running/paused: request graceful stop (chunk function sees this flag)
      await ref.update({ status: 'stop_requested', updatedAt: FieldValue.serverTimestamp() });
    }

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/pause-campaign', async (req, res) => {
  let decoded;
  try { decoded = await verifyIdToken(req); }
  catch (e) { return res.status(401).json({ success: false, error: e.message }); }

  const { campaignId } = req.body;
  if (!campaignId) return res.status(400).json({ success: false, error: 'campaignId is required.' });

  try {
    await db.doc(`users/${decoded.uid}/campaigns/${campaignId}`).update({
      status: 'paused', updatedAt: FieldValue.serverTimestamp(),
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/resume-campaign', async (req, res) => {
  let decoded;
  try { decoded = await verifyIdToken(req); }
  catch (e) { return res.status(401).json({ success: false, error: e.message }); }

  const { campaignId } = req.body;
  if (!campaignId) return res.status(400).json({ success: false, error: 'campaignId is required.' });

  try {
    // Setting status back to 'running' re-triggers the onDocumentWritten chunk processor
    await db.doc(`users/${decoded.uid}/campaigns/${campaignId}`).update({
      status: 'running', updatedAt: FieldValue.serverTimestamp(),
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── Legacy single-email endpoint (used by Selective mode) ────────────────────

app.post('/api/validate-credentials', async (req, res) => {
  const { senderEmail, senderPassword } = req.body;
  if (!senderEmail || !senderPassword) {
    return res.status(400).json({ success: false, error: 'Email and password are required.' });
  }
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: senderEmail, pass: senderPassword },
    });
    await transporter.verify();
    res.json({ success: true, message: 'Gmail credentials verified successfully.' });
  } catch (err) {
    console.error('SMTP verify error:', err.message);
    res.status(401).json({
      success: false,
      error: `Authentication failed: ${err.message}. Make sure you are using an App Password, not your regular Gmail password.`,
    });
  }
});

app.post('/api/send-email', async (req, res) => {
  const {
    senderEmail, senderPassword, recipientEmail, recipientName,
    subject, body, attachment,
  } = req.body;

  if (!senderEmail || !senderPassword || !recipientEmail || !subject || !body) {
    return res.status(400).json({ success: false, error: 'Missing required fields.' });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: senderEmail, pass: senderPassword },
    });

    const mailOptions = {
      from: `"${senderEmail.split('@')[0]}" <${senderEmail}>`,
      to: recipientEmail,
      subject,
      html: body,
      text: body.replace(/<[^>]*>/g, ''),
    };

    if (attachment?.content && attachment?.filename) {
      mailOptions.attachments = [{
        filename: attachment.filename,
        content: Buffer.from(attachment.content, 'base64'),
        contentType: attachment.contentType || 'application/octet-stream',
      }];
    }

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${recipientEmail} [${info.messageId}]`);
    res.json({ success: true, messageId: info.messageId, recipient: recipientEmail, name: recipientName });
  } catch (err) {
    console.error(`❌ Failed to send to ${recipientEmail}:`, err.message);
    res.status(500).json({ success: false, error: err.message, recipient: recipientEmail });
  }
});

exports.api = onRequest({ cors: true }, app);
