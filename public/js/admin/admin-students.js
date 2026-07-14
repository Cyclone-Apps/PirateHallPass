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