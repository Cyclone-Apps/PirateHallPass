// js/admin/admin-students.js

import { 
    upsertStudentData, listenToAllStudents, 
    listenToAllRestrictions, updateStudentRestrictions 
} from "../modules/admin-engine.js";

// ==========================================
// 🧠 STATE MANAGEMENT (Exported for shared use)
// ==========================================
export let rawStudentsCache = [];
export let allRestrictionsCache = {};
export let allStudentsCache = []; // Keeps combined data perfectly available for search and other modules

let selectedRooms = [];
let selectedPeers = [];
let currentEditStudentId = null;

// ==========================================
// 🚀 INITIALIZATION & EVENT BINDING
// ==========================================
export function initStudentManagement() {
    // 1. Data Subscriptions (Starts background listeners)
    listenToAllStudents((students) => {
        rawStudentsCache = students;
        mergeAndRender();
    });

    listenToAllRestrictions((restrictionsMap) => {
        allRestrictionsCache = restrictionsMap;
        mergeAndRender();
    });

    // 2. 🪟 MODAL OPEN/CLOSE LISTENERS (This was missing!)
    document.addEventListener("click", (e) => {
        // Open Student Management Modal
        if (e.target.closest("#btn-open-management")) {
            document.getElementById("management-modal")?.classList.remove("hidden");
        }
        // Close Student Management Modal
        if (e.target.closest("#close-management-modal") || e.target.id === "close-management-modal") {
            document.getElementById("management-modal")?.classList.add("hidden");
        }
        // Close Restriction Modal
        if (e.target.closest("#close-restriction-modal") || e.target.id === "close-restriction-modal") {
            document.getElementById("restriction-modal")?.classList.add("hidden");
        }
    });

    // 3. Bind UI Event Listeners exclusively for the Students Tab
    document.getElementById("btn-sync-students")?.addEventListener("click", handleStudentSync);
    document.getElementById("search-student")?.addEventListener("input", mergeAndRender);
    
    document.getElementById("input-restricted-rooms")?.addEventListener("input", handleRoomInput);
    document.getElementById("btn-clear-rooms")?.addEventListener("click", handleClearRooms);
    document.getElementById("peer-search-input")?.addEventListener("input", handlePeerSearch);
    document.getElementById("btn-save-restrictions")?.addEventListener("click", saveRestrictions);

    // Click-away listener specifically restricted to the peer dropdown
    document.addEventListener("click", (e) => {
        const peerSearchInput = document.getElementById("peer-search-input");
        const peerDropdown = document.getElementById("peer-autocomplete-dropdown");
        if (peerDropdown && peerSearchInput && e.target !== peerSearchInput && !peerDropdown.contains(e.target)) {
            peerDropdown.classList.add("hidden");
        }
    });

    // Bind this to the window object so inline HTML onclick handlers don't break
    window.removePeer = function(id) {
        selectedPeers = selectedPeers.filter(p => p !== id);
        renderSelectedPeers();
    };
}

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

async function handleStudentSync() {
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

    // 1. IMPORT EMAILS
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

    // 2. IMPORT SCHEDULES
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
}

// ==========================================
// RENDER STUDENT LIST & SEARCH 
// ==========================================
function mergeAndRender() {
    allStudentsCache = rawStudentsCache.map(student => {
        return {
            ...student,
            restrictions: allRestrictionsCache[student.studentId] || null
        };
    });

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
            if(window.openSchedulePopup) window.openSchedulePopup(student); 
        });

        container.appendChild(card);
    });
}

// ==========================================
// ADVANCED WIZARD: RESTRICTIONS
// ==========================================
async function openRestrictionModal(student) {
    currentEditStudentId = student.id;
    document.getElementById("modal-student-name").innerText = `Edit: ${student.fullName}`;
    document.getElementById("modal-student-id").value = student.id; 
    
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

    selectedRooms = student.restrictions?.rooms ? [...student.restrictions.rooms] : [];
    updateRoomDisplay();

    selectedPeers = student.restrictions?.noContact ? [...student.restrictions.noContact] : [];
    renderSelectedPeers();

    document.getElementById("restriction-modal").classList.remove("hidden");
}

function updateRoomDisplay() {
    document.getElementById("input-restricted-rooms").value = selectedRooms.join(", ");
}

function handleRoomInput(e) {
    const rawText = e.target.value;
    selectedRooms = rawText.split(",").map(s => s.trim()).filter(s => s.length > 0);
    if(typeof applyMapHighlights === "function") applyMapHighlights();
}

function handleClearRooms() {
    selectedRooms = [];
    updateRoomDisplay();
    if(typeof applyMapHighlights === "function") applyMapHighlights();
}

function handlePeerSearch(e) {
    const peerDropdown = document.getElementById("peer-autocomplete-dropdown");
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
                e.target.value = "";
                peerDropdown.classList.add("hidden");
            });
        });
    } else {
        peerDropdown.innerHTML = `<div style="padding: 10px; color: #999;">No matches found</div>`;
        peerDropdown.classList.remove("hidden");
    }
}

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

async function saveRestrictions() {
    const sId = document.getElementById("modal-student-id").value;
    let periods = [];
    
    if (document.getElementById("check-all-periods").checked) {
        periods = ["All"];
    } else {
        document.querySelectorAll(".period-check:checked").forEach(cb => periods.push(cb.value));
    }
    
    const restrictions = { periods: periods, rooms: selectedRooms, noContact: selectedPeers };
    const existingStudentObj = allStudentsCache.find(s => s.studentId === sId);
    const oldPeers = existingStudentObj?.restrictions?.noContact || [];
    
    const success = await updateStudentRestrictions(sId, restrictions, oldPeers);
    if (success) {
        alert("Restrictions saved successfully across all student accounts!");
        document.getElementById("restriction-modal").classList.add("hidden");
    } else {
        alert("Error saving restrictions.");
    }
}