# Firebase Hosting & Storage Migration Guide

This guide covers the steps required to complete the migration of the Atlas Daily Report PWA from GitHub Pages to Firebase Hosting. The codebase has already been updated to use Vite and environment variables.

## 1) Prerequisites
- **Node.js** installed locally.
- **Firebase CLI** installed (`npm install -g firebase-tools`).
- Access to the existing Firebase project used for Firestore/Auth.
- Run `npm install` in the project root to install dependencies.

## 2) Local Configuration (Important!)
Since we have moved sensitive keys out of the code, you must configure them locally.
1.  Copy `.env.example` to `.env`:
    ```bash
    cp .env.example .env
    ```
2.  Open `.env` and fill in your actual Firebase API keys.
    *   *Note:* This file is ignored by Git to keep your keys safe.

## 3) Verify Build Locally
Before deploying, ensure the app builds correctly with your keys.
1.  Run the build:
    ```bash
    npm run build
    ```
2.  Preview the production build locally:
    ```bash
    npm run preview
    ```
3.  Open the provided localhost URL (e.g., `http://localhost:4173`) and check that:
    - The app loads without errors.
    - You can log in (Firebase Auth works).
    - The service worker registers (check DevTools > Application).

## 4) Initialize Firebase Hosting
1.  Authenticate:
    ```bash
    firebase login
    ```
2.  Initialize Hosting (if not already done):
    ```bash
    firebase init hosting
    ```
    - Choose **Use existing project** and select your project.
    - **Public directory:** `dist` (This is where Vite builds the app).
    - **Configure as single-page app:** **Yes**.
    - **Set up automatic builds and deploys with GitHub?** **No** (unless you want to set up Actions now).
    - **Overwrite `index.html`?** **No** (Vite handles this).

## 5) Manual Deployment
To deploy the app to the live URL:
1.  Build the project first (Crucial!):
    ```bash
    npm run build
    ```
2.  Deploy to Firebase:
    ```bash
    firebase deploy --only hosting
    ```
3.  Your site will be live at `https://<project-id>.web.app`.

## 6) Automated Deployment (CI/CD via GitHub Actions)
To automate deployment when you push to `main`:
1.  Run `firebase init hosting:github`.
    - It will ask to log in to GitHub.
    - It will create a Service Account key and save it as a GitHub Secret (`FIREBASE_SERVICE_ACCOUNT_...`).
    - It will create `.github/workflows/firebase-hosting-merge.yml`.
2.  **Important:** You must add your `.env` variables to GitHub Secrets so the build server can access them.
    - Go to GitHub Repo > Settings > Secrets and variables > Actions.
    - Add a secret for each key in your `.env` file (e.g., `VITE_FIREBASE_API_KEY`).
    - Update the workflow `.yml` file to inject these secrets during the build step:
      ```yaml
      - run: npm ci && npm run build
        env:
          VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
          # ... add other keys here
      ```

## 7) Cleanup
1.  Disable GitHub Pages in the repository settings to avoid confusion.
2.  Update any DNS records if you are moving a custom domain to Firebase Hosting.

## 8) Post-Migration Integration Steps
The following features are currently disabled or pending configuration:
- **Firebase Storage:** Enable in Firebase Console -> Build -> Storage.
- **Google Drive API:** Enable in Google Cloud Console, create OAuth Client ID, and update `drive-service.js`.

See `app.js` comments for `storageUploadsEnabled` and `driveUploadsEnabled` flags to toggle these features on once configured.
