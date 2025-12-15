# Atlas Daily Report PWA

This is a Progressive Web App (PWA) for generating Atlas Daily Reports. It is designed to be hosted on GitHub Pages.

## Features

- **Crew Management**: Quickly add workers from a dropdown list.
- **Report Sections**: Fill out Work Performed, Equipment Used, Hauling, Safety Topics, Delays, and Photos Sent.
- **Digital Signature**: Sign the report directly on the screen using a touch-friendly signature pad.
- **PDF Generation**: Generates a PDF formatted to match the Atlas Daily Report specifications.
- **Offline Capable**: Includes a Service Worker for offline access (after first visit).

## Hosting on GitHub Pages

1. Commit and push these files to a GitHub repository.
2. Go to the repository **Settings**.
3. Navigate to **Pages** in the sidebar.
4. Under **Source**, select `Deploy from a branch`.
5. Select your main branch and `/ (root)` folder.
6. Click **Save**.

Your app will be available at `https://<your-username>.github.io/<repo-name>/`.

## Usage

1. Open the app URL on your device.
2. Fill in the date, project details, and foreman name.
3. Add crew members and adjust their hours.
4. Fill out the report sections.
5. Sign in the signature box.
6. Click **Generate PDF** to download the report.
