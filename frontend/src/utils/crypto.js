// ─────────────────────────────────────────────────────────────────────────────
// utils/crypto.js  –  AES-GCM client-side encryption for sensitive Firestore fields
// Key derivation: PBKDF2(userId, APP_SALT) → 256-bit AES-GCM key
// The encrypted value is stored as a base64 string (12-byte IV || ciphertext).
// ─────────────────────────────────────────────────────────────────────────────

const APP_SALT = import.meta.env.VITE_ENCRYPTION_SALT || 'cold-email-agent-fallback-salt';
const PBKDF2_ITERATIONS = 100_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

async function deriveKey(userId) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(userId),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(APP_SALT),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypt a plaintext string and return a base64-encoded ciphertext. */
export async function encryptField(plaintext, userId) {
  const key = await deriveKey(userId);
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext),
  );
  // Combine iv (12 bytes) + encrypted bytes into one Uint8Array
  const combined = new Uint8Array(12 + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), 12);
  // Return as base64 string safe for Firestore storage
  return btoa(String.fromCharCode(...combined));
}

/** Decrypt a base64-encoded ciphertext string back to plaintext. */
export async function decryptField(cipherBase64, userId) {
  try {
    const key = await deriveKey(userId);
    const combined  = Uint8Array.from(atob(cipherBase64), c => c.charCodeAt(0));
    const iv        = combined.slice(0, 12);
    const encrypted = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted,
    );
    return dec.decode(decrypted);
  } catch {
    // Key mismatch or corrupted data
    return null;
  }
}
