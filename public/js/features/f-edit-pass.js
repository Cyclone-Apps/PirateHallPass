import { renderPassList } from '../modules/ui-widgets.js';
import { updatePassStatus } from '../modules/pass-engine.js';
import { db } from "../firebase-config.js";
import { collection, doc, getDoc, getDocs, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * Initializes the Fix Issues tab logic
 */
export function initFixIssuesTab() {
    const tabToday = document.getElementById('tab-history-today');
    const tabYesterday = document.getElementById('tab-history-yesterday');
    const tabIssues = document.getElementById('tab-history-issues');
    
    const listToday = document.getElementById('list-history-today');
    const listYesterday = document.getElementById('list-history-yesterday');
    const listIssues = document.getElementById('list-history-issues');

    if (!tabIssues) return;

    tabIssues.addEventListener('click', () => {
        // Toggle Active States
        tabToday.style.background = '#e0e0e0'; tabToday.style.color = '#333';
        tabYesterday.style.background = '#e0e0e0'; tabYesterday.style.color = '#333';
        tabIssues.style.background = '#c62828'; tabIssues.style.color = 'white';

        // Toggle Views
        listToday.classList.add('hidden');
        listYesterday.classList.add('hidden');
        listIssues.classList.remove('hidden');
    });
}

/**
 * Filters and routes stuck passes to the Fix Issues tab.
 * Call this inside your main pass listener whenever passes are fetched.
 */
export function processStuckPasses(stalePasses, currentUser) {
    const tabIssues = document.getElementById('tab-history-issues');
    const issuesCount = document.getElementById('issues-count');
    if (!tabIssues) return;

    // 🕵️ LOG: Who does the computer think is logged in?
    console.log(`[STALE FILTER] Processing for user:`, currentUser?.displayName);

    // 1. TEACHER CHECK (Enforces accountability + catches orphans)
    const myStalePasses = stalePasses.filter(pass => {
        const hasOriginTeacher = pass.originTeacher && pass.originTeacher !== "Unknown" && pass.originTeacher.trim() !== "";
        const hasTargetTeacher = pass.targetTeacher && pass.targetTeacher !== "Unknown" && pass.targetTeacher.trim() !== "";
        const isOrphanedPass = !hasOriginTeacher && !hasTargetTeacher;

        const isMine = pass.originTeacher === currentUser?.displayName || 
               pass.targetTeacher === currentUser?.displayName ||
               pass.senderName === currentUser?.displayName || 
               currentUser?.role === 'admin' ||
               isOrphanedPass; 
               
        // 🕵️ LOG: Why is it keeping/rejecting this pass?
        console.log(`[STALE FILTER] Pass ${pass.id} | Target: "${pass.targetTeacher}" | Origin: "${pass.originTeacher}" | Is Mine? ${isMine}`);

        return isMine;
    });
    
    // 🕵️ LOG: Final count
    console.log(`[STALE FILTER] Total passes surviving the filter:`, myStalePasses.length);

    if (myStalePasses.length > 0) {
        tabIssues.classList.remove('hidden');
        tabIssues.style.display = 'flex';
        issuesCount.innerText = myStalePasses.length;
        
        renderPassList(myStalePasses, 'list-history-issues', 'issues-count');
        tabIssues.style.animation = "pulseAlert 2s infinite";

        // 🌟 NEW: Auto-open the tab if it's currently hidden
        if (document.getElementById('list-history-issues').classList.contains('hidden')) {
            tabIssues.click();
        }
        
    } else {
        tabIssues.classList.add('hidden');
        document.getElementById('list-history-issues').innerHTML = "";
    }
}

// 🌟 GLOBAL BUTTON ACTIONS
window.resolveStalePass = async (passId, action) => {
    const { getFirestore, doc, updateDoc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
    const db = getFirestore();

    if (action === 'deleted') {
        if (confirm("Are you sure you want to delete this pass record entirely?")) {
            await deleteDoc(doc(db, "passes", passId));
        }
    } else if (action === 'completed') {
        if (confirm("Mark this pass as properly completed?")) {
            await updateDoc(doc(db, "passes", passId), {
                status: 'completed',
                needsVerification: false // Removes the flag so it clears from the red tab!
            });
        }
    } else if (action === 'acknowledge') {
        await updateDoc(doc(db, "passes", passId), {
            needsVerification: false // Keeps it 'cancelled' but clears it from the red tab
        });
    }
};

/**
 * Exportable helper to quickly cancel a stuck pass
 */
export async function forceCloseStuckPass(passId) {
    if (confirm("Are you sure you want to cancel this old pass and remove it from the system?")) {
        // Leverages your existing updatePassStatus function
        await updatePassStatus(passId, "cancelled"); 
    }
}

/**
 * Opens a robust edit modal pre-filled with the pass's current data.
 * @param {string} passId - The Firestore document ID of the pass
 * @param {object} passData - The current data object for the pass
 */
export async function openFullEditPassModal(passId, passData) {
    let modal = document.getElementById("full-edit-pass-modal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "full-edit-pass-modal";
        modal.style.cssText = "display: flex; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.7); z-index: 10000; align-items: center; justify-content: center;";
        document.body.appendChild(modal);
    } else {
        modal.style.display = "flex";
    }

    // Helper functions to convert Firebase Timestamps to HTML input formats
    const formatTimeForInput = (ts) => {
        if (!ts) return "";
        const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
        return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' });
    };
    
    const formatDateForInput = (ts) => {
        if (!ts) return "";
        const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
        const year = d.getFullYear();
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // Pre-fill values
    const passDate = formatDateForInput(passData.createdAt || passData.acceptedAt);
    const tDeparted = formatTimeForInput(passData.acceptedAt || passData.createdAt);
    const tArrived = formatTimeForInput(passData.arrivedAt);
    const tLeftDest = formatTimeForInput(passData.departedAt);
    const tReturned = formatTimeForInput(passData.returnedAt);

    modal.innerHTML = `
        <div style="background: white; border-radius: 12px; width: 95%; max-width: 500px; display: flex; flex-direction: column; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
            <div style="padding: 15px 20px; background: #0277bd; color: white; display: flex; justify-content: space-between; align-items: center; border-radius: 12px 12px 0 0;">
                <h2 style="margin: 0; font-size: 1.2rem;">✏️ Edit Pass Record</h2>
                <span id="close-edit-modal" style="cursor: pointer; font-size: 1.5rem; font-weight: bold;">✖</span>
            </div>
            
            <div style="padding: 20px; display: flex; flex-direction: column; gap: 15px; overflow-y: auto; max-height: 80vh;">
                <div>
                    <label style="font-weight: bold; display: block; margin-bottom: 5px;">Date of Pass:</label>
                    <input type="date" id="edit-date" value="${passDate}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                </div>

                <div>
                    <label style="font-weight: bold; display: block; margin-bottom: 5px;">Student:</label>
                    <select id="edit-student" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                        <option value="">Loading students...</option>
                    </select>
                </div>

                <div>
                    <label style="font-weight: bold; display: block; margin-bottom: 5px;">Origin (Teacher/Room):</label>
                    <select id="edit-origin" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                        <option value="">Loading staff...</option>
                    </select>
                </div>

                <div>
                    <label style="font-weight: bold; display: block; margin-bottom: 5px;">Destination (Teacher or Room):</label>
                    <select id="edit-dest" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                        <option value="">Loading destinations...</option>
                    </select>
                </div>

                <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; border: 1px solid #eee;">
                    <label style="font-weight: bold; display: block; margin-bottom: 10px;">Adjust Times:</label>
                    
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span>🛫 Left Origin:</span>
                        <input type="time" id="edit-time-departed" value="${tDeparted}" style="padding: 5px; border: 1px solid #ccc; border-radius: 4px;">
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span>📍 Arrived Dest:</span>
                        <input type="time" id="edit-time-arrived" value="${tArrived}" style="padding: 5px; border: 1px solid #ccc; border-radius: 4px;">
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span>🚶 Left Dest:</span>
                        <input type="time" id="edit-time-left-dest" value="${tLeftDest}" style="padding: 5px; border: 1px solid #ccc; border-radius: 4px;">
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span>🏠 Returned:</span>
                        <input type="time" id="edit-time-returned" value="${tReturned}" style="padding: 5px; border: 1px solid #ccc; border-radius: 4px;">
                    </div>
                </div>

                <button id="btn-flag-fraud" style="padding: 10px; font-size: 1rem; background: white; color: #c62828; border: 1px solid #c62828; border-radius: 6px; cursor: pointer; font-weight: bold;">🚩 Flag as Fraudulent</button>

                <button id="btn-submit-edit" style="padding: 12px; font-size: 1.1rem; background: #fbc02d; color: #333; border: none; border-radius: 6px; cursor: pointer; margin-top: 10px; font-weight: bold;">Save Changes</button>
            </div>
        </div>
    `;

    document.getElementById("close-edit-modal").onclick = () => modal.style.display = "none";

    // --- FETCH DATA & POPULATE DROPDOWNS ---
    try {
        const usersSnap = await getDocs(collection(db, "users"));
        const settingsSnap = await getDoc(doc(db, "system", "settings"));
        const skipRoomsMap = settingsSnap.exists() ? (settingsSnap.data().skipCheckInRooms || {}) : {};

        let studentsHTML = '<option value="" disabled>Select a student...</option>';
        let staffHTML = '<option value="" disabled>Select staff...</option>';
        let destHTML = '<option value="" disabled>Select destination...</option>';

        const students = [];
        const staff = [];

        usersSnap.forEach(docSnap => {
            const data = docSnap.data();
            if (data.role === "student") students.push({ id: docSnap.id, name: data.displayName || data.firstName + " " + data.lastName, email: data.email });
            if (data.role === "teacher") {
                const formalName = (data.title && data.lastName) ? `${data.title} ${data.lastName}` : (data.lastName || data.displayName);
                staff.push({ id: docSnap.id, name: formalName, rawName: data.displayName, lastName: data.lastName });
            }
        });

        // 1. SMART STUDENT MATCHING
        let studentMatched = false;
        students.sort((a, b) => a.name.localeCompare(b.name)).forEach(s => {
            const isSelected = (passData.studentId === s.id || passData.studentName === s.name || passData.studentDisplayName === s.name) ? "selected" : "";
            if (isSelected) studentMatched = true;
            studentsHTML += `<option value="${s.id}" data-name="${s.name}" data-email="${s.email}" ${isSelected}>${s.name}</option>`;
        });
        if (!studentMatched && (passData.studentName || passData.studentDisplayName)) {
            const missingName = passData.studentDisplayName || passData.studentName;
            studentsHTML = `<option value="${passData.studentId || missingName}" data-name="${missingName}" selected>${missingName} (Legacy Record)</option>` + studentsHTML;
        }

        // 2. SMART ORIGIN MATCHING
        let originMatched = false;
        staff.sort((a, b) => a.name.localeCompare(b.name)).forEach(s => {
            const isSelected = (passData.originTeacher === s.rawName || passData.origin === s.rawName) ? "selected" : "";
            if (isSelected) originMatched = true;
            staffHTML += `<option value="${s.rawName}" data-last="${s.lastName}" ${isSelected}>${s.name}</option>`;
        });
        if (!originMatched && passData.origin) {
            // Origin was likely a room (e.g. "138 Band") or deleted staff member. Inject it so it shows up.
            staffHTML = `<option value="${passData.origin}" selected>${passData.origin}</option>` + staffHTML;
        }

        // 3. SMART DESTINATION MATCHING
        let destMatched = false;
        destHTML += `<optgroup label="Staff Members">`;
        staff.forEach(s => {
            const isSelected = (passData.targetTeacher === s.rawName || passData.destination === s.rawName) ? "selected" : "";
            if (isSelected) destMatched = true;
            destHTML += `<option value="${s.rawName}" data-last="${s.lastName}" ${isSelected}>${s.name}</option>`;
        });
        destHTML += `</optgroup>`;

        let roomsHTML = "";
        Object.keys(skipRoomsMap).forEach(room => {
            if (skipRoomsMap[room]) {
                const isSelected = (passData.destination === room || passData.destinationRoom === room) ? "selected" : "";
                if (isSelected) destMatched = true;
                roomsHTML += `<option value="${room}" data-type="room" ${isSelected}>${room} (No Check-in)</option>`;
            }
        });
        if (!destMatched && passData.destination) {
            // Destination was a standard room not in the skipRoomsMap, or legacy. Inject it.
            roomsHTML += `<option value="${passData.destination}" data-type="room" selected>${passData.destination}</option>`;
        }
        
        if (roomsHTML) destHTML += `<optgroup label="Locations">${roomsHTML}</optgroup>`;

        document.getElementById("edit-student").innerHTML = studentsHTML;
        document.getElementById("edit-origin").innerHTML = staffHTML;
        document.getElementById("edit-dest").innerHTML = destHTML;

    } catch (err) {
        console.error("Failed to load data for edit pass", err);
    }

    // --- FRAUD FLAG LOGIC ---
    document.getElementById("btn-flag-fraud").onclick = async () => {
        const reason = prompt("Please enter a reason for flagging this pass as fraudulent:");
        if (!reason) return;

        try {
            await updateDoc(doc(db, "passes", passId), {
                status: "fraudulent_review",
                fraudExplanation: reason,
                flaggedBy: window.currentUser?.displayName || "Teacher",
                flaggedAt: Timestamp.now()
            });
            alert("Pass has been flagged for admin review.");
            modal.style.display = "none";
        } catch (error) {
            alert("Error flagging pass: " + error.message);
        }
    };

    // --- SUBMIT EDIT LOGIC ---
    document.getElementById("btn-submit-edit").onclick = async () => {
        const dateVal = document.getElementById("edit-date").value;
        const studentSelect = document.getElementById("edit-student");
        const originSelect = document.getElementById("edit-origin");
        const destSelect = document.getElementById("edit-dest");
        
        const departedTime = document.getElementById("edit-time-departed").value;
        const arrivedTime = document.getElementById("edit-time-arrived").value;
        const leftDestTime = document.getElementById("edit-time-left-dest").value;
        const returnedTime = document.getElementById("edit-time-returned").value;

        const btn = document.getElementById("btn-submit-edit");
        btn.innerText = "⏳ Saving...";
        btn.disabled = true;

        try {
            // Bulletproof Timestamp Builder from retro pass logic
            const makeTS = (timeStr) => {
                if (!timeStr) return null;
                const [year, month, day] = dateVal.split("-");
                const [hours, minutes] = timeStr.split(":");
                const d = new Date(year, month - 1, day, hours, minutes);
                return Timestamp.fromDate(d);
            };

            const selectedStudent = studentSelect.options[studentSelect.selectedIndex];
            const selectedOrigin = originSelect.options[originSelect.selectedIndex];
            const selectedDest = destSelect.options[destSelect.selectedIndex];
            const isDestRoom = selectedDest.getAttribute("data-type") === "room";

            const updateData = {
                acceptedAt: makeTS(departedTime),
                arrivedAt: makeTS(arrivedTime),
                departedAt: makeTS(leftDestTime),
                returnedAt: makeTS(returnedTime),
                
                destination: destSelect.value || "",
                destinationRoom: isDestRoom ? (destSelect.value || "") : "",
                destinationTeacher: isDestRoom ? "" : (destSelect.value || ""),
                destTeacherLastName: isDestRoom ? "" : (selectedDest.getAttribute("data-last") || ""),
                requiresCheckIn: !isDestRoom,
                targetTeacher: isDestRoom ? "" : (destSelect.value || ""),
                
                origin: originSelect.value || "",
                originTeacher: originSelect.value || "",
                originTeacherLastName: selectedOrigin.getAttribute("data-last") || "",
                
                studentDisplayName: selectedStudent.getAttribute("data-name") || "",
                studentEmail: selectedStudent.getAttribute("data-email") || "",
                studentId: selectedStudent.value || "",
                studentName: selectedStudent.getAttribute("data-name") || "",

                // Audit trail
                editedBy: window.currentUser?.displayName || "A Teacher",
                lastEditedAt: Timestamp.now()
            };

            // Only track original destination if it wasn't tracked already
            if (!passData.originalDestination && passData.destination !== destSelect.value) {
                updateData.originalDestination = passData.destination;
            }

            await updateDoc(doc(db, "passes", passId), updateData);
            
            modal.style.display = "none";
            alert("✅ Pass history updated successfully.");
            
        } catch (err) {
            console.error("🔥 Error saving edit pass:", err);
            alert("Error saving edit. Please check the browser console.");
            btn.innerText = "Save Changes";
            btn.disabled = false;
        }
    };
}