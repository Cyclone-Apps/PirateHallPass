import { db } from "../firebase-config.js";
import { collection, doc, getDoc, getDocs, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { schoolMapSVG } from "../map.js"; 

export async function renderMapRoomSettingsModal() {
    // 1. Create Modal Container
    let modal = document.getElementById("map-room-settings-modal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "map-room-settings-modal";
        modal.style.cssText = "display: flex; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.7); z-index: 10000; align-items: center; justify-content: center;";
        document.body.appendChild(modal);
    } else {
        modal.style.display = "flex";
    }

    modal.innerHTML = `
        <div style="background: white; border-radius: 12px; width: 95%; max-width: 1200px; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
            <div style="padding: 15px 20px; background: #f5f5f5; border-bottom: 2px solid #ccc; display: flex; justify-content: space-between; align-items: center; border-radius: 12px 12px 0 0;">
                <h2 style="margin: 0; color: #1565c0;">🗺️ Map & Room Settings</h2>
                <span id="close-map-room-modal" style="cursor: pointer; font-size: 1.5rem; font-weight: bold; color: #555;">✖</span>
            </div>
            
            <div style="padding: 15px 20px; background: #fff3cd; color: #856404; font-size: 0.95rem; border-bottom: 1px solid #ffeeba;">
                <strong>Legend:</strong> Checking <strong>Skip Check-in</strong> allows students to bypass teacher approval. Checking <strong>Disabled</strong> prevents students from selecting the room on the map. 
                Names in <span style="color: red; font-weight: bold;">Red</span> mean the teacher unchecked "Available" for that period.
            </div>

            <div id="map-room-table-container" style="padding: 0 20px 20px 20px; margin-top: 10px; overflow-y: auto; flex-grow: 1; position: relative;">
                <h3 style="text-align: center; color: #555;">⏳ Loading room data and schedules...</h3>
            </div>
        </div>
    `;

    // Close Listener
    document.getElementById("close-map-room-modal").onclick = () => {
        modal.style.display = "none";
    };

    try {
        // 2. Fetch system settings (for skipCheckInRooms AND disabledRooms)
        const settingsRef = doc(db, "system", "settings");
        const settingsSnap = await getDoc(settingsRef);
        const skipRoomsMap = settingsSnap.exists() ? (settingsSnap.data().skipCheckInRooms || {}) : {};
        const disabledRoomsMap = settingsSnap.exists() ? (settingsSnap.data().disabledRooms || {}) : {}; // 🆕 Fetch Disabled Data

        // 3. Extract Rooms from SVG Map
        if (!schoolMapSVG) throw new Error("schoolMapSVG is missing.");
        const allRooms = new Set();
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = schoolMapSVG;
        
        tempDiv.querySelectorAll(".map-node").forEach(node => {
            let roomId = node.getAttribute("data-id");
            if (roomId && !roomId.toLowerCase().includes("hallway") && !roomId.toLowerCase().includes("corridor") && !roomId.toLowerCase().includes("block")) {
                allRooms.add(roomId.trim());
            }
        });
        const roomsList = Array.from(allRooms).sort();

        // 4. Fetch Teacher Assignments
        const usersSnap = await getDocs(collection(db, "users"));
        const roomAssignmentsMap = {}; 
        
        roomsList.forEach(room => {
            roomAssignmentsMap[room] = { 1:[], 2:[], 3:[], 4:[], 5:[], 6:[], 7:[], 8:[], 9:[] };
        });

        usersSnap.forEach(docSnap => {
            const data = docSnap.data();
            if (data.role === "teacher" && data.roomAssignments) {
                const displayName = (data.title && data.lastName) ? `${data.title} ${data.lastName}` : (data.lastName || data.displayName);
                
                for (let p = 1; p <= 9; p++) {
                    const periodData = data.roomAssignments[String(p)];
                    if (periodData && periodData.room) {
                        const assignedRoom = roomsList.find(r => r.toLowerCase().includes(periodData.room.toLowerCase()) || periodData.room.toLowerCase().includes(r.toLowerCase()));
                        if (assignedRoom) {
                            roomAssignmentsMap[assignedRoom][p].push({
                                name: displayName,
                                available: periodData.available
                            });
                        }
                    }
                }
            }
        });

        // 5. Build the Table HTML
        let tableHTML = `
            <table style="width: 100%; border-collapse: separate; border-spacing: 0; text-align: center; font-size: 0.9rem;">
                <thead>
                    <tr>
                        <th style="padding: 10px; background: #e0e0e0; position: sticky; top: 0; z-index: 10; border-bottom: 2px solid #aaa; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">Room</th>
                        <th style="padding: 10px; background: #e0e0e0; position: sticky; top: 0; z-index: 10; border-bottom: 2px solid #aaa; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">Skip Check-in<br><span style="font-size: 0.8em; font-weight: normal;">(Bypass Pass)</span></th>
                        <th style="padding: 10px; background: #e0e0e0; position: sticky; top: 0; z-index: 10; border-bottom: 2px solid #aaa; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">Disabled<br><span style="font-size: 0.8em; font-weight: normal;">(Hide from Students)</span></th>
                        ${[1,2,3,4,5,6,7,8,9].map(p => `<th style="padding: 10px; background: #e0e0e0; position: sticky; top: 0; z-index: 10; border-bottom: 2px solid #aaa; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">P${p}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
        `;

        roomsList.forEach(room => {
            const isCheckedSkip = skipRoomsMap[room.toLowerCase()] ? "checked" : "";
            const isCheckedDisabled = disabledRoomsMap[room.toLowerCase()] ? "checked" : ""; // 🆕 Check Disabled Status
            
            tableHTML += `<tr>
                <td style="padding: 10px; border-bottom: 1px solid #ddd; font-weight: bold; background: #fafafa; border-right: 1px solid #ddd;">${room}</td>
                <td style="padding: 10px; border-bottom: 1px solid #ddd; border-right: 1px solid #ddd;">
                    <input type="checkbox" class="skip-room-toggle" data-room="${room}" ${isCheckedSkip} style="transform: scale(1.5); cursor: pointer;">
                </td>
                <td style="padding: 10px; border-bottom: 1px solid #ddd; border-right: 1px solid #ddd; background: #fff5f5;">
                    <input type="checkbox" class="disable-room-toggle" data-room="${room}" ${isCheckedDisabled} style="transform: scale(1.5); cursor: pointer;">
                </td>
            `;
            
            for (let p = 1; p <= 9; p++) {
                const teachers = roomAssignmentsMap[room][p];
                let cellHtml = "";
                if (teachers.length > 0) {
                    cellHtml = teachers.map(t => {
                        const color = t.available ? "#333" : "red";
                        return `<div style="color: ${color}; margin-bottom: 3px;">${t.name}</div>`;
                    }).join('');
                } else {
                    cellHtml = `<span style="color: #ccc;">-</span>`;
                }
                tableHTML += `<td style="padding: 5px; border-bottom: 1px solid #ddd; border-right: 1px solid #eee;">${cellHtml}</td>`;
            }
            tableHTML += `</tr>`;
        });

        tableHTML += `</tbody></table>`;
        document.getElementById("map-room-table-container").innerHTML = tableHTML;

        // 6a. Attach Checkbox Listeners for Skip Check-in
        document.querySelectorAll(".skip-room-toggle").forEach(checkbox => {
            checkbox.addEventListener("change", async (e) => {
                const roomName = e.target.getAttribute("data-room").toLowerCase();
                const isSkip = e.target.checked;
                
                try {
                    skipRoomsMap[roomName] = isSkip;
                    await updateDoc(doc(db, "system", "settings"), {
                        skipCheckInRooms: skipRoomsMap
                    });
                    console.log(`✅ Room ${roomName} skip check-in set to ${isSkip}`);
                } catch (err) {
                    console.error("❌ Failed to update skip check-in setting:", err);
                    alert("Failed to save setting. Check console.");
                    e.target.checked = !isSkip; 
                }
            });
        });

        // 6b. 🆕 Attach Checkbox Listeners for Disabled Rooms
        document.querySelectorAll(".disable-room-toggle").forEach(checkbox => {
            checkbox.addEventListener("change", async (e) => {
                const roomName = e.target.getAttribute("data-room").toLowerCase();
                const isDisabled = e.target.checked;
                
                try {
                    disabledRoomsMap[roomName] = isDisabled;
                    await updateDoc(doc(db, "system", "settings"), {
                        disabledRooms: disabledRoomsMap
                    });
                    console.log(`✅ Room ${roomName} disabled status set to ${isDisabled}`);
                } catch (err) {
                    console.error("❌ Failed to update disabled setting:", err);
                    alert("Failed to save setting. Check console.");
                    e.target.checked = !isDisabled; 
                }
            });
        });

    } catch (err) {
        console.error("❌ Error building map rooms grid:", err);
        document.getElementById("map-room-table-container").innerHTML = `<h3 style="color: red; text-align: center;">Error loading grid data.</h3>`;
    }
}