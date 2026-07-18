import { db } from "../firebase-config.js";
import { collection, doc, getDoc, getDocs, addDoc, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAdjustedNow } from "../modules/time-engine.js";

export async function renderRetroPassModal() {
    let modal = document.getElementById("retro-pass-modal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "retro-pass-modal";
        modal.style.cssText = "display: flex; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.7); z-index: 10000; align-items: center; justify-content: center;";
        document.body.appendChild(modal);
    } else {
        modal.style.display = "flex";
    }

    const now = getAdjustedNow();
    const todayStr = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

    modal.innerHTML = `
        <div style="background: white; border-radius: 12px; width: 95%; max-width: 500px; display: flex; flex-direction: column; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
            <div style="padding: 15px 20px; background: #f57c00; color: white; display: flex; justify-content: space-between; align-items: center; border-radius: 12px 12px 0 0;">
                <h2 style="margin: 0;">🕰️ Log Past Pass</h2>
                <span id="close-retro-modal" style="cursor: pointer; font-size: 1.5rem; font-weight: bold;">✖</span>
            </div>
            
            <div style="padding: 20px; display: flex; flex-direction: column; gap: 15px; overflow-y: auto; max-height: 80vh;">
                <p style="margin: 0; font-size: 0.9rem; color: #666;">Use this to record a pass that happened while the network was down. It will be saved directly to the pass history.</p>

                <div>
                    <label style="font-weight: bold; display: block; margin-bottom: 5px;">Date of Pass:</label>
                    <input type="date" id="retro-date" value="${todayStr}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                </div>

                <div>
                    <label style="font-weight: bold; display: block; margin-bottom: 5px;">Student:</label>
                    <select id="retro-student" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                        <option value="">Loading students...</option>
                    </select>
                </div>

                <div>
                    <label style="font-weight: bold; display: block; margin-bottom: 5px;">Origin (Teacher/Room):</label>
                    <select id="retro-origin" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                        <option value="">Loading staff...</option>
                    </select>
                </div>

                <div>
                    <label style="font-weight: bold; display: block; margin-bottom: 5px;">Destination (Teacher or Room):</label>
                    <select id="retro-dest" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                        <option value="">Loading destinations...</option>
                    </select>
                </div>

                <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; border: 1px solid #eee;">
                    <label style="font-weight: bold; display: block; margin-bottom: 10px;">Best Guess Times:</label>
                    
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span>🛫 Left Origin:</span>
                        <input type="time" id="retro-time-departed" required style="padding: 5px; border: 1px solid #ccc; border-radius: 4px;">
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span>📍 Arrived Dest (Optional):</span>
                        <input type="time" id="retro-time-arrived" style="padding: 5px; border: 1px solid #ccc; border-radius: 4px;">
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span>🚶 Left Dest (Optional):</span>
                        <input type="time" id="retro-time-left-dest" style="padding: 5px; border: 1px solid #ccc; border-radius: 4px;">
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span>🏠 Returned:</span>
                        <input type="time" id="retro-time-returned" required style="padding: 5px; border: 1px solid #ccc; border-radius: 4px;">
                    </div>
                </div>

                <button id="btn-submit-retro" class="primary-btn" style="padding: 12px; font-size: 1.1rem; background: #2e7d32; color: white; border: none; border-radius: 6px; cursor: pointer; margin-top: 10px;">💾 Save to History</button>
            </div>
        </div>
    `;

    document.getElementById("close-retro-modal").onclick = () => modal.style.display = "none";

    // --- FETCH DATA ---
    try {
        const usersSnap = await getDocs(collection(db, "users"));
        const settingsSnap = await getDoc(doc(db, "system", "settings"));
        const skipRoomsMap = settingsSnap.exists() ? (settingsSnap.data().skipCheckInRooms || {}) : {};

        let studentsHTML = '<option value="" disabled selected>Select a student...</option>';
        let staffHTML = '<option value="" disabled selected>Select staff...</option>';
        let destHTML = '<option value="" disabled selected>Select destination...</option>';

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

        students.sort((a, b) => a.name.localeCompare(b.name)).forEach(s => {
            studentsHTML += `<option value="${s.id}" data-name="${s.name}" data-email="${s.email}">${s.name}</option>`;
        });

        staff.sort((a, b) => a.name.localeCompare(b.name)).forEach(s => {
            staffHTML += `<option value="${s.rawName}" data-last="${s.lastName}">${s.name}</option>`;
        });

        // Add Staff to Destination
        destHTML += `<optgroup label="Staff Members">${staffHTML.replace('<option value="" disabled selected>Select staff...</option>', '')}</optgroup>`;
        
        // Add Skip-Rooms to Destination
        let roomsHTML = "";
        Object.keys(skipRoomsMap).forEach(room => {
            if (skipRoomsMap[room]) roomsHTML += `<option value="${room}" data-type="room">${room} (No Check-in)</option>`;
        });
        if (roomsHTML) destHTML += `<optgroup label="Locations">${roomsHTML}</optgroup>`;

        document.getElementById("retro-student").innerHTML = studentsHTML;
        document.getElementById("retro-origin").innerHTML = staffHTML;
        document.getElementById("retro-dest").innerHTML = destHTML;

    } catch (err) {
        console.error("Failed to load data for retro pass", err);
    }

    // --- SUBMIT LOGIC ---
    document.getElementById("btn-submit-retro").onclick = async () => {
        const dateVal = document.getElementById("retro-date").value;
        const studentSelect = document.getElementById("retro-student");
        const originSelect = document.getElementById("retro-origin");
        const destSelect = document.getElementById("retro-dest");
        
        const departedTime = document.getElementById("retro-time-departed").value;
        const arrivedTime = document.getElementById("retro-time-arrived").value;
        const leftDestTime = document.getElementById("retro-time-left-dest").value;
        const returnedTime = document.getElementById("retro-time-returned").value;

        if (!dateVal || !studentSelect.value || !originSelect.value || !destSelect.value || !departedTime || !returnedTime) {
            alert("Please fill out the Date, Student, Origin, Destination, Left Origin time, and Returned time.");
            return;
        }

        const btn = document.getElementById("btn-submit-retro");
        btn.innerText = "⏳ Saving...";
        btn.disabled = true;

        try {
            // Bulletproof Timestamp Builder
            const makeTS = (timeStr) => {
                if (!timeStr) return null;
                const [year, month, day] = dateVal.split("-");
                const [hours, minutes] = timeStr.split(":");
                // Use local time parsing
                const d = new Date(year, month - 1, day, hours, minutes);
                return Timestamp.fromDate(d);
            };

            const tsCreatedAt = makeTS(departedTime);
            const tsArrived = makeTS(arrivedTime); // Removed the fallback
            const tsDeparted = makeTS(leftDestTime); // Removed the fallback
            const tsReturned = makeTS(returnedTime);

            // Format custom creator string safely
            const creatorName = window.currentUser?.displayName || "A Teacher";
            const [rHours, rMins] = returnedTime.split(":");
            const mockDate = new Date(); 
            mockDate.setHours(parseInt(rHours), parseInt(rMins));
            
            const formattedTime = mockDate.toLocaleTimeString("en-US", { hour: 'numeric', minute: '2-digit' }).toLowerCase();
            const [y, m, dNum] = dateVal.split("-");
            const formattedDate = new Date(y, m - 1, dNum).toLocaleDateString("en-US", { month: 'short', day: 'numeric' });
            
            const customInitiatedString = `Pass created by ${creatorName} at ${formattedTime} on ${formattedDate}`;

            const selectedStudent = studentSelect.options[studentSelect.selectedIndex];
            const selectedOrigin = originSelect.options[originSelect.selectedIndex];
            const selectedDest = destSelect.options[destSelect.selectedIndex];
            
            const isDestRoom = selectedDest.getAttribute("data-type") === "room";

            // Fallbacks added (|| "") to ensure Firebase never receives `undefined`
            const retroPassData = {
                acceptedAt: tsCreatedAt,
                arrivedAt: tsArrived,
                createdAt: tsCreatedAt,
                dailyLogCount: 0,
                departedAt: tsDeparted,
                destination: destSelect.value || "",
                destinationRoom: isDestRoom ? (destSelect.value || "") : "",
                destinationTeacher: isDestRoom ? "" : (destSelect.value || ""),
                destTeacherLastName: isDestRoom ? "" : (selectedDest.getAttribute("data-last") || ""),
                initiatedBy: "teacher",
                origin: originSelect.value || "",
                originRoom: "",
                originTeacher: originSelect.value || "",
                originTeacherLastName: selectedOrigin.getAttribute("data-last") || "",
                period: "Retroactive",
                requiresCheckIn: !isDestRoom,
                returnedAt: tsReturned,
                senderName: customInitiatedString, 
                status: "returned", 
                studentDisplayName: selectedStudent.getAttribute("data-name") || "",
                studentEmail: selectedStudent.getAttribute("data-email") || "",
                studentId: selectedStudent.value || "",
                studentName: selectedStudent.getAttribute("data-name") || "",
                targetTeacher: isDestRoom ? "" : (destSelect.value || ""),
                type: "retroactive"
            };

            console.log("💾 Attempting to save retro pass data:", retroPassData);

            await addDoc(collection(db, "passes"), retroPassData);
            
            modal.style.display = "none";
            alert("✅ Retroactive pass saved successfully to history.");
            
        } catch (err) {
            console.error("🔥 Error saving retro pass:", err);
            alert("Error saving pass. Please check the browser console for details.");
            btn.innerText = "💾 Save to History";
            btn.disabled = false;
        }
    };
}