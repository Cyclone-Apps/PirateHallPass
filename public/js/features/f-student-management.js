// public/js/features/f-student-management.js
import { db } from "../firebase-config.js";
import { collection, query, where, onSnapshot, doc, getDoc, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// 🧠 STATE MANAGEMENT
// ==========================================
export let allStudentsCache = []; // Keeps data available for search and other modules

let selectedRooms = [];
let selectedPeers = [];
let currentEditStudentId = null;

// ==========================================
// 🚀 INITIALIZATION & EVENT BINDING
// ==========================================
export function initStudentManagement() {
    listenToStudentData();
    bindEvents();
}

function bindEvents() {
    // Modal Open/Close Listeners
    document.addEventListener("click", (e) => {
        // Open Student Management Modal
        if (e.target.closest("#btn-open-student-management")) {
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

    // Dashboard UI Listeners
    document.getElementById("search-student")?.addEventListener("input", renderAdminStudentList);
    
    // Restriction UI Listeners
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
// 📥 FIREBASE DATA SYNC
// ==========================================
function listenToStudentData() {
    // Querying unified 'users' collection where role is 'student'
    const q = query(collection(db, "users"), where("role", "==", "student"));

    onSnapshot(q, (snapshot) => {
        allStudentsCache = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            data.id = docSnap.id; // Usually the email
            allStudentsCache.push(data);
        });

        // Sort alphabetically by displayName
        allStudentsCache.sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
        
        renderAdminStudentList();
    });
}

// ==========================================
// 🎨 RENDER STUDENT LIST & SEARCH 
// ==========================================
function renderAdminStudentList() {
    const container = document.getElementById("admin-student-list");
    if (!container) return;

    const searchInput = document.getElementById("search-student");
    const term = searchInput ? searchInput.value.toLowerCase().trim() : "";
    
    let studentsToRender = allStudentsCache;
    
    if (term) {
        studentsToRender = allStudentsCache.filter(s => 
            (s.displayName && s.displayName.toLowerCase().includes(term)) || 
            (s.email && s.email.toLowerCase().includes(term))
        );
    }

    container.innerHTML = "";
    container.style.alignItems = "start";

    if (studentsToRender.length === 0) {
        container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 30px; color: #666;">No students found.</div>`;
        return;
    }

    studentsToRender.forEach(student => {
        const card = document.createElement("div");
        card.style.cssText = "position: relative; background: white; padding: 15px; border-radius: 8px; border: 1px solid #ced4da; box-shadow: 0 2px 4px rgba(0,0,0,0.05); transition: transform 0.1s;";
        card.onmouseover = () => card.style.transform = "scale(1.02)";
        card.onmouseout = () => card.style.transform = "scale(1)";
        
        let restrictionsHtml = "";
        const res = student.restrictions;
        
        if (res && (res.rooms?.length > 0 || res.noContactPeers?.length > 0 || (res.periods?.length > 0 && !res.periods.includes("All")))) {
            let details = [];
            
            if (res.periods && res.periods.length > 0 && !res.periods.includes("All")) {
                details.push(`<strong>Periods:</strong> ${res.periods.join(", ")}`);
            }
            if (res.rooms && res.rooms.length > 0) {
                details.push(`<strong>Rooms:</strong> ${res.rooms.join(", ")}`);
            }
            if (res.noContactPeers && res.noContactPeers.length > 0) {
                const peerNames = res.noContactPeers.map(id => {
                    const peer = allStudentsCache.find(s => s.id === id);
                    return peer ? peer.displayName : id;
                });
                details.push(`<strong>Peers:</strong> ${peerNames.join(", ")}`);
            }

            if (details.length > 0) {
                restrictionsHtml = `
                    <div style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed #ccc;">
                        <span style="background: var(--pirate-red, #c62828); color: white; padding: 3px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: bold; display: inline-block; margin-bottom: 8px;">Restricted</span>
                        <div style="font-size: 0.85rem; color: #444; line-height: 1.5;">
                            ${details.map(d => `<div>${d}</div>`).join("")}
                        </div>
                    </div>
                `;
            }
        }

        card.innerHTML = `
            <div style="padding-right: 65px;"> 
                <strong style="font-size: 1.1rem; color: var(--pirate-red, #c62828);">${student.displayName || "Unknown"}</strong>
                <div style="font-size: 0.9rem; color: #555; margin-top: 5px;">Clever ID: ${student.cleverId || "N/A"}</div>
                <div style="font-size: 0.9rem; color: #555; overflow: hidden; text-overflow: ellipsis;">${student.email || "N/A"}</div>
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
// 🛑 ADVANCED WIZARD: RESTRICTIONS
// ==========================================
async function openRestrictionModal(student) {
    currentEditStudentId = student.id;
    document.getElementById("modal-student-name").innerText = `Edit: ${student.displayName}`;
    document.getElementById("modal-student-id").value = student.id; 
    
    // Exactly as you defined them in your old code!
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

    selectedPeers = student.restrictions?.noContactPeers ? [...student.restrictions.noContactPeers] : [];
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
        !selectedPeers.includes(s.id) && 
        (s.displayName?.toLowerCase().includes(term) || s.email?.toLowerCase().includes(term))
    ).slice(0, 5);

    if (matches.length > 0) {
        peerDropdown.innerHTML = matches.map(m => `
            <div class="peer-option" data-id="${m.id}" data-name="${m.displayName}" style="padding: 10px; cursor: pointer; border-bottom: 1px solid #eee;">
                <strong>${m.displayName}</strong> <span style="font-size: 0.8rem; color: #888;">(${m.email})</span>
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
        const studentObj = allStudentsCache.find(s => s.id === peerId);
        const peerName = studentObj ? studentObj.displayName : peerId;
        return `
            <div style="background: #ced0d0; padding: 5px 12px; border-radius: 15px; display: flex; align-items: center; gap: 8px; font-size: 0.95rem;">
                ${peerName}
                <span style="cursor: pointer; color: #ef1a14; font-weight: bold;" onclick="removePeer('${peerId}')">✖</span>
            </div>
        `}).join("");
}

async function saveRestrictions() {
    const sId = document.getElementById("modal-student-id").value;
    const btn = document.getElementById("btn-save-restrictions");
    
    btn.innerText = "💾 Saving...";
    btn.disabled = true;

    let periods = [];
    if (document.getElementById("check-all-periods").checked) {
        periods = ["All"];
    } else {
        document.querySelectorAll(".period-check:checked").forEach(cb => periods.push(cb.value));
    }
    
    try {
        const batch = writeBatch(db);
        
        // 1. Update the student being edited
        const mainStudentRef = doc(db, "users", sId);
        batch.set(mainStudentRef, {
            restrictions: {
                periods: periods,
                rooms: selectedRooms,
                noContactPeers: selectedPeers
            }
        }, { merge: true });

        // 2. Bidirectional Peer Blocking (If I block B, B blocks me automatically)
        for (const peerId of selectedPeers) {
            const peerRef = doc(db, "users", peerId);
            const peerData = allStudentsCache.find(s => s.id === peerId);
            
            let peerNoContactList = peerData?.restrictions?.noContactPeers || [];
            if (!peerNoContactList.includes(sId)) {
                peerNoContactList.push(sId);
                batch.set(peerRef, {
                    restrictions: { noContactPeers: peerNoContactList }
                }, { merge: true });
            }
        }

        await batch.commit();
        
        alert("Restrictions saved successfully!");
        document.getElementById("restriction-modal").classList.add("hidden");

    } catch (error) {
        console.error("Error saving restrictions:", error);
        alert("Error saving restrictions.");
    } finally {
        btn.innerText = "💾 Save All Restrictions";
        btn.disabled = false;
    }
}

// ==========================================
// 📅 STUDENT SCHEDULE POP-UP
// ==========================================
window.openSchedulePopup = async function(student) {
    const existingModal = document.getElementById("student-schedule-popup-modal");
    if (existingModal) existingModal.remove();

    const modal = document.createElement("div");
    modal.id = "student-schedule-popup-modal";
    modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 9999; font-family: sans-serif;";

    const box = document.createElement("div");
    box.style.cssText = "background: white; padding: 25px; border-radius: 12px; width: 90%; max-width: 420px; box-shadow: 0 4px 15px rgba(0,0,0,0.2); max-height: 80vh; overflow-y: auto;";

    let html = `<h3 style="margin-top: 0; color: var(--pirate-red, #c62828); border-bottom: 2px solid #eee; padding-bottom: 10px;">📋 Full Schedule: ${student.displayName || "Unknown"}</h3>`;
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
        // Show a loading indicator because we are going to fetch teacher details live!
        html += `<div id="schedule-loading-indicator" style="padding: 10px; color: #0277bd; font-weight: bold;">Loading teachers & rooms... ⏳</div>`;
        html += `<div id="schedule-content-area" style="display: none;"></div>`;
    }

    const closeBtn = document.createElement("button");
    closeBtn.innerText = "Close";
    closeBtn.style.cssText = "background: #6c757d; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; float: right; margin-top: 10px; font-weight: bold;";
    closeBtn.onclick = () => modal.remove();

    box.innerHTML = html;
    box.appendChild(closeBtn);
    modal.appendChild(box);
    document.body.appendChild(modal);

    // If there are periods, go fetch the teacher names and rooms!
    if (periods.length > 0) {
        let schedHtml = "";
        
        for (const p of periods) {
            const classData = sched[p];
            let teacherName = "Unknown Teacher";
            let roomName = "Unknown Room";

            // Cross-reference the teacherCleverId with our unified 'users' collection
            if (classData.teacherCleverId) {
                const q = query(collection(db, "users"), where("cleverId", "==", classData.teacherCleverId));
                const snap = await getDocs(q);
                
                if (!snap.empty) {
                    const teacherData = snap.docs[0].data();
                    teacherName = teacherData.displayName || "Unknown";
                    roomName = teacherData.mapName || "N/A"; 
                }
            }

            schedHtml += `
            <div style="background: #f8f9fa; border-left: 4px solid #ced4da; padding: 10px; margin-bottom: 8px; border-radius: 4px;">
                <strong style="color: #333;">Period ${p}:</strong> ${classData.className}<br>
                <div style="font-size: 0.85rem; color: #555; margin-top: 2px;">Room: <strong>${roomName}</strong> | Teacher: ${teacherName}</div>
            </div>`;
        }
        
        document.getElementById("schedule-loading-indicator").style.display = "none";
        const contentArea = document.getElementById("schedule-content-area");
        contentArea.innerHTML = schedHtml;
        contentArea.style.display = "block";
    }
}