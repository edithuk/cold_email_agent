/**
 * lib/crypto.js
 * AES-GCM encryption helpers.
 * Mirrors frontend/src/utils/crypto.js exactly so both sides derive the
 * same key from the same salt + userId.
 */

const { subtle } = require('crypto').webcrypto; // Node 20 built-in

const enc = new TextEncoder();
const dec = new TextDecoder();

/**
 * Derives a 256-bit AES-GCM key from the given userId and salt via PBKDF2.
 * @param {string} userId
 * @param {string} salt
 * @returns {Promise<CryptoKey>}
 */
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

/**
 * Decrypts a base64-encoded AES-GCM cipher produced by the frontend.
 * Returns null if decryption fails (key mismatch, corrupt data, etc.).
 * @param {string} cipherBase64
 * @param {string} userId
 * @param {string} salt
 * @returns {Promise<string|null>}
 */
async function decryptField(cipherBase64, userId, salt) {
  try {
    const key = await deriveKey(userId, salt);
    const buf = Buffer.from(cipherBase64, 'base64');
    // Copy into a fresh Uint8Array to avoid Node WebCrypto byteOffset bugs.
    const combined = new Uint8Array(buf.length);
    combined.set(buf);
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const decrypted = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return dec.decode(decrypted);
  } catch (err) {
    console.error('[crypto] decryptField failed:', err.message);
    return null;
  }
}

module.exports = { deriveKey, decryptField };
