/**
 * routes/email.js
 * Express router for single-email endpoints:
 *   POST /api/validate-credentials
 *   POST /api/send-email
 */

const { Router } = require('express');
const { createTransporter } = require('../lib/smtp');

const router = Router();

// ── POST /api/validate-credentials ───────────────────────────────────────────
router.post('/validate-credentials', async (req, res) => {
  const { senderEmail, senderPassword } = req.body;
  if (!senderEmail || !senderPassword) {
    return res.status(400).json({ success: false, error: 'Email and password are required.' });
  }
  try {
    const transporter = createTransporter(senderEmail, senderPassword);
    await transporter.verify();
    res.json({ success: true, message: 'Gmail credentials verified successfully.' });
  } catch (err) {
    console.error('[validate-credentials] SMTP verify error:', err.message);
    res.status(401).json({
      success: false,
      error: `Authentication failed: ${err.message}. Make sure you are using an App Password, not your regular Gmail password.`,
    });
  }
});

// ── POST /api/send-email (selective / legacy single-send) ─────────────────────
router.post('/send-email', async (req, res) => {
  const {
    senderEmail, senderPassword, recipientEmail, recipientName,
    subject, body, attachment,
  } = req.body;

  if (!senderEmail || !senderPassword || !recipientEmail || !subject || !body) {
    return res.status(400).json({ success: false, error: 'Missing required fields.' });
  }

  try {
    const transporter = createTransporter(senderEmail, senderPassword);

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

module.exports = router;
