/**
 * routes/campaigns.js
 * Express router for campaign lifecycle endpoints:
 *   POST /api/start-campaign
 *   POST /api/stop-campaign
 *   POST /api/pause-campaign
 *   POST /api/resume-campaign
 */

const { Router } = require('express');
const { db, FieldValue } = require('../lib/init');
const { verifyIdToken } = require('../lib/auth');

const router = Router();

// ── Helper: auth guard ────────────────────────────────────────────────────────
async function requireAuth(req, res) {
  try {
    return await verifyIdToken(req);
  } catch (e) {
    res.status(e.status || 401).json({ success: false, error: e.message });
    return null;
  }
}

// ── POST /api/start-campaign ──────────────────────────────────────────────────
router.post('/start-campaign', async (req, res) => {
  const decoded = await requireAuth(req, res);
  if (!decoded) return;

  const uid = decoded.uid;
  const {
    contacts, stages, colMap, customTags,
    delaySeconds, campaignName, resumeBase64, resumeFilename,
  } = req.body;

  if (!contacts?.length || !stages?.length || !colMap?.email) {
    return res.status(400).json({
      success: false,
      error: 'contacts, stages, and colMap.email are required.',
    });
  }

  // Look up the sender email from the user's SMTP profile.
  let senderEmail;
  try {
    const credDoc = await db.doc(`users/${uid}/profile/smtp`).get();
    if (!credDoc.exists) {
      return res.status(400).json({
        success: false,
        error: 'No SMTP credentials found. Please save your credentials in Settings first.',
      });
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
        // Start immediately if queue is idle, otherwise wait in line.
        status: isIdle ? 'running' : 'queued',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      tx.set(campaignRef, campaignData);

      if (isIdle) {
        tx.set(queueRef, {
          senderEmail,
          activeCampaignId: campaignId,
          pendingQueue: [],
          updatedAt: FieldValue.serverTimestamp(),
        });
        queued = false;
      } else {
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

// ── POST /api/stop-campaign ───────────────────────────────────────────────────
router.post('/stop-campaign', async (req, res) => {
  const decoded = await requireAuth(req, res);
  if (!decoded) return;

  const { campaignId } = req.body;
  if (!campaignId) return res.status(400).json({ success: false, error: 'campaignId is required.' });

  try {
    const ref = db.doc(`users/${decoded.uid}/campaigns/${campaignId}`);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ success: false, error: 'Campaign not found.' });

    const data = snap.data();

    if (data.status === 'queued') {
      // Cancel immediately — remove from the pending queue.
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
      // Running / paused: request graceful stop (chunk function reads this flag).
      await ref.update({ status: 'stop_requested', updatedAt: FieldValue.serverTimestamp() });
    }

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/pause-campaign ──────────────────────────────────────────────────
router.post('/pause-campaign', async (req, res) => {
  const decoded = await requireAuth(req, res);
  if (!decoded) return;

  const { campaignId } = req.body;
  if (!campaignId) return res.status(400).json({ success: false, error: 'campaignId is required.' });

  try {
    await db.doc(`users/${decoded.uid}/campaigns/${campaignId}`).update({
      status: 'paused',
      updatedAt: FieldValue.serverTimestamp(),
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/resume-campaign ─────────────────────────────────────────────────
router.post('/resume-campaign', async (req, res) => {
  const decoded = await requireAuth(req, res);
  if (!decoded) return;

  const { campaignId } = req.body;
  if (!campaignId) return res.status(400).json({ success: false, error: 'campaignId is required.' });

  try {
    // Setting status back to 'running' re-triggers the onDocumentWritten chunk processor.
    await db.doc(`users/${decoded.uid}/campaigns/${campaignId}`).update({
      status: 'running',
      updatedAt: FieldValue.serverTimestamp(),
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
