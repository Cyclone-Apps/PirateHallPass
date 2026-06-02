// js/main-admin.js
import { 
    upsertStudentData, listenToAllStudents, updateStudentRestrictions, 
    saveBellSchedule, fetchBellSchedules, setEmergencyState, 
    listenToEmergencyState, saveTimeOffset, listenToTimeOffset, setActiveDailySchedule,
    listenToAllRestrictions, listenToDailyConfig, saveAcademicCalendar, fetchAcademicCalendar
} from "./modules/admin-engine.js";
import { handleGoogleLogin, initAuthListener } from "./modules/auth-roles.js";
import { schoolMapSVG } from "./map.js";
import { initializeTimeEngine } from "./modules/time-engine.js";

// --- NEW IMPORTS ADDED HERE ---
import { fetchAllStudents } from "./modules/pass-engine.js";
import { renderHeader, setupStudentAutocomplete } from "./modules/ui-widgets.js";

// Call the function to start the background clock!
initializeTimeEngine(); 

// --- INIT AUTH & UI ---
const btnLogin = document.getElementById("btn-google-login");
if (btnLogin) btnLogin.addEventListener("click", handleGoogleLogin);

initAuthListener("admin", async (user, role) => {
    window.currentUser = user;
    renderHeader(user, role);

    // =======================================================
    // PRE-LOAD STUDENTS FOR VIRTUAL KIOSK
    // =======================================================
    try {
        const studentList = await fetchAllStudents();
        const nameInput = document.getElementById("input-proxy-name");
        const dropdown = document.getElementById("proxy-autocomplete-list");
        const emailDisplay = document.getElementById("display-proxy-email");
        const emailHidden = document.getElementById("input-proxy-email");
        
        if (nameInput && dropdown) {
            setupStudentAutocomplete(nameInput, dropdown, studentList, null, emailDisplay, emailHidden);
        }
    } catch (err) {
        console.error("Failed to setup proxy autocomplete:", err);
    }
});

// --- GLOBAL CLICK LISTENER ---
let loadedSchedules = {};

document.addEventListener("click", async (e) => {
    if (e.target.id === "btn-open-management") {
        document.getElementById("management-modal").classList.remove("hidden");
    }
    if (e.target.id === "close-management-modal") {
        document.getElementById("management-modal").classList.add("hidden");
    }
    if (e.target.id === "close-restriction-modal") {
        document.getElementById("restriction-modal").classList.add("hidden");
    }
    if (e.target.id === "close-bell-schedule-modal") {
        document.getElementById("bell-schedule-modal").classList.add("hidden");
    }
    
    // --- VIRTUAL KIOSK CONTROLS ---
    const proxySetupModal = document.getElementById("proxy-setup-modal");
    const proxyEmulatorModal = document.getElementById("proxy-emulator-modal");

    if (e.target.id === "btn-open-proxy-setup") {
        if (proxySetupModal) proxySetupModal.classList.remove("hidden");
    }
    
    if (e.target.id === "close-proxy-setup") {
        if (proxySetupModal) proxySetupModal.classList.add("hidden");
    }
    
    if (e.target.id === "btn-close-emulator") {
        if (proxyEmulatorModal) proxyEmulatorModal.classList.add("hidden");
        const iframe = document.getElementById("proxy-iframe");
        if (iframe) iframe.src = ""; // Clear the iframe to stop background processes
    }

    if (e.target.id === "btn-launch-proxy") {
        const pName = document.getElementById("input-proxy-name").value.trim();
        const pEmail = document.getElementById("input-proxy-email").value.trim();
        
        if (!pName || !pEmail) return alert("Please enter both the student's name and email.");
        
        // Grab the Admin or Teacher's name automatically!
        const creatorName = window.currentUser.displayName; 
        const iframe = document.getElementById("proxy-iframe");
        
        // Build the URL with the proxy flag so the student app knows it's being emulated
        const proxyUrl = `student.html?proxy=true&studentName=${encodeURIComponent(pName)}&studentEmail=${encodeURIComponent(pEmail)}&teacherName=${encodeURIComponent(creatorName)}`;
        
        if (iframe) iframe.src = proxyUrl;
        if (proxySetupModal) proxySetupModal.classList.add("hidden");
        if (proxyEmulatorModal) proxyEmulatorModal.classList.remove("hidden");
    }

    // Emergency Modal Toggles
    if (e.target.id === "btn-emergency") { 
        document.getElementById("emergency-modal").classList.remove("hidden");
    }
    if (e.target.id === "close-emergency-modal") {
        document.getElementById("emergency-modal").classList.add("hidden");
    }

    // Map Popout Modal
    if (e.target.id === "btn-open-map-popout") {
        document.getElementById("map-popout-modal").classList.remove("hidden");
        loadModalMap(); // Load map when opening fullscreen
    }
    if (e.target.id === "btn-close-map-popout") {
        document.getElementById("map-popout-modal").classList.add("hidden");
    }

    if (e.target.id === "btn-open-bell-schedule") {
        document.getElementById("bell-schedule-modal").classList.remove("hidden");
        loadedSchedules = await fetchBellSchedules();
        renderScheduleTable(document.getElementById("schedule-type-select").value);
    }
    if (e.target.id === "close-bell-schedule-modal") {
        document.getElementById("bell-schedule-modal").classList.add("hidden");
    }
});


// ==========================================
// CSV PARSING & STUDENT SYNC ENGINE
// ==========================================
function parseCSV(csvText) {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== "");
    const headers = lines[0].split(",").map(h => h.replace(/['"]/g, "").trim());
    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const row = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
        if (row.length === 0) continue;
        const obj = {};
        headers.forEach((header, index) => {
            let val = row[index] ? row[index].replace(/['"]/g, "").trim() : "";
            obj[header] = val;
        });
        data.push(obj);
    }
    return data;
}

document.getElementById("btn-sync-students").addEventListener("click", async () => {
    const scheduleFile = document.getElementById("file-schedule").files[0];
    const emailFile = document.getElementById("file-email").files[0];
    const statusTxt = document.getElementById("sync-status");

    if (!scheduleFile && !emailFile) {
        statusTxt.innerText = "⚠️ Please select at least one CSV file to sync.";
        return;
    }

    statusTxt.innerText = "⏳ Reading files...";

    const readAsText = (file) => new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.readAsText(file);
    });

    const studentMap = {};

    // 1. IMPORT EMAILS (Keeping your existing parseCSV for this since it worked fine)
    if (emailFile) {
        const emailText = await readAsText(emailFile);
        const emailData = parseCSV(emailText);
        emailData.forEach(row => {
            const sId = row.StudentID ? String(row.StudentID).trim() : null;
            if (!sId) return;
            if (!studentMap[sId]) studentMap[sId] = {};
            
            const fName = row.FLName ? String(row.FLName).trim() : "";
            studentMap[sId].studentId = sId;
            studentMap[sId].fullName = fName;
            studentMap[sId].displayName = fName; 
            studentMap[sId].email = row.Email ? String(row.Email).trim() : "";
            studentMap[sId].grade = row.Grade ? String(row.Grade).trim() : "";
        });
    }

    // 2. IMPORT SCHEDULES USING ABSOLUTE INDICES (Bulletproof)
    if (scheduleFile) {
        const schedText = await readAsText(scheduleFile);
        const rows = schedText.split(/\r?\n/); 
        
        for (let i = 1; i < rows.length; i++) {
            const rowStr = rows[i].trim();
            if (!rowStr) continue;

            const cols = rowStr.split(","); 
            
            const sId = cols[0] ? cols[0].trim() : null; 
            if (!sId) continue;

            if (!studentMap[sId]) {
                const lName = cols[1] ? cols[1].trim() : ""; 
                const fName = cols[2] ? cols[2].trim() : ""; 
                const combinedName = `${fName} ${lName}`.trim();
                
                studentMap[sId] = {
                    studentId: sId,
                    fullName: combinedName,
                    displayName: combinedName,
                    grade: cols[4] ? cols[4].trim() : "", 
                    schedule: {}
                };
            }
            if (!studentMap[sId].schedule) {
                studentMap[sId].schedule = {};
            }

            const period = cols[7] ? cols[7].trim() : null; 
            
            if (period) {
                const courseName = cols[9] ? cols[9].trim() : ""; 
                const daysMet = cols[11] ? cols[11].trim() : ""; 
                
                let teacherName = cols[13] ? cols[13].trim() : ""; 
                if (cols[14] && cols[14].trim()) {                 
                    teacherName += `, ${cols[14].trim()}`;
                }
                
                const realRoom = cols[18] ? cols[18].trim() : ""; 
                
                const courseWithDays = daysMet && daysMet !== "123456" ? `${courseName} (${daysMet})` : courseName;

                const rawClassObject = {
                    courseName: courseName,
                    room: realRoom,
                    teacher: teacherName,
                    daysMet: daysMet
                };

                if (studentMap[sId].schedule[period]) {
                    studentMap[sId].schedule[period].courseName += ` / ${courseWithDays}`;
                    
                    if (realRoom && !studentMap[sId].schedule[period].room.includes(realRoom)) {
                        studentMap[sId].schedule[period].room += ` / ${realRoom}`;
                    }
                    if (teacherName && !studentMap[sId].schedule[period].teacher.includes(teacherName)) {
                        studentMap[sId].schedule[period].teacher += ` / ${teacherName}`;
                    }
                    
                    studentMap[sId].schedule[period].allClasses.push(rawClassObject);
                } else {
                    studentMap[sId].schedule[period] = {
                        courseName: courseWithDays,
                        room: realRoom,
                        teacher: teacherName,
                        allClasses: [rawClassObject] 
                    };
                }
            }
        }
    }
    
    statusTxt.innerText = "⏳ Uploading to database...";
    
    let successCount = 0;
    const studentKeys = Object.keys(studentMap);
    
    for (const sId of studentKeys) {
        const success = await upsertStudentData(sId, studentMap[sId]);
        if (success) successCount++;
    }

    if (successCount === studentKeys.length) {
        statusTxt.innerText = `✅ Successfully synced ${successCount} students!`;
    } else {
        statusTxt.innerText = `⚠️ Synced ${successCount} out of ${studentKeys.length} students. Check console.`;
    }
    
    document.getElementById("file-schedule").value = "";
    document.getElementById("file-email").value = "";
});


// ==========================================
// RENDER STUDENT LIST & SEARCH (DECOUPLED)
// ==========================================
let rawStudentsCache = [];
let allRestrictionsCache = {};
let allStudentsCache = []; // Keeps combined data perfectly available for search and dropdowns!

function mergeAndRender() {
    // Dynamically stitch the separate student and restriction records together
    allStudentsCache = rawStudentsCache.map(student => {
        return {
            ...student,
            restrictions: allRestrictionsCache[student.studentId] || null
        };
    });

    // Preserves active text filters when real-time updates hit!
    const searchInput = document.getElementById("search-student");
    const term = searchInput ? searchInput.value.toLowerCase().trim() : "";
    
    if (term) {
        const filtered = allStudentsCache.filter(s => 
            (s.fullName && s.fullName.toLowerCase().includes(term)) || 
            (s.studentId && s.studentId.includes(term))
        );
        renderAdminStudentList(filtered);
    } else {
        renderAdminStudentList(allStudentsCache);
    }
}

// Listen for typing in the search bar
const searchEl = document.getElementById("search-student");
if (searchEl) {
    searchEl.addEventListener("input", () => {
        mergeAndRender();
    });
}

// 1. Listen to students database collection
listenToAllStudents((students) => {
    rawStudentsCache = students;
    mergeAndRender();
});

// 2. Listen to decoupled restrictions database collection
listenToAllRestrictions((restrictionsMap) => {
    allRestrictionsCache = restrictionsMap;
    mergeAndRender();
});

// 3. Render Function (With Decoupled Restrictions & Icons)
function renderAdminStudentList(students) {
    const container = document.getElementById("admin-student-list");
    if (!container) return;
    container.innerHTML = "";
    
    container.style.alignItems = "start";

    students.forEach(student => {
        const card = document.createElement("div");
        card.style.cssText = "position: relative; background: white; padding: 15px; border-radius: 8px; border: 1px solid #ced4da; box-shadow: 0 2px 4px rgba(0,0,0,0.05); transition: transform 0.1s;";
        card.onmouseover = () => card.style.transform = "scale(1.02)";
        card.onmouseout = () => card.style.transform = "scale(1)";
        
        let restrictionsHtml = "";
        const res = student.restrictions;
        
        if (res && (res.rooms?.length > 0 || res.noContact?.length > 0 || (res.periods?.length > 0 && !res.periods.includes("All")))) {
            let details = [];
            
            if (res.periods && res.periods.length > 0 && !res.periods.includes("All")) {
                details.push(`<strong>Periods:</strong> ${res.periods.join(", ")}`);
            }
            if (res.rooms && res.rooms.length > 0) {
                details.push(`<strong>Rooms:</strong> ${res.rooms.join(", ")}`);
            }
            if (res.noContact && res.noContact.length > 0) {
                const peerNames = res.noContact.map(id => {
                    const peer = allStudentsCache.find(s => s.studentId === id);
                    return peer ? peer.fullName : id;
                });
                details.push(`<strong>Peers:</strong> ${peerNames.join(", ")}`);
            }

            if (details.length > 0) {
                restrictionsHtml = `
                    <div style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed #ccc;">
                        <span style="background: var(--pirate-red); color: white; padding: 3px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: bold; display: inline-block; margin-bottom: 8px;">Restricted</span>
                        <div style="font-size: 0.85rem; color: #444; line-height: 1.5;">
                            ${details.map(d => `<div>${d}</div>`).join("")}
                        </div>
                    </div>
                `;
            }
        }

        card.innerHTML = `
            <div style="padding-right: 65px;"> 
                <strong style="font-size: 1.1rem; color: var(--pirate-red);">${student.fullName || "Unknown"} (${student.studentId})</strong>
                <div style="font-size: 0.9rem; color: #555; margin-top: 5px;">Grade: ${student.grade || "N/A"}</div>
                <div style="font-size: 0.9rem; color: #555;">Email: ${student.email || "N/A"}</div>
            </div>
            
            <div style="position: absolute; top: 15px; right: 15px; display: flex; gap: 10px; font-size: 1.3rem;">
                <span class="action-schedule" style="cursor: pointer; filter: grayscale(100%); transition: filter 0.2s;" title="View Schedule" onmouseover="this.style.filter='none'" onmouseout="this.style.filter='grayscale(100%)'">📅</span>
                <span class="action-restriction" style="cursor: pointer; filter: grayscale(100%); transition: filter 0.2s;" title="Modify Restrictions" onmouseover="this.style.filter='none'" onmouseout="this.style.filter='grayscale(100%)'">🛑</span>
            </div>

            ${restrictionsHtml}
        `;

        card.querySelector(".action-restriction").addEventListener("click", (e) => {
            e.stopPropagation(); 
            openRestrictionModal(student);
        });

        card.querySelector(".action-schedule").addEventListener("click", (e) => {
            e.stopPropagation();
            window.openSchedulePopup(student); // Hooked up properly!
        });

        container.appendChild(card);
    });
}


// ==========================================
// ADVANCED WIZARD: RESTRICTIONS & MAP
// ==========================================
let selectedRooms = [];
let selectedPeers = [];
let currentEditStudentId = null;

async function openRestrictionModal(student) {
    currentEditStudentId = student.id;
    document.getElementById("modal-student-name").innerText = `Edit: ${student.fullName}`;
    document.getElementById("modal-student-id").value = student.id; 
    
    // 1. Generate Period Checkboxes 
    const allPeriods = ["1", "2", "3", "4", "4 (Advisor)", "5", "6A Lunch", "6B Class", "6A Class", "6B Lunch", "6-Advisor", "7", "8", "9", "WIN", "Advisor", "Lunch"];
    const periodContainer = document.getElementById("restriction-periods");
    
    periodContainer.innerHTML = `<label style="font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 5px;"><input type="checkbox" id="check-all-periods" value="All"> All Day</label>`;
    
    allPeriods.forEach(p => {
        const isChecked = student.restrictions?.periods?.includes(p) ? "checked" : "";
        periodContainer.innerHTML += `<label style="cursor: pointer; display: flex; align-items: center; gap: 5px;"><input type="checkbox" class="period-check" value="${p}" ${isChecked}> ${p}</label>`;
    });

    const checkAll = document.getElementById("check-all-periods");
    const periodChecks = document.querySelectorAll(".period-check");
    
    if (!student.restrictions?.periods || student.restrictions.periods.includes("All")) {
        checkAll.checked = true;
        periodChecks.forEach(cb => cb.disabled = true);
    } else {
        checkAll.checked = false;
    }

    checkAll.addEventListener("change", (e) => {
        periodChecks.forEach(cb => {
            cb.disabled = e.target.checked;
            if(e.target.checked) cb.checked = false;
        });
    });

    // 2. Load Rooms text area
    selectedRooms = student.restrictions?.rooms ? [...student.restrictions.rooms] : [];
    updateRoomDisplay();

    // 3. Peers
    selectedPeers = student.restrictions?.noContact ? [...student.restrictions.noContact] : [];
    renderSelectedPeers();

    document.getElementById("restriction-modal").classList.remove("hidden");
}

function loadModalMap() {
    const container = document.getElementById("full-map-container");
    if (!container) return; 
    
    if (!container.querySelector("svg")) {
        container.innerHTML = schoolMapSVG;
        
        const svg = container.querySelector("svg");
        svg.style.width = "100%";
        svg.style.height = "100%";
        
        const mapNodes = svg.querySelectorAll(".map-node"); 
        mapNodes.forEach(node => {
            node.style.cursor = "pointer";
            node.addEventListener("click", () => {
                const roomId = node.getAttribute("data-id");
                if (!roomId) return;
                
                if (selectedRooms.includes(roomId)) {
                    selectedRooms = selectedRooms.filter(r => r !== roomId);
                } else {
                    selectedRooms.push(roomId);
                }
                updateRoomDisplay();
                applyMapHighlights();
            });
        });
    }
    applyMapHighlights();
}

function applyMapHighlights() {
    const svg = document.querySelector("#full-map-container svg");
    if(!svg) return;
    
    const mapNodes = svg.querySelectorAll(".map-node");
    mapNodes.forEach(node => {
        const roomId = node.getAttribute("data-id");
        if(!roomId) return;
        
        const shape = node.querySelector(".zone-box, .corridor-box, path, rect, polygon") || node;
        
        if (selectedRooms.includes(roomId)) {
            shape.style.fill = "#ef1a14"; // Solid Pirate Red
            shape.style.opacity = "0.7";
        } else {
            shape.style.fill = ""; 
            shape.style.opacity = "1";
        }
    });
}

function updateRoomDisplay() {
    document.getElementById("input-restricted-rooms").value = selectedRooms.join(", ");
}

document.getElementById("input-restricted-rooms").addEventListener("input", (e) => {
    const rawText = e.target.value;
    selectedRooms = rawText.split(",").map(s => s.trim()).filter(s => s.length > 0);
    applyMapHighlights();
});

document.getElementById("btn-clear-rooms").addEventListener("click", () => {
    selectedRooms = [];
    updateRoomDisplay();
    applyMapHighlights();
});

// Peer Autocomplete Search Logic
const peerSearchInput = document.getElementById("peer-search-input");
const peerDropdown = document.getElementById("peer-autocomplete-dropdown");

peerSearchInput.addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase().trim();
    if (!term) {
        peerDropdown.classList.add("hidden");
        return;
    }
    
    const matches = allStudentsCache.filter(s => 
        s.id !== currentEditStudentId && 
        !selectedPeers.includes(s.studentId) && 
        (s.fullName?.toLowerCase().includes(term) || s.studentId?.includes(term))
    ).slice(0, 5); 
    
    if (matches.length > 0) {
        peerDropdown.innerHTML = matches.map(m => `
            <div class="peer-option" data-id="${m.studentId}" data-name="${m.fullName}" style="padding: 10px; cursor: pointer; border-bottom: 1px solid #eee;">
                <strong>${m.fullName}</strong> (${m.studentId})
            </div>
        `).join("");
        peerDropdown.classList.remove("hidden");
        
        document.querySelectorAll(".peer-option").forEach(opt => {
            opt.addEventListener("click", () => {
                const id = opt.getAttribute("data-id");
                selectedPeers.push(id); 
                renderSelectedPeers();
                peerSearchInput.value = "";
                peerDropdown.classList.add("hidden");
            });
        });
    } else {
        peerDropdown.innerHTML = `<div style="padding: 10px; color: #999;">No matches found</div>`;
        peerDropdown.classList.remove("hidden");
    }
});

document.addEventListener("click", (e) => {
    if (e.target !== peerSearchInput && !peerDropdown.contains(e.target)) {
        peerDropdown.classList.add("hidden");
    }
});

function renderSelectedPeers() {
    const container = document.getElementById("selected-peers-container");
    container.innerHTML = selectedPeers.map(peerId => {
        const studentObj = allStudentsCache.find(s => s.studentId === peerId);
        const peerName = studentObj ? studentObj.fullName : peerId;
        
        return `
        <div style="background: #ced0d0; padding: 5px 12px; border-radius: 15px; display: flex; align-items: center; gap: 8px; font-size: 0.95rem;">
            ${peerName} (${peerId})
            <span style="cursor: pointer; color: #ef1a14; font-weight: bold;" onclick="removePeer('${peerId}')">✖</span>
        </div>
    `}).join("");
}

window.removePeer = function(id) {
    selectedPeers = selectedPeers.filter(p => p !== id);
    renderSelectedPeers();
}

document.getElementById("btn-save-restrictions").addEventListener("click", async () => {
    const sId = document.getElementById("modal-student-id").value;
    
    let periods = [];
    if (document.getElementById("check-all-periods").checked) {
        periods = ["All"];
    } else {
        document.querySelectorAll(".period-check:checked").forEach(cb => periods.push(cb.value));
    }

    const restrictions = {
        periods: periods,
        rooms: selectedRooms, 
        noContact: selectedPeers 
    };

    // Extract historical states from cache to execute accurate bidirectional differential tracking
    const existingStudentObj = allStudentsCache.find(s => s.studentId === sId);
    const oldPeers = existingStudentObj?.restrictions?.noContact || [];

    const success = await updateStudentRestrictions(sId, restrictions, oldPeers);
    if (success) {
        alert("Restrictions saved successfully across all student accounts!");
        document.getElementById("restriction-modal").classList.add("hidden");
    } else {
        alert("Error saving restrictions.");
    }
});


// ==========================================
// BELL SCHEDULE ENGINE
// ==========================================
const scheduleTbody = document.getElementById("schedule-tbody");
const scheduleSelect = document.getElementById("schedule-type-select");

const scheduleLayouts = {
    "HS - Regular": ["1", "2", "3", "4 (Advisor)", "5", "6A Lunch", "6B Class", "6A Class", "6B Lunch", "7", "8", "9"],
    "HS - Early Out": ["1", "2", "3", "5", "7", "8", "6A Lunch", "6B Class", "6A Class", "6B Lunch", "9"],
    "HS - Late Start": ["1", "2", "3", "6A Lunch", "6B Class", "6A Class", "6B Lunch", "5", "7", "8", "9"],
    "JH - Regular": ["1", "2", "WIN", "3", "4", "5", "Lunch", "6-Advisor", "7", "8", "9"],
    "JH - Early Out": ["1", "2", "3", "4", "7", "5", "Advisor", "Lunch", "8", "9"],
    "JH - Late Start": ["1", "2", "3", "Lunch", "4", "5", "7", "8", "9"]
};

const defaultTimes = {
    "HS - Regular": { "1": { start: "08:10", end: "08:56" }, "2": { start: "09:00", end: "09:46" }, "3": { start: "09:49", end: "10:35" }, "4 (Advisor)": { start: "10:39", end: "10:55" }, "5": { start: "10:59", end: "11:45" }, "6A Lunch": { start: "11:45", end: "12:10" }, "6B Class": { start: "11:49", end: "12:35" }, "6A Class": { start: "12:14", end: "13:00" }, "6B Lunch": { start: "12:35", end: "13:00" }, "7": { start: "13:04", end: "13:50" }, "8": { start: "13:54", end: "14:40" }, "9": { start: "14:44", end: "15:30" } },
    "HS - Early Out": { "1": { start: "08:10", end: "08:44" }, "2": { start: "08:48", end: "09:22" }, "3": { start: "09:26", end: "10:00" }, "5": { start: "10:04", end: "10:38" }, "7": { start: "10:42", end: "11:16" }, "8": { start: "11:20", end: "11:55" }, "6A Lunch": { start: "11:55", end: "12:20" }, "6B Class": { start: "12:00", end: "12:30" }, "6A Class": { start: "12:25", end: "12:55" }, "6B Lunch": { start: "12:30", end: "12:55" }, "9": { start: "13:00", end: "13:30" } },
    "HS - Late Start": { "1": { start: "10:10", end: "10:42" }, "2": { start: "10:46", end: "11:18" }, "3": { start: "11:22", end: "11:58" }, "6A Lunch": { start: "12:00", end: "12:25" }, "6B Class": { start: "12:00", end: "12:30" }, "6A Class": { start: "12:25", end: "12:55" }, "6B Lunch": { start: "12:30", end: "12:55" }, "5": { start: "13:00", end: "13:35" }, "7": { start: "13:39", end: "14:14" }, "8": { start: "14:18", end: "14:52" }, "9": { start: "14:56", end: "15:30" } },
    "JH - Regular": { "1": { start: "08:10", end: "08:56" }, "2": { start: "09:00", end: "09:46" }, "WIN": { start: "09:49", end: "10:08" }, "3": { start: "10:11", end: "10:51" }, "4": { start: "10:54", end: "11:34" }, "5": { start: "11:37", end: "12:17" }, "Lunch": { start: "12:17", end: "12:42" }, "6-Advisor": { start: "12:45", end: "13:01" }, "7": { start: "13:04", end: "13:50" }, "8": { start: "13:54", end: "14:40" }, "9": { start: "14:44", end: "15:25" } },
    "JH - Early Out": { "1": { start: "08:10", end: "08:44" }, "2": { start: "08:48", end: "09:22" }, "3": { start: "09:26", end: "10:00" }, "4": { start: "10:04", end: "10:38" }, "7": { start: "10:42", end: "11:16" }, "5": { start: "11:20", end: "11:55" }, "Advisor": { start: "11:55", end: "12:10" }, "Lunch": { start: "12:10", end: "12:35" }, "8": { start: "12:38", end: "13:02" }, "9": { start: "13:05", end: "13:30" } },
    "JH - Late Start": { "1": { start: "10:10", end: "10:42" }, "2": { start: "10:46", end: "11:18" }, "3": { start: "11:22", end: "11:52" }, "Lunch": { start: "11:52", end: "12:20" }, "4": { start: "12:25", end: "12:57" }, "5": { start: "13:00", end: "13:35" }, "7": { start: "13:39", end: "14:14" }, "8": { start: "14:18", end: "14:52" }, "9": { start: "14:56", end: "15:25" } }
};

scheduleSelect.addEventListener("change", (e) => {
    renderScheduleTable(e.target.value);
});

function renderScheduleTable(scheduleType) {
    scheduleTbody.innerHTML = "";
    const periods = scheduleLayouts[scheduleType] || [];
    const existingData = loadedSchedules[scheduleType] || defaultTimes[scheduleType] || {};

    periods.forEach(period => {
        const rowData = existingData[period] || { start: "", end: "" };
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td style="padding: 10px; border-bottom: 1px solid #ddd; font-weight: bold;">${period}</td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">
                <input type="time" class="time-start" data-period="${period}" value="${rowData.start}" style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; width: 100%;">
            </td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">
                <input type="time" class="time-end" data-period="${period}" value="${rowData.end}" style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; width: 100%;">
            </td>
        `;
        scheduleTbody.appendChild(tr);
    });
}

document.getElementById("btn-save-schedule").addEventListener("click", async () => {
    const scheduleType = scheduleSelect.value;
    const timeData = {};
    const startInputs = document.querySelectorAll(".time-start");
    const endInputs = document.querySelectorAll(".time-end");
    
    startInputs.forEach((input, index) => {
        const period = input.getAttribute("data-period");
        timeData[period] = {
            start: input.value,
            end: endInputs[index].value
        };
    });

    const btn = document.getElementById("btn-save-schedule");
    btn.innerText = "⏳ Saving...";
    const success = await saveBellSchedule(scheduleType, timeData);
    
    if (success) {
        loadedSchedules[scheduleType] = timeData;
        btn.innerText = "✅ Saved Successfully!";
        setTimeout(() => btn.innerText = "💾 Save Times to Database", 2000);
    } else {
        alert("There was an error saving the schedule.");
        btn.innerText = "💾 Save Times to Database";
    }
});

// --- Set Today's Active Schedule ---
document.addEventListener("click", async (e) => {
    if (e.target.id === "btn-set-active-schedule") {
        const scheduleName = document.getElementById("schedule-type-select").value;
        const btn = e.target;
        
        btn.innerText = "⏳ Setting...";
        const success = await setActiveDailySchedule(scheduleName);
        
        if (success) {
            btn.innerText = "✅ Active Today";
            btn.style.backgroundColor = "#1b5e20"; // Darker green on success
            setTimeout(() => {
                btn.innerText = "✅ Make Active Today";
                btn.style.backgroundColor = "#2e7d32";
            }, 2500);
        }
    }
});

// --- NEW: Time Offset Logic ---
listenToTimeOffset((offset) => {
    const input = document.getElementById("input-time-offset");
    if (input) input.value = offset;
});

document.addEventListener("click", async (e) => {
    if (e.target.id === "btn-save-time-offset") {
        const offsetVal = document.getElementById("input-time-offset").value;
        const btn = e.target;
        btn.innerText = "⏳ Saving...";
        
        const success = await saveTimeOffset(offsetVal);
        if (success) {
            btn.innerText = "✅ Saved";
            btn.style.backgroundColor = "#2e7d32";
            setTimeout(() => {
                btn.innerText = "Save Offset";
                btn.style.backgroundColor = "";
            }, 2000);
        }
    }
});

// ==========================================
// EMERGENCY MANAGEMENT ENGINE
// ==========================================
let currentEmergencyState = { globalLockdown: false, lockedAreas: [] };

listenToEmergencyState((state) => {
    currentEmergencyState = state;
    
    const title = document.getElementById("emergency-status-title");
    const msg = document.getElementById("emergency-status-msg");
    const box = document.getElementById("emergency-status-box");
    const btnGlobal = document.getElementById("btn-toggle-global-lockdown");

    if (state.globalLockdown) {
        box.style.background = "#ffebee"; // Light Red
        box.style.borderColor = "var(--pirate-red)";
        title.style.color = "var(--pirate-red)";
        title.innerText = "🚨 SYSTEM IN LOCK DOWN";
        msg.innerText = "All rooms are currently in LOCK DOWN. Press the Remove Lockdown button below.";
        
        btnGlobal.innerText = "🔓 Remove All Room Lockdown";
        btnGlobal.style.backgroundColor = "#2e7d32"; // Green to remove
    } else {
        box.style.background = "#e8f5e9"; // Light Green
        box.style.borderColor = "#4caf50";
        title.style.color = "#2e7d32";
        title.innerText = "✅ No Current System Restrictions";
        msg.innerText = "The building is operating normally.";
        
        btnGlobal.innerText = "🔒 Lock Down All Rooms";
        btnGlobal.style.backgroundColor = "var(--pirate-red)"; 
    }
});

document.getElementById("btn-toggle-global-lockdown").addEventListener("click", async () => {
    const newState = !currentEmergencyState.globalLockdown;
    await setEmergencyState({ globalLockdown: newState });
});

document.getElementById("btn-modify-area-lockdown").addEventListener("click", () => {
    alert("Area Lockdown mapping requires the Time Engine to be completed first. Moving to Time Engine task next!");
});

// Global configuration trackers used to compute current/next class periods
window.globalTimeOffsetSeconds = 0;
window.activeDailyScheduleName = "HS - Regular";
window.globalBellSchedulesCache = {};

// Track system time offset modifications
listenToTimeOffset((offset) => window.globalTimeOffsetSeconds = parseInt(offset) || 0);

// Track active campus schedule variations
listenToDailyConfig((config) => window.activeDailyScheduleName = config?.activeSchedule || "HS - Regular");

// Cache schedule maps on initialization for popup lookups
fetchBellSchedules().then(scheds => window.globalBellSchedulesCache = scheds || {});

window.openSchedulePopup = function(student) {
    const existingModal = document.getElementById("student-schedule-popup-modal");
    if (existingModal) existingModal.remove();

    const modal = document.createElement("div");
    modal.id = "student-schedule-popup-modal";
    modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 9999; font-family: sans-serif;";

    const box = document.createElement("div");
    box.style.cssText = "background: white; padding: 25px; border-radius: 12px; width: 90%; max-width: 420px; box-shadow: 0 4px 15px rgba(0,0,0,0.2); max-height: 80vh; overflow-y: auto;";

    let html = `<h3 style="margin-top: 0; color: var(--pirate-red); border-bottom: 2px solid #eee; padding-bottom: 10px;">📋 Full Schedule: ${student.fullName}</h3>`;
    const sched = student.schedule || {};

    // Safely sort periods numerically (1, 2, 3...)
    const periods = Object.keys(sched).sort((a, b) => {
        const numA = parseInt(a);
        const numB = parseInt(b);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.localeCompare(b);
    });

    if (periods.length === 0) {
        html += `<div style="padding: 10px; color: #777;">No schedule data found for this student.</div>`;
    } else {
        periods.forEach(p => {
            html += `
            <div style="background: #f8f9fa; border-left: 4px solid var(--pirate-silver); padding: 10px; margin-bottom: 8px; border-radius: 4px;">
                <strong style="color: #333;">Period ${p}:</strong> ${sched[p].courseName}<br>
                <div style="font-size: 0.85rem; color: #555; margin-top: 2px;">Room: ${sched[p].room || "N/A"} | Teacher: ${sched[p].teacher || "N/A"}</div>
            </div>`;
        });
    }

    const closeBtn = document.createElement("button");
    closeBtn.innerText = "Close";
    closeBtn.style.cssText = "background: #6c757d; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; float: right; margin-top: 10px; font-weight: bold;";
    closeBtn.onclick = () => modal.remove();

    box.innerHTML = html;
    box.appendChild(closeBtn);
    modal.appendChild(box);
    document.body.appendChild(modal);
}

// ==========================================
// ACADEMIC CALENDAR BUILDER ENGINE (V3 - School Year & Vertical Weekdays)
// ==========================================
let currentAcademicStartYear = calculateCurrentAcademicYear(); // Tracks the start year of the session (e.g., 2025 for '25-26)
let masterCalendarData = {};                                   // Memory cache of database mapping

/**
 * Automatically computes the correct academic start year based on today's date.
 * (e.g., If today is June 2026, it falls under the 2025-26 session, returning 2025)
 */
function calculateCurrentAcademicYear() {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth(); // 0 = January, 7 = August

    // If today is August or later, the session starts this year. Otherwise, it started last year.
    if (currentMonth >= 7) {
        return currentYear;
    } else {
        return currentYear - 1;
    }
}

/**
 * Initializes and opens the calendar modal.
 */
async function openAcademicCalendarModal() {
    masterCalendarData = await fetchAcademicCalendar();
    currentAcademicStartYear = calculateCurrentAcademicYear(); // Snap back to current year when opened
    renderVerticalAcademicCalendar();
    document.getElementById("academic-cal-modal").classList.remove("hidden");
}

/**
 * Builds and injects the 12-month vertical calendar grids (August -> July).
 */
function renderVerticalAcademicCalendar() {
    const endYear = currentAcademicStartYear + 1;

    // Set human-readable multi-year header (e.g., "2025-26")
    const yearDisplay = document.getElementById("cal-year-display");
    if (yearDisplay) yearDisplay.innerText = `${currentAcademicStartYear}-${String(endYear).slice(-2)}`;

    const scrollArea = document.getElementById("academic-cal-scroll-area");
    if (!scrollArea) return;

    // Define the 12-month academic cycle
    const academicMonths = [
        { index: 7, year: currentAcademicStartYear, name: "August" },
        { index: 8, year: currentAcademicStartYear, name: "September" },
        { index: 9, year: currentAcademicStartYear, name: "October" },
        { index: 10, year: currentAcademicStartYear, name: "November" },
        { index: 11, year: currentAcademicStartYear, name: "December" },
        { index: 0, year: endYear, name: "January" },
        { index: 1, year: endYear, name: "February" },
        { index: 2, year: endYear, name: "March" },
        { index: 3, year: endYear, name: "April" },
        { index: 4, year: endYear, name: "May" },
        { index: 5, year: endYear, name: "June" },
        { index: 6, year: endYear, name: "July" }
    ];

    let html = '';

    // Loop through the mapped academic months
    academicMonths.forEach(m => {
        const daysInMonth = new Date(m.year, m.index + 1, 0).getDate();
        const firstDayOfWeek = new Date(m.year, m.index, 1).getDay();
        
        // Calculate empty boxes for the first row of the month (excluding weekends)
        let blanks = 0;
        if (firstDayOfWeek > 0 && firstDayOfWeek < 6) {
            blanks = firstDayOfWeek - 1; 
        }

        let monthGridHTML = `
            <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; flex-grow: 1;">
                <div style="font-size:0.7rem; color:#888; text-align:center; margin-bottom:2px; font-weight:bold;">M</div>
                <div style="font-size:0.7rem; color:#888; text-align:center; margin-bottom:2px; font-weight:bold;">T</div>
                <div style="font-size:0.7rem; color:#888; text-align:center; margin-bottom:2px; font-weight:bold;">W</div>
                <div style="font-size:0.7rem; color:#888; text-align:center; margin-bottom:2px; font-weight:bold;">Th</div>
                <div style="font-size:0.7rem; color:#888; text-align:center; margin-bottom:2px; font-weight:bold;">F</div>
        `;

        // Inject blank alignment spaces
        for (let i = 0; i < blanks; i++) {
            monthGridHTML += `<div></div>`;
        }

        // Loop through every day of the month
        for (let day = 1; day <= daysInMonth; day++) {
            const dow = new Date(m.year, m.index, day).getDay();
            
            // SKIP WEEKENDS (Sunday = 0, Saturday = 6)
            if (dow === 0 || dow === 6) continue;
            
            const dateStr = `${m.year}-${String(m.index + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            // Intelligent Defaults: Weekdays are 'F' (Full schedule)
            let code = masterCalendarData[dateStr] || 'F';

            // Visual Style Matrix
            let bgColor = "#e8f5e9"; let color = "#2e7d32"; // F - Full
            if (code === 'E') { bgColor = "#fff3e0"; color = "#ef6c00"; } // E - Early Out
            if (code === 'L') { bgColor = "#e3f2fd"; color = "#1565c0"; } // L - Late Start
            if (code === 'N') { bgColor = "#ffebee"; color = "#c62828"; } // N - No School

            monthGridHTML += `
                <div class="cal-day-cell" data-date="${dateStr}" data-code="${code}" style="background: ${bgColor}; color: ${color}; border: 1px solid ${color}55; border-radius: 4px; padding: 6px 0; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor: pointer; user-select: none; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                    <div style="font-size:0.65rem; color:#555; line-height: 1;">${day}</div>
                    <div style="font-size: 1.1rem; font-weight:bold; line-height: 1; margin-top:3px;">${code}</div>
                </div>
            `;
        }
        monthGridHTML += `</div>`;

        // Combine side-rotated "MONTH YEAR" title with the grid
        html += `
            <div style="display: flex; gap: 15px; background: white; padding: 10px; border-radius: 8px; border: 1px solid #ddd;">
                <div style="writing-mode: vertical-rl; transform: rotate(180deg); text-align: center; font-weight: 900; font-size: 0.95rem; color: #aaa; display: flex; align-items: center; justify-content: center; min-width: 25px; letter-spacing: 2px; border-right: 1px solid #eee; padding-left: 5px;">
                    ${m.name.toUpperCase()} ${m.year}
                </div>
                ${monthGridHTML}
            </div>
        `;
    });

    scrollArea.innerHTML = html;

    // Attach click triggers to individual weekday boxes to cycle the codes
    document.querySelectorAll(".cal-day-cell").forEach(cell => {
        cell.addEventListener("click", () => {
            const date = cell.getAttribute("data-date");
            let currentCode = cell.getAttribute("data-code");
            
            // Core Cycler Logic: F -> E -> L -> N -> back to F
            const nextCodeMap = { 'F': 'E', 'E': 'L', 'L': 'N', 'N': 'F' };
            masterCalendarData[date] = nextCodeMap[currentCode];
            
            renderVerticalAcademicCalendar(); 
        });
    });
}

// Unified Global Event Routing delegation for Calendar controls
document.addEventListener("click", async (e) => {
    
    // Open / Close Modal
    if (e.target.id === "btn-open-academic-cal-modal") openAcademicCalendarModal();
    if (e.target.id === "close-academic-cal-modal") document.getElementById("academic-cal-modal").classList.add("hidden");

    // Navigate Backward 1 Academic Year
    if (e.target.id === "btn-cal-year-prev") {
        currentAcademicStartYear--;
        renderVerticalAcademicCalendar();
    }
    
    // Navigate Forward 1 Academic Year
    if (e.target.id === "btn-cal-year-next") {
        currentAcademicStartYear++;
        renderVerticalAcademicCalendar();
    }
    
    // Commit current map to system/calendar
    if (e.target.id === "btn-save-academic-cal") {
        const btn = e.target;
        const originalText = btn.innerHTML;
        
        btn.disabled = true;
        btn.innerText = "⏳ Saving Calendar Data...";
        
        const success = await saveAcademicCalendar(masterCalendarData);
        
        btn.disabled = false;
        if (success) {
            btn.innerText = "✅ Saved Successfully!";
            btn.style.backgroundColor = "#2e7d32";
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.style.backgroundColor = "var(--pirate-red)";
            }, 2000);
        } else {
            alert("Error syncing academic calendar to Firestore.");
            btn.innerHTML = originalText;
        }
    }
});