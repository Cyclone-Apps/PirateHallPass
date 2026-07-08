// public/js/features/f-staff-roster.js
import { db } from "../firebase-config.js";
import { collection, doc, setDoc, query, where, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Keep a local copy of the staff list available for other modules (like the sync engine)
export let activeStaffList = [];

export function initStaffRoster() {
    listenToTeacherRoster();
    bindRosterEvents();
}

function bindRosterEvents() {
    // 1. Modal Toggles
    document.addEventListener("click", async (e) => {
        if (e.target.closest("#btn-open-teacher-management")) {
            document.getElementById("teacher-management-modal")?.classList.remove("hidden");
        }
        if (e.target.id === "close-teacher-management-modal") {
            document.getElementById("teacher-management-modal")?.classList.add("hidden");
        }
        if (e.target.id === "btn-open-add-teacher") {
            document.getElementById("add-teacher-modal")?.classList.remove("hidden");
        }
        if (e.target.id === "btn-cancel-new-teacher" || e.target.id === "close-add-teacher-modal") {
            document.getElementById("add-teacher-modal")?.classList.add("hidden");
        }

        // 2. Add New Teacher
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

        // 3. Lunch Pill Toggles
        if (e.target.classList.contains("lunch-option")) {
            const pill = e.target.closest(".teacher-lunch-pill");
            const teacherId = pill.dataset.id;
            let selectedLunch = e.target.dataset.value; // "A" or "B"
            
            // If they click the already active option, turn it off (set to 'none')
            if (pill.dataset.lunch === selectedLunch) selectedLunch = "none";
            
            // Save to Firebase (The real-time listener will instantly update the UI!)
            setDoc(doc(db, "users", teacherId), { lunch: selectedLunch }, { merge: true });
        }        
    });

    // 4. CSV Import (Roster)
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
                // Calls the function that actually parses and saves the CSV data
                await processTeacherCSV(event.target.result);
                
                // UI Reset
                btnTriggerTeacherImport.innerText = "✅ Import Complete!";
                setTimeout(() => {
                    btnTriggerTeacherImport.innerText = "📥 Import";
                    btnTriggerTeacherImport.disabled = false;
                    fileInputTeachers.value = ""; 
                }, 3000);
            };
            reader.readAsText(file);
        });
    }

    // 5. Live Search & Admin Toggle
    const searchInput = document.getElementById("input-search-teachers");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            const term = e.target.value.toLowerCase();
            document.querySelectorAll(".staff-roster-row").forEach(row => {
                row.style.display = row.innerText.toLowerCase().includes(term) ? "" : "none";
            });
        });
    }

    const tbodyElement = document.getElementById("teacher-roster-table-body");
    if (tbodyElement) {
        tbodyElement.addEventListener("change", async (e) => {
            
            // --- Existing Admin Toggle Logic ---
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

            // --- 🌟 NEW: Save Map Name Logic ---
            if (e.target.classList.contains("teacher-map-name-input")) {
                const uid = e.target.getAttribute("data-uid");
                const newMapName = e.target.value.trim();
                
                e.target.style.borderColor = "#0277bd"; // visual feedback (blue)
                try {
                    await setDoc(doc(db, "users", uid), { mapName: newMapName }, { merge: true });
                    e.target.style.borderColor = "green"; // success
                } catch (err) {
                    console.error("Failed to save Map Name", err);
                    e.target.style.borderColor = "red"; // error
                }
            }

            // --- 🌟 NEW: Save Schedule Alias Logic ---
            if (e.target.classList.contains("teacher-alias-select")) {
                const uid = e.target.getAttribute("data-uid");
                const newAlias = e.target.value; // Will be "" if "-- No Link --" is selected
                
                e.target.style.borderColor = "#0277bd"; // visual feedback (blue)
                try {
                    await setDoc(doc(db, "users", uid), { 
                        scheduleAlias: newAlias === "" ? null : newAlias 
                    }, { merge: true });
                    // No need to turn green, the table will instantly reload with the new data!
                } catch (err) {
                    console.error("Failed to save Schedule Alias", err);
                    e.target.style.borderColor = "red"; // error
                }
            }
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
    
    onSnapshot(q, async (snapshot) => {
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="6" style="padding: 20px; text-align: center; color: #888;">No staff records found. Import a CSV to begin.</td></tr>';
            return;
        }

        // 🌟 NEW: Extract all unique names from the Master Schedule
        let allScheduleNames = new Set();
        try {
            const schedSnap = await getDoc(doc(db, "settings", "master_schedule"));
            if (schedSnap.exists()) {
                const sched = schedSnap.data();
                Object.keys(sched).forEach(period => {
                    if (period !== 'lockedRooms' && period !== 'skipCheckInRooms') {
                        Object.values(sched[period]).forEach(roomArr => {
                            roomArr.forEach(a => { if (a.teacher) allScheduleNames.add(a.teacher.trim()); });
                        });
                    }
                });
            }
        } catch (err) {
            console.error("Failed to load schedule names for dropdowns:", err);
        }

        // 🌟 NEW: Find which names are already claimed by staff members
        activeStaffList = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            data.id = docSnap.id; 
            activeStaffList.push(data);
        });

        const claimedNames = activeStaffList.map(s => s.scheduleAlias).filter(Boolean);
        const availableNames = Array.from(allScheduleNames).filter(name => !claimedNames.includes(name)).sort();

        let html = "";
        let datalistHTML = ""; 

        activeStaffList.forEach(data => {
            const name = data.displayName || "Unknown";
            const email = data.email || data.id;
            const isAdmin = data.role === "admin";
            const lunchShift = data.lunch || "none";
            const isA = lunchShift === "A";
            const isB = lunchShift === "B";
            
            // 🌟 NEW: Get Map Name and Current Alias
            const mapName = data.mapName || "";
            const currentAlias = data.scheduleAlias || "";

            datalistHTML += `<option value="${name}">`;

            // 🌟 NEW: Build the Map Name Input
            const mapNameInput = `
                <input type="text" class="teacher-map-name-input" data-uid="${data.id}" value="${mapName}" placeholder="e.g. Smith" 
                style="padding: 6px; border-radius: 4px; border: 1px solid #ccc; width: 100%; max-width: 120px; text-align: center; outline: none;" />
            `;

            // 🌟 NEW: Build the Alias Dropdown
            let aliasDropdown = `<select class="teacher-alias-select" data-uid="${data.id}" style="padding: 6px; border-radius: 4px; border: 1px solid #ccc; width: 100%; max-width: 180px; outline: none;">`;
            aliasDropdown += `<option value="">-- No Link --</option>`;
            if (currentAlias) {
                aliasDropdown += `<option value="${currentAlias}" selected>${currentAlias}</option>`;
            }
            availableNames.forEach(avail => {
                aliasDropdown += `<option value="${avail}">${avail}</option>`;
            });
            aliasDropdown += `</select>`;

            const checkboxHTML = `<div style="text-align: center;"><input type="checkbox" class="teacher-admin-toggle" data-email="${email}" ${isAdmin ? "checked" : ""} style="width: 18px; height: 18px; cursor: pointer;" /></div>`;

            const lunchHTML = `
                <div style="text-align: center;">
                    <div class="teacher-lunch-pill" data-id="${data.id}" data-lunch="${lunchShift}" style="display: inline-flex; border-radius: 20px; overflow: hidden; border: 1px solid #ccc; cursor: pointer; user-select: none; font-size: 0.9rem;">
                        <div class="lunch-option" data-value="A" style="padding: 6px 16px; background: ${isA ? '#c62828' : '#f8f9fa'}; color: ${isA ? 'white' : '#444'}; font-weight: bold; transition: 0.2s;">A</div>
                        <div class="lunch-option" data-value="B" style="padding: 6px 16px; background: ${isB ? '#c62828' : '#f8f9fa'}; color: ${isB ? 'white' : '#444'}; font-weight: bold; border-left: 1px solid #ccc; transition: 0.2s;">B</div>
                    </div>
                </div>
            `;

           html += `
                <tr class="staff-roster-row" data-uid="${data.id}" style="border-bottom: 1px solid #eee; transition: background 0.2s;" onmouseover="this.style.background='#f9f9f9'" onmouseout="this.style.background='white'">
                    <td style="padding: 12px; color: #333; font-weight: 500;">${name}</td>
                    <td style="padding: 12px; color: #666;">${email}</td>
                    <td style="padding: 12px; text-align: center;">${mapNameInput}</td>
                    <td style="padding: 12px; text-align: center;">${aliasDropdown}</td>
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