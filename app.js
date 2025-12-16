document.addEventListener('DOMContentLoaded', () => {
    // --- State Management ---
    const defaultWorkers = ['Stuart', 'Tommy', 'Jesus', 'Danilo'];
    const defaultProjects = ['100-F1630-1000 South Pointe - ProMax-SD'];

    let workers = JSON.parse(localStorage.getItem('atlas_workers')) || defaultWorkers;
    let projects = JSON.parse(localStorage.getItem('atlas_projects')) || defaultProjects;

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
    const generatePdfBtn = document.getElementById('generate-pdf');
    const dateInput = document.getElementById('report-date');

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

        signaturePad.clear(); // Clear internal state matches canvas clear

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
    // We need to wait a tick for layout
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
        // Keep both buttons: 'Generate' for direct download, 'Share' for system share options.
    }

    // Populate Initial Lists
    updateProjectSelect();
    updateWorkerSelect();
    renderSettingsLists();

    // --- Functions ---

    function saveState() {
        localStorage.setItem('atlas_workers', JSON.stringify(workers));
        localStorage.setItem('atlas_projects', JSON.stringify(projects));
        updateProjectSelect();
        updateWorkerSelect();
        renderSettingsLists();
    }

    function updateProjectSelect() {
        const datalist = document.getElementById('project-options');
        datalist.innerHTML = '';
        projects.forEach(p => {
            const option = document.createElement('option');
            option.value = p;
            datalist.appendChild(option);
        });
    }

    function updateWorkerSelect() {
        workerSelect.innerHTML = '<option value="">Select Worker to Add</option>';
        workers.forEach(w => {
            const option = document.createElement('option');
            option.value = w;
            option.textContent = w;
            workerSelect.appendChild(option);
        });
    }

    function renderSettingsLists() {
        // Projects
        projectsList.innerHTML = '';
        projects.forEach((p, index) => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${p}</span> <button class="delete-btn" data-type="project" data-index="${index}">Delete</button>`;
            projectsList.appendChild(li);
        });

        // Workers
        workersList.innerHTML = '';
        workers.forEach((w, index) => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${w}</span> <button class="delete-btn" data-type="worker" data-index="${index}">Delete</button>`;
            workersList.appendChild(li);
        });

        // Add event listeners to delete buttons
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const type = e.target.dataset.type;
                const index = parseInt(e.target.dataset.index);
                if (type === 'project') {
                    projects.splice(index, 1);
                } else {
                    workers.splice(index, 1);
                }
                saveState();
            });
        });
    }

    // --- Event Listeners ---

    // Add Worker to Table
    addWorkerBtn.addEventListener('click', () => {
        const workerName = workerSelect.value;
        if (!workerName) return;

        addWorkerRow(workerName);
        workerSelect.value = ''; // Reset select
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

    // Add New Project
    addProjectBtn.addEventListener('click', () => {
        const val = newProjectInput.value.trim();
        if (val && !projects.includes(val)) {
            projects.push(val);
            saveState();
            newProjectInput.value = '';
        }
    });

    // Add New Worker (Settings)
    addWorkerSettingsBtn.addEventListener('click', () => {
        const val = newWorkerInput.value.trim();
        if (val && !workers.includes(val)) {
            workers.push(val);
            saveState();
            newWorkerInput.value = '';
        }
    });

    // Clear Signature (Canvas only)
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
        generatePDF(); // Default behavior (download)
    });

    // Share PDF
    sharePdfBtn.addEventListener('click', async () => {
        if (!reportForm.checkValidity()) {
            reportForm.reportValidity();
            return;
        }
        await generatePDF(true); // true = share mode
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
            theme: 'grid', // Changed to grid for borders
            styles: { halign: 'center', cellWidth: 'wrap', lineColor: 200, lineWidth: 0.1, textColor: 20 },
            columnStyles: { 0: { cellWidth: 80 }, 1: { cellWidth: 80 } }, // Manually set widths
            margin: { left: 24 } // Offset to match image roughly
        });

        yPos = doc.lastAutoTable.finalY + 15;

        // Foreman / Project Lead Signature Label
        doc.setFont("helvetica", "bold");
        doc.text("Foreman / Project Lead Signature", 14, yPos);
        yPos += 5; // Space below label

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
        doc.setLineDash([]); // Reset to solid line

        // Save PDF
        const filenameDate = dateVal.replace(/-/g, '');
        const filename = `Atlas_Daily_Report_${filenameDate}.pdf`;

        if (isShare) {
            // Share Logic
            const pdfBlob = doc.output('blob');
            const file = new File([pdfBlob], filename, { type: 'application/pdf' });

            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        files: [file],
                        title: 'Atlas Daily Report',
                        text: `Here is the daily report for ${dateStr}.`,
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

    function formatTime(timeStr) {
        if (!timeStr) return '';
        const [hour, minute] = timeStr.split(':');
        const h = parseInt(hour);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${h12}:${minute} ${ampm}`;
    }
});
