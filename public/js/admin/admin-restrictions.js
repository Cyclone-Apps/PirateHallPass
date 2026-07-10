// js/admin/admin-restrictions.js
import { db } from "../firebase-config.js";
import { doc, writeBatch } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { allStudentsCache } from "./admin-students.js"; // 👈 Pulling live data from File 1!

// ==========================================
// 🧠 STATE MANAGEMENT
// ==========================================
let selectedRooms = [];
let selectedPeers = [];
let currentEditStudentId = null;

// ==========================================
// 🚀 EVENT BINDING
// ==========================================
export function bindRestrictionEvents() {
    // Close Modal
    document.addEventListener("click", (e) => {
        if (e.target.closest("#close-restriction-modal") || e.target.id === "close-restriction-modal") {
            document.getElementById("restriction-modal")?.classList.add("hidden");
        }
    });

    document.getElementById("input-restricted-rooms")?.addEventListener("input", handleRoomInput);
    document.getElementById("btn-clear-rooms")?.addEventListener("click", handleClearRooms);
    document.getElementById("peer-search-input")?.addEventListener("input", handlePeerSearch);
    document.getElementById("btn-save-restrictions")?.addEventListener("click", saveRestrictions);

    // Peer Dropdown Click-Away
    document.addEventListener("click", (e) => {
        const peerSearchInput = document.getElementById("peer-search-input");
        const peerDropdown = document.getElementById("peer-autocomplete-dropdown");
        if (peerDropdown && peerSearchInput && e.target !== peerSearchInput && !peerDropdown.contains(e.target)) {
            peerDropdown.classList.add("hidden");
        }
    });

    // Make removePeer globally accessible for the inline onclick handler
    window.removePeer = function(id) {
        selectedPeers = selectedPeers.filter(p => p !== id);
        renderSelectedPeers();
    };
}

// ==========================================
// 🛑 OPEN WIZARD
// ==========================================
export async function openRestrictionModal(student) {
    currentEditStudentId = student.id;
    document.getElementById("modal-student-name").innerText = `Edit: ${student.displayName}`;
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

    selectedPeers = student.restrictions?.noContactPeers ? [...student.restrictions.noContactPeers] : [];
    renderSelectedPeers();

    document.getElementById("restriction-modal").classList.remove("hidden");
}

// ==========================================
// 🗺️ ROOMS & PEERS LOGIC
// ==========================================
function updateRoomDisplay() {
    document.getElementById("input-restricted-rooms").value = selectedRooms.join(", ");
}

function handleRoomInput(e) {
    const rawText = e.target.value;
    selectedRooms = rawText.split(",").map(s => s.trim()).filter(s => s.length > 0);
}

function handleClearRooms() {
    selectedRooms = [];
    updateRoomDisplay();
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

// ==========================================
// 💾 SAVE TO FIREBASE
// ==========================================
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
        
        const mainStudentRef = doc(db, "users", sId);
        batch.set(mainStudentRef, {
            restrictions: {
                periods: periods,
                rooms: selectedRooms,
                noContactPeers: selectedPeers
            }
        }, { merge: true });

        // Auto-Block: If A blocks B, B blocks A
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