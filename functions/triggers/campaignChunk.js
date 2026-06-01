/**
 * triggers/campaignChunk.js
 * Firestore onDocumentWritten trigger — users/{uid}/campaigns/{campaignId}.
 *
 * Processes one chunk of contacts (up to 25) per invocation, sending Stage 0
 * emails and queuing follow-up jobs for later stages.  Self-chains by
 * incrementing `currentChunkIdx`, which re-fires this trigger.
 *
 * Critical guard logic prevents re-entrant execution from per-contact result
 * writes (those don't change currentChunkIdx or status).
 */

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { db, ENCRYPTION_SALT, FieldValue, Timestamp } = require('../lib/init');
const { fetchSmtpCredentials, createTransporter } = require('../lib/smtp');
const { compileTemplate, htmlToText } = require('../lib/template');
const { advanceAccountQueue } = require('../lib/queue');

exports.processCampaignChunk = onDocumentWritten(
  {
    document: 'users/{uid}/campaigns/{campaignId}',
    region: 'asia-south2',
    secrets: [ENCRYPTION_SALT],
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async (event) => {
    const before = event.data.before.data() ?? {};
    const after = event.data.after.data();

    // ── Guard 1: ignore deletes and non-running states ────────────────────
    if (!after) return;
    if (after.status !== 'running') return;

    // ── Guard 2: only act on meaningful state transitions ─────────────────
    // Per-contact result writes must NOT trigger a new chunk — they don't
    // change currentChunkIdx or status.
    const isNew = !event.data.before.exists;
    const chunkAdvanced = after.currentChunkIdx !== before.currentChunkIdx;
    const statusOpened = before.status !== 'running' && after.status === 'running';

    if (!isNew && !chunkAdvanced && !statusOpened) {
      // Spurious write (e.g. result update, counter increment) — skip silently.
      return;
    }

    const { uid, campaignId } = event.params;
    const campaignRef = db.doc(`users/${uid}/campaigns/${campaignId}`);
    const salt = ENCRYPTION_SALT.value().trim();

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

    // ── Fetch & decrypt SMTP credentials ──────────────────────────────────
    let senderEmail, senderPassword, senderName;
    try {
      ({ senderEmail, senderPassword, senderName } = await fetchSmtpCredentials(uid, salt));
    } catch (credErr) {
      console.error('[chunk] Credential error:', credErr.message);
      await campaignRef.update({
        status: 'failed',
        error: credErr.message,
        updatedAt: FieldValue.serverTimestamp(),
      });
      await advanceAccountQueue(uid, after.senderEmail, campaignId);
      return;
    }

    const transporter = createTransporter(senderEmail, senderPassword);

    const contacts = after.contacts || [];
    const stages = after.stages || [];
    const colMap = after.colMap || {};
    const customTags = after.customTags || [];
    const stage0 = stages[0] || {};
    const delayMs = (after.delaySeconds ?? 15) * 1000;

    let stopped = false;
    let paused = false;

    // ── Process each contact in this chunk ────────────────────────────────
    for (let i = start; i < end; i++) {

      // Re-check stop/pause every 5 contacts (fresh Firestore read).
      if ((i - start) > 0 && (i - start) % 5 === 0) {
        const fresh = await campaignRef.get();
        const s = fresh.data()?.status;
        if (s === 'stop_requested') { stopped = true; break; }
        if (s === 'paused') { paused = true; break; }
      }

      const row = contacts[i];
      const recipientEmail = row[colMap.email]?.toString().trim() || '';
      const recipientName = colMap.name ? row[colMap.name]?.toString().trim() : '';

      // ── IDEMPOTENCY CHECK: skip contacts already successfully sent ────────
      // This guards against duplicate sends when the function is retried after
      // a timeout or crash (the contact loop restarts from `start` but the
      // Firestore results map already reflects what was done in the prior run).
      const existingResult = after.results?.[String(i)];
      if (existingResult?.status === 'success') {
        console.log(`[chunk] Contact ${i} (${recipientEmail}) already sent — skipping.`);
        continue;
      }

      // Mark contact as active (doesn't advance chunkIdx → guard filters re-entry).
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

        // ── Queue follow-up stages (1+) for this contact ──────────────────
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

      // Inter-contact delay (skip after the last contact in the chunk).
      if (i < end - 1 && !stopped && !paused) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }

    // ── Determine next state after chunk loop ─────────────────────────────
    if (stopped) {
      console.log(`[chunk] Stopped by user. Campaign ${campaignId} stopped.`);
      await campaignRef.update({ status: 'stopped', updatedAt: FieldValue.serverTimestamp() });
      await advanceAccountQueue(uid, after.senderEmail, campaignId);

    } else if (paused) {
      console.log(`[chunk] Paused by user. Campaign ${campaignId} paused.`);
      // Don't advance queue — a paused campaign holds its slot.
      await campaignRef.update({ status: 'paused', updatedAt: FieldValue.serverTimestamp() });

    } else if (end >= total) {
      console.log(`[chunk] All ${total} contacts done. Campaign ${campaignId} completed!`);
      await campaignRef.update({ status: 'completed', updatedAt: FieldValue.serverTimestamp() });
      await advanceAccountQueue(uid, after.senderEmail, campaignId);

    } else {
      // Advance to the next chunk — this write triggers the next invocation.
      console.log(`[chunk] Chunk ${chunkIdx} done. Triggering chunk ${chunkIdx + 1}...`);
      await campaignRef.update({
        currentChunkIdx: chunkIdx + 1,
        status: 'running',
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }
);
