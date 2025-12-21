import { db, app, auth, storage } from './firebase-config.js';
import {
    collection,
    addDoc,
    onSnapshot,
    deleteDoc,
    doc,
    updateDoc,
    enableIndexedDbPersistence,
    query,
    orderBy,
    getDocs,
    where,
    getDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import {
    signInWithPopup,
    GoogleAuthProvider,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
    ref,
    uploadBytes,
    getDownloadURL,
    deleteObject
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";
import { formatTime, removeFromList, isNameInList, validateIncidentForm } from './utils.js';
import { translations } from './translations.js';
import { initDriveAPI, initGIS, authenticateDrive, createDriveFolder, uploadFileToDrive } from './drive-service.js';

// Main Execution
const isConfigured = app.options.apiKey !== "YOUR_API_KEY";

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

    // --- Auth Logic ---
    const provider = new GoogleAuthProvider();

    googleLoginBtn.addEventListener('click', () => {
        console.log("Login button clicked"); // Debug log
        signInWithPopup(auth, provider)
            .then((result) => {
                console.log("User signed in:", result.user);
            }).catch((error) => {
                console.error("Login failed:", error);
                alert("Login failed: " + error.message);
            });
    });

    logoutBtn.addEventListener('click', () => {
        signOut(auth).then(() => {
            console.log("User signed out");
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
                checkUserRole(user.email);
                setupRealtimeListeners();
                // Auto-load signature from Cloud if available
                loadCloudSignature(user.email);
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

            if (userDoc.exists()) {
                const userData = userDoc.data();
                console.log("User data found:", userData);
                if (userData.role === 'admin') {
                    console.log("User is Admin. Revealing controls.");
                    settingsBtn.classList.remove('hidden');
                    reviewReportsBtn.classList.remove('hidden');
                } else {
                    console.log(`User role is '${userData.role}', not 'admin'. Hiding controls.`);
                    settingsBtn.classList.add('hidden');
                    reviewReportsBtn.classList.add('hidden');
                }
            } else {
                console.log("No user document found in 'users' collection.");
                settingsBtn.classList.add('hidden');
                reviewReportsBtn.classList.add('hidden');
            }
        } catch (error) {
            console.error("Error checking role:", error);
            settingsBtn.classList.add('hidden');
            reviewReportsBtn.classList.add('hidden');
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
        initDriveAPI();
        initGIS();
    });
} else {
    initializeAppLogic();
    initDriveAPI();
    initGIS();
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

    // Only enable Firestore persistence if configured
    if (isConfigured) {
        enableIndexedDbPersistence(db)
            .catch((err) => {
                if (err.code == 'failed-precondition') {
                    console.log('Persistence failed: Multiple tabs open');
                } else if (err.code == 'unimplemented') {
                    console.log('Persistence failed: Browser not supported');
                }
            });
    }

    // --- DOM Elements ---
    const projectSelect = document.getElementById('project-select');
    const workerSelect = document.getElementById('worker-select');
    const crewTableBody = document.querySelector('#crew-table tbody');
    const addWorkerBtn = document.getElementById('add-worker-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeModal = document.querySelector('.close-modal');
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

    if (hamburgerBtn && navMenu) {
        hamburgerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            navMenu.classList.toggle('open');
        });

        window.addEventListener('click', (e) => {
            if (navMenu.classList.contains('open') &&
                !navMenu.contains(e.target) &&
                e.target !== hamburgerBtn) {
                navMenu.classList.remove('open');
            }
        });

        navMenu.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                navMenu.classList.remove('open');
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
        let saved = localStorage.getItem('atlas_signature');

        // If not in local, try cloud check (if logged in)
        if (!saved && auth.currentUser) {
            try {
                const userDoc = await getDoc(doc(db, "users", auth.currentUser.email));
                if (userDoc.exists() && userDoc.data().signature) {
                    saved = userDoc.data().signature;
                    localStorage.setItem('atlas_signature', saved); // Sync local
                }
            } catch (e) {
                console.error("Error fetching signature:", e);
            }
        }

        if (saved) {
            // Check if it's JSON (vector) or DataURL (image)
            if (saved.trim().startsWith('[')) {
                try {
                    const vectorData = JSON.parse(saved);
                    incidentSignaturePad.fromData(vectorData);
                } catch (e) {
                    console.error("Error parsing vector sig:", e);
                }
            } else {
                incidentSignaturePad.fromDataURL(saved);
            }
            incidentSignatureHasData = true;
            incidentCachedVectorData = incidentSignaturePad.toData();
        } else {
            alert("No saved signature found. Please save one in the Daily Report tab first.");
        }
    });

    // --- Photo Upload Logic ---
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

            // 1. Upload Photos
            const photoUrls = [];
            for (let i = 0; i < selectedPhotos.length; i++) {
                const file = selectedPhotos[i];
                const storageRef = ref(storage, `temp_incidents/${reportId}/${file.name}`);
                await uploadBytes(storageRef, file);
                const url = await getDownloadURL(storageRef);
                photoUrls.push({ name: file.name, url: url, path: storageRef.fullPath });
            }

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
                submittedBy: auth.currentUser ? auth.currentUser.email : 'unknown'
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

            snapshot.forEach(doc => {
                const data = doc.data();
                const li = document.createElement('li');
                li.innerHTML = `
                    <div style="display:flex; justify-content:space-between;">
                        <span>${data.date} - ${data.project}</span>
                        <span style="font-size:0.8em; color:#666;">${data.foreman}</span>
                    </div>
                `;
                li.addEventListener('click', () => {
                    openReportReview(doc.id, data);
                    // Open detailed view logic
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

        // Render Content
        let photosHtml = '';
        if (data.photos && data.photos.length > 0) {
            data.photos.forEach(p => {
                photosHtml += `<a href="${p.url}" target="_blank" style="margin-right:5px;"><img src="${p.url}" style="width:100px; height:100px; object-fit:cover; border:1px solid #ccc;"></a>`;
            });
        }

        reviewContent.innerHTML = `
            <p><strong>Date:</strong> ${data.date}</p>
            <p><strong>Project:</strong> ${data.project}</p>
            <p><strong>Foreman:</strong> ${data.foreman}</p>
            <p><strong>Submitted By:</strong> ${data.submittedBy}</p>
            <hr>
            <p><strong>Description:</strong></p>
            <p style="white-space: pre-wrap; background:#f9f9f9; padding:10px;">${data.description}</p>
            <p><strong>Photos:</strong></p>
            <div style="display:flex; flex-wrap:wrap;">${photosHtml || 'No photos attached.'}</div>
            <hr>
            <p><strong>User Signature:</strong></p>
            <canvas id="review-user-sig" width="300" height="150" style="border:1px solid #ccc;"></canvas>
        `;

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

        if (confirm("Approve this report? This will create a local PDF download and upload to Google Drive.")) {
            try {
                approveReportBtn.disabled = true;
                approveReportBtn.textContent = "Processing...";

                // 1. Authenticate with Drive
                await authenticateDrive();

                // 2. Create Drive Folder
                const folderName = `Incident_${currentReviewReportData.date}_${currentReviewReportData.project}`;
                const folderId = await createDriveFolder(folderName);

                // 3. Upload Original Photos
                if (currentReviewReportData.photos && currentReviewReportData.photos.length > 0) {
                    for (const photo of currentReviewReportData.photos) {
                        try {
                            // Fetch Blob from Firebase URL
                            const response = await fetch(photo.url);
                            const blob = await response.blob();
                            await uploadFileToDrive(blob, photo.name, folderId);
                        } catch (pErr) {
                            console.error("Failed to upload photo to Drive:", pErr);
                        }
                    }
                }

                // 4. Generate & Upload PDF (Stub - using jsPDF later/now)
                // For now we just create a text file as proof
                const pdfBlob = new Blob([`Incident Report for ${currentReviewReportData.project}\nDate: ${currentReviewReportData.date}\nDescription: ${currentReviewReportData.description}`], { type: 'text/plain' });
                await uploadFileToDrive(pdfBlob, 'Report_Summary.txt', folderId);

                // 5. Cleanup Storage & Update Firestore
                if (currentReviewReportData.photos && currentReviewReportData.photos.length > 0) {
                    for (const photo of currentReviewReportData.photos) {
                        try {
                            const photoRef = ref(storage, photo.path);
                            await deleteObject(photoRef);
                        } catch (delErr) {
                            console.warn("Failed to delete temp photo from Storage:", delErr);
                        }
                    }
                }

                await updateDoc(doc(db, "incident_reports", currentReviewReportId), {
                    status: 'approved',
                    adminSignature: adminCachedVectorData,
                    adminActionAt: new Date().toISOString(),
                    adminNote: adminNote.value,
                    driveFolderId: folderId,
                    photos: [] // Clear photo refs as they are gone from Firebase Storage
                });

                alert("Report Approved & Uploaded to Drive!");
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
            li.innerHTML = `<span>${w.name}</span>`;

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
                        });
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
                    li.innerHTML = `<span>${email}</span>`;

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

    function addWorkerRow(name, timeIn = '08:00', timeOut = '16:30', hours = '8.5') {
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
        tdTimeIn.appendChild(inputTimeIn);
        tr.appendChild(tdTimeIn);

        // Time Out Cell
        const tdTimeOut = document.createElement('td');
        const inputTimeOut = document.createElement('input');
        inputTimeOut.type = 'time';
        inputTimeOut.value = timeOut;
        inputTimeOut.className = 'table-input';
        tdTimeOut.appendChild(inputTimeOut);
        tr.appendChild(tdTimeOut);

        // Hours Cell
        const tdHours = document.createElement('td');
        const inputHours = document.createElement('input');
        inputHours.type = 'number';
        inputHours.value = hours;
        inputHours.step = '0.5';
        inputHours.className = 'table-input';
        tdHours.appendChild(inputHours);
        tr.appendChild(tdHours);

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

    closeModal.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
    });

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

    // Save Signature
    saveSignatureBtn.addEventListener('click', async () => {
        if (!signatureHasData) {
            alert("Please sign before saving.");
            return;
        }

        let data;
        if (cachedBackgroundImage) {
            data = signaturePad.toDataURL(); // Save image as string
        } else {
            data = JSON.stringify(signaturePad.toData()); // Save strokes
        }

        // 1. Save Local
        localStorage.setItem('atlas_signature', data);

        // 2. Save Cloud (if logged in & configured)
        if (isConfigured && auth.currentUser) {
            try {
                // We'll store it in the user's document under 'signature' field
                const userEmail = auth.currentUser.email;
                await setDoc(doc(db, "users", userEmail), {
                    signature: data
                }, { merge: true });
                console.log("Signature saved to cloud.");
            } catch (err) {
                console.error("Error saving signature to cloud:", err);
                alert("Saved locally, but failed to sync to cloud.");
            }
        }

        alert("Signature saved!");
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

        // Fallback to Local
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
            // 1. Remove Local
            localStorage.removeItem('atlas_signature');

            // 2. Remove Cloud
            if (isConfigured && auth.currentUser) {
                try {
                    const userEmail = auth.currentUser.email;
                    // Using updateDoc to delete a specific field is cleaner, 
                    // but we need to import deleteField if we want to do that strictly.
                    // For now, setting it to null or empty string is often sufficient, 
                    // but let's try to just update it to null.
                    await setDoc(doc(db, "users", userEmail), {
                        signature: null
                    }, { merge: true });
                } catch (err) {
                    console.error("Error deleting cloud signature:", err);
                }
            }
            alert("Saved signature removed.");
        }
    });

    // Load Signature Helper (Logic only)
    function loadSignatureData(dataString) {
        if (!dataString) return;

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
            signaturePad.fromDataURL(dataString);
            signatureHasData = true;
            cachedBackgroundImage = dataString;
            cachedVectorData = [];
        }
    }

    // Load Cloud Signature Helper
    async function loadCloudSignature(email) {
        try {
            const userDoc = await getDoc(doc(db, "users", email));
            if (userDoc.exists()) {
                const data = userDoc.data();
                if (data.signature) {
                    loadSignatureData(data.signature);
                    // Also update local storage to keep them in sync
                    localStorage.setItem('atlas_signature', data.signature);
                    return true;
                }
            }
        } catch (err) {
            console.error("Error loading cloud signature:", err);
        }
        return false;
    }

    // Initial Load (Local fallback on startup)
    function loadLocalSignature() {
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
