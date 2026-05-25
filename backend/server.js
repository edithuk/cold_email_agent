require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '25mb' }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Validate SMTP credentials without sending a real email
app.post('/api/validate-credentials', async (req, res) => {
  const { senderEmail, senderPassword } = req.body;

  if (!senderEmail || !senderPassword) {
    return res.status(400).json({ success: false, error: 'Email and password are required.' });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: senderEmail,
        pass: senderPassword,
      },
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

// Send a single email
app.post('/api/send-email', async (req, res) => {
  const {
    senderEmail,
    senderPassword,
    recipientEmail,
    recipientName,
    subject,
    body,
    attachment, // { filename: string, content: string (base64), contentType: string }
  } = req.body;

  if (!senderEmail || !senderPassword || !recipientEmail || !subject || !body) {
    return res.status(400).json({ success: false, error: 'Missing required fields.' });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: senderEmail,
        pass: senderPassword,
      },
    });

    const mailOptions = {
      from: `"${senderEmail.split('@')[0]}" <${senderEmail}>`,
      to: recipientEmail,
      subject: subject,
      html: body,   // already rich HTML from Quill editor
      text: body.replace(/<[^>]*>/g, ''), // plain-text fallback (tags stripped)
    };

    if (attachment && attachment.content && attachment.filename) {
      mailOptions.attachments = [
        {
          filename: attachment.filename,
          content: Buffer.from(attachment.content, 'base64'),
          contentType: attachment.contentType || 'application/octet-stream',
        },
      ];
    }

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${recipientEmail} [${info.messageId}]`);

    res.json({
      success: true,
      messageId: info.messageId,
      recipient: recipientEmail,
      name: recipientName,
    });
  } catch (err) {
    console.error(`❌ Failed to send to ${recipientEmail}:`, err.message);
    res.status(500).json({
      success: false,
      error: err.message,
      recipient: recipientEmail,
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Cold Email Agent backend running on http://localhost:${PORT}`);
});
