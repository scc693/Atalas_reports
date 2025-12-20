// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBn_oCvX_fNCBFwLF4kKr5waaQQo0wvDtM",
  authDomain: "atlas-reports-ed500.firebaseapp.com",
  projectId: "atlas-reports-ed500",
  storageBucket: "atlas-reports-ed500.firebasestorage.app",
  messagingSenderId: "819760278562",
  appId: "1:819760278562:web:042ab94fc8d4f050312e7b"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { app, db };
