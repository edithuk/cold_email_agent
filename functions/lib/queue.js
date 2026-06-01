/**
 * lib/queue.js
 * Account-level campaign queue management.
 *
 * Each sender email address has a single active campaign slot and an ordered
 * pending queue. When a campaign finishes (completed / stopped), this module
 * atomically pops the next campaign and starts it by updating its status to
 * 'running', which in turn triggers the processCampaignChunk Cloud Function.
 */

const { db, FieldValue } = require('./init');

/**
 * Advances the account queue for `senderEmail` after `finishedCampaignId`
 * has completed or been stopped.  If there is another campaign waiting in
 * the pending queue it is atomically promoted to `activeCampaignId` and its
 * Firestore status is set to 'running'.
 *
 * @param {string} uid                  - Firebase user ID
 * @param {string|undefined} senderEmail
 * @param {string} finishedCampaignId
 */
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
      // Updating status to 'running' fires the onDocumentWritten trigger.
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

module.exports = { advanceAccountQueue };
