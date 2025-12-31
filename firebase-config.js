import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import {
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  browserPopupRedirectResolver,
} from "firebase/auth";
import { getStorage } from "firebase/storage";

// Helper to handle both Vite (import.meta.env) and Jest (process.env)
const getEnv = (key) => {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env[key];
  }
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return undefined;
};

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: getEnv('VITE_FIREBASE_API_KEY'),
  authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: getEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: getEnv('VITE_FIREBASE_APP_ID')
};

// Google Client ID for One Tap
const googleClientId = getEnv('VITE_GOOGLE_CLIENT_ID') || 'YOUR_GOOGLE_CLIENT_ID';

// Google Drive API Config
const driveConfig = {
  clientId: "YOUR_GOOGLE_CLIENT_ID", // TODO: Replace with actual Client ID
  apiKey: "YOUR_GOOGLE_API_KEY",    // TODO: Replace with actual API Key
  scopes: "https://www.googleapis.com/auth/drive.file"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore with persistent cache (replaces deprecated enableIndexedDbPersistence)
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

// Use explicit Auth initialization so we can control persistence.
// Safari PWAs (especially on iOS) sometimes run in environments where
// third-party cookies and localStorage behave differently, which can
// cause redirect-based sign-ins to "forget" the authenticated session.
// Providing multiple persistence fallbacks anchored by IndexedDB keeps
// the redirect session available when the app re-opens in standalone mode.
const auth = initializeAuth(app, {
  persistence: [
    indexedDBLocalPersistence,
    browserLocalPersistence,
    browserSessionPersistence,
  ],
  popupRedirectResolver: browserPopupRedirectResolver,
});
const storage = getStorage(app); // Initialize Storage

export { app, db, auth, storage, driveConfig, googleClientId };

