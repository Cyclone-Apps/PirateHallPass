// public/js/features/f-staff-schedule.js
import { db } from "../firebase-config.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { schoolMapSVG } from "../map.js"; 
import { activeStaffList } from "./f-staff-roster.js"; // Needs the staff list for dropdowns!

let currentLiveScheduleData = null; // Replaces window.currentLiveScheduleData

export function initStaffSchedule() {
    bindScheduleEvents();
}

function bindScheduleEvents() {
    // 1. CSV Import (Master Schedule)
    const importScheduleBtn = document.getElementById("btn-import-teacher-schedule");
    if (importScheduleBtn) {
        importScheduleBtn.addEventListener("click", processTeacherCSVImport);
    }

    // 2. Global Click Delegation for Schedule Actions
    document.addEventListener("click", async (e) => {
        
        // --- MODAL TOGGLES ---
        if (e.target.closest("#btn-open-teacher-schedule")) {
            document.getElementById("teacher-schedule-modal")?.classList.remove("hidden");
            const snap = await getDoc(doc(db, "settings", "master_schedule"));
            if (snap.exists()) renderTeacherScheduleTable(snap.data());
        }
        if (e.target.id === "close-teacher-schedule-modal") {
            document.getElementById("teacher-schedule-modal")?.classList.add("hidden");
        }

        // --- EDIT SCHEDULE CELL CONTROLS ---
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

        if (e.target.id === "btn-cancel-cell") {
            document.getElementById("edit-schedule-cell-modal")?.classList.add("hidden");
        }
    });

    // 3. Sub-listener for rotation dropdown showing custom days input
    const rotDropdown = document.getElementById("edit-cell-rotation");
    if (rotDropdown) {
        rotDropdown.addEventListener("change", (ev) => {
            const container = document.getElementById("edit-cell-custom-days-container");
            if (container) ev.target.value === "custom" ? container.classList.remove("hidden") : container.classList.add("hidden");
        });
    }
}

// ==========================================
// 📅 3. MASTER SCHEDULE GRID & IMPORT
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

            // 🟢 NEW: Preserve existing locked rooms & skip check-ins during import securely!
            const snap = await getDoc(doc(db, "settings", "master_schedule"));
            const existingLocked = snap.exists() ? (snap.data().lockedRooms || {}) : {};
            const existingSkipCheckIn = snap.exists() ? (snap.data().skipCheckInRooms || {}) : {};
            
            cleanSchedule.lockedRooms = existingLocked;
            cleanSchedule.skipCheckInRooms = existingSkipCheckIn;

            await setDoc(doc(db, "settings", "master_schedule"), cleanSchedule);
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

function renderTeacherScheduleTable(scheduleObj) {
    currentLiveScheduleData = scheduleObj; 
    const headerRow = document.getElementById("teacher-table-header");
    const tbody = document.getElementById("teacher-table-tbody");
    if (!headerRow || !tbody || !scheduleObj) return;

    // 🟢 1. Extract locked rooms and skip check-ins
    const lockedRooms = scheduleObj.lockedRooms || {};
    const skipCheckInRooms = scheduleObj.skipCheckInRooms || {};

    // 🟢 2. Build complete list of rooms from Map + Schedule
    const allRooms = new Set();
    
    // Grab rooms from the imported schedule
    Object.keys(scheduleObj).forEach(key => {
        if (key !== 'lockedRooms' && key !== 'skipCheckInRooms') {
            Object.keys(scheduleObj[key]).forEach(room => allRooms.add(room));
        }
    });

    // Grab rooms from the Map SVG to ensure 100% coverage
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

    // 🟢 3. Prepare Live Staff List for Dropdowns (Using imported activeStaffList)
    const sortedStaff = [...activeStaffList].sort((a,b) => (a.displayName || "").localeCompare(b.displayName || ""));

    // 🟢 4. Render Headers (With new Check-In column)
    let headerHtml = `
        <th style="padding: 12px; border-bottom: 2px solid #dee2e6;">Room</th>
        <th style="padding: 12px; border-bottom: 2px solid #dee2e6; width: 120px; text-align: center; line-height: 1.3;">
            Skip Check-In ⏩<br>
            <span style="font-size: 0.75rem; font-weight: normal; color: #666;">(For Restrooms)</span>
        </th>
        <th style="padding: 12px; border-bottom: 2px solid #dee2e6; width: 220px; line-height: 1.3;">
            Lock Room to Staff 🔒<br>
            <span style="font-size: 0.75rem; font-weight: normal; color: #666;">(Overrides schedule)</span>
        </th>
    `;
    periods.forEach(p => headerHtml += `<th style="padding: 12px; border-bottom: 2px solid #dee2e6;">Period ${p}</th>`);
    headerRow.innerHTML = headerHtml;

    // 🟢 5. Render Rows & Dropdowns
    let rowsHtml = "";
    sortedRooms.forEach(room => {
        const lockedTeacher = lockedRooms[room] || "";
        
        // Build the dropdown select HTML
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
        
       // Failsafe: Keep teacher visible even if they were removed from the master staff list
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

    // ==========================================
    // 🟢 ATTACH DROPDOWN LISTENERS (AUTO-SAVE!)
    // ==========================================
    tbody.querySelectorAll(".select-lock-staff").forEach(sel => {
        sel.addEventListener("change", async (e) => {
            const room = e.target.getAttribute("data-room");
            const selectedTeacher = e.target.value;
            
            if (!currentLiveScheduleData.lockedRooms) {
                currentLiveScheduleData.lockedRooms = {};
            }

            if (selectedTeacher) {
                currentLiveScheduleData.lockedRooms[room] = selectedTeacher;
            } else {
                delete currentLiveScheduleData.lockedRooms[room];
            }

            // Sync to the map's live cache
            if (!window.liveMasterSchedule) window.liveMasterSchedule = {};
            window.liveMasterSchedule.lockedRooms = currentLiveScheduleData.lockedRooms;

            // Visual flash of success
            const originalBg = e.target.style.background;
            e.target.style.background = "#e8f5e9"; 
            setTimeout(() => e.target.style.background = originalBg, 500);

            try {
                await setDoc(doc(db, "settings", "master_schedule"), {
                    lockedRooms: currentLiveScheduleData.lockedRooms
                }, { merge: true });
            } catch (err) {
                console.error("Failed to save lock:", err);
                alert("Failed to save lock. Check connection.");
            }
        });
    });

    // ==========================================
    // 🟢 ATTACH SKIP CHECK-IN LISTENERS
    // ==========================================
    tbody.querySelectorAll(".toggle-skip-checkin").forEach(box => {
        box.addEventListener("change", async (e) => {
            const room = e.target.getAttribute("data-room");
            const isChecked = e.target.checked;

            if (!currentLiveScheduleData.skipCheckInRooms) {
                currentLiveScheduleData.skipCheckInRooms = {};
            }

            if (isChecked) {
                currentLiveScheduleData.skipCheckInRooms[room] = true;
            } else {
                delete currentLiveScheduleData.skipCheckInRooms[room];
            }

            // Sync to live cache
            if (!window.liveMasterSchedule) window.liveMasterSchedule = {};
            window.liveMasterSchedule.skipCheckInRooms = currentLiveScheduleData.skipCheckInRooms;

            // Visual flash of success
            const td = e.target.closest("td");
            const originalBg = td.style.background;
            td.style.background = "#e8f5e9";
            setTimeout(() => td.style.background = originalBg, 500);

            try {
                await setDoc(doc(db, "settings", "master_schedule"), {
                    skipCheckInRooms: currentLiveScheduleData.skipCheckInRooms
                }, { merge: true });
            } catch (err) {
                console.error("Failed to save skip toggle:", err);
                alert("Failed to save. Check connection.");
                e.target.checked = !isChecked; // revert visually
            }
        });
    });

    // Reattach manual edit listeners for the rest of the schedule
    tbody.querySelectorAll(".editable-schedule-cell").forEach(cell => {
        cell.addEventListener("click", () => {
            // Existing logic is handled by global click delegation!
        });
    });
}