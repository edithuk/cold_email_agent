/**
 * lib/auth.js
 * Firebase Auth middleware / helper for verifying Bearer tokens in Express routes.
 */

const { getAuth } = require('./init');

/**
 * Extracts and verifies a Firebase ID token from the Authorization header.
 * Throws an error with `status = 401` on failure so route handlers can
 * return the right HTTP status code.
 *
 * @param {import('express').Request} req
 * @returns {Promise<import('firebase-admin/auth').DecodedIdToken>}
 */
async function verifyIdToken(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    const err = new Error('Missing or invalid Authorization header.');
    err.status = 401;
    throw err;
  }
  return getAuth().verifyIdToken(token);
}

module.exports = { verifyIdToken };
