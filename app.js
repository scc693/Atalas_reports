import { db, app } from './firebase-config.js';
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
    where
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { formatTime, removeFromList, isNameInList } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
    // Check if Firebase is configured
    const isConfigured = app.options.apiKey !== "YOUR_API_KEY";

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

        container.insertBefore(alertDiv, container.firstChild);
    }

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
    const deleteSignatureBtn = document.getElementById('delete-signature');
    const sharePdfBtn = document.getElementById('share-pdf');
    // const generatePdfBtn = document.getElementById('generate-pdf'); // Not strictly used in JS, handled by form submit
    const dateInput = document.getElementById('report-date');
    const foremanInput = document.getElementById('foreman');

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

    // Initial Resize & Load
    setTimeout(() => {
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        canvas.getContext("2d").scale(ratio, ratio);
        loadSignature();
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
        workerSelect.innerHTML = '<option value="">Select Worker to Add</option>';
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
        tr.innerHTML = `
            <td><input type="text" value="${name}" class="table-input" /></td>
            <td><input type="time" value="${timeIn}" class="table-input" /></td>
            <td><input type="time" value="${timeOut}" class="table-input" /></td>
            <td><input type="number" value="${hours}" step="0.5" class="table-input" /></td>
            <td><button type="button" class="remove-row-btn" style="background-color: #ff4d4d;">X</button></td>
        `;

        tr.querySelector('.remove-row-btn').addEventListener('click', () => {
            tr.remove();
        });

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
    saveSignatureBtn.addEventListener('click', () => {
        if (!signatureHasData) {
            alert("Please sign before saving.");
            return;
        }

        let data;
        if (cachedBackgroundImage) {
            data = signaturePad.toDataURL();
        } else {
            data = JSON.stringify(signaturePad.toData());
        }

        localStorage.setItem('atlas_signature', data);
        alert("Signature saved!");
    });

    // Delete Saved Signature
    deleteSignatureBtn.addEventListener('click', () => {
        localStorage.removeItem('atlas_signature');
        alert("Saved signature removed.");
    });

    // Load Signature Helper
    function loadSignature() {
        const saved = localStorage.getItem('atlas_signature');
        if (saved) {
            if (saved.trim().startsWith('[')) {
                try {
                    const points = JSON.parse(saved);
                    signaturePad.fromData(points);
                    signatureHasData = true;
                    cachedVectorData = points;
                    cachedBackgroundImage = null;
                } catch (e) {
                    console.error("Error loading signature data", e);
                }
            } else {
                signaturePad.fromDataURL(saved);
                signatureHasData = true;
                cachedBackgroundImage = saved;
                cachedVectorData = [];
            }
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
