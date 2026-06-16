// js/admin/admin-staff.js

import { db } from "../firebase-config.js";
import { collection, doc, setDoc, getDoc, getDocs, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// 🧠 STATE MANAGEMENT
// ==========================================
window.activeStaffList = []; 
window.currentLiveScheduleData = null; 

// ==========================================
// 🚀 INITIALIZATION & EVENT BINDING
// ==========================================
export function initStaffManagement() {
    
    // 1. Start Live Roster Listener
    listenToTeacherRoster();

    // 2. CSV Import Binding (Roster)
    const btnTriggerTeacherImport = document.getElementById("btn-trigger-teacher-import");
    const fileInputTeachers = document.getElementById("file-import-teachers");
    if (btnTriggerTeacherImport && fileInputTeachers) {
        btnTriggerTeacherImport.addEventListener("click", () => {
            const file = fileInputTeachers.files[0];
            if (!file) return alert("Please select a CSV file first.");

            btnTriggerTeacherImport.innerText = "⏳ Importing...";
            btnTriggerTeacherImport.disabled = true;

            const reader = new FileReader();
            reader.onload = async (event) => {
                await processTeacherCSV(event.target.result);
                btnTriggerTeacherImport.innerText = "✅ Import Complete!";
                setTimeout(() => {
                    btnTriggerTeacherImport.innerText = "📥 Import Teachers";
                    btnTriggerTeacherImport.disabled = false;
                    fileInputTeachers.value = ""; 
                }, 3000);
            };
            reader.readAsText(file);
        });
    }

    // 3. CSV Import Binding (Master Schedule)
    const importScheduleBtn = document.getElementById("btn-import-teacher-schedule");
    if (importScheduleBtn) {
        importScheduleBtn.addEventListener("click", processTeacherCSVImport);
    }

    // 4. Live Search Filter Binding
    const searchInput = document.getElementById("input-search-teachers");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            const term = e.target.value.toLowerCase();
            document.querySelectorAll(".staff-roster-row").forEach(row => {
                row.style.display = row.innerText.toLowerCase().includes(term) ? "" : "none";
            });
        });
    }

    // 5. Admin Privilege Toggle Binding
    const tbodyElement = document.getElementById("teacher-roster-table-body");
    if (tbodyElement) {
        tbodyElement.addEventListener("change", async (e) => {
            if (e.target.classList.contains("teacher-admin-toggle")) {
                // Fetch the actual Document ID from the closest row
                const docId = e.target.closest("tr").dataset.uid; 
                const grantAdmin = e.target.checked;
                
                if (!docId) {
                    alert("Error: Cannot update role. Document ID missing.");
                    e.target.checked = !grantAdmin; // Revert visually
                    return;
                }

                try {
                    // Update using the UID instead of the email
                    await setDoc(doc(db, "users", docId), { role: grantAdmin ? "admin" : "teacher" }, { merge: true });
                } catch (err) {
                    console.error("Failed to update user privileges:", err);
                    alert("Critical Error: Database authorization update failed.");
                    e.target.checked = !grantAdmin; 
                }
            }
        });
    }

    // 6. Global Click Delegation for Modals and Actions
    document.addEventListener("click", async (e) => {
        
        // --- MODAL TOGGLES ---
        if (e.target.closest("#btn-open-teacher-management")) {
            document.getElementById("teacher-management-modal")?.classList.remove("hidden");
        }
        if (e.target.id === "close-teacher-management-modal") {
            document.getElementById("teacher-management-modal")?.classList.add("hidden");
        }
        if (e.target.closest("#btn-open-teacher-schedule")) {
            document.getElementById("teacher-schedule-modal")?.classList.remove("hidden");
            const snap = await getDoc(doc(db, "settings", "master_schedule"));
            if (snap.exists()) renderTeacherScheduleTable(snap.data());
        }
        if (e.target.id === "close-teacher-schedule-modal") {
            document.getElementById("teacher-schedule-modal")?.classList.add("hidden");
        }
        if (e.target.id === "btn-open-add-teacher") {
            document.getElementById("add-teacher-modal")?.classList.remove("hidden");
        }
        if (e.target.id === "btn-cancel-new-teacher" || e.target.id === "close-add-teacher-modal") {
            document.getElementById("add-teacher-modal")?.classList.add("hidden");
        }

        // --- NEW: LUNCH PILL TOGGLE LOGIC ---
        if (e.target.classList.contains("lunch-option")) {
            const pill = e.target.closest(".teacher-lunch-pill");
            const teacherId = pill.dataset.id;
            let selectedLunch = e.target.dataset.value; // "A" or "B"
            
            // If they click the already active option, turn it off (set to 'none')
            if (pill.dataset.lunch === selectedLunch) selectedLunch = "none";
            
            // Save to Firebase (The real-time listener will instantly update the UI!)
            setDoc(doc(db, "users", teacherId), { lunch: selectedLunch }, { merge: true });
        }

        // --- ADD NEW TEACHER ---
        if (e.target.id === "btn-save-new-teacher") {
            const name = document.getElementById("new-teacher-name").value.trim();
            const email = document.getElementById("new-teacher-email").value.trim().toLowerCase();
            if (!name || !email) return alert("Please fill out both Name and Email.");
            
            e.target.innerText = "Saving...";
            try {
                await setDoc(doc(db, "users", email), { displayName: name, email: email, role: "teacher" }, { merge: true });
                document.getElementById("new-teacher-name").value = "";
                document.getElementById("new-teacher-email").value = "";
                document.getElementById("add-teacher-modal")?.classList.add("hidden");
                alert("Teacher successfully added to the database!");
            } catch (err) { alert("Error adding teacher."); }
            e.target.innerText = "Save Teacher";
        }

        // --- AUTO-MATCH SCHEDULE SYNC ---
        if (e.target.id === "btn-sync-schedules") runAutoMatchSync(e.target);

        // --- EDIT SCHEDULE CELL CONTROLS ---
        const cell = e.target.closest(".editable-schedule-cell");
        if (cell) {
            const room = cell.getAttribute("data-room");
            const period = cell.getAttribute("data-period");
            document.getElementById("edit-cell-room").value = room;
            document.getElementById("edit-cell-period").value = period;
            document.getElementById("edit-cell-title").innerText = `Edit: ${room.toUpperCase()} (Period ${period})`;
            
            const existingData = window.currentLiveScheduleData[period][room];
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

            if (!window.currentLiveScheduleData[period]) window.currentLiveScheduleData[period] = {};
            window.currentLiveScheduleData[period][room] = [{ teacher, days }];

            e.target.innerText = "Saving...";
            await setDoc(doc(db, "settings", "master_schedule"), window.currentLiveScheduleData);
            renderTeacherScheduleTable(window.currentLiveScheduleData);
            document.getElementById("edit-schedule-cell-modal")?.classList.add("hidden");
            e.target.innerText = "Save";
        }

        if (e.target.id === "btn-clear-cell") {
            const room = document.getElementById("edit-cell-room").value;
            const period = document.getElementById("edit-cell-period").value;
            if (window.currentLiveScheduleData[period] && window.currentLiveScheduleData[period][room]) {
                delete window.currentLiveScheduleData[period][room];
                await setDoc(doc(db, "settings", "master_schedule"), window.currentLiveScheduleData);
                renderTeacherScheduleTable(window.currentLiveScheduleData);
            }
            document.getElementById("edit-schedule-cell-modal")?.classList.add("hidden");
        }

        if (e.target.id === "btn-cancel-cell") {
            document.getElementById("edit-schedule-cell-modal")?.classList.add("hidden");
        }
    });

    // Sub-listener for rotation dropdown showing custom days input
    const rotDropdown = document.getElementById("edit-cell-rotation");
    if (rotDropdown) {
        rotDropdown.addEventListener("change", (ev) => {
            const container = document.getElementById("edit-cell-custom-days-container");
            if (container) ev.target.value === "custom" ? container.classList.remove("hidden") : container.classList.add("hidden");
        });
    }
}

// ==========================================
// 📋 1. LIVE TEACHER ROSTER & IMPORT
// ==========================================
function listenToTeacherRoster() {
    const tbody = document.getElementById("teacher-roster-table-body");
    if (!tbody) return;

    // Inject 'Add Teacher' button above table if it doesn't exist
    const tableElement = tbody.closest("table");
    if (tableElement && !document.getElementById("btn-open-add-teacher")) {
        tableElement.insertAdjacentHTML('beforebegin', `
            <div style="display: flex; justify-content: flex-end; margin-bottom: 15px;">
                <button id="btn-open-add-teacher" style="background: #0277bd; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-weight: bold; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">
                    ➕ Manually Add Teacher
                </button>
            </div>
        `);
    }

    const q = query(collection(db, "users"), where("role", "in", ["teacher", "admin"]));
    
    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="4" style="padding: 20px; text-align: center; color: #888;">No staff records found. Import a CSV to begin.</td></tr>';
            return;
        }

        let html = "";
        let datalistHTML = ""; 
        window.activeStaffList = []; 

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            data.id = docSnap.id; 
            window.activeStaffList.push(data);

            const name = data.displayName || "Unknown";
            const email = data.email || docSnap.id;
            const isAdmin = data.role === "admin";
            const lunchShift = data.lunch || "none";
            const isA = lunchShift === "A";
            const isB = lunchShift === "B";

            datalistHTML += `<option value="${name}">`;

            const aliasBadge = data.scheduleAlias 
                ? `<div style="font-size: 0.8rem; color: #0277bd; margin-top: 4px;">🔗 Linked Schedule: <strong>${data.scheduleAlias}</strong></div>` 
                : ``;

            const checkboxHTML = `<div style="text-align: center;"><input type="checkbox" class="teacher-admin-toggle" data-email="${email}" ${isAdmin ? "checked" : ""} style="width: 18px; height: 18px; cursor: pointer;" /></div>`;

            const lunchHTML = `
                <div style="text-align: center;">
                    <div class="teacher-lunch-pill" data-id="${docSnap.id}" data-lunch="${lunchShift}" style="display: inline-flex; border-radius: 20px; overflow: hidden; border: 1px solid #ccc; cursor: pointer; user-select: none; font-size: 0.9rem;">
                        <div class="lunch-option" data-value="A" style="padding: 6px 16px; background: ${isA ? '#c62828' : '#f8f9fa'}; color: ${isA ? 'white' : '#444'}; font-weight: bold; transition: 0.2s;">A</div>
                        <div class="lunch-option" data-value="B" style="padding: 6px 16px; background: ${isB ? '#c62828' : '#f8f9fa'}; color: ${isB ? 'white' : '#444'}; font-weight: bold; border-left: 1px solid #ccc; transition: 0.2s;">B</div>
                    </div>
                </div>
            `;

           html += `
                <tr class="staff-roster-row" data-uid="${docSnap.id}" style="border-bottom: 1px solid #eee; transition: background 0.2s;" onmouseover="this.style.background='#f9f9f9'" onmouseout="this.style.background='white'">
                    <td style="padding: 12px; color: #333; font-weight: 500;">${name}${aliasBadge}</td>
                    <td style="padding: 12px; color: #666;">${email}</td>
                    <td style="padding: 12px;">${checkboxHTML}</td>
                    <td style="padding: 12px;">${lunchHTML}</td>
                </tr>
            `;
        });
        
        tbody.innerHTML = html;
        const datalist = document.getElementById("staff-list-options");
        if (datalist) datalist.innerHTML = datalistHTML;
    });
}

async function processTeacherCSV(csvText) {
    const rows = csvText.split(/\r?\n/).filter(row => row.trim() !== "");
    const headers = rows[0].split(",").map(h => h.trim());
    const nameIdx = headers.indexOf("Member Name");
    const emailIdx = headers.indexOf("Member Email");

    if (nameIdx === -1 || emailIdx === -1) return alert("Error: CSV must contain 'Member Name' and 'Member Email' columns.");

    let successCount = 0;
    for (let i = 1; i < rows.length; i++) {
        const cols = rows[i].split(",");
        if (cols.length < 2) continue;

        const name = cols[nameIdx].trim();
        const email = cols[emailIdx].trim().toLowerCase();

        if (email && name) {
            try {
                const userRef = doc(db, "users", email);
                const docSnap = await getDoc(userRef);
                let finalizedRole = (docSnap.exists() && docSnap.data().role === "admin") ? "admin" : "teacher";

                await setDoc(userRef, { displayName: name, email: email, role: finalizedRole }, { merge: true });
                successCount++;
            } catch (err) { console.error(`Failed to import ${email}:`, err); }
        }
    }
    alert(`Successfully imported/updated ${successCount} teachers!`);
}

// ==========================================
// 🔄 2. AUTO-MATCH SCHEDULE SYNC ENGINE
// ==========================================
async function runAutoMatchSync(btnSync) {
    btnSync.innerText = "⏳ Scanning...";
    btnSync.disabled = true;

    try {
        // Fetch all students to extract unique teacher names from their schedules
        const snap = await getDocs(collection(db, "students"));
        const uniqueScheduleNames = new Set();
        
        snap.forEach(docSnap => {
            const student = docSnap.data();
            if (student.schedule) {
                Object.values(student.schedule).forEach(classInfo => {
                    if (classInfo.teacher && classInfo.teacher.trim() !== "" && classInfo.teacher !== "N/A") {
                        uniqueScheduleNames.add(classInfo.teacher.trim());
                    }
                });
            }
        });

        const unmappedNames = [];
        const staffList = window.activeStaffList || [];

        for (const schedName of uniqueScheduleNames) {
            if (staffList.find(staff => staff.scheduleAlias === schedName)) continue;

            const lastNameTarget = schedName.split(" ").pop().toLowerCase();
            const potentialMatches = staffList.filter(staff => (staff.displayName || "").split(" ").pop().toLowerCase() === lastNameTarget);

            if (potentialMatches.length === 1) {
                const matchedStaff = potentialMatches[0];
                await setDoc(doc(db, "users", matchedStaff.id), { scheduleAlias: schedName }, { merge: true });
            } else {
                unmappedNames.push(schedName);
            }
        }

        renderUnmappedUI(unmappedNames, staffList);

    } catch (err) {
        console.error("Error running schedule synchronization engine:", err);
        alert("Error running schedule match scan. See console.");
    }

    btnSync.innerText = "🔄 Auto-Match Schedules";
    btnSync.disabled = false;
}

function renderUnmappedUI(unmappedNames, staffList) {
    const alertBox = document.getElementById("teacher-mapping-alert");
    const container = document.getElementById("unmapped-teachers-container");
    const countBadge = document.getElementById("unmapped-count-badge");
    
    if (!alertBox || !container || !countBadge) return;

    if (unmappedNames.length === 0) {
        alertBox.classList.add("hidden");
        alert("✅ Schedule Sync Complete! All schedule names matched successfully.");
        return;
    }

    alertBox.classList.remove("hidden");
    countBadge.innerText = unmappedNames.length;

    let optionsHtml = `<option value="">-- Select Staff Account --</option>`;
    [...staffList].sort((a, b) => (a.displayName || "").localeCompare(b.displayName || "")).forEach(staff => {
        optionsHtml += `<option value="${staff.id}">${staff.displayName} (${staff.email})</option>`;
    });

    container.innerHTML = unmappedNames.map(name => `
        <div class="unmapped-row" style="display: flex; align-items: center; gap: 15px; background: white; padding: 10px; border-radius: 4px; border: 1px solid #ffeeba;">
            <strong style="width: 150px; color: #333;">${name}</strong>
            <span style="font-size: 1.5rem;">➡️</span>
            <select class="manual-map-select" data-schedname="${name}" style="flex: 1; padding: 8px; border-radius: 4px; border: 1px solid #ccc; font-size: 1rem;">
                ${optionsHtml}
            </select>
            <button class="primary-btn btn-save-manual-map" style="padding: 8px 15px; background: #2e7d32; border: none; color: white; cursor: pointer; border-radius: 4px;">💾 Link</button>
        </div>
    `).join("");

    container.querySelectorAll(".btn-save-manual-map").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            const row = e.target.closest(".unmapped-row");
            const select = row.querySelector(".manual-map-select");
            const schedName = select.getAttribute("data-schedname");
            const staffEmail = select.value;

            if (!staffEmail) return alert("Please select a staff member.");

            e.target.innerText = "⏳...";
            e.target.disabled = true;

            try {
                await setDoc(doc(db, "users", staffEmail), { scheduleAlias: schedName }, { merge: true });
                row.remove();
                
                countBadge.innerText = container.children.length;
                if (container.children.length === 0) {
                    alertBox.classList.add("hidden");
                    alert("✅ All schedule names linked successfully!");
                }
            } catch (err) {
                alert("Failed to save assignment details.");
                e.target.innerText = "💾 Link";
                e.target.disabled = false;
            }
        });
    });
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
    window.currentLiveScheduleData = scheduleObj; 
    const headerRow = document.getElementById("teacher-table-header");
    const tbody = document.getElementById("teacher-table-tbody");
    if (!headerRow || !tbody || !scheduleObj) return;

    const allRooms = new Set();
    Object.values(scheduleObj).forEach(pObj => Object.keys(pObj).forEach(room => allRooms.add(room)));
    const sortedRooms = Array.from(allRooms).sort();
    const periods = Object.keys(scheduleObj).sort((a,b) => parseInt(a) - parseInt(b));

    let headerHtml = `<th style="padding: 12px; border-bottom: 2px solid #dee2e6;">Room</th>`;
    periods.forEach(p => headerHtml += `<th style="padding: 12px; border-bottom: 2px solid #dee2e6;">Period ${p}</th>`);
    headerRow.innerHTML = headerHtml;

    let rowsHtml = "";
    sortedRooms.forEach(room => {
        let rowHtml = `<tr><td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #eee;">${room.toUpperCase()}</td>`;
        periods.forEach(p => {
            const assignments = scheduleObj[p][room];
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
}