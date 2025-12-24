# Atlas Daily Report PWA

A Progressive Web App (PWA) for generating Atlas Daily Reports, hosted on Firebase Hosting.

## Features

- **Crew Management**: Quickly add workers from a dropdown list.
- **Report Sections**: Fill out Work Performed, Equipment Used, Hauling, Safety Topics, Delays, and Photos Sent.
- **Digital Signature**: Sign the report directly on the screen using a touch-friendly signature pad.
- **PDF Generation**: Generates a PDF formatted to match the Atlas Daily Report specifications.
- **Offline Capable**: Includes a Service Worker for offline access (after first visit).

## Deployment

This project uses **Firebase Hosting** with automatic deployments via GitHub Actions.

### Automatic Deployment (CI/CD)

Pushing to the `Main` branch triggers an automatic build and deploy:

1. GitHub Actions runs `npm ci && npm run build`.
2. The `dist/` folder is deployed to Firebase Hosting.

### Live URL

The app is available at: **<https://atlas-reports-ed500.web.app>**

### Manual Deployment

To deploy manually:

```bash
npm run build
firebase deploy --only hosting
```

## Local Development

```bash
npm install
npm run dev
```

## Usage

1. Open the app URL on your device.
2. Fill in the date, project details, and foreman name.
3. Add crew members and adjust their hours.
4. Fill out the report sections.
5. Sign in the signature box.
6. Click **Generate PDF** to download the report.
