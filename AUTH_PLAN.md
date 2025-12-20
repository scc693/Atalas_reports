# Google Authentication Implementation Plan

To add Google Sign-In and restrict access to the application, we would need to perform the following steps:

## 1. Firebase Console Setup
*   Go to **Authentication** > **Sign-in method**.
*   Enable **Google**.
*   Configure the support email and save.

## 2. Code Implementation (`app.js`)
*   **Import Auth SDK:**
    ```javascript
    import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "firebase/auth";
    ```
*   **Initialize Auth:**
    ```javascript
    const auth = getAuth(app);
    const provider = new GoogleAuthProvider();
    ```
*   **Create Login UI:**
    *   Add a "Login with Google" button (initially visible).
    *   Hide the main app UI (`.container`) by default.
*   **Handle Login:**
    ```javascript
    loginBtn.addEventListener('click', () => {
        signInWithPopup(auth, provider).then((result) => {
            // User signed in
        }).catch((error) => {
            console.error(error);
        });
    });
    ```
*   **Session Management:**
    *   Use `onAuthStateChanged` to detect if a user is logged in.
    *   If logged in -> Show App, Hide Login Button, Load Data (Firestore listeners).
    *   If logged out -> Hide App, Show Login Button.

## 3. Security Rules (Firestore)
*   Update Firestore rules to strictly enforce authentication:
    ```
    rules_version = '2';
    service cloud.firestore {
      match /databases/{database}/documents {
        match /{document=**} {
          allow read, write: if request.auth != null;
        }
      }
    }
    ```
*   This ensures only logged-in users can read or modify the worker/project lists.

## 4. (Optional) User Whitelisting
*   If you want to restrict access to *specific* Google accounts (e.g., only your company email), we would add a check in the code or security rules to verify `request.auth.token.email` matches an allowed domain or list.

## 5. Role-Based Access Control (Permissions)
To handle different permission levels (e.g., "Standard User" vs. "Admin"), we would implement the following:

### A. Database Structure
*   Create a `users` collection in Firestore.
*   Each document would correspond to a user's email or ID and store their role:
    ```json
    // users/jane@example.com
    {
      "role": "admin"
    }
    // users/joe@example.com
    {
      "role": "standard"
    }
    ```

### B. Security Rules Update
*   **Standard Users:** Can `read` the `workers` and `projects` lists (to populate dropdowns) but cannot `write` (add/delete).
*   **Admins:** Can `read` and `write` to all collections.
    ```
    match /workers/{worker} {
      allow read: if request.auth != null;
      allow write: if get(/databases/$(database)/documents/users/$(request.auth.token.email)).data.role == 'admin';
    }
    ```

### C. UI Adjustments
*   The "Manage Lists" button would be hidden or disabled for users who do not have the 'admin' role.
