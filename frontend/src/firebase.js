import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Validate config at startup
const missingKeys = Object.entries(firebaseConfig)
  .filter(([, v]) => !v || v.startsWith('your_'))
  .map(([k]) => k);

if (missingKeys.length > 0) {
  console.warn(
    `[Firebase] Missing env vars: ${missingKeys.join(', ')}.\n` +
    'Fill in frontend/.env.local with your Firebase project config.'
  );
}

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// ── Local emulator connections ────────────────────────────────────────────────
// Set VITE_USE_EMULATOR=true in frontend/.env.local to use local emulators
// instead of production Firebase. Never set this in .env.production.
if (import.meta.env.VITE_USE_EMULATOR === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  console.info(
    '%c[Firebase] 🔧 Using LOCAL EMULATORS (Auth:9099, Firestore:8080, Functions via Vite proxy→5001)',
    'color: orange; font-weight: bold'
  );
}
