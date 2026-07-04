import { initStudentSelect } from "./r-select.js";
import { collection, getDocs, query, where, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../firebase-config.js"; 
import { getDateFiltersHTML, getActionButtonsHTML, getStatusFilterHeaderHTML, getDateRange, initStatusFilter, printReportContainer } from "./r-utils.js";

let selectedStudentData = null;
let currentReportPasses = []; 
let activeStatuses = new Set(); 

// New State Variables for features
let showTimeDetails = false;
let hasAcceptedDeleteWarning = false;

export function loadSingleStudentReport(settingsContainer, reportContainer) {
    
    // 1. Inject UI using shared HTML utilities
    settingsContainer.innerHTML = `
        <div class="settings-layout">
            <div class="settings-left">
                <h2>Single Student Report</h2>
                <div class="search-group">
                    <label>Search Student:</label>
                    <div class="searchable-dropdown">
                        <input type="text" id="singleStudentInput" class="searchable-input" placeholder="Click to see all, or type to search..." autocomplete="off">
                        <div id="singleStudentDropdown" class="dropdown-list"></div>
                    </div>
                </div>
                ${getDateFiltersHTML()}
            </div>
            
            <div class="settings-right">
                ${getActionButtonsHTML("Run Report")}
            </div>
        </div>
    `;

    // 2. Initialize Student Dropdown and Buttons
    const inputElement = document.getElementById('singleStudentInput');
    const dropdownElement = document.getElementById('singleStudentDropdown');
    const runBtn = document.getElementById('runReportBtn');
    const printBtn = document.getElementById('printReportBtn');

    initStudentSelect(inputElement, dropdownElement, (student) => {
        selectedStudentData = student;
    });

    // --- Wire up Print Button ---
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            if (currentReportPasses.length === 0) {
                alert("Please run a report first before printing.");
                return;
            }
            printReportContainer('reportContainer');
        });
    }

    // 3. Run Report Logic
    runBtn.addEventListener('click', async () => {
        if (!selectedStudentData) {
            alert("Please select a student first.");
            return;
        }
        
        reportContainer.classList.remove('hidden');
        reportContainer.innerHTML = `<p>Loading pass history for ${selectedStudentData.name}...</p>`;

        try {
            // A. Get Date Range from utility
            const { startMillis, endMillis } = getDateRange();

            // B. Fetch Data
            const passesRef = collection(db, "passes");
            const q = query(passesRef, where("studentDisplayName", "==", selectedStudentData.name));
            const snapshot = await getDocs(q);
            
            let fetchedPasses = [];
            const uniqueStatuses = new Set();

            snapshot.forEach(doc => {
                const pass = { id: doc.id, ...doc.data() };
                const passTime = pass.createdAt && typeof pass.createdAt.toMillis === 'function' ? pass.createdAt.toMillis() : 0;
                
                if (passTime >= startMillis && passTime <= endMillis) {
                    fetchedPasses.push(pass);
                    uniqueStatuses.add((pass.status || "unknown").toLowerCase());
                }
            });

            // Safely sort newest first
            fetchedPasses.sort((a, b) => {
                const aTime = a.createdAt && typeof a.createdAt.toMillis === 'function' ? a.createdAt.toMillis() : 0;
                const bTime = b.createdAt && typeof b.createdAt.toMillis === 'function' ? b.createdAt.toMillis() : 0;
                return bTime - aTime;
            });

            currentReportPasses = fetchedPasses;

            if (currentReportPasses.length === 0) {
                reportContainer.innerHTML = `<h2>Pass History: ${selectedStudentData.name}</h2><p>No passes found in this date range.</p>`;
                return;
            }

            // C. Build Table Framework
            reportContainer.innerHTML = `
                <h2>Pass History: ${selectedStudentData.name}</h2>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <p style="margin: 0;">Visible Passes: <strong id="visiblePassCount">${currentReportPasses.length}</strong></p>
                    <label style="cursor: pointer; display: flex; align-items: center; gap: 8px; font-weight: bold; background: #f0f0f0; padding: 5px 10px; border-radius: 6px;">
                        <input type="checkbox" id="toggleTimeDetails" ${showTimeDetails ? 'checked' : ''}>
                        Show Detailed Times
                    </label>
                </div>
                <table class="report-table">
                    <thead>
                        <tr>
                            <th>Date & Time</th>
                            <th>Period</th>
                            <th>Origin</th>
                            <th>Destination</th>
                            <th>Duration / Times</th>
                            <th>${getStatusFilterHeaderHTML()}</th>
                            <th style="width: 40px; text-align: center;"></th>
                        </tr>
                    </thead>
                    <tbody id="reportTableBody"></tbody>
                </table>
            `;

            // Wire up the toggle switch
            document.getElementById('toggleTimeDetails').addEventListener('change', (e) => {
                showTimeDetails = e.target.checked;
                renderTableBody();
            });

            // D. Initialize Filter Logic & Initial Render
            activeStatuses = initStatusFilter(uniqueStatuses, (updatedStatuses) => {
                activeStatuses = updatedStatuses;
                renderTableBody(); 
            });

            renderTableBody(); // Render once on load

        } catch (error) {
            console.error("Error fetching report:", error);
            reportContainer.innerHTML = `<p style="color: red; font-weight: bold;">Error loading report.</p>`;
        }
    });
}

// Helper function to format timestamp to time string
function formatTime(ts) {
    if (ts && typeof ts.toDate === 'function') {
        return ts.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return '--:--';
}

// Helper: Renders rows based on active checkboxes and toggle state
function renderTableBody() {
    const tbody = document.getElementById('reportTableBody');
    if(!tbody) return;

    const countDisplay = document.getElementById('visiblePassCount');
    let tableHTML = "";
    let visibleCount = 0;

    currentReportPasses.forEach(pass => {
        const status = (pass.status || "unknown").toLowerCase();
        if (!activeStatuses.has(status)) return; 

        visibleCount++;
        let dateStr = "Unknown Date", timeStr = "--";
        if (pass.createdAt && typeof pass.createdAt.toDate === 'function') {
            const dateObj = pass.createdAt.toDate();
            dateStr = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
            timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        // Handle Duration vs Detailed Times
        let timeDataDisplay = "-";
        if (showTimeDetails) {
            // Show stacked detailed times
            const t1 = formatTime(pass.acceptedAt);
            const t2 = formatTime(pass.arrivedAt);
            const t3 = formatTime(pass.departedAt);
            const t4 = formatTime(pass.returnedAt);
            
            timeDataDisplay = `
                <div style="font-size: 0.8em; line-height: 1.3; white-space: nowrap;">
                    <div>🛫 Left Org: <strong>${t1}</strong></div>
                    <div>📍 Arr Dest: <strong>${t2}</strong></div>
                    <div>🚶 Left Dest: <strong>${t3}</strong></div>
                    <div>🏠 Returned: <strong>${t4}</strong></div>
                </div>
            `;
        } else {
            // Show standard duration
            if (pass.acceptedAt && typeof pass.acceptedAt.toMillis === 'function' && pass.returnedAt && typeof pass.returnedAt.toMillis === 'function') {
                const diffMins = Math.max(1, Math.round((pass.returnedAt.toMillis() - pass.acceptedAt.toMillis()) / 60000));
                timeDataDisplay = `${diffMins} min`;
            }
        }

        tableHTML += `
            <tr>
                <td>${dateStr} <br> <small style="color: #666;">${timeStr}</small></td>
                <td>${pass.period || '-'}</td>
                <td>${pass.originTeacher || '-'}</td>
                <td>${pass.destination || '-'}</td>
                <td>${timeDataDisplay}</td>
                <td style="text-transform: capitalize;">${status}</td>
                <td style="text-align: center;">
                    <span class="delete-pass-btn" data-id="${pass.id}" title="Deletes are Permanent" style="cursor: pointer; font-size: 1.2em;">🗑️</span>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = tableHTML;
    if(countDisplay) countDisplay.textContent = visibleCount;

    // Attach click listeners to all the new trash cans
    document.querySelectorAll('.delete-pass-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const passId = e.currentTarget.getAttribute('data-id');
            handleDeleteClick(passId);
        });
    });
}

// --- Delete Logic ---

function handleDeleteClick(passId) {
    if (!hasAcceptedDeleteWarning) {
        showDeleteWarningModal(passId);
    } else {
        executeDelete(passId);
    }
}

function showDeleteWarningModal(passId) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.style.zIndex = '9998'; // Ensure it's on top
    
    const modal = document.createElement('div');
    modal.className = 'pass-detail-modal';
    modal.style.zIndex = '9999';
    modal.style.maxWidth = '400px';
    modal.innerHTML = `
        <h3 style="margin-top:0; color: #cc0000;">⚠️ Permanent Deletion</h3>
        <p>You are about to permanently delete this pass from the database. This action cannot be undone.</p>
        <p style="font-size: 0.9em; color: #555;"><i>(You will only see this warning once per session)</i></p>
        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
            <button id="cancelDeleteBtn" style="padding: 8px 16px; cursor: pointer; border-radius: 4px; border: 1px solid #ccc; background: #fff;">Cancel</button>
            <button id="understandDeleteBtn" style="padding: 8px 16px; cursor: pointer; border-radius: 4px; border: none; background: #cc0000; color: white; font-weight: bold;">I Understand</button>
        </div>
    `;
    
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
    
    document.getElementById('cancelDeleteBtn').onclick = () => {
        backdrop.remove();
        modal.remove();
    };
    
    document.getElementById('understandDeleteBtn').onclick = () => {
        hasAcceptedDeleteWarning = true;
        backdrop.remove();
        modal.remove();
        executeDelete(passId);
    };
}

async function executeDelete(passId) {
    try {
        // 1. Delete from Firestore
        await deleteDoc(doc(db, "passes", passId));
        
        // 2. Remove from local array so we don't have to re-query the whole database
        currentReportPasses = currentReportPasses.filter(p => p.id !== passId);
        
        // 3. Re-render the table
        renderTableBody();
        
    } catch (error) {
        console.error("Error deleting pass:", error);
        alert("Failed to delete the pass. Check your database permissions.");
    }
}