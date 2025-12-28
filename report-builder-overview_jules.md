# Atlas Daily Report PWA - Technical Overview & Roadmap

## Executive Summary

The **Atlas Daily Report** is a Progressive Web Application (PWA) designed to streamline the daily reporting process for construction crews. It serves two primary functions:
1.  **Daily Reports:** Capturing crew hours, work performed, equipment usage, and safety topics for daily operations.
2.  **Incident Reports:** Providing a structured, secure workflow for documenting onsite incidents, including photo evidence and administrative approval.

The application is built with an "Offline-First" architecture, ensuring functionality in remote job sites with poor connectivity, while leveraging Firebase for real-time cloud synchronization and secure data storage when online.

---

## Product Features

### 1. Daily Reporting Module
The core of the application allows foremen to generate detailed daily PDF reports directly from their device.

*   **Crew Management:**
    *   Dynamic addition of workers from a managed list.
    *   Duplicate prevention logic ensures accurate crew lists.
    *   Time In/Time Out and Total Hours tracking for each worker.
*   **Report Sections:**
    *   Dedicated fields for *Work Performed*, *Equipment Used*, *Hauling/Dumpsters*, *Safety Topics*, and *Delays*.
    *   Auto-expanding text areas to accommodate detailed descriptions.
*   **PDF Generation (Client-Side):**
    *   Utilizes `jspdf` to generate professional, standardized PDF reports entirely within the browser.
    *   Includes company branding and structured layouts.
    *   **Sharing:** Leverages the Web Share API (`navigator.share`) to allow users to directly email or save the PDF on mobile devices without creating cluttering temporary files.

### 2. Incident Reporting Pipeline
A specialized workflow for documenting safety incidents or accidents.

*   **Submission Workflow:**
    *   Captures critical details: Date, Project, Foreman, Description, and **Photo Evidence**.
    *   **Photo Management:** Users can attach photos which are uploaded to Firebase Storage (with a placeholder fallback mechanism for offline scenarios).
    *   **Signature:** Requires a digital signature from the submitter.
*   **Admin Approval Dashboard:**
    *   Admins can view a list of "Pending" reports.
    *   Admins review details, photos, and the submitter's signature.
    *   **Approval Logic:**
        *   Admins sign off on the report using a secondary signature pad.
        *   Upon approval, the system triggers a final processing step: uploading the report and photos to **Google Drive** for permanent archival.
        *   Includes "Request Revision" functionality to send reports back to the submitter with notes.
    *   **Security:** Strict role-based access control prevents unauthorized users from viewing or approving sensitive incident reports.

### 3. Signature Management System
A robust digital signature implementation designed for reliability and security.

*   **Canvas & Drawing:**
    *   Uses `signature_pad` for high-fidelity stroke capture.
    *   **Resize Handling:** Custom logic preserves signature vector data during window resizing (e.g., rotating a tablet), preventing data loss.
*   **Data Persistence:**
    *   Signatures can be saved locally for quick reuse on daily reports.
    *   Cloud synchronization allows a user's signature to follow them across devices.
*   **Security:** See "Deep Dive: Security & Encryption" below.

### 4. Application Administration
*   **Role-Based Access Control (RBAC):**
    *   **Worker:** Can create reports and view their own data.
    *   **Admin:** Full access to manage lists (Projects, Workers, Admins) and approve incident reports.
*   **List Management:** Admins can add/remove projects and workers, which syncs in real-time to all devices via Firestore.
*   **"Magic Saving" Defaults:** The app learns foreman preferences, automatically associating specific foremen with specific projects to speed up data entry.

### 5. Offline Capabilities
*   **PWA Architecture:** Installed via `vite-plugin-pwa` with a Service Worker that caches critical assets (HTML, CSS, JS).
*   **Local Fallback:** If Firebase is unreachable, the app gracefully degrades to using `localStorage` for saving lists and signatures, ensuring the crew can still generate PDF reports in the field.

---

## Technical Architecture

### Frontend Stack
*   **Framework:** Vanilla JavaScript (ES Modules) for lightweight, fast performance without framework overhead.
*   **Build Tool:** **Vite** is used for bundling, providing extremely fast hot module replacement (HMR) during development and optimized production builds.
*   **PWA:** Configured via `vite-plugin-pwa` to generate the Web Manifest and Service Worker strategies (Auto-Update).
*   **Styling:** CSS3 with CSS Variables for theming (Light/Dark mode support) and responsive Flexbox/Grid layouts.

### Key Libraries
*   **`firebase` (v12+):** Modular SDK for Auth, Firestore, Storage.
*   **`signature_pad`:** For handling canvas drawing input.
*   **`jspdf` & `jspdf-autotable`:** For client-side PDF generation.

### Backend & Infrastructure (Firebase)
*   **Hosting:** Firebase Hosting serves the static assets and PWA entry points.
*   **Authentication:** Firebase Auth (Google Provider) handles identity.
*   **Database:** Cloud Firestore (NoSQL) stores relational data (Users, Projects, Reports).
*   **Storage:** Firebase Storage holds temporary incident photos before they are archived to Drive.

### Integrations: Google Drive
The application integrates with the Google Drive API to provide permanent storage for approved Incident Reports.
*   **Flow:** Upon Admin approval, the app authenticates via OAuth 2.0, creates a structured folder in Drive (e.g., `Incident_2023-10-27_ProjectA`), and uploads the final PDF summary and original high-resolution photos.
*   **Status:** Fully integrated using the Google Identity Services (GIS) and Google API Client (GAPI) libraries.

---

## Deep Dive: Security & Encryption

The application implements a "Defense in Depth" strategy, particularly for handling digital signatures.

### 1. Client-Side Encryption (End-to-End Encryption for Signatures)
To protect user signatures from being stored in plain text or easily compromised, the app uses the **Web Crypto API** to implement AES-GCM encryption.

*   **Encryption Algorithm:** AES-GCM (Galois/Counter Mode) with 256-bit keys. This provides both confidentiality and integrity.
*   **Key Storage (Device Local):**
    *   Encryption keys are stored in **IndexedDB** (using the `atlas_signature_keys` database).
    *   Keys are marked as `extractable: true` only to support the key wrapping mechanism (see below).
    *   This ensures that on a trusted device, the signature is decrypted transparently without user intervention.
*   **Multi-Device Portability (Key Wrapping):**
    *   To allow a user to sync their secure signature to a *new* device, the application uses a **Key Wrapping** strategy based on a user-provided passphrase.
    *   **PBKDF2 Key Derivation:** When a user sets a passphrase, the app derives a "Wrapping Key" using PBKDF2 (100,000 iterations, SHA-256).
    *   **AES-Key Wrapping:** The actual Data Encryption Key (DEK) is wrapped (encrypted) using this derived key.
    *   **Cloud Storage:** The *Wrapped Key*, *Salt*, and *IV* are stored in Firestore (`users/{email}/signatureEncrypted`), but the *actual* key never leaves the device in plain text.
    *   **Result:** The server never sees the raw signature or the raw key. Only a user with the correct passphrase can unwrap the key on a new device.

### 2. Firestore Security Rules
Database access is strictly controlled via `firestore.rules`.

*   **Immutable Identity:** Users can only create documents where `submittedBy` matches their authenticated `request.auth.token.email`. This prevents spoofing.
*   **Role Enforcement:**
    *   Write access to global lists (`projects`, `workers`) is restricted to users where `role == 'admin'`.
    *   Regular `worker` users have Read-Only access to lists.
*   **Incident Report Integrity:**
    *   `allow update`: Only Admins can update incident reports (to change status to `approved`). Submitters cannot tamper with a report after submission.
    *   `allow delete`: Explicitly set to `false` for all users to ensure an audit trail.

---

## Data Model (Firestore Schema)

### `users` Collection
Stores user profiles, roles, and encrypted signature data.
```json
{
  "email": "user@example.com",
  "role": "worker" | "admin",
  "createdAt": "ISO String",
  "signatureEncrypted": {
    "ciphertext": "BASE64...",
    "iv": "BASE64...",
    "keyVersion": 1,
    "isMultiDevice": true,
    "wrappedKey": "BASE64... (Optional)",
    "wrappedKeySalt": "BASE64... (Optional)"
  }
}
```

### `projects` Collection
Global list of active jobsites.
```json
{
  "name": "Downtown Plaza",
  "defaultForeman": "John Doe" // Learned preference
}
```

### `workers` Collection
Global list of available crew members.
```json
{
  "name": "Jane Smith"
}
```

### `incident_reports` Collection
Transactional records of submitted incidents.
```json
{
  "date": "2023-10-27",
  "project": "Downtown Plaza",
  "foreman": "John Doe",
  "description": "...",
  "status": "submitted" | "approved" | "needs_revision",
  "submittedBy": "user@example.com", // Enforced by Security Rules
  "assignedAdmin": "admin@example.com",
  "photos": [
    { "url": "https://firebasestorage...", "path": "..." }
  ],
  "signature": [...] // Vector data for PDF generation
}
```
