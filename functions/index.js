/**
 * Cold Email Agent – Firebase Cloud Functions entry point
 *
 * This file is intentionally thin.  All business logic lives in the
 * sub-modules listed below:
 *
 *   lib/
 *     init.js        — Firebase Admin initialisation & shared singletons
 *     crypto.js      — AES-GCM encrypt/decrypt helpers
 *     template.js    — Template compiler & HTML-to-text converter
 *     auth.js        — Bearer-token auth middleware
 *     smtp.js        — SMTP credential fetching & nodemailer factory
 *     queue.js       — Account-level campaign queue management
 *     swagger.js     — OpenAPI spec & Swagger UI middleware
 *
 *   triggers/
 *     scheduledFollowUps.js  — Cloud Scheduler (every 1 h) follow-up dispatch
 *     campaignChunk.js       — Firestore onDocumentWritten campaign processor
 *
 *   routes/
 *     campaigns.js   — start / stop / pause / resume campaign endpoints
 *     email.js       — validate-credentials & single send-email endpoint
 */

const { onRequest } = require('firebase-functions/v2/https');
const express = require('express');
const cors = require('cors');

const { attachSwagger } = require('./lib/swagger');
const campaignRoutes = require('./routes/campaigns');
const emailRoutes = require('./routes/email');

// ── Cloud Trigger exports ─────────────────────────────────────────────────────
const { dispatchScheduledFollowUps } = require('./triggers/scheduledFollowUps');
const { processCampaignChunk } = require('./triggers/campaignChunk');

exports.dispatchScheduledFollowUps = dispatchScheduledFollowUps;
exports.processCampaignChunk = processCampaignChunk;

// ── Express HTTP API ──────────────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '25mb' }));

// Interactive API docs
attachSwagger(app);

// Health check
app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
);

// Domain routers
app.use('/api', campaignRoutes);
app.use('/api', emailRoutes);

exports.api = onRequest({ cors: true }, app);
