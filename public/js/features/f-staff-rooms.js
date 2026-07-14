// =====================================================================
// 🏫 STAFF ROOM ASSIGNMENTS MODULE
// FILE: public/js/features/f-staff-rooms.js
// =====================================================================
import { db } from "../firebase-config.js";
import { collection, doc, getDoc, updateDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { schoolMapSVG } from "../map.js"; 

// Ensure you import schoolMapSVG here if it is not a global window variable!
// import { schoolMapSVG } from "../your-svg-file.js"; 

let globalRoomsList = []; 

// ==========================================
// 🚀 DYNAMIC MAP FETCH
// ==========================================
export function loadMapRooms() {
    try {
        if (!schoolMapSVG) {
            console.error("⚠️ schoolMapSVG is missing.");
            return;
        }

        const allRooms = new Set();
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = schoolMapSVG;
        
        tempDiv.querySelectorAll(".map-node").forEach(node => {
            let roomId = node.getAttribute("data-id");
            if (roomId && !roomId.toLowerCase().includes("hallway") && !roomId.toLowerCase().includes("corridor") && !roomId.toLowerCase().includes("block")) {
                allRooms.add(roomId.toLowerCase().replace(/^room\s+/i, '').trim());
            }
        });

        globalRoomsList = Array.from(allRooms).sort();
    } catch (err) {
        console.error("⚠️ Failed to parse rooms from map SVG.", err);
    }
}

// ==========================================
// 🏫 MAIN MODAL BUILDER
// ==========================================
window.openRoomAssignmentsModal = async function(user) {
    // 1. Guarantee the map is parsed right before we build the dropdowns!
    loadMapRooms();

    if (!user) return;
    
    const userDocRef = doc(db, "users", user.email);
    const userSnap = await getDoc(userDocRef);
    const userData = userSnap.exists() ? userSnap.data() : {};
    
    const existingData = userData.roomAssignments || {};
    const lunchTrack = existingData.lunchTrack || "";

    const allStaffSnap = await getDocs(collection(db, "users"));
    const claimedRooms = {}; 
    
    for (let i = 1; i <= 9; i++) claimedRooms[i] = {};
    
    allStaffSnap.forEach(doc => {
        const staff = doc.data();
        if (staff.email === user.email || !staff.roomAssignments) return; 
        
        for (let i = 1; i <= 9; i++) {
            const assignment = staff.roomAssignments[i];
            if (assignment && assignment.room && assignment.room !== "No Room" && !assignment.coTeacher) {
                claimedRooms[i][assignment.room] = staff.title ? `${staff.title} ${staff.lastName}` : staff.lastName;
            }
        }
    });

    const modal = document.createElement("div");
    modal.id = "room-assignments-modal";
    modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 10000; font-family: sans-serif;";

    const box = document.createElement("div");
    box.style.cssText = "background: white; padding: 20px; border-radius: 8px; width: 95%; max-width: 600px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); max-height: 90vh; display: flex; flex-direction: column;";

    let html = `
        <h2 style="margin-top: 0; color: #1565c0; border-bottom: 2px solid #eee; padding-bottom: 10px;">🏫 My Room Assignments</h2>
        
        <div style="background: #fff3cd; color: #856404; padding: 10px; border-radius: 4px; border-left: 4px solid #ffeeba; margin-bottom: 15px; font-size: 0.9rem;">
            <strong>Required:</strong> Please select your 6th Period Lunch Track (A or B) before assigning rooms.
            <div style="margin-top: 8px; font-weight: bold;">
                Lunch Track: 
                <label><input type="radio" name="lunchTrack" value="A" ${lunchTrack === "A" ? "checked" : ""}> 6A</label> &nbsp;&nbsp;
                <label><input type="radio" name="lunchTrack" value="B" ${lunchTrack === "B" ? "checked" : ""}> 6B</label>
            </div>
        </div>

        <div style="overflow-y: auto; flex-grow: 1; padding-right: 10px;" id="room-assignments-list">
    `;

    // Build the dropdowns
    for (let p = 1; p <= 9; p++) {
        const pdData = existingData[p] || { room: "", available: true, coTeacher: false };
        
        let roomOptions = "";

        // 🎯 If the room is completely missing from the DB, force this placeholder!
        if (!pdData.room || pdData.room === "") {
            roomOptions += `<option value="" disabled selected>⚠️ Needs Selected</option>`;
        }
        
        roomOptions += `<option value="No Room" ${pdData.room === "No Room" ? "selected" : ""}>No Room</option>`;
        
        // Add the dynamically fetched rooms
        globalRoomsList.forEach(r => {
            roomOptions += `<option value="${r}" ${pdData.room === r ? "selected" : ""}>${r}</option>`;
        });

        // Fallback: Preserve legacy rooms that might have been removed from the map
        if (pdData.room !== "No Room" && pdData.room !== "" && !globalRoomsList.includes(pdData.room)) {
             roomOptions += `<option value="${pdData.room}" selected>${pdData.room} (Legacy Room)</option>`;
        }

        html += `
            <div style="background: #f8f9fa; padding: 12px; margin-bottom: 10px; border-radius: 6px; border: 1px solid #ddd;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <strong style="font-size: 1.1rem; color: #333;">Period ${p}</strong>
                    <label style="font-size: 0.85rem; color: #555;">
                        <input type="checkbox" id="coTeacher_${p}" ${pdData.coTeacher ? "checked" : ""}> Co-Teacher's Room
                    </label>
                </div>
                <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                    <select id="roomSelect_${p}" data-period="${p}" style="padding: 6px; border-radius: 4px; border: 1px solid #ccc; flex-grow: 1;">
                        ${roomOptions}
                    </select>
                    <label style="font-size: 0.9rem; font-weight: bold; color: ${pdData.available ? '#2e7d32' : '#c62828'}; cursor: pointer;">
                        <input type="checkbox" id="available_${p}" ${pdData.available ? "checked" : ""}> 
                        <span id="availLabel_${p}">${pdData.available ? "✅ Available (Accepts Passes)" : "❌ Unavailable (Do Not Disturb)"}</span>
                    </label>
                </div>
            </div>
        `;
    }

    html += `</div>
        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 15px; border-top: 2px solid #eee; padding-top: 15px;">
            <button id="btn-cancel-rooms" style="background: #6c757d; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: bold;">Cancel</button>
            <button id="btn-save-rooms" style="background: #2e7d32; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: bold;">💾 Save Assignments</button>
        </div>
    `;

    box.innerHTML = html;
    modal.appendChild(box);
    document.body.appendChild(modal);

    // Event Bindings inside the modal
    for (let p = 1; p <= 9; p++) {
        const select = document.getElementById(`roomSelect_${p}`);
        const coTeacherCheck = document.getElementById(`coTeacher_${p}`);
        const availCheck = document.getElementById(`available_${p}`);
        const availLabel = document.getElementById(`availLabel_${p}`);

        availCheck.addEventListener("change", (e) => {
            if (e.target.checked) {
                availLabel.innerHTML = "✅ Available (Accepts Passes)";
                availLabel.style.color = "#2e7d32";
            } else {
                availLabel.innerHTML = "❌ Unavailable (Do Not Disturb)";
                availLabel.style.color = "#c62828";
            }
        });

        select.addEventListener("change", (e) => {
            const trackSelected = document.querySelector('input[name="lunchTrack"]:checked');
            if (!trackSelected) {
                alert("🛑 You must select your Lunch Track (6A or 6B) at the top before selecting rooms!");
                e.target.value = ""; // Reset to blank
                return;
            }

            const chosenRoom = e.target.value;
            if (chosenRoom !== "No Room" && chosenRoom !== "" && !coTeacherCheck.checked) {
                const claimant = claimedRooms[p][chosenRoom];
                if (claimant) {
                    alert(`🛑 Conflict Detected!\n\nThis room has been claimed by ${claimant} for Period ${p}.\n\nAsk them to remove it, or if you are co-teaching in their room, please check the "Co-Teacher's Room" box first!`);
                    e.target.value = ""; // Reset to blank
                }
            }
        });
    }

    document.getElementById("btn-save-rooms").addEventListener("click", async () => {
        const trackSelected = document.querySelector('input[name="lunchTrack"]:checked');
        if (!trackSelected) {
            alert("🛑 You must select your Lunch Track (6A or 6B) at the top!");
            return;
        }

        const newAssignments = { lunchTrack: trackSelected.value };
        for (let p = 1; p <= 9; p++) {
            const selectedRoom = document.getElementById(`roomSelect_${p}`).value;
            // Prevent saving if they still have the blank warning selected
            if (!selectedRoom || selectedRoom === "") {
                alert(`🛑 Please select a room (or "No Room") for Period ${p} before saving.`);
                return;
            }
            
            newAssignments[p] = {
                room: selectedRoom,
                available: document.getElementById(`available_${p}`).checked,
                coTeacher: document.getElementById(`coTeacher_${p}`).checked
            };
        }

        try {
            await updateDoc(userDocRef, { roomAssignments: newAssignments });
            alert("✅ Room assignments saved successfully!");
            modal.remove();
            
            // Update global user object and re-run warning check
            window.currentUser.roomAssignments = newAssignments;
            checkMissingRoomsWarning(newAssignments);
            
        } catch (err) {
            console.error("Error saving rooms:", err);
            alert("❌ Failed to save. Ensure you are logged in.");
        }
    });

    document.getElementById("btn-cancel-rooms").addEventListener("click", () => modal.remove());
};

// ==========================================
// ⚠️ MISSING ROOM WARNING SYSTEM
// ==========================================
export function checkMissingRoomsWarning(roomAssignments) {
    let hasMissing = false;
    let isFullyMissing = (!roomAssignments || !roomAssignments.lunchTrack);

    if (!isFullyMissing) {
        for (let p = 1; p <= 9; p++) {
            // Flag if undefined, blank, or still set to the "Needs Selected" empty string
            if (!roomAssignments[p] || !roomAssignments[p].room || roomAssignments[p].room === "") {
                hasMissing = true;
            }
        }
    }

    if (isFullyMissing) {
        window.staffRoomWarningText = `<div style="background: #ffebee; color: #c62828; padding: 10px; border-radius: 4px; border-left: 4px solid #c62828; font-weight: bold; text-align: center; margin-bottom: 5px;">🛑 Action Required: You must configure your Room Assignments!</div>`;
    } else if (hasMissing) {
        window.staffRoomWarningText = `<div style="background: #fff3cd; color: #856404; padding: 10px; border-radius: 4px; border-left: 4px solid #ffeeba; text-align: center; margin-bottom: 5px;">⚠️ Reminder: You have unassigned periods. Please update your Room Assignments.</div>`;
    } else {
        window.staffRoomWarningText = ""; // Clear it if they are perfect!
    }
    
    // Call the unified renderer from main-teacher.js
    if (typeof window.renderTeacherMessageCenter === "function") {
        window.renderTeacherMessageCenter();
    }
}

// ==========================================
// 🚀 EVENT BINDING
// ==========================================
document.addEventListener("click", (e) => {
    if (e.target.id === "btn-open-room-assignments") {
        if (window.currentUser) {
            window.openRoomAssignmentsModal(window.currentUser);
        } else {
            console.error("⚠️ Cannot open Room Assignments: No logged in user found!");
        }
    }
});