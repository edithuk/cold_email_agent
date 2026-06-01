/**
 * lib/smtp.js
 * SMTP credential helpers and nodemailer transporter factory.
 */

const nodemailer = require('nodemailer');
const { db } = require('./init');
const { decryptField } = require('./crypto');

/**
 * Fetches and decrypts SMTP credentials stored in `users/{uid}/profile/smtp`.
 *
 * @param {string} uid   - Firebase user ID
 * @param {string} salt  - Encryption salt (from ENCRYPTION_SALT secret, trimmed)
 * @returns {Promise<{ senderEmail: string, senderPassword: string, senderName: string }>}
 */
async function fetchSmtpCredentials(uid, salt) {
  const credDoc = await db.doc(`users/${uid}/profile/smtp`).get();
  if (!credDoc.exists) {
    throw new Error('SMTP credentials not found. Please save your credentials first.');
  }
  const credData = credDoc.data();
  const senderEmail = credData.gmailAddress || credData.email;
  const senderName = credData.displayName || senderEmail?.split('@')[0] || 'Sender';
  const encPw = credData.encryptedPassword;

  if (!senderEmail || !encPw) {
    throw new Error('Incomplete SMTP credentials (missing gmailAddress or encryptedPassword).');
  }
  const senderPassword = await decryptField(encPw, uid, salt);
  if (!senderPassword) {
    throw new Error('Failed to decrypt SMTP password (key mismatch or corrupted data).');
  }
  return { senderEmail, senderPassword, senderName };
}

/**
 * Creates a Nodemailer Gmail SMTP transporter.
 *
 * @param {string} senderEmail
 * @param {string} senderPassword - Gmail App Password
 * @returns {import('nodemailer').Transporter}
 */
function createTransporter(senderEmail, senderPassword) {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: senderEmail, pass: senderPassword },
  });
}

module.exports = { fetchSmtpCredentials, createTransporter };
