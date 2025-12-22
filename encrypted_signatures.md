# Encrypted signature storage plan

## Goals
- Prevent Firestore from holding raw signature data while keeping signatures decryptable by the signed-in user.
- Minimize blast radius if Firestore is compromised or a device is lost.
- Keep the implementation fully client-side using browser-standard APIs (no custom backend).

## Recommended approach (why not hashing)
- A signature must be viewable later, so a one-way hash does not work; use authenticated encryption instead.
- Use symmetric AES-GCM for confidentiality + integrity. It is supported in modern browsers via the Web Crypto API and works with binary canvas exports.

## Key management
- Generate a per-user data key on first signature save: `crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"])`.
- Persist the `CryptoKey` in IndexedDB (structured clone allows storing non-exportable keys). Keep a `keyVersion` marker alongside it.
- On logout or auth change, delete the cached key from IndexedDB and memory.
- Optional multi-device unlock:
  - Derive a wrapping key from a user-provided passphrase with PBKDF2 + salt (salt stored in Firestore under the user document).
  - Wrap (`crypto.subtle.wrapKey`) the data key with that wrapping key and store the wrapped blob + salt + iterations in Firestore. On a new device, prompt for the passphrase to unwrap.
- Do **not** derive the encryption key from Firebase ID tokens or UID alone; those are server-visible and rotate unpredictably.

## Encryption workflow (per save)
1. Export the signature from `signature_pad` as a PNG data URL, convert to an `ArrayBuffer`.
2. Ensure the data key is loaded from IndexedDB; if missing, generate and persist it.
3. Create a random 96-bit IV (`crypto.getRandomValues(new Uint8Array(12))`).
4. Encrypt with `crypto.subtle.encrypt({ name: "AES-GCM", iv }, dataKey, signatureBuffer)`.
5. Base64-encode the ciphertext and IV for Firestore storage.
6. Store in Firestore (e.g., `signatures/{userId}/{reportId}`) the fields: `ciphertext`, `iv`, `keyVersion`, `createdAt`, `mimeType` (e.g., `image/png`), `format` (e.g., `base64`), and optional `wrappedKey` metadata if multi-device recovery is enabled.

## Decryption workflow (per view/download)
1. Load the data key from IndexedDB; if absent, attempt unwrap with the stored wrapped key (prompting for passphrase) or fail securely.
2. Fetch ciphertext + IV from Firestore.
3. Decrypt with AES-GCM; handle failures by clearing cached keys and prompting the user to re-unlock.
4. Convert the plaintext `ArrayBuffer` back to a blob/data URL for display or PDF embedding.

## Key rotation and recovery
- Track `keyVersion` in both IndexedDB and Firestore records.
- To rotate:
  1. Generate a new data key and bump `keyVersion`.
  2. Re-encrypt existing signatures locally in batches, updating `keyVersion` per document.
  3. Update wrapped-key metadata if multi-device recovery is used.
- If unwrap fails (wrong passphrase), block decryption, clear local cache, and request the passphrase again.

## Data handling safeguards
- Zero sensitive buffers after use (`ciphertext.fill(0)` before dropping references where practical).
- Strip the canvas after encryption to avoid lingering plaintext in memory/DOM.
- Use HTTPS-only service worker caching; never cache ciphertext responses in shared caches.
- Gate encryption/decryption on Firebase Auth state; block operations until `onAuthStateChanged` yields a valid user.

## Implementation checklist (app.js oriented)
- Add a `signatureEncryption` module with helpers for key load/generate, encrypt, decrypt, and unwrap logic (Web Crypto + IndexedDB).
- Integrate into the existing signature save flow: replace direct Firestore writes with the encrypted payload schema above.
- Integrate into signature display/export: decrypt before rendering in the UI or embedding into PDF.
- Add UI states: loading/unlock prompts, passphrase entry for new devices, and error messaging for decryption failures.
- Add Jest tests for (a) encryption/decryption round-trips, (b) key persistence/clearing on logout, and (c) unwrap failure cases.

## Open questions to settle with stakeholders
- Is multi-device access required? If yes, enforce passphrase-based wrapping; if not, keep keys device-local for stronger isolation.
- What is the acceptable UX for passphrase loss (e.g., signatures become unrecoverable vs. admin-assisted reset with data loss)?
- Should signature data expire or be pruneable, and how should rotation be scheduled (per month/quarter/event)?
