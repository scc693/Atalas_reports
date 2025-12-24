# Firebase Hosting & Storage Migration Guide

This guide covers the steps required to complete the migration of the Atlas Daily Report PWA from GitHub Pages to Firebase Hosting. The codebase has already been updated to use Vite and environment variables.

## 1) Prerequisites

- **Node.js** installed locally.
- **Firebase CLI** installed (`npm install -g firebase-tools`).
- Access to the existing Firebase project used for Firestore/Auth.
- Run `npm install` in the project root to install dependencies.

## 2) Local Configuration (Important!)

Since we have moved sensitive keys out of the code, you must configure them locally.

1. Copy `.env.example` to `.env`:

    ```bash
    cp .env.example .env
    ```

2. Open `.env` and fill in your actual Firebase API keys.
    - *Note:* This file is ignored by Git to keep your keys safe.

## 3) Verify Build Locally

Before deploying, ensure the app builds correctly with your keys.

1. Run the build:

    ```bash
    npm run build
    ```

2. Preview the production build locally:

    ```bash
    npm run preview
    ```

3. Open the provided localhost URL (e.g., `http://localhost:4173`) and check that:
    - The app loads without errors.
    - You can log in (Firebase Auth works).
    - The service worker registers (check DevTools > Application).

## 4) Initialize Firebase Hosting with GitHub Actions

1. Authenticate:

    ```bash
    firebase login
    ```

2. Initialize Hosting with GitHub integration:

    ```bash
    firebase init hosting
    ```

    - Choose **Use existing project** and select your project.
    - **Public directory:** `dist` (This is where Vite builds the app).
    - **Configure as single-page app:** **Yes**.
    - **Set up automatic builds and deploys with GitHub?** **Yes**.
    - **Overwrite `index.html`?** **No** (Vite handles this).

3. The Firebase CLI will now:
    - Prompt you to authorize with GitHub (follow the browser flow).
    - Ask which GitHub repository to use.
    - Create a Service Account key and save it as a GitHub Secret (`FIREBASE_SERVICE_ACCOUNT_...`).
    - Generate two workflow files:
      - `.github/workflows/firebase-hosting-merge.yml` (deploys on push to main)
      - `.github/workflows/firebase-hosting-pull-request.yml` (preview channel for PRs)

4. **Critical:** Add your Firebase keys to GitHub Secrets:
    - Go to your GitHub Repo > Settings > Secrets and variables > Actions.
    - Click "New repository secret" and add each of these:
      - `VITE_FIREBASE_API_KEY` = (your API key value)
      - `VITE_FIREBASE_AUTH_DOMAIN` = (your auth domain)
      - `VITE_FIREBASE_PROJECT_ID` = (your project ID)
      - `VITE_FIREBASE_STORAGE_BUCKET` = (your storage bucket)
      - `VITE_FIREBASE_MESSAGING_SENDER_ID` = (your sender ID)
      - `VITE_FIREBASE_APP_ID` = (your app ID)

5. Update the generated workflow files to use these secrets:
    - Open `.github/workflows/firebase-hosting-merge.yml`
    - Find the `npm ci && npm run build` step
    - Add the `env:` section with your secrets:

      ```yaml
      - run: npm ci && npm run build
        env:
          VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
          VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.VITE_FIREBASE_AUTH_DOMAIN }}
          VITE_FIREBASE_PROJECT_ID: ${{ secrets.VITE_FIREBASE_PROJECT_ID }}
          VITE_FIREBASE_STORAGE_BUCKET: ${{ secrets.VITE_FIREBASE_STORAGE_BUCKET }}
          VITE_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.VITE_FIREBASE_MESSAGING_SENDER_ID }}
          VITE_FIREBASE_APP_ID: ${{ secrets.VITE_FIREBASE_APP_ID }}
      ```

    - Repeat for `.github/workflows/firebase-hosting-pull-request.yml`

## 5) First Deployment

Once GitHub Actions is configured, deployment is automatic:

1. Commit and push your changes to the `main` branch:

    ```bash
    git add .
    git commit -m "Configure Firebase Hosting with GitHub Actions"
    git push origin main
    ```

2. GitHub Actions will automatically build and deploy your app.
3. Check the Actions tab in your GitHub repo to monitor the deployment.
4. Your site will be live at `https://<project-id>.web.app`.

## 6) Manual Deployment (Optional)

If you ever need to deploy manually:

1. Build the project first:

    ```bash
    npm run build
    ```

2. Deploy to Firebase:

    ```bash
    firebase deploy --only hosting
    ```

## 7) Cleanup

1. Disable GitHub Pages in the repository settings to avoid confusion.
2. Update any DNS records if you are moving a custom domain to Firebase Hosting.

## 8) Post-Migration Integration Steps

The following features are currently disabled or pending configuration:

- **Firebase Storage:** Enable in Firebase Console -> Build -> Storage.
- **Google Drive API:** Enable in Google Cloud Console, create OAuth Client ID, and update `drive-service.js`.

See `app.js` comments for `storageUploadsEnabled` and `driveUploadsEnabled` flags to toggle these features on once configured.
