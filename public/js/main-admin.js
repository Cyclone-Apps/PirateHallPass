// js/main-admin.js
import { 
    upsertStudentData, listenToAllStudents, updateStudentRestrictions, 
    saveBellSchedule, fetchBellSchedules, setEmergencyState, 
    listenToEmergencyState, saveTimeOffset, listenToTimeOffset, setActiveDailySchedule 
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
        const rows = schedText.split(/\r?\n/); // Split into individual lines
        
        // Start loop at i = 1 to skip the header row completely
        for (let i = 1; i < rows.length; i++) {
            const rowStr = rows[i].trim();
            if (!rowStr) continue;

            const cols = rowStr.split(","); // Split the line by commas
            
            const sId = cols[0] ? cols[0].trim() : null; // Index 0: StudentID
            if (!sId) continue;

            if (!studentMap[sId]) {
                const lName = cols[1] ? cols[1].trim() : ""; // Index 1: LastName
                const fName = cols[2] ? cols[2].trim() : ""; // Index 2: FirstName
                const combinedName = `${fName} ${lName}`.trim();
                
                studentMap[sId] = {
                    studentId: sId,
                    fullName: combinedName,
                    displayName: combinedName,
                    grade: cols[4] ? cols[4].trim() : "",    // Index 4: Grade
                    schedule: {}
                };
            }
            if (!studentMap[sId].schedule) {
                studentMap[sId].schedule = {};
            }

            const period = cols[7] ? cols[7].trim() : null;  // Index 7: Period
            
            if (period) {
                const courseName = cols[9] ? cols[9].trim() : "";  // Index 9: CourseName
                const daysMet = cols[11] ? cols[11].trim() : "";   // Index 11: DaysMet
                
                // Grab Teacher 1. If Teacher 2 exists (like Mr. Burrow), combine them!
                let teacherName = cols[13] ? cols[13].trim() : ""; // Index 13: Teacher1
                if (cols[14] && cols[14].trim()) {                 // Index 14: Teacher2
                    teacherName += `, ${cols[14].trim()}`;
                }
                
                const realRoom = cols[18] ? cols[18].trim() : "";  // Index 18: Room
                
                const courseWithDays = daysMet && daysMet !== "123456" ? `${courseName} (${daysMet})` : courseName;

                // The clean raw object for the future Rotation Engine
                const rawClassObject = {
                    courseName: courseName,
                    room: realRoom,
                    teacher: teacherName,
                    daysMet: daysMet
                };

                if (studentMap[sId].schedule[period]) {
                    // CONFLICT DETECTED! Combine strings for today's UI
                    studentMap[sId].schedule[period].courseName += ` / ${courseWithDays}`;
                    
                    if (realRoom && !studentMap[sId].schedule[period].room.includes(realRoom)) {
                        studentMap[sId].schedule[period].room += ` / ${realRoom}`;
                    }
                    if (teacherName && !studentMap[sId].schedule[period].teacher.includes(teacherName)) {
                        studentMap[sId].schedule[period].teacher += ` / ${teacherName}`;
                    }
                    
                    // Push the raw class into the array for the future Rotation engine!
                    studentMap[sId].schedule[period].allClasses.push(rawClassObject);
                } else {
                    // First class found for this period
                    studentMap[sId].schedule[period] = {
                        courseName: courseWithDays,
                        room: realRoom,
                        teacher: teacherName,
                        allClasses: [rawClassObject] // Create the array!
                    };
                }
            }
        }
    }
    
    // --- FINAL UPLOAD TO FIREBASE ---
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
// RENDER STUDENT LIST & SEARCH
// ==========================================
let allStudentsCache = [];

listenToAllStudents((students) => {
    allStudentsCache = students;
    renderAdminStudentList(students);
});

function renderAdminStudentList(students) {
    const container = document.getElementById("admin-student-list");
    if (!container) return;
    container.innerHTML = "";
    
    container.style.alignItems = "start";

    students.forEach(student => {
        const card = document.createElement("div");
        card.style.cssText = "background: white; padding: 15px; border-radius: 8px; border: 1px solid #ced4da; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.05); transition: transform 0.1s;";
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
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <strong style="font-size: 1.1rem; color: var(--pirate-red);">${student.fullName || "Unknown"} (${student.studentId})</strong>
            </div>
            <div style="font-size: 0.9rem; color: #555; margin-top: 5px;">Grade: ${student.grade || "N/A"}</div>
            <div style="font-size: 0.9rem; color: #555;">Email: ${student.email || "N/A"}</div>
            ${restrictionsHtml}
        `;

        card.addEventListener("click", () => openRestrictionModal(student));
        container.appendChild(card);
    });
}

document.getElementById("search-student").addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allStudentsCache.filter(s => 
        (s.fullName && s.fullName.toLowerCase().includes(term)) || 
        (s.studentId && s.studentId.includes(term))
    );
    renderAdminStudentList(filtered);
});


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
    if (!container) {
        console.error("🚨 Missing #full-map-container in admin.html! Cannot load the map.");
        return; 
    }
    
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

// Listen for manual typing
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

    const success = await updateStudentRestrictions(sId, restrictions);
    if (success) {
        alert("Restrictions saved successfully!");
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