/**
 * lib/init.js
 * Initialises Firebase Admin once and exports shared singletons.
 * Every other module imports from here — never calls initializeApp() itself.
 */

const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { defineSecret } = require('firebase-functions/params');

initializeApp();

const db = getFirestore();
const ENCRYPTION_SALT = defineSecret('ENCRYPTION_SALT');

module.exports = { db, ENCRYPTION_SALT, FieldValue, Timestamp, getAuth };
