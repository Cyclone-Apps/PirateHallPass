// =====================================================================
// 🏫 STAFF ROOM ASSIGNMENTS MODULE
// FILE: public/js/features/f-staff-rooms.js
// =====================================================================
import { db } from "../firebase-config.js";
import { collection, doc, getDoc, updateDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { schoolMapSVG } from "../map.js"; 

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
    loadMapRooms();
    if (!user) return;
    
    const userDocRef = doc(db, "users", user.email);
    const userSnap = await getDoc(userDocRef);
    const userData = userSnap.exists() ? userSnap.data() : {};
    
    const existingData = userData.roomAssignments || {};
    let currentLunchTrack = existingData.lunchTrack || "";

    const allStaffSnap = await getDocs(collection(db, "users"));
    const claimedRooms = {}; 
    
    // We now support 1-9 plus WIN
    const allPossiblePeriods = [1, 2, 'WIN', 3, 4, 5, 6, 7, 8, 9];
    allPossiblePeriods.forEach(p => claimedRooms[p] = {});
    
    allStaffSnap.forEach(doc => {
        const staff = doc.data();
        if (staff.email === user.email || !staff.roomAssignments) return; 
        
        allPossiblePeriods.forEach(p => {
            const assignment = staff.roomAssignments[p];
            if (assignment && assignment.room && assignment.room !== "No Room" && !assignment.coTeacher) {
                claimedRooms[p][assignment.room] = staff.title ? `${staff.title} ${staff.lastName}` : staff.lastName;
            }
        });
    });

    const modal = document.createElement("div");
    modal.id = "room-assignments-modal";
    modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 10000; font-family: sans-serif;";

    const box = document.createElement("div");
    box.style.cssText = "background: white; padding: 20px; border-radius: 8px; width: 95%; max-width: 600px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); max-height: 90vh; display: flex; flex-direction: column;";

    box.innerHTML = `
        <h2 style="margin-top: 0; color: #1565c0; border-bottom: 2px solid #eee; padding-bottom: 10px;">🏫 My Room Assignments</h2>
        
        <div style="background: #fff3cd; color: #856404; padding: 10px; border-radius: 4px; border-left: 4px solid #ffeeba; margin-bottom: 15px; font-size: 0.9rem;">
            <strong>Required:</strong> Please select your Lunch Track before assigning rooms.
            <div style="margin-top: 8px; font-weight: bold; display: flex; gap: 15px;">
                <label><input type="radio" name="lunchTrack" value="A" ${currentLunchTrack === "A" ? "checked" : ""}> 6A (HS)</label>
                <label><input type="radio" name="lunchTrack" value="B" ${currentLunchTrack === "B" ? "checked" : ""}> 6B (HS)</label>
                <label><input type="radio" name="lunchTrack" value="JH" ${currentLunchTrack === "JH" ? "checked" : ""}> JH (7th/8th)</label>
            </div>
        </div>

        <div style="overflow-y: auto; flex-grow: 1; padding-right: 10px;" id="room-assignments-list">
            </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 15px; border-top: 2px solid #eee; padding-top: 15px;">
            <button id="btn-cancel-rooms" style="background: #6c757d; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: bold;">Cancel</button>
            <button id="btn-save-rooms" style="background: #2e7d32; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: bold;">💾 Save Assignments</button>
        </div>
    `;

    modal.appendChild(box);
    document.body.appendChild(modal);

    const listContainer = document.getElementById("room-assignments-list");

    // 🚀 DYNAMIC RENDERER: Builds the UI chronologically based on the track selected
    function renderPeriods() {
        const trackSelected = document.querySelector('input[name="lunchTrack"]:checked')?.value || "";
        
        // Default to HS Schedule
        let activePeriods = [1, 2, 3, 4, 5, 6, 7, 8, 9];
        let labels = { 6: "Period 6" };

        // Morph to JH Schedule
        if (trackSelected === "JH") {
            activePeriods = [1, 2, 'WIN', 3, 4, 5, 6, 7, 8, 9];
            labels = { 'WIN': "WIN Time", 6: "Period 6 (Advisor)" };
        }

        let html = "";
        activePeriods.forEach(p => {
            const pdData = existingData[p] || { room: "", available: true, coTeacher: false };
            let roomOptions = "";

            if (!pdData.room || pdData.room === "") {
                roomOptions += `<option value="" disabled selected>⚠️ Needs Selected</option>`;
            }
            
            roomOptions += `<option value="No Room" ${pdData.room === "No Room" ? "selected" : ""}>No Room</option>`;
            
            globalRoomsList.forEach(r => {
                roomOptions += `<option value="${r}" ${pdData.room === r ? "selected" : ""}>${r}</option>`;
            });

            if (pdData.room !== "No Room" && pdData.room !== "" && !globalRoomsList.includes(pdData.room)) {
                 roomOptions += `<option value="${pdData.room}" selected>${pdData.room} (Legacy Room)</option>`;
            }

            const periodLabel = labels[p] || `Period ${p}`;

            html += `
                <div class="period-row" data-period="${p}" style="background: #f8f9fa; padding: 12px; margin-bottom: 10px; border-radius: 6px; border: 1px solid #ddd;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <strong style="font-size: 1.1rem; color: #333;">${periodLabel}</strong>
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
        });

        listContainer.innerHTML = html;

        // Re-bind events to the newly generated rows
        activePeriods.forEach(p => {
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
                const chosenRoom = e.target.value;
                if (chosenRoom !== "No Room" && chosenRoom !== "" && !coTeacherCheck.checked) {
                    const claimant = claimedRooms[p][chosenRoom];
                    if (claimant) {
                        alert(`🛑 Conflict Detected!\n\nThis room has been claimed by ${claimant} for ${labels[p] || 'Period ' + p}.\n\nAsk them to remove it, or if you are co-teaching in their room, please check the "Co-Teacher's Room" box first!`);
                        e.target.value = ""; 
                    }
                }
            });
        });
    }

    // Bind Radio Buttons to dynamically re-render the list
    document.querySelectorAll('input[name="lunchTrack"]').forEach(radio => {
        radio.addEventListener('change', () => renderPeriods());
    });

    // Render initially if they already have a track saved
    if (currentLunchTrack) {
        renderPeriods();
    }

    document.getElementById("btn-save-rooms").addEventListener("click", async () => {
        const trackSelected = document.querySelector('input[name="lunchTrack"]:checked');
        if (!trackSelected) {
            alert("🛑 You must select your Lunch Track (A, B, or JH) at the top!");
            return;
        }

        const newAssignments = { lunchTrack: trackSelected.value };
        const rows = document.querySelectorAll(".period-row");
        
        let hasErrors = false;

        rows.forEach(row => {
            const p = row.getAttribute("data-period");
            const selectedRoom = document.getElementById(`roomSelect_${p}`).value;
            
            if (!selectedRoom || selectedRoom === "") {
                alert(`🛑 Please select a room (or "No Room") for the flagged periods before saving.`);
                hasErrors = true;
                return;
            }
            
            newAssignments[p] = {
                room: selectedRoom,
                available: document.getElementById(`available_${p}`).checked,
                coTeacher: document.getElementById(`coTeacher_${p}`).checked
            };
        });

        if (hasErrors) return;

        try {
            await updateDoc(userDocRef, { roomAssignments: newAssignments });
            alert("✅ Room assignments saved successfully!");
            modal.remove();
            
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
        // Only flag missing data for the periods dictated by their selected track
        let requiredPeriods = [1, 2, 3, 4, 5, 6, 7, 8, 9];
        if (roomAssignments.lunchTrack === "JH") {
            requiredPeriods = [1, 2, 'WIN', 3, 4, 5, 6, 7, 8, 9];
        }

        requiredPeriods.forEach(p => {
            if (!roomAssignments[p] || !roomAssignments[p].room || roomAssignments[p].room === "") {
                hasMissing = true;
            }
        });
    }

    if (isFullyMissing) {
        window.staffRoomWarningText = `<div style="background: #ffebee; color: #c62828; padding: 10px; border-radius: 4px; border-left: 4px solid #c62828; font-weight: bold; text-align: center; margin-bottom: 5px;">🛑 Action Required: You must configure your Room Assignments!</div>`;
    } else if (hasMissing) {
        window.staffRoomWarningText = `<div style="background: #fff3cd; color: #856404; padding: 10px; border-radius: 4px; border-left: 4px solid #ffeeba; text-align: center; margin-bottom: 5px;">⚠️ Reminder: You have unassigned periods. Please update your Room Assignments.</div>`;
    } else {
        window.staffRoomWarningText = ""; 
    }
    
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