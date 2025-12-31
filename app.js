import { db, app, auth, storage, googleClientId } from './firebase-config.js';
import {
    collection,
    addDoc,
    onSnapshot,
    deleteDoc,
    doc,
    updateDoc,
    query,
    orderBy,
    getDocs,
    where,
    getDoc,
    setDoc
} from "firebase/firestore";
import {
    GoogleAuthProvider,
    signInWithCredential,
    signInWithPopup,
    onAuthStateChanged,
    signOut
} from "firebase/auth";
import {
    ref,
    uploadBytes,
    getDownloadURL,
    deleteObject
} from "firebase/storage";
import { formatTime, removeFromList, isNameInList, validateIncidentForm } from './utils.js';
import { translations } from './translations.js';
import { initDriveAPI, initGIS, authenticateDrive, createDriveFolder, uploadFileToDrive, isDriveConfigured } from './drive-service.js';

function calculateHours(timeIn, timeOut) {
    if (!timeIn || !timeOut) return { text: "0:00", isNextDay: false };

    const [inHours, inMinutes] = timeIn.split(':').map(Number);
    const [outHours, outMinutes] = timeOut.split(':').map(Number);

    let totalInMinutes = inHours * 60 + inMinutes;
    let totalOutMinutes = outHours * 60 + outMinutes;
    let isNextDay = false;

    if (totalOutMinutes < totalInMinutes) {
        totalOutMinutes += 24 * 60; // Add 24 hours
        isNextDay = true;
    }

    const diffMinutes = totalOutMinutes - totalInMinutes;
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;

    const formattedMinutes = minutes < 10 ? `0${minutes}` : minutes;
    return { text: `${hours}:${formattedMinutes}`, isNextDay };
}
import {
    ensureDataKey,
    encryptSignature,
    decryptSignature,
    wrapKeyWithPassphrase,
    unwrapKeyWithPassphrase,
    saveDataKey,
    loadDataKey,
    clearDataKey
} from './signatureEncryption.js';

// Main Execution
const isConfigured = app.options.apiKey !== "YOUR_API_KEY";
const storageUploadsEnabled = true; // Firebase Storage is configured for incident photos
const driveUploadsEnabled = false; // TODO: enable when Google Drive integration is configured
const driveConfigured = isDriveConfigured;
const storagePlaceholderMessage = "Firebase Storage not configured. Photos are marked as pending upload.";
const drivePlaceholderMessage = "Google Drive not configured. Approval uploads are pending setup.";

// --- Signature Loading Coordination ---
// These module-level variables coordinate between auth state and canvas initialization
let pendingUserEmail = null;
let signaturePadReady = false;
let loadCloudSignatureFn = null;

// --- DOM Elements & Auth Setup ---
function initializeAppLogic() {
    const loginOverlay = document.getElementById('login-overlay');
    const appContent = document.getElementById('app-content');
    const googleLoginBtn = document.getElementById('google-login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userDisplayName = document.getElementById('user-display-name');
    const settingsBtn = document.getElementById('settings-btn'); // defined here for scope

    if (!googleLoginBtn) {
        console.error("Login button not found! Retrying in 500ms...");
        setTimeout(initializeAppLogic, 500);
        return;
    }

    // --- Google One Tap Authentication ---

    // Initialize Google One Tap when the Google Identity Services library is ready
    const initializeGoogleOneTap = () => {
        if (!window.google?.accounts?.id) {
            console.warn("Google Identity Services not loaded yet. Retrying...");
            setTimeout(initializeGoogleOneTap, 500);
            return;
        }

        if (!isConfigured || googleClientId === 'YOUR_GOOGLE_CLIENT_ID') {
            console.warn("Firebase or Google Client ID not configured. Skipping Google One Tap.");
            return;
        }

        console.log("Initializing Google One Tap...");

        // Initialize Google One Tap
        window.google.accounts.id.initialize({
            client_id: googleClientId,
            callback: handleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: false,
        });

        // Show the One Tap prompt automatically
        window.google.accounts.id.prompt((notification) => {
            if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                console.log("One Tap not displayed:", notification.getNotDisplayedReason());
                console.log("Moment skipped:", notification.getSkippedReason());
            }
        });
    };

    // Handle the credential response from Google One Tap
    const handleCredentialResponse = async (response) => {
        console.log("Google One Tap credential received");

        try {
            // Create a Google credential from the ID token
            const credential = GoogleAuthProvider.credential(response.credential);

            // Sign in to Firebase with the credential
            const result = await signInWithCredential(auth, credential);
            console.log("User signed in successfully:", result.user);

        } catch (error) {
            console.error("Sign-in error:", error);
            alert("Login failed: " + error.message);
        }
    };

    // Manual login button handler (triggers One Tap with popup fallback)
    const handleLoginClick = async () => {
        console.log("Login button clicked");

        if (!isConfigured) {
            alert("Firebase is not configured. Please set up your Firebase credentials to use authentication.");
            return;
        }

        // Try One Tap first if available
        if (window.google?.accounts?.id) {
            console.log("Attempting One Tap sign-in...");

            // Trigger One Tap and check if it displays
            window.google.accounts.id.prompt((notification) => {
                if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                    console.log("One Tap not available, falling back to popup sign-in");
                    console.log("Reason:", notification.getNotDisplayedReason() || notification.getSkippedReason());

                    // Fall back to popup authentication
                    handlePopupSignIn();
                }
            });
        } else {
            // Google Identity Services not loaded, use popup directly
            console.log("Google Identity Services not loaded, using popup sign-in");
            handlePopupSignIn();
        }
    };

    // Popup sign-in fallback
    const handlePopupSignIn = async () => {
        try {
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            console.log("User signed in via popup:", result.user);
        } catch (error) {
            console.error("Popup sign-in error:", error);
            if (error.code === 'auth/popup-blocked') {
                alert("Popup was blocked. Please allow popups for this site and try again.");
            } else if (error.code === 'auth/cancelled-popup-request') {
                // User closed the popup, no need to show error
                console.log("Popup sign-in cancelled by user");
            } else {
                alert("Login failed: " + error.message);
            }
        }
    };

    // Attach the login button click handler
    googleLoginBtn.addEventListener('click', handleLoginClick);

    // Initialize Google One Tap when ready
    if (isConfigured) {
        initializeGoogleOneTap();
    } else {
        console.warn("Firebase not configured. Skipping Google One Tap initialization.");
    }

    logoutBtn.addEventListener('click', () => {
        signOut(auth).then(() => {
            console.log("User signed out");

            // Disable Google One Tap auto-select after sign out
            if (window.google?.accounts?.id) {
                window.google.accounts.id.disableAutoSelect();
            }

            window.location.reload();
        }).catch((error) => {
            console.error("Logout failed:", error);
        });
    });

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            loginOverlay.style.display = 'none';
            appContent.classList.remove('hidden');
            userDisplayName.textContent = user.email;

            if (isConfigured) {
                // Auto-register user if not exists
                const userRef = doc(db, "users", user.email);
                try {
                    const userSnap = await getDoc(userRef);
                    if (!userSnap.exists()) {
                        await setDoc(userRef, {
                            email: user.email,
                            role: 'worker',
                            createdAt: new Date().toISOString()
                        });
                        console.log("New user registered as worker:", user.email);
                    }
                } catch (regErr) {
                    console.error("Error registering user:", regErr);
                }

                checkUserRole(user.email);
                // Note: setupRealtimeListeners is called later within DOMContentLoaded
                // Store email for signature loading; actual load happens when canvas is ready
                pendingUserEmail = user.email;
                if (signaturePadReady && loadCloudSignatureFn) {
                    loadCloudSignatureFn(user.email);
                }
            }
        } else {
            loginOverlay.style.display = 'flex';
            appContent.classList.add('hidden');
            userDisplayName.textContent = '';
        }
    });

    async function checkUserRole(email) {
        try {
            console.log(`Checking role for: ${email}`);
            const userDoc = await getDoc(doc(db, "users", email));
            // Get DOM elements directly to avoid scope issues
            const settingsBtnEl = document.getElementById('settings-btn');
            const reviewReportsBtnEl = document.getElementById('review-reports-btn');

            if (userDoc.exists()) {
                const userData = userDoc.data();
                console.log("User data found:", userData);
                if (userData.role === 'admin') {
                    console.log("User is Admin. Revealing controls.");
                    if (settingsBtnEl) settingsBtnEl.classList.remove('hidden');
                    if (reviewReportsBtnEl) reviewReportsBtnEl.classList.remove('hidden');
                } else {
                    console.log(`User role is '${userData.role}', not 'admin'. Hiding controls.`);
                    if (settingsBtnEl) settingsBtnEl.classList.add('hidden');
                    if (reviewReportsBtnEl) reviewReportsBtnEl.classList.add('hidden');
                }
            } else {
                console.log("No user document found in 'users' collection.");
                if (settingsBtnEl) settingsBtnEl.classList.add('hidden');
                if (reviewReportsBtnEl) reviewReportsBtnEl.classList.add('hidden');
            }
        } catch (error) {
            console.error("Error checking role:", error);
            const settingsBtnEl = document.getElementById('settings-btn');
            const reviewReportsBtnEl = document.getElementById('review-reports-btn');
            if (settingsBtnEl) settingsBtnEl.classList.add('hidden');
            if (reviewReportsBtnEl) reviewReportsBtnEl.classList.add('hidden');
        }
    }

    // Config Warning
    if (!isConfigured) {
        const container = document.querySelector('.container');
        const alertDiv = document.createElement('div');
        alertDiv.style.backgroundColor = '#ffcc00';
        alertDiv.style.color = '#333';
        alertDiv.style.padding = '15px';
        alertDiv.style.marginBottom = '20px';
        alertDiv.style.borderRadius = '5px';
        alertDiv.style.textAlign = 'center';
        alertDiv.style.fontWeight = 'bold';
        alertDiv.innerHTML = '⚠️ Firebase Setup Required: App is running in <span style="text-decoration: underline;">Offline/Local Mode</span>. Update <code style="background:rgba(255,255,255,0.5);padding:2px 4px;border-radius:3px;">firebase-config.js</code> to enable cloud sync.';

        // Insert after header or at top of container
        if (container && container.firstChild) {
            container.insertBefore(alertDiv, container.firstChild);
        }
    }
}

// Initialize when ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initializeAppLogic();
        if (driveConfigured) {
            initDriveAPI();
            initGIS();
        } else {
            console.warn(drivePlaceholderMessage);
        }
    });
} else {
    initializeAppLogic();
    if (driveConfigured) {
        initDriveAPI();
        initGIS();
    } else {
        console.warn(drivePlaceholderMessage);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Other DOM dependant logic (like tables etc) can stay here or be moved if needed
    // For now we keep the previous structure but Auth is handled above.


    // --- State Management ---
    // Arrays now hold objects
    // workers: [{ id: '...', name: '...' }]
    // projects: [{ id: '...', name: '...', defaultForeman: '...' }]
    let workers = [];
    let projects = [];

    // Firestore persistence is now configured in firebase-config.js

    // --- DOM Elements ---
    const projectSelect = document.getElementById('project-select');
    const workerSelect = document.getElementById('worker-select');
    const crewTableBody = document.querySelector('#crew-table tbody');
    const addWorkerBtn = document.getElementById('add-worker-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const settingsModalCloseBtn = settingsModal ? settingsModal.querySelector('.close-modal') : null;
    const projectsList = document.getElementById('projects-list');
    const workersList = document.getElementById('workers-list');
    const addProjectBtn = document.getElementById('add-project-btn');
    const newProjectInput = document.getElementById('new-project');
    const addWorkerSettingsBtn = document.getElementById('add-worker-btn-settings');
    const newWorkerInput = document.getElementById('new-worker');
    const reportForm = document.getElementById('report-form');
    const canvas = document.getElementById('signature-pad');
    const clearSignatureBtn = document.getElementById('clear-signature');
    const saveSignatureBtn = document.getElementById('save-signature');
    const loadSignatureBtn = document.getElementById('load-signature');
    const deleteSignatureBtn = document.getElementById('delete-signature');
    const sharePdfBtn = document.getElementById('share-pdf');
    // const generatePdfBtn = document.getElementById('generate-pdf'); // Not strictly used in JS, handled by form submit
    const dateInput = document.getElementById('report-date');
    const foremanInput = document.getElementById('foreman');
    const incidentForm = document.getElementById('incident-form');
    const incidentPhotosInput = document.getElementById('incident-photos');
    const photoPreviewList = document.getElementById('photo-preview-list');
    const incidentDateInput = document.getElementById('incident-date');
    const incidentProjectInput = document.getElementById('incident-project');
    const incidentForemanInput = document.getElementById('incident-foreman');
    const incidentDescriptionInput = document.getElementById('incident-description');
    const incidentSubmitBtn = document.getElementById('submit-incident-btn');
    const adminSelectModal = document.getElementById('admin-select-modal');
    const closeAdminModal = document.getElementById('close-admin-modal');
    const adminSelectList = document.getElementById('admin-select-list');

    // Admin Review Elements
    const reviewReportsBtn = document.getElementById('review-reports-btn');
    const reviewsListModal = document.getElementById('reviews-list-modal');
    const closeReviewsList = document.getElementById('close-reviews-list');
    const pendingReportsList = document.getElementById('pending-reports-list');
    const reportReviewModal = document.getElementById('report-review-modal');
    const closeReportReview = document.getElementById('close-report-review');
    const reviewContent = document.getElementById('review-content');
    const adminSignatureCanvas = document.getElementById('admin-signature-pad');
    const clearAdminSignatureBtn = document.getElementById('clear-admin-signature');
    const adminNote = document.getElementById('admin-note');
    const approveReportBtn = document.getElementById('approve-report-btn');
    const requestRevisionBtn = document.getElementById('request-revision-btn');

    // --- Placeholder Notices for Pending Integrations ---
    function addIntegrationNotice(message) {
        const incidentTab = document.getElementById('incident-reports-tab');
        if (!incidentTab) return;

        const banner = document.createElement('div');
        banner.className = 'integration-warning';
        banner.textContent = message;
        banner.style.border = '1px solid #f0ad4e';
        banner.style.backgroundColor = '#fff3cd';
        banner.style.color = '#664d03';
        banner.style.padding = '10px';
        banner.style.borderRadius = '6px';
        banner.style.marginBottom = '12px';

        incidentTab.insertBefore(banner, incidentTab.firstChild);
    }

    // --- Internationalization ---
    let currentLang = localStorage.getItem('atlas_lang') || 'en';
    const langBtn = document.getElementById('lang-btn');

    function updateLanguage(lang) {
        currentLang = lang;
        localStorage.setItem('atlas_lang', lang);

        // Update Text Content
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (translations[lang] && translations[lang][key]) {
                el.textContent = translations[lang][key];
            }
        });

        // Update Placeholders
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (translations[lang] && translations[lang][key]) {
                el.placeholder = translations[lang][key];
            }
        });

        // Update Language Button Text
        if (langBtn) {
            if (lang === 'en') {
                langBtn.textContent = 'Español';
            } else {
                langBtn.textContent = 'English';
            }
        }
    }

    if (langBtn) {
        langBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const newLang = currentLang === 'en' ? 'es' : 'en';
            updateLanguage(newLang);
        });
        // Initial Load
        updateLanguage(currentLang);
    }

    // --- Hamburger Menu Logic ---
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const navMenu = document.getElementById('nav-menu');

    const setMenuState = (isOpen) => {
        navMenu.classList.toggle('open', isOpen);
        hamburgerBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    };

    if (hamburgerBtn && navMenu) {
        setMenuState(false);

        hamburgerBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent triggering the window click listener immediately
            setMenuState(!navMenu.classList.contains('open'));
        });

        // Close menu when clicking outside
        window.addEventListener('click', (e) => {
            // If menu is open and click is NOT on the menu or the button
            if (navMenu.classList.contains('open') &&
                !navMenu.contains(e.target) &&
                e.target !== hamburgerBtn) {
                setMenuState(false);
            }
        });

        // Close menu when a link inside it is clicked (optional but good for UX)
        navMenu.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                // Don't close if it's the settings button as that opens a modal, 
                // but actually it might be fine to close the menu behind the modal.
                // Let's close it.
                setMenuState(false);
            });
        });
    }

    // --- Tab Navigation Logic ---
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');

            // Update Buttons
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update Content
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === `${targetTab}-tab`) {
                    content.classList.add('active');
                }
            });

            // If switching to Incident Tab, resize its canvas
            if (targetTab === 'incident-reports') {
                setTimeout(resizeIncidentCanvas, 100);
            } else {
                resizeCanvas(); // Resize Daily Report canvas
            }
        });
    });
    // --- Initialization ---
    // Set today's date
    dateInput.valueAsDate = new Date();
    incidentDateInput.valueAsDate = new Date();

    if (!storageUploadsEnabled) {
        addIntegrationNotice(storagePlaceholderMessage);
    }
    if (!driveUploadsEnabled || !driveConfigured) {
        addIntegrationNotice(drivePlaceholderMessage);
    }

    // Initialize Signature Pad
    const signaturePad = new SignaturePad(canvas);
    let signatureHasData = false;
    let cachedBackgroundImage = null;
    let cachedVectorData = [];

    signaturePad.addEventListener("beginStroke", () => {
        signatureHasData = true;
    });

    signaturePad.addEventListener("endStroke", () => {
        cachedVectorData = signaturePad.toData();
    });

    function resizeCanvas() {
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        canvas.getContext("2d").scale(ratio, ratio);

        signaturePad.clear();

        if (cachedBackgroundImage) {
            signaturePad.fromDataURL(cachedBackgroundImage, { ratio: ratio }).then(() => {
                if (cachedVectorData && cachedVectorData.length > 0) {
                    signaturePad.fromData(cachedVectorData, { clear: false });
                }
            });
        } else if (cachedVectorData && cachedVectorData.length > 0) {
            signaturePad.fromData(cachedVectorData);
        }
    }
    window.addEventListener("resize", resizeCanvas);

    // --- Incident Signature Pad ---
    const incidentCanvas = document.getElementById('incident-signature-pad');
    const incidentSignaturePad = new SignaturePad(incidentCanvas);
    let incidentSignatureHasData = false;
    let incidentCachedVectorData = [];

    incidentSignaturePad.addEventListener("beginStroke", () => {
        incidentSignatureHasData = true;
    });

    incidentSignaturePad.addEventListener("endStroke", () => {
        incidentCachedVectorData = incidentSignaturePad.toData();
    });

    function resizeIncidentCanvas() {
        if (!incidentCanvas) return;
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        incidentCanvas.width = incidentCanvas.offsetWidth * ratio;
        incidentCanvas.height = incidentCanvas.offsetHeight * ratio;
        incidentCanvas.getContext("2d").scale(ratio, ratio);

        incidentSignaturePad.clear();
        if (incidentCachedVectorData && incidentCachedVectorData.length > 0) {
            incidentSignaturePad.fromData(incidentCachedVectorData);
        }
    }
    window.addEventListener("resize", resizeIncidentCanvas);

    document.getElementById('clear-incident-signature').addEventListener('click', () => {
        incidentSignaturePad.clear();
        incidentSignatureHasData = false;
        incidentCachedVectorData = [];
    });

    document.getElementById('load-incident-signature').addEventListener('click', async () => {
        let saved = null;

        // Helper to apply signature data to the incident pad
        const applySignatureData = (dataString) => {
            if (dataString.trim().startsWith('[')) {
                try {
                    const vectorData = JSON.parse(dataString);
                    incidentSignaturePad.fromData(vectorData);
                } catch (e) {
                    console.error("Error parsing vector sig:", e);
                    return false;
                }
            } else {
                incidentSignaturePad.fromDataURL(dataString);
            }
            incidentSignatureHasData = true;
            incidentCachedVectorData = incidentSignaturePad.toData();
            return true;
        };

        // 1. Try encrypted local storage first
        const localEncrypted = localStorage.getItem('atlas_signature_encrypted');
        if (localEncrypted) {
            try {
                const encData = JSON.parse(localEncrypted);
                const keyData = await loadDataKey();
                if (keyData) {
                    const decrypted = await decryptSignature(encData.ciphertext, encData.iv, keyData.key);
                    if (applySignatureData(decrypted)) {
                        return;
                    }
                }
            } catch (err) {
                console.error("Error loading local encrypted signature for incident:", err);
            }
        }

        // 2. Try legacy local storage
        saved = localStorage.getItem('atlas_signature');
        if (saved) {
            if (applySignatureData(saved)) {
                return;
            }
        }

        // 3. Try cloud (if logged in)
        if (auth.currentUser) {
            try {
                const userDocData = await getDoc(doc(db, "users", auth.currentUser.email));
                if (userDocData.exists()) {
                    const data = userDocData.data();

                    // Check for encrypted signature first
                    if (data.signatureEncrypted && data.signatureEncrypted.ciphertext) {
                        const encData = data.signatureEncrypted;

                        // Try to load local key first
                        let keyData = await loadDataKey();

                        if (keyData) {
                            try {
                                const decrypted = await decryptSignature(encData.ciphertext, encData.iv, keyData.key);
                                if (applySignatureData(decrypted)) {
                                    return;
                                }
                            } catch (err) {
                                console.warn("Decryption with local key failed for incident signature:", err);
                            }
                        }

                        // If multi-device and no local key or decryption failed, prompt for passphrase
                        if (encData.isMultiDevice && encData.wrappedKey) {
                            const passphrase = prompt("Enter your signature passphrase to load on this device:");
                            if (passphrase) {
                                try {
                                    const unwrappedKey = await unwrapKeyWithPassphrase(
                                        encData.wrappedKey,
                                        encData.wrappedKeySalt,
                                        encData.wrappedKeyIv,
                                        passphrase
                                    );
                                    // Save the key locally for future use
                                    await saveDataKey(unwrappedKey, encData.keyVersion || 1);
                                    const decrypted = await decryptSignature(encData.ciphertext, encData.iv, unwrappedKey);
                                    if (applySignatureData(decrypted)) {
                                        return;
                                    }
                                } catch (err) {
                                    console.error("Passphrase unlock failed for incident signature:", err);
                                    alert("Incorrect passphrase or decryption failed. Please try again.");
                                    return;
                                }
                            } else {
                                return; // User cancelled passphrase prompt
                            }
                        }
                    }

                    // Fallback to legacy unencrypted signature
                    if (data.signature) {
                        saved = data.signature;
                        localStorage.setItem('atlas_signature', saved);
                        if (applySignatureData(saved)) {
                            return;
                        }
                    }
                }
            } catch (e) {
                console.error("Error fetching signature:", e);
            }
        }

        alert("No saved signature found. Please save one in the Daily Report tab first.");
    });

    // --- Photo Upload Logic ---
    const STORAGE_PLACEHOLDER_URL = 'PENDING_STORAGE_UPLOAD';
    let selectedPhotos = [];

    incidentPhotosInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        files.forEach(file => {
            // Basic validation
            if (!file.type.startsWith('image/')) return;
            selectedPhotos.push(file);
        });

        renderPhotoPreviews();
        // Reset input so change event triggers even if same file selected again
        incidentPhotosInput.value = '';
    });

    function buildPlaceholderPhotoRecords(reportId) {
        return selectedPhotos.map((file) => ({
            name: file.name,
            url: STORAGE_PLACEHOLDER_URL,
            path: `placeholder/${reportId}/${file.name}`,
            placeholder: true,
            note: storagePlaceholderMessage
        }));
    }

    async function uploadIncidentPhotos(reportId) {
        if (selectedPhotos.length === 0) return [];

        if (!storageUploadsEnabled) {
            console.warn("Storage uploads disabled. Using placeholder photo records.");
            return buildPlaceholderPhotoRecords(reportId);
        }

        const photoUrls = [];
        for (let i = 0; i < selectedPhotos.length; i++) {
            const file = selectedPhotos[i];
            const storageRef = ref(storage, `temp_incidents/${reportId}/${file.name}`);
            try {
                await uploadBytes(storageRef, file);
                const url = await getDownloadURL(storageRef);
                photoUrls.push({ name: file.name, url: url, path: storageRef.fullPath });
            } catch (error) {
                console.error("Photo upload failed, storing placeholder entry:", error);
                photoUrls.push({
                    name: file.name,
                    url: STORAGE_PLACEHOLDER_URL,
                    path: storageRef.fullPath,
                    placeholder: true,
                    note: storagePlaceholderMessage
                });
            }
        }

        return photoUrls;
    }

    function renderPhotoPreviews() {
        photoPreviewList.innerHTML = '';
        selectedPhotos.forEach((file, index) => {
            const previewDiv = document.createElement('div');
            previewDiv.className = 'photo-preview';

            const img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            img.onload = () => URL.revokeObjectURL(img.src); // Memory cleanup

            const removeBtn = document.createElement('button');
            removeBtn.className = 'photo-delete-btn';
            removeBtn.innerHTML = '&times;';
            removeBtn.title = 'Remove Photo';
            removeBtn.onclick = () => {
                selectedPhotos.splice(index, 1);
                renderPhotoPreviews();
            };

            previewDiv.appendChild(img);
            previewDiv.appendChild(removeBtn);
            photoPreviewList.appendChild(previewDiv);
        });
    }

    // --- Incident Submission Logic ---
    incidentSubmitBtn.addEventListener('click', (e) => {
        e.preventDefault();

        // Validate Validation
        const validation = validateIncidentForm({
            date: incidentDateInput.value,
            project: incidentProjectInput.value,
            foreman: incidentForemanInput.value,
            description: incidentDescriptionInput.value,
            hasSignature: incidentSignatureHasData
        });

        if (!validation.valid) {
            alert(validation.error);
            return;
        }

        // Open Admin Select Modal
        openAdminSelectModal();
    });

    /* Removed validIncidentForm function as it is replaced by validateIncidentForm from utils.js */

    function openAdminSelectModal() {
        adminSelectModal.classList.remove('hidden');
        adminSelectList.innerHTML = 'Loading admins...';

        // Fetch Admins
        const qAdmins = query(collection(db, "users"), where("role", "==", "admin"));
        getDocs(qAdmins).then((snapshot) => {
            adminSelectList.innerHTML = '';
            if (snapshot.empty) {
                adminSelectList.innerHTML = '<li>No admins found. Please ask an owner to create an admin.</li>';
                return;
            }

            snapshot.forEach((doc) => {
                const adminEmail = doc.id;
                const li = document.createElement('li');
                li.textContent = adminEmail;
                li.addEventListener('click', () => {
                    if (confirm(`Send report to ${adminEmail}?`)) {
                        submitIncidentReport(adminEmail);
                        adminSelectModal.classList.add('hidden');
                    }
                });
                adminSelectList.appendChild(li);
            });
        }).catch(err => {
            console.error("Error fetching admins:", err);
            adminSelectList.textContent = "Error loading admins.";
        });
    }

    if (closeAdminModal) {
        closeAdminModal.addEventListener('click', () => {
            adminSelectModal.classList.add('hidden');
        });
    }

    async function submitIncidentReport(adminEmail) {
        incidentSubmitBtn.disabled = true;
        incidentSubmitBtn.textContent = "Submitting...";

        try {
            const timestamp = new Date().toISOString();
            const reportId = `${incidentDateInput.value}_${Date.now()}`;

            // 1. Upload Photos (placeholder-friendly)
            const photoUrls = await uploadIncidentPhotos(reportId);

            // 2. Save Report Doc
            await addDoc(collection(db, "incident_reports"), {
                date: incidentDateInput.value,
                project: incidentProjectInput.value,
                foreman: incidentForemanInput.value,
                description: incidentDescriptionInput.value,
                signature: incidentCachedVectorData, // User signature
                photos: photoUrls,
                status: 'submitted',
                submittedAt: timestamp,
                assignedAdmin: adminEmail,
                submittedBy: auth.currentUser ? auth.currentUser.email : 'unknown',
                storageStatus: storageUploadsEnabled ? 'uploaded' : 'pending_setup',
                driveStatus: driveUploadsEnabled ? 'pending_upload' : 'pending_setup'
            });

            alert("Incident Report Submitted Successfully!");
            // Reset Form
            incidentForm.reset();
            incidentSignaturePad.clear();
            incidentSignatureHasData = false;
            incidentCachedVectorData = [];
            selectedPhotos = [];
            renderPhotoPreviews();

        } catch (error) {
            console.error("Error submitting report:", error);
            alert("Failed to submit report. Please try again.");
        } finally {
            incidentSubmitBtn.disabled = false;
            incidentSubmitBtn.textContent = "Submit Report";
        }
    }

    // --- Admin Review Logic ---
    let currentReviewReportId = null;
    let currentReviewReportData = null;

    // Admin Signature Pad
    const adminSignaturePad = new SignaturePad(adminSignatureCanvas);
    let adminSignatureHasData = false;
    let adminCachedVectorData = [];

    adminSignaturePad.addEventListener("beginStroke", () => {
        adminSignatureHasData = true;
    });
    adminSignaturePad.addEventListener("endStroke", () => {
        adminCachedVectorData = adminSignaturePad.toData();
    });

    document.getElementById('clear-admin-signature').addEventListener('click', () => {
        adminSignaturePad.clear();
        adminSignatureHasData = false;
        adminCachedVectorData = [];
    });

    reviewReportsBtn.addEventListener('click', () => {
        reviewsListModal.classList.remove('hidden');
        renderPendingReports();
    });

    closeReviewsList.addEventListener('click', () => {
        reviewsListModal.classList.add('hidden');
    });

    closeReportReview.addEventListener('click', () => {
        reportReviewModal.classList.add('hidden');
    });

    async function renderPendingReports() {
        pendingReportsList.innerHTML = 'Loading...';
        try {
            const q = query(collection(db, "incident_reports"), where("status", "==", "submitted"), orderBy("submittedAt", "desc"));
            const snapshot = await getDocs(q);

            pendingReportsList.innerHTML = '';
            if (snapshot.empty) {
                pendingReportsList.innerHTML = '<li>No pending reports.</li>';
                return;
            }

            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                const li = document.createElement('li');

                const wrapper = document.createElement('div');
                wrapper.style.display = 'flex';
                wrapper.style.justifyContent = 'space-between';

                const dateProjectSpan = document.createElement('span');
                dateProjectSpan.textContent = `${data.date} - ${data.project}`;

                const foremanSpan = document.createElement('span');
                foremanSpan.style.fontSize = '0.8em';
                foremanSpan.style.color = '#666';
                foremanSpan.textContent = data.foreman;

                wrapper.appendChild(dateProjectSpan);
                wrapper.appendChild(foremanSpan);
                li.appendChild(wrapper);

                li.addEventListener('click', () => {
                    openReportReview(docSnap.id, data);
                });
                pendingReportsList.appendChild(li);
            });
        } catch (err) {
            console.error("Error fetching pending reports:", err);
            pendingReportsList.innerHTML = 'Error loading reports.';
        }
    }

    function openReportReview(docId, data) {
        currentReviewReportId = docId;
        currentReviewReportData = data;

        reviewsListModal.classList.add('hidden');
        reportReviewModal.classList.remove('hidden');

        // Render Content safely without innerHTML
        reviewContent.innerHTML = ''; // Clear previous content

        // Helper to create labeled paragraph
        function createLabeledP(label, value) {
            const p = document.createElement('p');
            const strong = document.createElement('strong');
            strong.textContent = label;
            p.appendChild(strong);
            p.appendChild(document.createTextNode(' ' + value));
            return p;
        }

        reviewContent.appendChild(createLabeledP('Date:', data.date || ''));
        reviewContent.appendChild(createLabeledP('Project:', data.project || ''));
        reviewContent.appendChild(createLabeledP('Foreman:', data.foreman || ''));
        reviewContent.appendChild(createLabeledP('Submitted By:', data.submittedBy || ''));

        reviewContent.appendChild(document.createElement('hr'));

        const descLabel = document.createElement('p');
        const descStrong = document.createElement('strong');
        descStrong.textContent = 'Description:';
        descLabel.appendChild(descStrong);
        reviewContent.appendChild(descLabel);

        const descP = document.createElement('p');
        descP.style.whiteSpace = 'pre-wrap';
        descP.style.background = '#f9f9f9';
        descP.style.padding = '10px';
        descP.textContent = data.description || '';
        reviewContent.appendChild(descP);

        const photosLabel = document.createElement('p');
        const photosStrong = document.createElement('strong');
        photosStrong.textContent = 'Photos:';
        photosLabel.appendChild(photosStrong);
        reviewContent.appendChild(photosLabel);

        const photosDiv = document.createElement('div');
        photosDiv.style.display = 'flex';
        photosDiv.style.flexWrap = 'wrap';

        if (data.photos && data.photos.length > 0) {
            data.photos.forEach(p => {
                if (p.placeholder || p.url === STORAGE_PLACEHOLDER_URL) {
                    const badge = document.createElement('div');
                    badge.textContent = `${p.name || 'Photo'} pending upload`;
                    badge.style.padding = '8px 10px';
                    badge.style.marginRight = '8px';
                    badge.style.marginBottom = '8px';
                    badge.style.borderRadius = '6px';
                    badge.style.border = '1px dashed #f0ad4e';
                    badge.style.color = '#a56400';
                    badge.style.backgroundColor = '#fff7e6';
                    photosDiv.appendChild(badge);
                } else {
                    const a = document.createElement('a');
                    a.href = p.url;
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    a.style.marginRight = '5px';

                    const img = document.createElement('img');
                    img.src = p.url;
                    img.style.width = '100px';
                    img.style.height = '100px';
                    img.style.objectFit = 'cover';
                    img.style.border = '1px solid #ccc';
                    img.alt = 'Incident photo';

                    a.appendChild(img);
                    photosDiv.appendChild(a);
                }
            });
        } else {
            photosDiv.textContent = 'No photos attached.';
        }
        reviewContent.appendChild(photosDiv);

        if (!storageUploadsEnabled) {
            const storageNote = document.createElement('p');
            storageNote.textContent = storagePlaceholderMessage;
            storageNote.style.color = '#a56400';
            storageNote.style.fontStyle = 'italic';
            reviewContent.appendChild(storageNote);
        }
        if (!driveUploadsEnabled) {
            const driveNote = document.createElement('p');
            driveNote.textContent = drivePlaceholderMessage;
            driveNote.style.color = '#a56400';
            driveNote.style.fontStyle = 'italic';
            reviewContent.appendChild(driveNote);
        }

        reviewContent.appendChild(document.createElement('hr'));

        const sigLabel = document.createElement('p');
        const sigStrong = document.createElement('strong');
        sigStrong.textContent = 'User Signature:';
        sigLabel.appendChild(sigStrong);
        reviewContent.appendChild(sigLabel);

        const sigCanvas = document.createElement('canvas');
        sigCanvas.id = 'review-user-sig';
        sigCanvas.width = 300;
        sigCanvas.height = 150;
        sigCanvas.style.border = '1px solid #ccc';
        reviewContent.appendChild(sigCanvas);

        // Render User Signature on the read-only canvas
        setTimeout(() => {
            const userSigCanvas = document.getElementById('review-user-sig');
            if (userSigCanvas && data.signature) {
                const pad = new SignaturePad(userSigCanvas);
                pad.fromData(data.signature);
                pad.off(); // Disable editing
            }
            // Resize admin pad
            const ratio = Math.max(window.devicePixelRatio || 1, 1);
            if (adminSignatureCanvas) {
                adminSignatureCanvas.width = adminSignatureCanvas.offsetWidth * ratio;
                adminSignatureCanvas.height = adminSignatureCanvas.offsetHeight * ratio;
                adminSignatureCanvas.getContext("2d").scale(ratio, ratio);
                adminSignaturePad.clear();
            }
        }, 100);

        adminNote.value = '';
        adminSignaturePad.clear();
        adminSignatureHasData = false;
        adminCachedVectorData = [];

        // Prevent Self-Approval logic
        if (data.submittedBy === auth.currentUser.email) {
            approveReportBtn.disabled = true;
            approveReportBtn.textContent = "Cannot Approve Own Report";
            approveReportBtn.title = "You cannot approve a report you submitted.";
            approveReportBtn.style.backgroundColor = '#ccc';
            approveReportBtn.style.cursor = 'not-allowed';

            // Add a warning message in UI
            const warningMsg = document.createElement('div');
            warningMsg.id = 'self-approve-warning';
            warningMsg.style.color = 'red';
            warningMsg.style.marginBottom = '10px';
            warningMsg.style.fontWeight = 'bold';
            warningMsg.textContent = "⚠️ You cannot approve your own report.";

            // Remove any existing warning to prevent duplicates
            const existingWarning = document.getElementById('self-approve-warning');
            if (existingWarning) existingWarning.remove();

            const actionsDiv = document.querySelector('#report-review-modal .actions');
            if (actionsDiv) actionsDiv.parentNode.insertBefore(warningMsg, actionsDiv);

        } else {
            approveReportBtn.disabled = false;
            approveReportBtn.textContent = "Approve & Sign";
            approveReportBtn.title = "";
            approveReportBtn.style.backgroundColor = 'var(--btn-success)';
            approveReportBtn.style.cursor = 'pointer';

            const existingWarning = document.getElementById('self-approve-warning');
            if (existingWarning) existingWarning.remove();
        }
    }

    approveReportBtn.addEventListener('click', async () => {
        if (!adminSignatureHasData) {
            alert("Please sign the report to approve it.");
            return;
        }

        const confirmationMsg = driveUploadsEnabled
            ? "Approve this report? This will create a local PDF download and upload to Google Drive."
            : "Approve this report? Uploads will be marked as pending until Google Drive is configured.";

        if (confirm(confirmationMsg)) {
            try {
                approveReportBtn.disabled = true;
                approveReportBtn.textContent = "Processing...";

                let folderId = 'DRIVE_SETUP_PENDING';
                if (driveUploadsEnabled) {
                    // 1. Authenticate with Drive
                    await authenticateDrive();

                    // 2. Create Drive Folder
                    const folderName = `Incident_${currentReviewReportData.date}_${currentReviewReportData.project}`;
                    folderId = await createDriveFolder(folderName);

                    // 3. Upload Original Photos (only if they were uploaded to storage)
                    if (storageUploadsEnabled && currentReviewReportData.photos && currentReviewReportData.photos.length > 0) {
                        for (const photo of currentReviewReportData.photos) {
                            if (photo.placeholder || photo.url === STORAGE_PLACEHOLDER_URL) continue;
                            try {
                                const response = await fetch(photo.url);
                                const blob = await response.blob();
                                await uploadFileToDrive(blob, photo.name, folderId);
                            } catch (pErr) {
                                console.error("Failed to upload photo to Drive:", pErr);
                            }
                        }
                    }

                    // 4. Generate & Upload PDF (Stub - using jsPDF later/now)
                    const pdfBlob = new Blob([`Incident Report for ${currentReviewReportData.project}\nDate: ${currentReviewReportData.date}\nDescription: ${currentReviewReportData.description}`], { type: 'text/plain' });
                    await uploadFileToDrive(pdfBlob, 'Report_Summary.txt', folderId);
                }

                // 5. Cleanup Storage & Update Firestore
                if (storageUploadsEnabled && currentReviewReportData.photos && currentReviewReportData.photos.length > 0) {
                    for (const photo of currentReviewReportData.photos) {
                        try {
                            const photoRef = ref(storage, photo.path);
                            await deleteObject(photoRef);
                        } catch (delErr) {
                            console.warn("Failed to delete temp photo from Storage:", delErr);
                        }
                    }
                }

                const storageStatus = storageUploadsEnabled ? 'cleared_from_storage' : storagePlaceholderMessage;
                const driveStatus = driveUploadsEnabled ? 'uploaded' : drivePlaceholderMessage;

                await updateDoc(doc(db, "incident_reports", currentReviewReportId), {
                    status: 'approved',
                    adminSignature: adminCachedVectorData,
                    adminActionAt: new Date().toISOString(),
                    adminNote: adminNote.value,
                    driveFolderId: folderId,
                    photos: storageUploadsEnabled ? [] : (currentReviewReportData.photos || []),
                    storageStatus,
                    driveStatus
                });

                const successMsg = driveUploadsEnabled
                    ? "Report Approved & Uploaded to Drive!"
                    : "Report Approved. Uploads will resume once Drive and Storage are configured.";
                alert(successMsg);
                reportReviewModal.classList.add('hidden');
                reviewsListModal.classList.remove('hidden');
                renderPendingReports();
            } catch (err) {
                console.error("Error approving:", err);
                alert("Failed to approve/upload. Check console.");
            } finally {
                approveReportBtn.disabled = false;
                approveReportBtn.textContent = "Approve & Sign";
            }
        }
    });

    requestRevisionBtn.addEventListener('click', async () => {
        if (!adminNote.value.trim()) {
            alert("Please add a note explaining why revision is needed.");
            return;
        }

        if (confirm("Request revision for this report?")) {
            try {
                await updateDoc(doc(db, "incident_reports", currentReviewReportId), {
                    status: 'needs_revision',
                    adminActionAt: new Date().toISOString(),
                    adminNote: adminNote.value
                });
                alert("Revision Requested!");
                reportReviewModal.classList.add('hidden');
                reviewsListModal.classList.remove('hidden');
                renderPendingReports();
            } catch (err) {
                console.error("Error requesting revision:", err);
                alert("Failed to request revision.");
            }
        }
    });
    // Initial Resize & Load
    setTimeout(() => {
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        canvas.getContext("2d").scale(ratio, ratio);
        // Try local load immediately for speed/offline, 
        // Cloud load will override it shortly after if logged in.
        loadLocalSignature();

        // Signal that canvas is ready and expose the load function
        loadCloudSignatureFn = loadCloudSignature;
        signaturePadReady = true;

        // If user was already authenticated before canvas was ready, load their signature now
        if (pendingUserEmail) {
            loadCloudSignature(pendingUserEmail);
        }
    }, 100);

    // Check for Share Support
    if (navigator.share && navigator.canShare) {
        sharePdfBtn.classList.remove('hidden');
    }

    // Initialize Logic based on Configuration
    if (isConfigured) {
        setupRealtimeListeners();
        // Silent Auto-Migration on startup
        migrateData(null, true);
    } else {
        // Fallback to LocalStorage Mode
        loadLocalData();
    }


    // --- Local Storage Fallback Functions ---

    function loadLocalData() {
        // Load Workers
        const localWorkers = JSON.parse(localStorage.getItem('atlas_workers') || '[]');
        workers = localWorkers.map(name => ({ id: name, name: name }));
        updateWorkerSelect();

        // Load Projects
        const localProjects = JSON.parse(localStorage.getItem('atlas_projects') || '[]');
        const localForemen = JSON.parse(localStorage.getItem('atlas_project_foremen') || '{}');
        projects = localProjects.map(name => ({
            id: name,
            name: name,
            defaultForeman: localForemen[name] || ''
        }));
        updateProjectSelect();
    }

    function saveLocalData() {
        const wNames = workers.map(w => w.name);
        const pNames = projects.map(p => p.name);
        const pForemen = {};
        projects.forEach(p => {
            if (p.defaultForeman) pForemen[p.name] = p.defaultForeman;
        });

        localStorage.setItem('atlas_workers', JSON.stringify(wNames));
        localStorage.setItem('atlas_projects', JSON.stringify(pNames));
        localStorage.setItem('atlas_project_foremen', JSON.stringify(pForemen));
    }


    // --- Firestore Functions ---

    function setupRealtimeListeners() {
        // Prevent multiple listeners if called multiple times (though Auth state usually stable)
        // Workers Listener
        const qWorkers = query(collection(db, "workers"), orderBy("name"));
        onSnapshot(qWorkers, (snapshot) => {
            workers = [];
            snapshot.forEach((doc) => {
                workers.push({ id: doc.id, ...doc.data() });
            });
            // Keep local storage in sync with cloud to prevent "resurrection" issues
            saveLocalData();

            updateWorkerSelect();
            if (!settingsModal.classList.contains('hidden')) {
                renderSettingsLists();
            }
        });

        // Projects Listener
        const qProjects = query(collection(db, "projects"), orderBy("name"));
        onSnapshot(qProjects, (snapshot) => {
            projects = [];
            snapshot.forEach((doc) => {
                projects.push({ id: doc.id, ...doc.data() });
            });
            // Keep local storage in sync with cloud
            saveLocalData();

            updateProjectSelect();
            if (!settingsModal.classList.contains('hidden')) {
                renderSettingsLists();
            }
        });
    }

    async function migrateData(btnElement = null, silent = false) {
        if (btnElement) {
            btnElement.disabled = true;
            btnElement.textContent = "Uploading...";
        }

        try {
            // Migrate Workers
            const legacyWorkers = JSON.parse(localStorage.getItem('atlas_workers') || '[]');
            for (const w of legacyWorkers) {
                // Check Firestore directly to avoid race conditions with local array state
                const q = query(collection(db, "workers"), where("name", "==", w));
                const snapshot = await getDocs(q);

                if (snapshot.empty) {
                    await addDoc(collection(db, "workers"), { name: w });
                }
            }

            // Migrate Projects
            const legacyProjects = JSON.parse(localStorage.getItem('atlas_projects') || '[]');
            const legacyForemen = JSON.parse(localStorage.getItem('atlas_project_foremen') || '{}');

            for (const p of legacyProjects) {
                // Check Firestore directly
                const q = query(collection(db, "projects"), where("name", "==", p));
                const snapshot = await getDocs(q);

                if (snapshot.empty) {
                    const defaultForeman = legacyForemen[p] || "";
                    await addDoc(collection(db, "projects"), {
                        name: p,
                        defaultForeman: defaultForeman
                    });
                }
            }

            if (!silent) {
                alert("Migration complete! Your lists are now on the cloud.");
            }

            if (btnElement) {
                btnElement.remove(); // Remove button
            }

        } catch (error) {
            console.error("Migration failed: ", error);
            if (!silent) {
                alert("An error occurred during migration. Check console for details.");
                if (btnElement) {
                    btnElement.disabled = false;
                    btnElement.textContent = "☁️ Upload Local Data to Cloud";
                }
            }
        }
    }


    // --- UI Update Functions ---

    function updateProjectSelect() {
        const datalist = document.getElementById('project-options');
        datalist.innerHTML = '';
        projects.forEach(p => {
            const option = document.createElement('option');
            option.value = p.name;
            datalist.appendChild(option);
        });
    }

    function updateWorkerSelect() {
        // Get correct text for current language
        let defaultText = "Select Worker to Add";
        if (translations[currentLang] && translations[currentLang]["select_worker_default"]) {
            defaultText = translations[currentLang]["select_worker_default"];
        }

        // Re-create the default option with data-i18n attribute
        workerSelect.innerHTML = `<option value="" data-i18n="select_worker_default">${defaultText}</option>`;

        workers.forEach(w => {
            const option = document.createElement('option');
            option.value = w.name;
            option.textContent = w.name;
            workerSelect.appendChild(option);
        });
    }

    function renderSettingsLists() {
        // Projects
        projectsList.innerHTML = '';
        projects.forEach((p) => {
            const li = document.createElement('li');

            const infoDiv = document.createElement('div');
            infoDiv.style.display = 'flex';
            infoDiv.style.flexDirection = 'column';
            infoDiv.style.flex = '1';
            infoDiv.style.marginRight = '10px';

            const nameSpan = document.createElement('span');
            nameSpan.textContent = p.name;
            nameSpan.style.fontWeight = 'bold';

            const foremanInputSettings = document.createElement('input');
            foremanInputSettings.type = 'text';
            foremanInputSettings.placeholder = 'Default Foreman';
            foremanInputSettings.value = p.defaultForeman || '';
            foremanInputSettings.className = 'settings-foreman-input';
            foremanInputSettings.style.marginTop = '5px';
            foremanInputSettings.style.fontSize = '0.9rem';
            foremanInputSettings.style.padding = '4px';

            // Update Foreman on Change
            foremanInputSettings.addEventListener('change', async (e) => {
                const newVal = e.target.value;
                if (isConfigured) {
                    try {
                        await updateDoc(doc(db, "projects", p.id), {
                            defaultForeman: newVal
                        });
                    } catch (err) {
                        console.error("Error updating foreman:", err);
                    }
                } else {
                    // Local Fallback
                    p.defaultForeman = newVal;
                    saveLocalData();
                }

                if (projectSelect.value === p.name) {
                    foremanInput.value = newVal;
                }
            });

            infoDiv.appendChild(nameSpan);
            infoDiv.appendChild(foremanInputSettings);

            const delBtn = document.createElement('button');
            delBtn.className = 'delete-btn';
            delBtn.textContent = 'Delete';
            delBtn.addEventListener('click', async () => {
                if (confirm(`Delete project "${p.name}"?`)) {
                    // Always remove from Local Storage (Legacy/Backup) to prevent "Resurrection" on Sync
                    const localProjects = JSON.parse(localStorage.getItem('atlas_projects') || '[]');
                    const newLocalProjects = removeFromList(localProjects, p.name);
                    localStorage.setItem('atlas_projects', JSON.stringify(newLocalProjects));

                    // Also clean up foremen map
                    const localForemen = JSON.parse(localStorage.getItem('atlas_project_foremen') || '{}');
                    if (localForemen[p.name]) {
                        delete localForemen[p.name];
                        localStorage.setItem('atlas_project_foremen', JSON.stringify(localForemen));
                    }

                    if (isConfigured) {
                        try {
                            await deleteDoc(doc(db, "projects", p.id));
                        } catch (err) {
                            console.error("Error deleting project:", err);
                        }
                    } else {
                        // Local Fallback
                        const idx = projects.findIndex(proj => proj.id === p.id);
                        if (idx > -1) {
                            projects.splice(idx, 1);
                            saveLocalData();
                            renderSettingsLists();
                            updateProjectSelect();
                        }
                    }
                }
            });

            infoDiv.appendChild(nameSpan);
            infoDiv.appendChild(foremanInputSettings);
            li.appendChild(infoDiv);
            li.appendChild(delBtn);
            projectsList.appendChild(li);
        });

        // Workers
        workersList.innerHTML = '';
        workers.forEach((w) => {
            const li = document.createElement('li');
            const span = document.createElement('span');
            span.textContent = w.name;
            li.appendChild(span);

            const delBtn = document.createElement('button');
            delBtn.className = 'delete-btn';
            delBtn.textContent = 'Delete';
            delBtn.addEventListener('click', async () => {
                if (confirm(`Delete worker "${w.name}"?`)) {
                    // Always remove from Local Storage (Legacy/Backup) to prevent "Resurrection" on Sync
                    const localWorkers = JSON.parse(localStorage.getItem('atlas_workers') || '[]');
                    const newLocalWorkers = removeFromList(localWorkers, w.name);
                    localStorage.setItem('atlas_workers', JSON.stringify(newLocalWorkers));

                    if (isConfigured) {
                        try {
                            await deleteDoc(doc(db, "workers", w.id));
                        } catch (err) {
                            console.error("Error deleting worker:", err);
                        }
                    } else {
                        // Local Fallback
                        const idx = workers.findIndex(work => work.id === w.id);
                        if (idx > -1) {
                            workers.splice(idx, 1);
                            saveLocalData(); // This is redundant with the explicit removal above but keeps flow consistent
                            renderSettingsLists();
                            updateWorkerSelect();
                        }
                    }
                }
            });

            li.appendChild(delBtn);
            workersList.appendChild(li);
        });

        // Admins
        const adminsList = document.getElementById('admins-list');
        const newAdminInput = document.getElementById('new-admin');
        const addAdminBtn = document.getElementById('add-admin-btn');

        // Clear previous listeners to avoid duplicates if re-rendered (simple approach)
        const newAddBtn = addAdminBtn.cloneNode(true);
        addAdminBtn.parentNode.replaceChild(newAddBtn, addAdminBtn);

        newAddBtn.addEventListener('click', async () => {
            const email = newAdminInput.value.trim();
            if (email) {
                if (isConfigured) {
                    try {
                        // Use email as doc ID
                        await setDoc(doc(db, "users", email), {
                            role: "admin"
                        }, { merge: true });
                        alert(`Admin ${email} added.`);
                        renderSettingsLists(); // re-render to update list
                    } catch (err) {
                        console.error("Error adding admin:", err);
                        alert("Failed to add admin. Ensure you have permission.");
                    }
                } else {
                    alert("Admin management only works in cloud mode.");
                }
                newAdminInput.value = '';
            }
        });

        adminsList.innerHTML = 'Loading...';

        if (isConfigured) {
            const qAdmins = query(collection(db, "users"), where("role", "==", "admin"));
            getDocs(qAdmins).then((snapshot) => {
                adminsList.innerHTML = '';
                snapshot.forEach((userDoc) => {
                    const email = userDoc.id;
                    const li = document.createElement('li');
                    const emailSpan = document.createElement('span');
                    emailSpan.textContent = email;
                    li.appendChild(emailSpan);

                    const delBtn = document.createElement('button');
                    delBtn.className = 'delete-btn';
                    delBtn.textContent = 'Delete';

                    if (snapshot.size <= 1) {
                        delBtn.disabled = true;
                        delBtn.style.opacity = '0.5';
                        delBtn.style.cursor = 'not-allowed';
                        delBtn.title = "Cannot delete the last admin";
                    }

                    delBtn.addEventListener('click', async () => {
                        if (snapshot.size <= 1) {
                            alert("Cannot remove the last admin.");
                            return;
                        }

                        if (confirm(`Remove admin privileges for "${email}"?`)) {
                            try {
                                await deleteDoc(doc(db, "users", email));
                                renderSettingsLists();
                            } catch (err) {
                                console.error("Error deleting admin:", err);
                                alert("Failed to remove admin.");
                            }
                        }
                    });

                    li.appendChild(delBtn);
                    adminsList.appendChild(li);
                });
            }).catch(err => {
                console.error("Error fetching admins:", err);
                adminsList.innerHTML = 'Error loading admins.';
            });
        } else {
            adminsList.innerHTML = 'Not available in offline mode.';
        }
    }


    // --- Event Listeners ---

    // Magic Saving: Load Foreman when Project Changed
    projectSelect.addEventListener('change', () => {
        const selectedName = projectSelect.value;
        const projectObj = projects.find(p => p.name === selectedName);

        if (projectObj && projectObj.defaultForeman) {
            foremanInput.value = projectObj.defaultForeman;
        }
    });

    // Magic Saving: Save Foreman when Foreman Input Changed
    foremanInput.addEventListener('change', async () => {
        const currentProjectName = projectSelect.value;
        const currentForeman = foremanInput.value;

        if (currentProjectName) {
            const projectObj = projects.find(p => p.name === currentProjectName);
            // Only update if the project exists in our list (not a brand new typed one yet)
            if (projectObj) {
                if (isConfigured) {
                    try {
                        await updateDoc(doc(db, "projects", projectObj.id), {
                            defaultForeman: currentForeman
                        });
                    } catch (err) {
                        console.error("Error saving foreman:", err);
                    }
                } else {
                    // Local Fallback
                    projectObj.defaultForeman = currentForeman;
                    saveLocalData();
                }
            }
        }
    });

    // Add Worker to Table
    addWorkerBtn.addEventListener('click', () => {
        const workerName = workerSelect.value;
        if (!workerName) return;

        const existingNames = Array.from(crewTableBody.querySelectorAll('tr td:first-child input'))
            .map(input => input.value);

        if (existingNames.includes(workerName)) {
            alert('This worker has already been added to the report.');
            workerSelect.value = '';
            return;
        }

        addWorkerRow(workerName);
        workerSelect.value = '';
    });

    function addWorkerRow(name, timeIn = '08:00', timeOut = '16:30') {
        const tr = document.createElement('tr');

        // Name Cell
        const tdName = document.createElement('td');
        const inputName = document.createElement('input');
        inputName.type = 'text';
        inputName.value = name;
        inputName.className = 'table-input';
        tdName.appendChild(inputName);
        tr.appendChild(tdName);

        // Time In Cell
        const tdTimeIn = document.createElement('td');
        const inputTimeIn = document.createElement('input');
        inputTimeIn.type = 'time';
        inputTimeIn.value = timeIn;
        inputTimeIn.className = 'table-input';
        inputTimeIn.required = true;
        tdTimeIn.appendChild(inputTimeIn);
        tr.appendChild(tdTimeIn);

        // Time Out Cell
        const tdTimeOut = document.createElement('td');
        const inputTimeOut = document.createElement('input');
        inputTimeOut.type = 'time';
        inputTimeOut.value = timeOut;
        inputTimeOut.className = 'table-input';
        inputTimeOut.required = true;
        tdTimeOut.appendChild(inputTimeOut);
        tr.appendChild(tdTimeOut);

        // Hours Cell
        const tdHours = document.createElement('td');
        const inputHours = document.createElement('input');
        inputHours.type = 'text';
        // Initial value calculated below
        inputHours.placeholder = 'H:MM';
        inputHours.className = 'table-input';
        inputHours.required = true;

        const warningSpan = document.createElement('span');
        warningSpan.className = 'hours-warning';
        warningSpan.style.display = 'none'; // Hidden by default

        tdHours.appendChild(inputHours);
        tdHours.appendChild(warningSpan);
        tr.appendChild(tdHours);

        // Auto-Calculate Logic
        function updateRowHours() {
            const valIn = inputTimeIn.value;
            const valOut = inputTimeOut.value;

            const result = calculateHours(valIn, valOut);
            inputHours.value = result.text;

            if (result.isNextDay) {
                warningSpan.textContent = 'Next Day';
                warningSpan.style.display = 'block';
            } else {
                warningSpan.style.display = 'none';
            }
        }

        inputTimeIn.addEventListener('input', updateRowHours);
        inputTimeOut.addEventListener('input', updateRowHours);

        // Initialize
        updateRowHours();

        // Delete Button Cell
        const tdDelete = document.createElement('td');
        const btnDelete = document.createElement('button');
        btnDelete.type = 'button';
        btnDelete.className = 'remove-row-btn';
        btnDelete.style.backgroundColor = '#ff4d4d';
        btnDelete.textContent = 'X';
        btnDelete.addEventListener('click', () => {
            tr.remove();
        });
        tdDelete.appendChild(btnDelete);
        tr.appendChild(tdDelete);

        crewTableBody.appendChild(tr);
    }

    // Settings Modal
    settingsBtn.addEventListener('click', () => {
        renderSettingsLists();
        settingsModal.classList.remove('hidden');
    });

    if (settingsModalCloseBtn) {
        settingsModalCloseBtn.addEventListener('click', () => {
            settingsModal.classList.add('hidden');
        });
    }

    window.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.add('hidden');
        }
    });

    // Add New Project (Cloud/Local)
    addProjectBtn.addEventListener('click', async () => {
        const val = newProjectInput.value.trim();
        if (val) {
            // Check existence
            if (isNameInList(projects, val)) {
                alert("Project already exists!");
                return;
            }
            if (isConfigured) {
                try {
                    await addDoc(collection(db, "projects"), {
                        name: val,
                        defaultForeman: ""
                    });
                } catch (err) {
                    console.error("Error adding project:", err);
                    alert("Failed to add project.");
                }
            } else {
                // Local Fallback
                projects.push({ id: val, name: val, defaultForeman: "" });
                saveLocalData();
                renderSettingsLists();
                updateProjectSelect();
            }
            newProjectInput.value = '';
        }
    });

    // Add New Worker (Cloud/Local)
    addWorkerSettingsBtn.addEventListener('click', async () => {
        const val = newWorkerInput.value.trim();
        if (val) {
            if (isNameInList(workers, val)) {
                alert("Worker already exists!");
                return;
            }
            if (isConfigured) {
                try {
                    await addDoc(collection(db, "workers"), {
                        name: val
                    });
                } catch (err) {
                    console.error("Error adding worker:", err);
                    alert("Failed to add worker.");
                }
            } else {
                // Local Fallback
                workers.push({ id: val, name: val });
                saveLocalData();
                renderSettingsLists();
                updateWorkerSelect();
            }
            newWorkerInput.value = '';
        }
    });

    // Clear Signature
    clearSignatureBtn.addEventListener('click', () => {
        signaturePad.clear();
        signatureHasData = false;
        cachedBackgroundImage = null;
        cachedVectorData = [];
    });

    // Save Signature - Opens modal for encryption options
    saveSignatureBtn.addEventListener('click', async () => {
        if (!signatureHasData) {
            alert("Please sign before saving.");
            return;
        }

        // Show the multi-device choice modal
        const signatureSaveModal = document.getElementById('signature-save-modal');
        const multiDeviceCheckbox = document.getElementById('multi-device-checkbox');
        const passphraseSection = document.getElementById('passphrase-section');

        // Reset modal state
        multiDeviceCheckbox.checked = false;
        passphraseSection.classList.add('hidden');
        document.getElementById('signature-passphrase').value = '';
        document.getElementById('signature-passphrase-confirm').value = '';

        signatureSaveModal.classList.remove('hidden');
    });

    // Multi-device checkbox toggle
    document.getElementById('multi-device-checkbox').addEventListener('change', (e) => {
        const passphraseSection = document.getElementById('passphrase-section');
        if (e.target.checked) {
            passphraseSection.classList.remove('hidden');
        } else {
            passphraseSection.classList.add('hidden');
        }
    });

    // Close signature save modal
    document.getElementById('close-signature-save-modal').addEventListener('click', () => {
        document.getElementById('signature-save-modal').classList.add('hidden');
    });
    document.getElementById('cancel-save-signature-btn').addEventListener('click', () => {
        document.getElementById('signature-save-modal').classList.add('hidden');
    });

    // Confirm save signature with encryption
    document.getElementById('confirm-save-signature-btn').addEventListener('click', async () => {
        const multiDevice = document.getElementById('multi-device-checkbox').checked;
        const passphrase = document.getElementById('signature-passphrase').value;
        const passphraseConfirm = document.getElementById('signature-passphrase-confirm').value;

        // Validate passphrase if multi-device
        if (multiDevice) {
            if (!passphrase || passphrase.length < 4) {
                alert("Please enter a passphrase (at least 4 characters).");
                return;
            }
            if (passphrase !== passphraseConfirm) {
                alert("Passphrases do not match.");
                return;
            }
        }

        // Get signature data
        let signatureRawData;
        if (cachedBackgroundImage) {
            signatureRawData = signaturePad.toDataURL();
        } else {
            signatureRawData = JSON.stringify(signaturePad.toData());
        }

        try {
            // Ensure we have an encryption key
            const { key, keyVersion, isNew } = await ensureDataKey();

            // Encrypt the signature
            const { ciphertext, iv } = await encryptSignature(signatureRawData, key);

            // Prepare cloud data
            let cloudData = {
                signatureEncrypted: {
                    ciphertext,
                    iv,
                    keyVersion,
                    isMultiDevice: multiDevice,
                    createdAt: new Date().toISOString()
                },
                // Clear old unencrypted signature field
                signature: null
            };

            // If multi-device, wrap the key with passphrase and store in cloud
            if (multiDevice) {
                const wrappedKeyData = await wrapKeyWithPassphrase(key, passphrase);
                cloudData.signatureEncrypted.wrappedKey = wrappedKeyData.wrappedKey;
                cloudData.signatureEncrypted.wrappedKeySalt = wrappedKeyData.salt;
                cloudData.signatureEncrypted.wrappedKeyIv = wrappedKeyData.iv;
            }

            // Save to local storage (encrypted)
            localStorage.setItem('atlas_signature_encrypted', JSON.stringify({
                ciphertext,
                iv,
                keyVersion,
                isMultiDevice: multiDevice
            }));

            // Save to cloud if configured
            if (isConfigured && auth.currentUser) {
                const userEmail = auth.currentUser.email;
                await setDoc(doc(db, "users", userEmail), cloudData, { merge: true });
                console.log("Encrypted signature saved to cloud.");
            }

            document.getElementById('signature-save-modal').classList.add('hidden');
            alert("Signature saved securely!");

        } catch (err) {
            console.error("Error saving encrypted signature:", err);
            alert("Failed to save signature. Error: " + err.message);
        }
    });

    // Load Saved Signature (Manual Button)
    loadSignatureBtn.addEventListener('click', async () => {
        // Try Cloud first if logged in
        if (isConfigured && auth.currentUser) {
            const success = await loadCloudSignature(auth.currentUser.email);
            if (success) {
                alert("Loaded signature from account.");
                return;
            }
        }

        // Fallback to Local (check encrypted first, then legacy)
        const localEncrypted = localStorage.getItem('atlas_signature_encrypted');
        if (localEncrypted) {
            try {
                const encData = JSON.parse(localEncrypted);
                const keyData = await loadDataKey();
                if (keyData) {
                    const decrypted = await decryptSignature(encData.ciphertext, encData.iv, keyData.key);
                    loadSignatureData(decrypted);
                    alert("Loaded signature from device storage.");
                    return;
                }
            } catch (err) {
                console.error("Error loading local encrypted signature:", err);
            }
        }

        // Legacy unencrypted fallback
        const local = localStorage.getItem('atlas_signature');
        if (local) {
            loadSignatureData(local);
            alert("Loaded signature from device storage.");
        } else {
            alert("No saved signature found.");
        }
    });

    // Delete Saved Signature
    deleteSignatureBtn.addEventListener('click', async () => {
        if (confirm("Delete saved signature? This will remove it from this device and your account.")) {
            // 1. Remove Local (both encrypted and legacy)
            localStorage.removeItem('atlas_signature');
            localStorage.removeItem('atlas_signature_encrypted');

            // 2. Clear encryption key
            await clearDataKey();

            // 3. Remove Cloud
            if (isConfigured && auth.currentUser) {
                try {
                    const userEmail = auth.currentUser.email;
                    await setDoc(doc(db, "users", userEmail), {
                        signature: null,
                        signatureEncrypted: null
                    }, { merge: true });
                } catch (err) {
                    console.error("Error deleting cloud signature:", err);
                }
            }

            // 4. Clear canvas
            signaturePad.clear();
            signatureHasData = false;
            cachedBackgroundImage = null;
            cachedVectorData = [];

            alert("Saved signature removed.");
        }
    });

    // Reset Passphrase Button (in settings)
    const resetPassphraseBtn = document.getElementById('reset-passphrase-btn');
    if (resetPassphraseBtn) {
        resetPassphraseBtn.addEventListener('click', async () => {
            if (confirm("Reset passphrase? This will DELETE your saved signature and allow you to set a new passphrase.")) {
                // Delete signature
                localStorage.removeItem('atlas_signature');
                localStorage.removeItem('atlas_signature_encrypted');
                await clearDataKey();

                if (isConfigured && auth.currentUser) {
                    try {
                        const userEmail = auth.currentUser.email;
                        await setDoc(doc(db, "users", userEmail), {
                            signature: null,
                            signatureEncrypted: null
                        }, { merge: true });
                    } catch (err) {
                        console.error("Error deleting cloud signature:", err);
                    }
                }

                signaturePad.clear();
                signatureHasData = false;
                cachedBackgroundImage = null;
                cachedVectorData = [];

                alert("Passphrase reset. You can now save a new signature with a new passphrase.");
            }
        });
    }

    // Passphrase Entry Modal handlers
    document.getElementById('close-passphrase-entry-modal').addEventListener('click', () => {
        document.getElementById('passphrase-entry-modal').classList.add('hidden');
    });
    document.getElementById('cancel-unlock-btn').addEventListener('click', () => {
        document.getElementById('passphrase-entry-modal').classList.add('hidden');
    });

    // Load Signature Helper (Logic only) - triggers resize to ensure proper rendering
    function loadSignatureData(dataString) {
        if (!dataString) return;

        // For async fromDataURL, we need to ensure canvas is properly sized first
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        if (canvas.width !== canvas.offsetWidth * ratio || canvas.height !== canvas.offsetHeight * ratio) {
            canvas.width = canvas.offsetWidth * ratio;
            canvas.height = canvas.offsetHeight * ratio;
            canvas.getContext("2d").scale(ratio, ratio);
        }

        signaturePad.clear();
        if (dataString.trim().startsWith('[')) {
            try {
                const points = JSON.parse(dataString);
                signaturePad.fromData(points);
                signatureHasData = true;
                cachedVectorData = points;
                cachedBackgroundImage = null;
            } catch (e) {
                console.error("Error loading signature data", e);
            }
        } else {
            // fromDataURL is async - use callback/promise form if available
            signaturePad.fromDataURL(dataString, { ratio }).then(() => {
                signatureHasData = true;
                cachedBackgroundImage = dataString;
                cachedVectorData = [];
            }).catch(err => {
                console.error("Error loading signature from data URL:", err);
            });
            // Also set state immediately for sync fallback
            signatureHasData = true;
            cachedBackgroundImage = dataString;
            cachedVectorData = [];
        }
    }

    // Load Cloud Signature Helper - handles both encrypted and legacy
    async function loadCloudSignature(email) {
        try {
            const userDocData = await getDoc(doc(db, "users", email));
            if (!userDocData.exists()) return false;

            const data = userDocData.data();

            // Check for encrypted signature first
            if (data.signatureEncrypted && data.signatureEncrypted.ciphertext) {
                const encData = data.signatureEncrypted;

                // Try to load local key first
                let keyData = await loadDataKey();

                if (keyData) {
                    // We have a local key, try to decrypt
                    try {
                        const decrypted = await decryptSignature(encData.ciphertext, encData.iv, keyData.key);
                        loadSignatureData(decrypted);
                        return true;
                    } catch (err) {
                        console.warn("Decryption with local key failed, may need passphrase:", err);
                    }
                }

                // If multi-device and no local key or decryption failed, prompt for passphrase
                if (encData.isMultiDevice && encData.wrappedKey) {
                    return await promptForPassphrase(encData);
                }

                return false;
            }

            // Fallback to legacy unencrypted signature
            if (data.signature) {
                loadSignatureData(data.signature);
                localStorage.setItem('atlas_signature', data.signature);
                return true;
            }

            return false;
        } catch (err) {
            console.error("Error loading cloud signature:", err);
            return false;
        }
    }

    // Prompt for passphrase to unlock multi-device signature
    async function promptForPassphrase(encData) {
        return new Promise((resolve) => {
            const modal = document.getElementById('passphrase-entry-modal');
            const unlockBtn = document.getElementById('confirm-unlock-btn');
            const passphraseInput = document.getElementById('unlock-passphrase');

            passphraseInput.value = '';
            modal.classList.remove('hidden');

            const handleUnlock = async () => {
                const passphrase = passphraseInput.value;
                if (!passphrase) {
                    alert("Please enter your passphrase.");
                    return;
                }

                try {
                    // Unwrap the key with passphrase
                    const unwrappedKey = await unwrapKeyWithPassphrase(
                        encData.wrappedKey,
                        encData.wrappedKeySalt,
                        encData.wrappedKeyIv,
                        passphrase
                    );

                    // Save the key locally for future use
                    await saveDataKey(unwrappedKey, encData.keyVersion || 1);

                    // Decrypt the signature
                    const decrypted = await decryptSignature(encData.ciphertext, encData.iv, unwrappedKey);
                    loadSignatureData(decrypted);

                    modal.classList.add('hidden');
                    unlockBtn.removeEventListener('click', handleUnlock);
                    resolve(true);
                } catch (err) {
                    console.error("Passphrase unlock failed:", err);
                    alert("Incorrect passphrase or decryption failed. Please try again.");
                }
            };

            unlockBtn.addEventListener('click', handleUnlock);

            // Handle cancel
            const handleCancel = () => {
                modal.classList.add('hidden');
                unlockBtn.removeEventListener('click', handleUnlock);
                resolve(false);
            };
            document.getElementById('cancel-unlock-btn').addEventListener('click', handleCancel, { once: true });
            document.getElementById('close-passphrase-entry-modal').addEventListener('click', handleCancel, { once: true });
        });
    }

    // Initial Load (Local fallback on startup)
    async function loadLocalSignature() {
        // Check for encrypted signature first
        const localEncrypted = localStorage.getItem('atlas_signature_encrypted');
        if (localEncrypted) {
            try {
                const encData = JSON.parse(localEncrypted);
                const keyData = await loadDataKey();
                if (keyData) {
                    const decrypted = await decryptSignature(encData.ciphertext, encData.iv, keyData.key);
                    loadSignatureData(decrypted);
                    return;
                }
            } catch (err) {
                console.error("Error loading local encrypted signature:", err);
            }
        }

        // Legacy fallback
        const saved = localStorage.getItem('atlas_signature');
        if (saved) {
            loadSignatureData(saved);
        }
    }

    // Generate PDF
    reportForm.addEventListener('submit', (e) => {
        e.preventDefault();
        generatePDF();
    });

    // Share PDF
    sharePdfBtn.addEventListener('click', async () => {
        if (!reportForm.checkValidity()) {
            reportForm.reportValidity();
            return;
        }
        await generatePDF(true);
    });

    async function generatePDF(isShare = false) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Fonts & Config
        doc.setFont("helvetica");

        let yPos = 20;

        // Title
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        const title = "ATLAS DAILY REPORT";
        const titleWidth = doc.getTextWidth(title);
        const pageWidth = doc.internal.pageSize.getWidth();
        const xCenter = (pageWidth - titleWidth) / 2;
        doc.text(title, xCenter, yPos);
        // Underline
        doc.line(xCenter, yPos + 1, xCenter + titleWidth, yPos + 1);

        // Top Horizontal Line
        yPos += 5;
        doc.setLineWidth(0.5);
        doc.line(14, yPos, pageWidth - 14, yPos);

        yPos += 10;

        // Header Info
        doc.setFontSize(10);

        // Format Date
        const dateVal = document.getElementById('report-date').value;
        const dateObj = new Date(dateVal + 'T00:00:00'); // Ensure local time
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        const dateStr = dateObj.toLocaleDateString('en-US', options);

        doc.setFont("helvetica", "bold");
        doc.text(`Date: ${dateStr}`, 14, yPos);
        yPos += 5;

        const projectVal = document.getElementById('project-select').value;
        doc.text(`Project: ${projectVal}`, 14, yPos);
        yPos += 5;

        const foremanVal = document.getElementById('foreman').value;
        doc.text(`Foreman / Project Lead: ${foremanVal}`, 14, yPos);
        yPos += 10;

        // Crew Table
        doc.setFontSize(11);
        doc.text("Crew Members & Hours", 14, yPos);
        yPos += 2;

        const tableRows = [];
        const rows = crewTableBody.querySelectorAll('tr');
        rows.forEach(row => {
            const inputs = row.querySelectorAll('input');
            const name = inputs[0].value;
            // Format times to AM/PM
            const timeIn = formatTime(inputs[1].value);
            const timeOut = formatTime(inputs[2].value);
            const hours = inputs[3].value;
            tableRows.push([name, timeIn, timeOut, hours]);
        });

        // Use autoTable for the table
        doc.autoTable({
            startY: yPos,
            head: [['Name', 'Time In', 'Time Out', 'Hours']],
            body: tableRows,
            theme: 'grid',
            headStyles: { fillColor: [220, 220, 220], textColor: 20, lineColor: 200, lineWidth: 0.1 },
            styles: { lineColor: 200, lineWidth: 0.1, textColor: 20 },
            margin: { left: 14, right: 14 }
        });

        yPos = doc.lastAutoTable.finalY + 10;

        // Text Areas
        const sections = [
            { title: "Work Performed Today", id: "work-performed" },
            { title: "Equipment Used / Issues", id: "equipment" },
            { title: "Hauling / Dumpsters", id: "hauling" },
            { title: "Safety Topics / Incidents", id: "safety" },
            { title: "Delays / Problems / Needs", id: "delays" },
        ];

        sections.forEach(sec => {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.text(sec.title, 14, yPos);
            yPos += 5;

            doc.setFont("helvetica", "normal");
            const text = document.getElementById(sec.id).value || "N/A";

            // Split text to fit width
            const splitText = doc.splitTextToSize(text, pageWidth - 28);
            doc.text(splitText, 14, yPos);
            yPos += (splitText.length * 4) + 6; // Adjust spacing based on lines

            // Check for page break
            if (yPos > 270) {
                doc.addPage();
                yPos = 20;
            }
        });

        // Photos Sent
        doc.setFont("helvetica", "bold");
        doc.text("Photos Sent", 14, yPos);
        yPos += 5;
        doc.setFont("helvetica", "normal");
        const photosSent = document.getElementById("photos-sent").value;
        doc.text(photosSent, 14, yPos);
        yPos += 10;

        // Time In / Time Out Footer
        if (yPos > 250) {
            doc.addPage();
            yPos = 20;
        }

        doc.setFont("helvetica", "bold");
        doc.text("Time In / Time Out", 14, yPos);
        yPos += 5;

        // Draw Time Box
        const timeInVal = formatTime(document.getElementById('general-time-in').value);
        const timeOutVal = formatTime(document.getElementById('general-time-out').value);

        // Simple table for footer times
        doc.autoTable({
            startY: yPos,
            body: [[timeInVal, timeOutVal]],
            theme: 'grid',
            styles: { halign: 'center', cellWidth: 'wrap', lineColor: 200, lineWidth: 0.1, textColor: 20 },
            columnStyles: { 0: { cellWidth: 80 }, 1: { cellWidth: 80 } },
            margin: { left: 24 }
        });

        yPos = doc.lastAutoTable.finalY + 15;

        // Foreman / Project Lead Signature Label
        doc.setFont("helvetica", "bold");
        doc.text("Foreman / Project Lead Signature", 14, yPos);
        yPos += 5;

        // Signature Image
        if (signatureHasData) {
            // Save canvas as image
            const dataURL = canvas.toDataURL('image/png');
            // Scale down to fit (Width 60, Height 20)
            doc.addImage(dataURL, 'PNG', 14, yPos, 60, 20);
        }

        // Dashed Line
        yPos += 20;
        doc.setLineDash([2, 2], 0);
        doc.setLineWidth(0.1);
        doc.line(14, yPos, 80, yPos);
        doc.setLineDash([]);

        // Save PDF
        const filenameDate = dateVal;
        const filename = `Atlas_Daily_Report_${filenameDate}.pdf`;

        if (isShare) {
            // Share Logic
            const pdfBlob = doc.output('blob');
            const file = new File([pdfBlob], filename, { type: 'application/pdf' });

            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        files: [file],
                    });
                } catch (err) {
                    console.error('Error sharing:', err);
                }
            } else {
                alert("Your browser does not support sharing files. Downloading instead.");
                doc.save(filename);
            }
        } else {
            // Download Logic
            doc.save(filename);
        }
    }



});
