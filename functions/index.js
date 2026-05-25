/**
 * Cold Email Agent – Firebase Cloud Functions
 *
 * dispatchScheduledFollowUps:
 *   Runs every 30 minutes via Cloud Scheduler.
 *   Queries all users' pending scheduled_jobs where sendAfter <= now.
 *   Decrypts their SMTP password (same PBKDF2 + AES-GCM scheme as the browser),
 *   compiles the template with contact data, and sends via nodemailer.
 *   Updates the job document to 'sent' or 'failed'.
 */

const { onSchedule }        = require('firebase-functions/v2/scheduler');
const { defineSecret }      = require('firebase-functions/params');
const { initializeApp }     = require('firebase-admin/app');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');
const nodemailer            = require('nodemailer');
const { subtle }            = require('crypto').webcrypto;   // Node 20 has Web Crypto built-in

initializeApp();
const db = getFirestore();

// The same salt used by the frontend's crypto.js
const ENCRYPTION_SALT = defineSecret('ENCRYPTION_SALT');

// ── Crypto helpers (mirrors frontend/src/utils/crypto.js exactly) ──────────

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
      name:       'PBKDF2',
      salt:       enc.encode(salt),
      iterations: 100_000,
      hash:       'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function decryptField(cipherBase64, userId, salt) {
  try {
    const key      = await deriveKey(userId, salt);
    const combined = Buffer.from(cipherBase64, 'base64');
    const iv       = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const decrypted = await subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    );
    return dec.decode(decrypted);
  } catch (err) {
    console.error('[decrypt] Failed:', err.message);
    return null;
  }
}

// ── Template compiler (mirrors frontend/src/utils/template.js) ───────────

function compileTemplate(template, row, colMap, customTags = []) {
  if (!template) return '';
  let result = template;
  // Core field tags
  if (colMap) {
    Object.entries(colMap).forEach(([field, col]) => {
      if (col && row[col] !== undefined) {
        result = result.replace(new RegExp(`<${field}>`, 'gi'), row[col]);
      }
    });
  }
  // CSV column tags (raw header names normalised to snake_case)
  if (row) {
    Object.entries(row).forEach(([col, val]) => {
      const tag = col.toLowerCase().replace(/\s+/g, '_');
      result = result.replace(new RegExp(`<${tag}>`, 'gi'), val ?? '');
    });
  }
  // Custom tags (leave unresolved ones blank)
  if (customTags && customTags.length) {
    customTags.forEach(tag => {
      result = result.replace(new RegExp(`<${tag}>`, 'gi'), '');
    });
  }
  // Wipe any remaining unresolved tags
  result = result.replace(/<\w+>/g, '');
  return result;
}

// ── Strip HTML to plain text for nodemailer alternative ───────────────────

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

// ── Main scheduled function ───────────────────────────────────────────────

exports.dispatchScheduledFollowUps = onSchedule(
  {
    schedule:  'every 1 hours',   // Runs at the top of every hour
    timeZone:  'UTC',
    secrets:   [ENCRYPTION_SALT],
    memory:    '256MiB',
    timeoutSeconds: 540,
  },
  async (event) => {
    const salt = ENCRYPTION_SALT.value();
    const now  = Timestamp.now();
    console.log(`[scheduler] Running at ${now.toDate().toISOString()}`);

    // ── 1. Find all pending jobs across ALL users that are due ────────────
    // Firestore collectionGroup query across all users
    const snapshot = await db
      .collectionGroup('scheduled_jobs')
      .where('status',    '==', 'pending')
      .where('sendAfter', '<=', now)
      .limit(200)   // process max 200 per run to stay within timeout
      .get();

    if (snapshot.empty) {
      console.log('[scheduler] No pending jobs due. Exiting.');
      return;
    }

    console.log(`[scheduler] Found ${snapshot.size} due job(s).`);

    // Group jobs by userId so we only fetch/decrypt credentials once per user
    const jobsByUser = {};
    snapshot.docs.forEach(docSnap => {
      const data = docSnap.data();
      const userId = data.userId;
      if (!jobsByUser[userId]) jobsByUser[userId] = [];
      jobsByUser[userId].push({ ref: docSnap.ref, data });
    });

    // ── 2. Process each user's jobs ───────────────────────────────────────
    for (const [userId, jobs] of Object.entries(jobsByUser)) {
      // Fetch SMTP credentials from Firestore
      let senderEmail    = null;
      let senderPassword = null;

      try {
        const credDoc = await db.doc(`users/${userId}/private/smtp`).get();
        if (!credDoc.exists) {
          console.warn(`[scheduler] No SMTP creds doc for user ${userId}. Skipping ${jobs.length} job(s).`);
          for (const job of jobs) {
            await job.ref.update({ status: 'failed', error: 'SMTP credentials not found', updatedAt: FieldValue.serverTimestamp() });
          }
          continue;
        }

        const credData = credDoc.data();
        senderEmail    = credData.email;
        const encryptedPassword = credData.encryptedPassword;

        if (!senderEmail || !encryptedPassword) {
          throw new Error('Incomplete SMTP credentials in Firestore');
        }

        senderPassword = await decryptField(encryptedPassword, userId, salt);
        if (!senderPassword) {
          throw new Error('Failed to decrypt SMTP password (key mismatch or corrupted data)');
        }
      } catch (credErr) {
        console.error(`[scheduler] Credential error for user ${userId}:`, credErr.message);
        for (const job of jobs) {
          await job.ref.update({ status: 'failed', error: credErr.message, updatedAt: FieldValue.serverTimestamp() });
        }
        continue;
      }

      // Create a shared transporter for this user's credentials
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: senderEmail,
          pass: senderPassword,
        },
      });

      // ── 3. Send each job for this user ──────────────────────────────────
      for (const job of jobs) {
        const { data, ref } = job;

        // Mark as 'sending' immediately to prevent double-processing on concurrent runs
        await ref.update({ status: 'sending', updatedAt: FieldValue.serverTimestamp() });

        try {
          const compiledSubject = compileTemplate(data.subject, data.contactRow, data.colMap, data.customTags);
          const compiledBody    = compileTemplate(data.body,    data.contactRow, data.colMap, data.customTags);
          const plainText       = htmlToText(compiledBody);

          const mailOptions = {
            from:    `"Cold Email Agent" <${senderEmail}>`,
            to:      `${data.contactName ? data.contactName + ' <' : ''}${data.contactEmail}${data.contactName ? '>' : ''}`,
            subject: compiledSubject,
            html:    compiledBody,
            text:    plainText,
          };

          // Attach resume if present
          if (data.resumeBase64) {
            const buffer = Buffer.from(data.resumeBase64.split(',')[1] || data.resumeBase64, 'base64');
            mailOptions.attachments = [{
              filename: data.resumeFilename || 'resume.pdf',
              content:  buffer,
            }];
          }

          await transporter.sendMail(mailOptions);

          await ref.update({
            status:    'sent',
            sentAt:    FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            error:     null,
          });

          console.log(`[scheduler] ✓ Sent Stage ${data.stageIdx + 1} → ${data.contactEmail}`);
        } catch (sendErr) {
          console.error(`[scheduler] ✗ Failed Stage ${data.stageIdx + 1} → ${data.contactEmail}:`, sendErr.message);
          await ref.update({
            status:    'failed',
            error:     sendErr.message,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        // Small delay between sends to avoid Gmail rate limiting
        await new Promise(r => setTimeout(r, 800));
      }
    }

    console.log('[scheduler] Run complete.');
  }
);
