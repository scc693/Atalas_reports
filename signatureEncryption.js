/**
 * Signature Encryption Module
 * Uses Web Crypto API (AES-GCM) and IndexedDB for secure signature storage.
 * 
 * Features:
 * - Device-local encryption with IndexedDB key storage
 * - Optional multi-device access via passphrase-wrapped keys
 * - Self-service passphrase reset (clears signature)
 */

const DB_NAME = 'atlas_signature_keys';
const DB_VERSION = 1;
const KEY_STORE = 'keys';
const CURRENT_KEY_VERSION = 1;

// --- IndexedDB Helpers ---

/**
 * Opens the IndexedDB database for key storage.
 * @returns {Promise<IDBDatabase>}
 */
function openKeyStore() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(KEY_STORE)) {
                db.createObjectStore(KEY_STORE, { keyPath: 'id' });
            }
        };
    });
}

/**
 * Retrieves the data key from IndexedDB.
 * @returns {Promise<{key: CryptoKey, keyVersion: number} | null>}
 */
export async function loadDataKey() {
    try {
        const db = await openKeyStore();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(KEY_STORE, 'readonly');
            const store = transaction.objectStore(KEY_STORE);
            const request = store.get('dataKey');

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const result = request.result;
                if (result && result.key) {
                    resolve({ key: result.key, keyVersion: result.keyVersion || 1 });
                } else {
                    resolve(null);
                }
            };
        });
    } catch (err) {
        console.error('Error loading data key from IndexedDB:', err);
        return null;
    }
}

/**
 * Generates a new AES-GCM 256-bit encryption key.
 * @returns {Promise<CryptoKey>}
 */
export async function generateDataKey() {
    return crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true, // extractable (needed for wrapping)
        ['encrypt', 'decrypt']
    );
}

/**
 * Saves the data key to IndexedDB.
 * @param {CryptoKey} key 
 * @param {number} keyVersion 
 * @returns {Promise<void>}
 */
export async function saveDataKey(key, keyVersion = CURRENT_KEY_VERSION) {
    const db = await openKeyStore();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(KEY_STORE, 'readwrite');
        const store = transaction.objectStore(KEY_STORE);
        const request = store.put({ id: 'dataKey', key, keyVersion });

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

/**
 * Clears the encryption key from IndexedDB (for logout or reset).
 * @returns {Promise<void>}
 */
export async function clearDataKey() {
    try {
        const db = await openKeyStore();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(KEY_STORE, 'readwrite');
            const store = transaction.objectStore(KEY_STORE);
            const request = store.delete('dataKey');

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    } catch (err) {
        console.error('Error clearing data key:', err);
    }
}

// --- Encryption / Decryption ---

/**
 * Encrypts signature data using AES-GCM.
 * @param {string} signatureData - Base64 data URL or JSON string of signature
 * @param {CryptoKey} dataKey - AES-GCM key
 * @returns {Promise<{ciphertext: string, iv: string}>} - Base64 encoded ciphertext and IV
 */
export async function encryptSignature(signatureData, dataKey) {
    // Convert string to ArrayBuffer
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(signatureData);

    // Generate random IV (96 bits for AES-GCM)
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Encrypt
    const ciphertextBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        dataKey,
        dataBuffer
    );

    // Base64 encode for storage
    const ciphertext = btoa(String.fromCharCode(...new Uint8Array(ciphertextBuffer)));
    const ivBase64 = btoa(String.fromCharCode(...iv));

    return { ciphertext, iv: ivBase64 };
}

/**
 * Decrypts signature data using AES-GCM.
 * @param {string} ciphertext - Base64 encoded ciphertext
 * @param {string} ivBase64 - Base64 encoded IV
 * @param {CryptoKey} dataKey - AES-GCM key
 * @returns {Promise<string>} - Original signature data
 */
export async function decryptSignature(ciphertext, ivBase64, dataKey) {
    // Decode from Base64
    const ciphertextArray = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));

    // Decrypt
    const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        dataKey,
        ciphertextArray
    );

    // Convert back to string
    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
}

// --- Passphrase-based Key Wrapping (for multi-device) ---

const PBKDF2_ITERATIONS = 100000;

/**
 * Derives a wrapping key from a passphrase using PBKDF2.
 * @param {string} passphrase 
 * @param {Uint8Array} salt 
 * @returns {Promise<CryptoKey>}
 */
async function deriveWrappingKey(passphrase, salt) {
    const encoder = new TextEncoder();
    const passphraseKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(passphrase),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt,
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256'
        },
        passphraseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['wrapKey', 'unwrapKey']
    );
}

/**
 * Wraps the data key with a passphrase-derived key for cloud storage.
 * @param {CryptoKey} dataKey 
 * @param {string} passphrase 
 * @returns {Promise<{wrappedKey: string, salt: string, iv: string}>}
 */
export async function wrapKeyWithPassphrase(dataKey, passphrase) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const wrappingKey = await deriveWrappingKey(passphrase, salt);

    const wrappedKeyBuffer = await crypto.subtle.wrapKey(
        'raw',
        dataKey,
        wrappingKey,
        { name: 'AES-GCM', iv }
    );

    return {
        wrappedKey: btoa(String.fromCharCode(...new Uint8Array(wrappedKeyBuffer))),
        salt: btoa(String.fromCharCode(...salt)),
        iv: btoa(String.fromCharCode(...iv))
    };
}

/**
 * Unwraps a data key using the passphrase.
 * @param {string} wrappedKeyBase64 
 * @param {string} saltBase64 
 * @param {string} ivBase64 
 * @param {string} passphrase 
 * @returns {Promise<CryptoKey>}
 */
export async function unwrapKeyWithPassphrase(wrappedKeyBase64, saltBase64, ivBase64, passphrase) {
    const wrappedKey = Uint8Array.from(atob(wrappedKeyBase64), c => c.charCodeAt(0));
    const salt = Uint8Array.from(atob(saltBase64), c => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));

    const wrappingKey = await deriveWrappingKey(passphrase, salt);

    return crypto.subtle.unwrapKey(
        'raw',
        wrappedKey,
        wrappingKey,
        { name: 'AES-GCM', iv },
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
}

/**
 * Ensures a data key exists (loads from IndexedDB or generates new).
 * @returns {Promise<{key: CryptoKey, keyVersion: number, isNew: boolean}>}
 */
export async function ensureDataKey() {
    const existing = await loadDataKey();
    if (existing) {
        return { ...existing, isNew: false };
    }

    const key = await generateDataKey();
    await saveDataKey(key, CURRENT_KEY_VERSION);
    return { key, keyVersion: CURRENT_KEY_VERSION, isNew: true };
}

/**
 * Helper to zero out sensitive buffers after use.
 * @param {ArrayBuffer | Uint8Array} buffer 
 */
export function zeroBuffer(buffer) {
    if (buffer instanceof ArrayBuffer) {
        new Uint8Array(buffer).fill(0);
    } else if (buffer instanceof Uint8Array) {
        buffer.fill(0);
    }
}
