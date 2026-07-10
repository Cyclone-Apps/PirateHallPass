// public/js/features/f-staff-schedule.js
import { db } from "../firebase-config.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { schoolMapSVG } from "../map.js"; 
import { activeStaffList } from "./f-staff-roster.js"; 

export let currentLiveScheduleData = null; 

export function initStaffSchedule() {
    loadExistingSchedule();
    bindScheduleEvents();
}

// ==========================================
// 🚀 INITIALIZATION & EVENTS
// ==========================================
async function loadExistingSchedule() {
    const snap = await getDoc(doc(db, "settings", "master_schedule"));
    if (snap.exists()) {
        currentLiveScheduleData = snap.data();
    }
}

function bindScheduleEvents() {
    // CSV Import Button
    document.getElementById("btn-import-teacher-schedule")?.addEventListener("click", processTeacherCSVImport);

    // Global Modals & Cell Clicks
    document.addEventListener("click", async (e) => {
        // Open Modal
        if (e.target.closest("#btn-open-teacher-schedule")) {
            document.getElementById("teacher-schedule-modal")?.classList.remove("hidden");
            if (currentLiveScheduleData) {
                renderTeacherScheduleTable(currentLiveScheduleData);
            } else {
                await loadExistingSchedule();
                if (currentLiveScheduleData) renderTeacherScheduleTable(currentLiveScheduleData);
            }
        }
        
        // Close Modal
        if (e.target.id === "close-teacher-schedule-modal") {
            document.getElementById("teacher-schedule-modal")?.classList.add("hidden");
        }

        // Edit Cell
        const cell = e.target.closest(".editable-schedule-cell");
        if (cell) {
            const room = cell.getAttribute("data-room");
            const period = cell.getAttribute("data-period");
            document.getElementById("edit-cell-room").value = room;
            document.getElementById("edit-cell-period").value = period;
            document.getElementById("edit-cell-title").innerText = `Edit: ${room.toUpperCase()} (Period ${period})`;
            
            const existingData = currentLiveScheduleData[period][room];
            document.getElementById("edit-cell-teacher").value = existingData && existingData.length > 0 ? existingData[0].teacher : "";
            document.getElementById("edit-schedule-cell-modal")?.classList.remove("hidden");
        }

        // Save Cell Edit
        if (e.target.id === "btn-save-cell") {
            const room = document.getElementById("edit-cell-room").value;
            const period = document.getElementById("edit-cell-period").value;
            const teacher = document.getElementById("edit-cell-teacher").value.trim();
            const rotSelect = document.getElementById("edit-cell-rotation").value;
            
            if (!teacher) return alert("Please enter a teacher name.");
            
            let days = rotSelect === "custom" 
                ? document.getElementById("edit-cell-custom-days").value.split(",").map(n => parseInt(n.trim())) 
                : rotSelect.split(",").map(Number);

            if (!currentLiveScheduleData[period]) currentLiveScheduleData[period] = {};
            currentLiveScheduleData[period][room] = [{ teacher, days }];

            e.target.innerText = "Saving...";
            await setDoc(doc(db, "settings", "master_schedule"), currentLiveScheduleData);
            renderTeacherScheduleTable(currentLiveScheduleData);
            document.getElementById("edit-schedule-cell-modal")?.classList.add("hidden");
            e.target.innerText = "Save";
        }

        // Clear Cell Edit
        if (e.target.id === "btn-clear-cell") {
            const room = document.getElementById("edit-cell-room").value;
            const period = document.getElementById("edit-cell-period").value;
            if (currentLiveScheduleData[period] && currentLiveScheduleData[period][room]) {
                delete currentLiveScheduleData[period][room];
                await setDoc(doc(db, "settings", "master_schedule"), currentLiveScheduleData);
                renderTeacherScheduleTable(currentLiveScheduleData);
            }
            document.getElementById("edit-schedule-cell-modal")?.classList.add("hidden");
        }

        // Cancel Cell Edit
        if (e.target.id === "btn-cancel-cell") {
            document.getElementById("edit-schedule-cell-modal")?.classList.add("hidden");
        }
    });

    // Custom Rotation Days Input Toggle
    document.getElementById("edit-cell-rotation")?.addEventListener("change", (ev) => {
        const container = document.getElementById("edit-cell-custom-days-container");
        if (container) ev.target.value === "custom" ? container.classList.remove("hidden") : container.classList.add("hidden");
    });
}

// ==========================================
// 📥 MASTER SCHEDULE CSV PARSER
// ==========================================
async function processTeacherCSVImport() {
    const fileInput = document.getElementById("file-teacher-schedule");
    const statusText = document.getElementById("teacher-import-status");
    
    if (!fileInput || !fileInput.files.length) {
        statusText.style.color = "var(--pirate-red)";
        statusText.innerText = "⚠️ Please select a valid CSV file first.";
        return;
    }

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const lines = e.target.result.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
            const headers = lines[0].split(",");

            const cleanSchedule = {}; 
            headers.forEach(h => {
                const period = h.trim();
                if (period !== "Room Name" && period !== "0") cleanSchedule[period] = {};
            });

            function extractTeacherInfo(rawText) {
                if (!rawText || rawText.toLowerCase() === 'nan') return null;
                let teacherName = null;
                const nameMatch = rawText.match(/(M[rs]s?\.?\s+[A-Za-z\-]+|Dr\.?\s+[A-Za-z\-]+)/i);
                if (nameMatch) teacherName = nameMatch[1].trim();
                else if (rawText.toLowerCase().includes("spanish")) teacherName = "Spanish"; 
                if (!teacherName) return null;

                let activeDays = [1, 2, 3, 4, 5, 6]; 
                const daysMatch = rawText.match(/([1-6\-]{6})/); 
                if (daysMatch) activeDays = daysMatch[1].split('').filter(c => c !== '-').map(Number);
                return { teacher: teacherName, days: activeDays };
            }

            for (let i = 1; i < lines.length; i++) {
                const rowCells = [];
                let currentCell = "", inQuotes = false;
                for (let char of lines[i]) {
                    if (char === '"') inQuotes = !inQuotes;
                    else if (char === ',' && !inQuotes) { rowCells.push(currentCell.trim()); currentCell = ""; }
                    else currentCell += char;
                }
                rowCells.push(currentCell.trim());

                let roomName = rowCells[0].toLowerCase().replace(/room\s+/i, '').trim();
                if (!roomName) continue;

                headers.forEach((h, idx) => {
                    const period = h.trim();
                    if (cleanSchedule[period]) {
                        const info = extractTeacherInfo(rowCells[idx]);
                        if (info) {
                            if (!cleanSchedule[period][roomName]) cleanSchedule[period][roomName] = [];
                            const exists = cleanSchedule[period][roomName].find(t => t.teacher === info.teacher && JSON.stringify(t.days) === JSON.stringify(info.days));
                            if (!exists) cleanSchedule[period][roomName].push(info);
                        }
                    }
                });
            }

            // Preserve existing locked rooms & skip check-ins
            const snap = await getDoc(doc(db, "settings", "master_schedule"));
            const existingLocked = snap.exists() ? (snap.data().lockedRooms || {}) : {};
            const existingSkipCheckIn = snap.exists() ? (snap.data().skipCheckInRooms || {}) : {};
            
            cleanSchedule.lockedRooms = existingLocked;
            cleanSchedule.skipCheckInRooms = existingSkipCheckIn;

            await setDoc(doc(db, "settings", "master_schedule"), cleanSchedule);
            currentLiveScheduleData = cleanSchedule; // Update live memory
            statusText.style.color = "green";
            statusText.innerText = `✅ Successfully mapped Teachers & Rotation Days!`;
            renderTeacherScheduleTable(cleanSchedule);
        } catch (error) {
            statusText.style.color = "var(--pirate-red)";
            statusText.innerText = `❌ Error processing file. Check console.`;
        }
    };
    reader.readAsText(fileInput.files[0]);
}

// ==========================================
// 🎨 RENDER SCHEDULE TABLE
// ==========================================
function renderTeacherScheduleTable(scheduleObj) {
    const headerRow = document.getElementById("teacher-table-header");
    const tbody = document.getElementById("teacher-table-tbody");
    if (!headerRow || !tbody || !scheduleObj) return;

    const lockedRooms = scheduleObj.lockedRooms || {};
    const skipCheckInRooms = scheduleObj.skipCheckInRooms || {};
    const allRooms = new Set();
    
    Object.keys(scheduleObj).forEach(key => {
        if (key !== 'lockedRooms' && key !== 'skipCheckInRooms') {
            Object.keys(scheduleObj[key]).forEach(room => allRooms.add(room));
        }
    });

    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = schoolMapSVG;
    tempDiv.querySelectorAll(".map-node").forEach(node => {
        let roomId = node.getAttribute("data-id");
        if (roomId && !roomId.toLowerCase().includes("hallway") && !roomId.toLowerCase().includes("corridor") && !roomId.toLowerCase().includes("block")) {
            allRooms.add(roomId.toLowerCase().replace(/^room\s+/i, '').trim());
        }
    });

    const sortedRooms = Array.from(allRooms).sort();
    const periods = Object.keys(scheduleObj).filter(k => k !== 'lockedRooms' && k !== 'skipCheckInRooms').sort((a,b) => parseInt(a) - parseInt(b));
    const sortedStaff = [...activeStaffList].sort((a,b) => (a.displayName || "").localeCompare(b.displayName || ""));

    let headerHtml = `
        <th style="padding: 12px; border-bottom: 2px solid #dee2e6;">Room</th>
        <th style="padding: 12px; border-bottom: 2px solid #dee2e6; width: 120px; text-align: center; line-height: 1.3;">
            Skip Check-In ⏩
        </th>
        <th style="padding: 12px; border-bottom: 2px solid #dee2e6; width: 220px; line-height: 1.3;">
            Lock Room to Staff 🔒
        </th>
    `;
    periods.forEach(p => headerHtml += `<th style="padding: 12px; border-bottom: 2px solid #dee2e6;">Period ${p}</th>`);
    headerRow.innerHTML = headerHtml;

    let rowsHtml = "";
    sortedRooms.forEach(room => {
        const lockedTeacher = lockedRooms[room] || "";
        
        let selectHtml = `<select class="select-lock-staff" data-room="${room}" style="width: 100%; padding: 6px; border-radius: 4px; border: 1px solid #ccc; font-size: 0.9rem; background: #fff;">`;
        selectHtml += `<option value="">-- No Lock --</option>`;
        
        let foundInList = false;
        sortedStaff.forEach(staff => {
            if(staff.displayName) {
                const isSelected = (staff.displayName === lockedTeacher) ? "selected" : "";
                if (isSelected) foundInList = true;
                selectHtml += `<option value="${staff.displayName}" ${isSelected}>${staff.displayName}</option>`;
            }
        });
        
        if (lockedTeacher && !foundInList) {
            selectHtml += `<option value="${lockedTeacher}" selected>${lockedTeacher} (Not in list)</option>`;
        }
        selectHtml += `</select>`;

        const isSkipped = skipCheckInRooms[room] ? "checked" : "";
        let skipHtml = `<div style="text-align: center;"><input type="checkbox" class="toggle-skip-checkin" data-room="${room}" ${isSkipped} style="width: 20px; height: 20px; cursor: pointer;"></div>`;

        let rowHtml = `<tr>
            <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #eee; white-space: nowrap;">
                ${room.toUpperCase()}
            </td>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">
                ${skipHtml}
            </td>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">
                ${selectHtml}
            </td>`;
        
        periods.forEach(p => {
            const assignments = scheduleObj[p] ? scheduleObj[p][room] : null;
            let cellHtml = "<span style='color:#ccc'>-</span>";
            if (assignments && assignments.length > 0) {
                cellHtml = assignments.map(a => {
                    const dayBadge = a.days.length === 6 ? "All Days" : `Days: ${a.days.join(",")}`;
                    return `<div>${a.teacher} <span style="font-size: 0.75rem; color: #888;">(${dayBadge})</span></div>`;
                }).join("");
            }
            rowHtml += `<td class="editable-schedule-cell" data-room="${room}" data-period="${p}" style="padding: 10px; border-bottom: 1px solid #eee; vertical-align: top; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#fff3cd'" onmouseout="this.style.background='transparent'">${cellHtml}</td>`;
        });
        rowHtml += `</tr>`;
        rowsHtml += rowHtml;
    });
    tbody.innerHTML = rowsHtml;

    // Attach Dropdown Auto-Save Listeners
    tbody.querySelectorAll(".select-lock-staff").forEach(sel => {
        sel.addEventListener("change", async (e) => {
            const room = e.target.getAttribute("data-room");
            const selectedTeacher = e.target.value;
            
            if (!currentLiveScheduleData.lockedRooms) currentLiveScheduleData.lockedRooms = {};
            if (selectedTeacher) currentLiveScheduleData.lockedRooms[room] = selectedTeacher;
            else delete currentLiveScheduleData.lockedRooms[room];

            if (!window.liveMasterSchedule) window.liveMasterSchedule = {};
            window.liveMasterSchedule.lockedRooms = currentLiveScheduleData.lockedRooms;

            e.target.style.background = "#e8f5e9"; 
            setTimeout(() => e.target.style.background = "", 500);

            try {
                await setDoc(doc(db, "settings", "master_schedule"), { lockedRooms: currentLiveScheduleData.lockedRooms }, { merge: true });
            } catch (err) { alert("Failed to save lock. Check connection."); }
        });
    });

    tbody.querySelectorAll(".toggle-skip-checkin").forEach(box => {
        box.addEventListener("change", async (e) => {
            const room = e.target.getAttribute("data-room");
            const isChecked = e.target.checked;

            if (!currentLiveScheduleData.skipCheckInRooms) currentLiveScheduleData.skipCheckInRooms = {};
            if (isChecked) currentLiveScheduleData.skipCheckInRooms[room] = true;
            else delete currentLiveScheduleData.skipCheckInRooms[room];

            if (!window.liveMasterSchedule) window.liveMasterSchedule = {};
            window.liveMasterSchedule.skipCheckInRooms = currentLiveScheduleData.skipCheckInRooms;

            const td = e.target.closest("td");
            td.style.background = "#e8f5e9";
            setTimeout(() => td.style.background = "", 500);

            try {
                await setDoc(doc(db, "settings", "master_schedule"), { skipCheckInRooms: currentLiveScheduleData.skipCheckInRooms }, { merge: true });
            } catch (err) { e.target.checked = !isChecked; }
        });
    });
}

// ==========================================
// 🔍 AUTOMATED ROOM FINDER ENGINE
// ==========================================
/**
 * Looks up the physical room number for a specific teacher and period based on the Master Schedule CSV.
 * @param {string} teacherAlias - The string selected in the "Schedule Link" dropdown (e.g., "Ms. Britt")
 * @param {string} period - The class period (e.g., "3")
 * @returns {string|null} - The room number (e.g., "104") or null if not found
 */
export function getRoomForTeacherAndPeriod(teacherAlias, period) {
    if (!currentLiveScheduleData || !teacherAlias || !period) return null;
    
    const periodData = currentLiveScheduleData[period];
    if (!periodData) return null;

    // Search through every room in this period to see if the teacher is assigned there
    for (const [roomNumber, teacherAssignments] of Object.entries(periodData)) {
        // teacherAssignments is an array of objects like: [{ teacher: "Ms. Britt", days: [1,2,3,4,5,6] }]
        const isHere = teacherAssignments.find(t => t.teacher === teacherAlias);
        if (isHere) {
            return roomNumber.toUpperCase(); // We found them!
        }
    }
    
    return null; // Not teaching during this period, or not on the CSV
}