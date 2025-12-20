import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBn_oCvX_fNCBFwLF4kKr5waaQQo0wvDtM",
  authDomain: "atlas-reports-ed500.firebaseapp.com",
  projectId: "atlas-reports-ed500",
  storageBucket: "atlas-reports-ed500.firebasestorage.app",
  messagingSenderId: "819760278562",
  appId: "1:819760278562:web:042ab94fc8d4f050312e7b"
};

// Google Drive API Config
const driveConfig = {
  clientId: "YOUR_GOOGLE_CLIENT_ID", // TODO: Replace with actual Client ID
  apiKey: "YOUR_GOOGLE_API_KEY",    // TODO: Replace with actual API Key
  scopes: "https://www.googleapis.com/auth/drive.file"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app); // Initialize Storage

export { app, db, auth, storage, driveConfig };
