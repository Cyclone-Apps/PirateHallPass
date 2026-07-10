// js/admin/admin-students.js
import { db } from "../firebase-config.js";
import { collection, query, where, onSnapshot, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { bindRestrictionEvents, openRestrictionModal } from "./admin-restrictions.js";

// ==========================================
// 🧠 STATE MANAGEMENT
// ==========================================
export let allStudentsCache = []; 

// ==========================================
// 🚀 INITIALIZATION & EVENT BINDING
// ==========================================
export function initStudentManagement() {
    listenToStudentData();
    bindEvents();
    bindRestrictionEvents(); 
}

function bindEvents() {
    document.addEventListener("click", (e) => {
        if (e.target.closest("#btn-open-management") || e.target.closest("#btn-open-student-management")) {
            document.getElementById("management-modal")?.classList.remove("hidden");
        }
        if (e.target.closest("#close-management-modal") || e.target.id === "close-management-modal") {
            document.getElementById("management-modal")?.classList.add("hidden");
        }
    });

    document.getElementById("search-student")?.addEventListener("input", renderAdminStudentList);
}

// ==========================================
// 📥 FIREBASE DATA SYNC
// ==========================================
function listenToStudentData() {
    const q = query(collection(db, "users"), where("role", "==", "student"));

    onSnapshot(q, (snapshot) => {
        allStudentsCache = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            data.id = docSnap.id; 
            allStudentsCache.push(data);
        });

        allStudentsCache.sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
        renderAdminStudentList();
    });
}

// ==========================================
// 🎨 RENDER STUDENT LIST
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
        container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 30px; color: #666;">No students found in the unified database.</div>`;
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
                <span style="background: #e9ecef; color: #495057; font-size: 0.75rem; font-weight: bold; padding: 2px 6px; border-radius: 4px; margin-left: 8px; vertical-align: middle;">
                    Grade: ${student.grade || "N/A"}
                </span>
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
            openSchedulePopup(student); 
        });

        container.appendChild(card);
    });
}

// ==========================================
// 📅 STUDENT SCHEDULE POP-UP
// ==========================================
async function openSchedulePopup(student) {
    const existingModal = document.getElementById("student-schedule-popup-modal");
    if (existingModal) existingModal.remove();

    const modal = document.createElement("div");
    modal.id = "student-schedule-popup-modal";
    modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 9999; font-family: sans-serif;";

    const box = document.createElement("div");
    box.style.cssText = "background: white; padding: 25px; border-radius: 12px; width: 90%; max-width: 420px; box-shadow: 0 4px 15px rgba(0,0,0,0.2); max-height: 80vh; overflow-y: auto;";

    let html = `<h3 style="margin-top: 0; color: var(--pirate-red, #c62828); border-bottom: 2px solid #eee; padding-bottom: 10px;">📋 Full Schedule: ${student.displayName || "Unknown"}</h3>`;
    const sched = student.schedule || {};

    const periods = Object.keys(sched).sort((a, b) => {
        const numA = parseInt(a);
        const numB = parseInt(b);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.localeCompare(b);
    });

    if (periods.length === 0) {
        html += `<div style="padding: 10px; color: #777;">No schedule data found for this student.</div>`;
    } else {
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

    if (periods.length > 0) {
        let schedHtml = "";
        
        // Fetch the Master Schedule once to use for all periods
        let masterSchedule = null;
        try {
            const msSnap = await getDoc(doc(db, "settings", "master_schedule"));
            if (msSnap.exists()) masterSchedule = msSnap.data();
        } catch(e) {
            console.error("Could not fetch master schedule for room lookups.");
        }
        
        for (const p of periods) {
            const classData = sched[p];
            let teacherName = "Unknown Teacher";
            let roomName = "N/A";

            if (classData.teacherCleverId) {
                const q = query(collection(db, "users"), where("cleverId", "==", classData.teacherCleverId));
                const snap = await getDocs(q);
                
                if (!snap.empty) {
                    const teacherData = snap.docs[0].data();
                    
                    // 🎓 NEW LOGIC: Prioritize the Title field, fallback to Alias, then default to Display Name
                    if (teacherData.title) {
                        teacherName = `${teacherData.title} ${teacherData.lastName}`;
                    } else if (teacherData.scheduleAlias) {
                        teacherName = teacherData.scheduleAlias; 
                    } else if (teacherData.manualNameOverride) {
                        teacherName = teacherData.displayName;
                    } else {
                        teacherName = teacherData.lastName; // Absolute fallback
                    }
                    
                    const alias = teacherData.scheduleAlias || teacherName;
                    
                    // 🔍 Dynamic Room Lookup Engine
                    let foundRoom = null;
                    if (masterSchedule && masterSchedule[p]) {
                        for (const [rNum, tArray] of Object.entries(masterSchedule[p])) {
                            if (tArray.find(t => t.teacher === alias)) {
                                foundRoom = rNum.toUpperCase();
                                break;
                            }
                        }
                    }
                    
                    // Fallback to static Map Name if dynamic lookup fails
                    roomName = foundRoom || teacherData.mapName || "N/A";
                }
            }

            schedHtml += `
            <div style="background: #f8f9fa; border-left: 4px solid #ced4da; padding: 10px; margin-bottom: 8px; border-radius: 4px;">
                <strong style="color: #333;">Period ${p}:</strong> ${classData.className}<br>
                <div style="font-size: 0.85rem; color: #555; margin-top: 2px;">Room: <strong style="color: #0277bd;">${roomName}</strong> | Teacher: ${teacherName}</div>
            </div>`;
        }
        
        document.getElementById("schedule-loading-indicator").style.display = "none";
        const contentArea = document.getElementById("schedule-content-area");
        contentArea.innerHTML = schedHtml;
        contentArea.style.display = "block";
    }
}