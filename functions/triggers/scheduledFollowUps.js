/**
 * triggers/scheduledFollowUps.js
 * Cloud Scheduler trigger — runs every hour and dispatches any scheduled
 * follow-up emails whose sendAfter timestamp is in the past.
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { db, ENCRYPTION_SALT, FieldValue, Timestamp } = require('../lib/init');
const { fetchSmtpCredentials, createTransporter } = require('../lib/smtp');
const { compileTemplate, htmlToText } = require('../lib/template');

exports.dispatchScheduledFollowUps = onSchedule(
  {
    schedule: 'every 1 hours',
    timeZone: 'UTC',
    secrets: [ENCRYPTION_SALT],
    memory: '256MiB',
    timeoutSeconds: 540,
  },
  async () => {
    const salt = ENCRYPTION_SALT.value().trim();
    const now = Timestamp.now();
    console.log(`[scheduler] Running at ${now.toDate().toISOString()}`);

    const snapshot = await db
      .collectionGroup('scheduled_jobs')
      .where('status', '==', 'pending')
      .where('sendAfter', '<=', now)
      .limit(200)
      .get();

    if (snapshot.empty) {
      console.log('[scheduler] No pending jobs due.');
      return;
    }
    console.log(`[scheduler] Found ${snapshot.size} due job(s).`);

    // Group jobs by userId so we only fetch credentials once per account.
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
          await job.ref.update({
            status: 'failed',
            error: credErr.message,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        continue;
      }

      const transporter = createTransporter(senderEmail, senderPassword);

      for (const { data, ref } of jobs) {
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
          await ref.update({
            status: 'failed',
            error: sendErr.message,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        // Brief pause between sends to avoid Gmail rate-limiting.
        await new Promise(r => setTimeout(r, 800));
      }
    }
    console.log('[scheduler] Run complete.');
  }
);
