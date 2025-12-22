# Firebase Hosting & Storage Migration Guide

This guide covers migrating the PWA from GitHub Pages to Firebase Hosting (Spark plan) while keeping source code on GitHub. It also explains enabling Firebase Storage and Google Drive integrations (currently disabled).

## 1) Prerequisites
- Firebase CLI installed locally (`npm install -g firebase-tools`).
- Access to the existing Firebase project used for Firestore/Auth.
- Project ID: confirm with `firebase projects:list`.
- GitHub repository permissions (for CI/CD setup, if desired).

## 2) Snapshot current hosting setup
- Note the current GitHub Pages branch/path and custom domain (if any).
- Confirm the production build output location (static assets are at repo root for this PWA).
- Export any DNS records used for Pages; you will need to update them for Firebase Hosting.

## 3) Initialize Firebase Hosting locally
1. Authenticate: `firebase login`.
2. In the repo root, run `firebase init hosting`:
   - Choose **Use existing project** and select the current Firebase project.
   - Public directory: `.` (root contains `index.html`, `app.js`, `sw.js`, etc.).
   - Configure as single-page app: **Yes** (rewrites all routes to `index.html`).
   - Do **not** overwrite existing files.
3. Confirm new files: `.firebase/`, `firebase.json`, `.firebaserc` (review into git).

### Example minimal `firebase.json`
```json
{
  "hosting": {
    "public": ".",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      { "source": "**", "destination": "/index.html" }
    ],
    "headers": [
      {
        "source": "/sw.js",
        "headers": [{ "key": "Cache-Control", "value": "no-cache" }]
      }
    ]
  }
}
```
- The `sw.js` header avoids aggressive caching during deployments.

## 4) Build & test locally (optional)
- If you have a build step, run it before deploy (this app serves static files directly). Use `firebase emulators:start --only hosting` to verify locally at `http://localhost:5000`.

## 5) Deploy to Firebase Hosting
1. Manual deploy: `firebase deploy --only hosting`.
2. Verify the live site URL shown in the deploy output (default: `https://<project-id>.web.app` and `https://<project-id>.firebaseapp.com`).
3. Confirm Service Worker update and offline behavior.

## 6) Set up CI/CD from GitHub (optional but recommended)
1. Run `firebase login:ci` to generate a CI token.
2. Add the token as a GitHub Actions secret (e.g., `FIREBASE_TOKEN`).
3. Create `.github/workflows/firebase-hosting.yml`:
   - Trigger on pushes to the main branch.
   - Steps: checkout -> setup Node -> install deps -> `firebase deploy --only hosting --token ${{ secrets.FIREBASE_TOKEN }}`.
4. Remove/disable GitHub Pages to avoid conflicting hosting.

## 7) Migrate custom domain (if used)
1. Add domain in Firebase Console > Hosting > Add custom domain.
2. Update DNS: add the TXT verification record, then A/AAAA records pointing to Firebase.
3. Wait for verification and HTTPS provisioning.

## 8) Enable Firebase Storage
1. In Firebase Console > Build > Storage: click **Get started** → choose the existing project → select the default bucket (keep it in the same region as Firestore).
2. Review security rules; start with authenticated access:
   ```rules
   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       match /{allPaths=**} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```
3. Commit updated `storage.rules` (if created) and deploy with `firebase deploy --only storage` after validation.

## 9) Wire Storage into the PWA
- Add the storage SDK to `firebase-config.js`:
  ```js
  import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
  export const storage = getStorage(app);
  ```
- In upload/download flows, replace placeholders with Storage calls:
  - Create refs via `ref(storage, 'uploads/${file.name}')`.
  - Use `uploadBytes` for file uploads and `getDownloadURL` to fetch URLs.
- Ensure UI gating: only show upload controls for authenticated users.
- Update Firestore docs if you store download URLs/metadata alongside records.

## 10) Enable Google Drive integration
1. In Google Cloud Console for the Firebase project, enable the **Google Drive API**.
2. Configure OAuth consent screen (Internal if only workspace users; External otherwise).
3. Create OAuth 2.0 Client ID (type: Web application) with authorized JS origins set to the Firebase Hosting domain(s) and redirect URI for the Google picker/Drive flow (if applicable).
4. Store the Client ID in a config file or environment (do not commit secrets).
5. Frontend integration:
   - Load Google API client (`gapi`) and initialize with the Client ID and scopes, e.g., `https://www.googleapis.com/auth/drive.file`.
   - Use the existing Drive service module to exchange tokens and perform file operations; update redirect URIs to match the Firebase Hosting domain.
6. Verify Drive flows in production URLs after deployment.

## 11) Clean-up & monitoring
- Remove GitHub Pages configuration (Settings → Pages → disable).
- Set up Firebase Hosting logs and alerts (via Google Cloud Logging).
- Verify Lighthouse scores and PWA installability on the new domain.
- Document new deployment commands in `README.md` or contributor docs.
