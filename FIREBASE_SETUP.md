# Firebase Setup Guide

To enable real-time cloud storage for your Atlas Daily Report app, follow these steps to set up a free Google Firebase project.

## 1. Create a Firebase Project
1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Click **"Add project"**.
3. Enter a name (e.g., `atlas-daily-report`).
4. Disable Google Analytics (not needed for this app) and click **"Create project"**.
5. Once ready, click **"Continue"**.

## 2. Enable Cloud Firestore
1. In the left sidebar, click **"Build"** > **"Firestore Database"**.
2. Click **"Create database"**.
3. Choose a location close to you (e.g., `nam5 (us-central)`).
4. **Security Rules:** Select **"Start in test mode"**.
   *   *Note: This allows anyone with the link to read/write data, which matches your request for an open tool without login. For production apps with sensitive data, you would lock this down later.*
5. Click **"Create"**.

## 3. Get Configuration Keys
1. In the Project Overview (click the Gear icon ⚙️ next to "Project Overview" in the top left), select **"Project settings"**.
2. Scroll down to the **"Your apps"** section.
3. Click the **Web icon** (`</>`) to create a web app.
4. Enter a nickname (e.g., `Atlas PWA`).
5. Uncheck "Also set up Firebase Hosting" (since you are using GitHub Pages or similar).
6. Click **"Register app"**.
7. You will see a code block labeled `const firebaseConfig = { ... };`.

## 4. Update Your Code
1. Open the `firebase-config.js` file in your repository.
2. Replace the placeholder values with the ones from the code block you just generated.

```javascript
// Example of what to look for in firebase-config.js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "atlas-daily-report.firebaseapp.com",
  projectId: "atlas-daily-report",
  storageBucket: "atlas-daily-report.firebasestorage.app",
  messagingSenderId: "...",
  appId: "..."
};
```

3. Save the file and deploy your app.

**That's it!** Your app now syncs workers and projects in real-time across all devices.
