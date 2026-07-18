import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../firebase-config.js"; // <-- Verify this path is correct for your app!

// ==========================================
// 🧑‍🏫 LOAD STAFF & ADMIN LIST FOR MAP MATCHING
// ==========================================
export async function loadStaffForMap() {
    try {
        const staffSnap = await getDocs(collection(db, "users")); 
        
        const allStaff = [];
        staffSnap.forEach(doc => {
            const data = doc.data();
            
            // 1. Check if they have a staff/admin role or flag
            const hasStaffRole = data.role === "teacher" || data.role === "staff" || data.isStaff;
            const hasAdminRole = data.role === "admin" || data.role === "administrator" || data.isAdmin;
            
            // 2. Safety net: If they have room assignments defined, they belong on the map!
            const hasRoomAssignments = !!data.roomAssignments || !!data.room || !!data.roomNumber;

            // If they meet any of these conditions, keep them!
            if (hasStaffRole || hasAdminRole || hasRoomAssignments) {
                allStaff.push(data);
            }
        });

        window.activeStaffList = allStaff;
        console.log(`✅ [MAP SETUP] Successfully loaded ${allStaff.length} staff & admin members for map matching!`);
    } catch (error) {
        console.error("❌ [MAP SETUP] Error loading staff/admin list:", error);
    }
}

// ==========================================
// 🟢 MAP OVERLAY: Swap Room Numbers for Teacher Names 
// ==========================================
export function showTeacherNamesOnMap() {
    console.log("\n🔍 [MAP OVERLAY] Zoom button clicked! Injecting names...");
    
    const mapSvg = document.getElementById("interactive-school-map");
    if (!mapSvg) return;
    
    let p = "1"; 
    if (window.currentTimeState && window.currentTimeState.currentPeriod) {
        p = String(window.currentTimeState.currentPeriod).trim();
    }
    const baseP = p.replace(/\D/g, '') || "1";
    
    const staffList = window.activeStaffList || [];
    if (staffList.length === 0) return;

    let matchCount = 0;

    mapSvg.querySelectorAll(".map-node").forEach(node => {
        const dataId = node.getAttribute("data-id") || "";
        const matchKey = dataId.toLowerCase().replace(/^room\s+/i, '').trim();
        if (!matchKey) return;

        let rawName = null;

        for (const staff of staffList) {
            let activeRoom = null;
            if (staff.roomAssignments) {
                if (staff.roomAssignments[p] && staff.roomAssignments[p].room !== "No Room") {
                    activeRoom = staff.roomAssignments[p].room;
                } else if (staff.roomAssignments[baseP] && staff.roomAssignments[baseP].room !== "No Room") {
                    activeRoom = staff.roomAssignments[baseP].room;
                }
            } else {
                activeRoom = staff.room || staff.roomNumber || null;
            }

            if (activeRoom) {
                const cleanActiveRoom = activeRoom.toLowerCase().replace(/^room\s+/i, '').trim();
                if (cleanActiveRoom === matchKey) {
                    rawName = staff.mapName && staff.mapName.trim() !== "" ? staff.mapName : (staff.lastName || staff.displayName);
                    matchCount++;
                    break; 
                }
            }
        }

        if (rawName) {
            let cleanName = rawName.trim();
            if (cleanName.includes(",")) {
                cleanName = cleanName.split(",")[0].trim();
            } else {
                const parts = cleanName.split(/\s+/);
                if (parts.length > 1) {
                    const titles = ["mr.", "mrs.", "ms.", "miss", "dr.", "coach"];
                    const firstWord = parts[0].toLowerCase();
                    if (titles.includes(firstWord)) cleanName = parts[0] + " " + parts[parts.length - 1];
                    else cleanName = parts[parts.length - 1];
                }
            }

            const textEl = node.querySelector("text.lbl-room, text.lbl-large");
            if (textEl) {
                if (!textEl.hasAttribute("data-orig-text")) {
                    textEl.setAttribute("data-orig-text", textEl.textContent);
                    textEl.setAttribute("data-orig-font", textEl.getAttribute("font-size") || "");
                    textEl.setAttribute("data-orig-fill", textEl.getAttribute("fill") || "");
                }
                textEl.textContent = cleanName;
                textEl.setAttribute("fill", "#0277bd");
                textEl.setAttribute("font-size", cleanName.length > 12 ? "10" : "13");
            }
        }
    });
}

// ==========================================
// 🔴 MAP OVERLAY: Revert to Room Numbers (When Zooming Out)
// ==========================================
export function hideTeacherNamesOnMap() {
    const mapSvg = document.getElementById("interactive-school-map");
    if (!mapSvg) return;

    mapSvg.querySelectorAll(".map-node").forEach(node => {
        const textEl = node.querySelector("text.lbl-room, text.lbl-large");
        if (textEl && textEl.hasAttribute("data-orig-text")) {
            textEl.textContent = textEl.getAttribute("data-orig-text");
            const origFont = textEl.getAttribute("data-orig-font");
            const origFill = textEl.getAttribute("data-orig-fill");
            
            if (origFont) textEl.setAttribute("font-size", origFont);
            else textEl.removeAttribute("font-size");
            
            if (origFill) textEl.setAttribute("fill", origFill);
            else textEl.removeAttribute("fill");
        }
    });
}

// ==========================================
// 🔍 FIND TEACHERS FOR A SPECIFIC ROOM (Current Period)
// ==========================================
export function getTeachersForRoom(roomName) {
    if (!roomName) return [];
    
    let p = "1"; 
    if (window.currentTimeState && window.currentTimeState.currentPeriod) {
        p = String(window.currentTimeState.currentPeriod).trim();
    }
    const baseP = p.replace(/\D/g, '') || "1";
    const matchKey = roomName.toLowerCase().replace(/^room\s+/i, '').trim();
    
    const staffList = window.activeStaffList || [];
    const foundTeachers = [];
    
    for (const staff of staffList) {
        let activeRoom = null;
        
        if (staff.roomAssignments) {
            if (staff.roomAssignments[p] && staff.roomAssignments[p].room !== "No Room") {
                activeRoom = staff.roomAssignments[p].room;
            } else if (staff.roomAssignments[baseP] && staff.roomAssignments[baseP].room !== "No Room") {
                activeRoom = staff.roomAssignments[baseP].room;
            }
        } else {
            activeRoom = staff.room || staff.roomNumber || null;
        }

        if (activeRoom) {
            const cleanActiveRoom = activeRoom.toLowerCase().replace(/^room\s+/i, '').trim();
            if (cleanActiveRoom === matchKey) {
                foundTeachers.push(staff);
            }
        }
    }
    
    return foundTeachers;
}

// ==========================================
// 🧼 HELPER: Is this a No-Check-In Room?
// ==========================================
export function isNoCheckInRoom(roomName, sysInfoCache) {
    if (!roomName) return false;
    const matchKey = roomName.toLowerCase().replace(/^room\s+/i, '').trim();
    
    let skipList = {};
    if (sysInfoCache && (sysInfoCache.skipCheckInRooms || sysInfoCache.noCheckInRooms)) {
        skipList = sysInfoCache.skipCheckInRooms || sysInfoCache.noCheckInRooms;
    } else if (window.sysInfo && (window.sysInfo.skipCheckInRooms || window.sysInfo.noCheckInRooms)) {
        skipList = window.sysInfo.skipCheckInRooms || window.sysInfo.noCheckInRooms;
    }
    
    return !!(skipList[matchKey] || skipList[roomName.toLowerCase().trim()]);
}

// ==========================================
// 🎨 HELPER: Build Dropdown HTML for Room
// ==========================================
export function buildStaffDropdownHTML(roomName) {
    let staffOptions = `<option value="No Receiving Teacher" style="font-weight: bold; color: #d32f2f;">-- No Receiving Teacher --</option>`;
    const staffList = window.activeStaffList || [];
    
    if (staffList.length === 0) return staffOptions;

    // Get any teachers specifically in this room right now
    const matchedTeachers = getTeachersForRoom(roomName);
    const matchedNames = matchedTeachers.map(t => t.displayName);

    // Group co-teachers at the top
    if (matchedNames.length > 0) {
        staffOptions += `<optgroup label="Teachers currently in ${roomName}">`;
        matchedTeachers.forEach(staff => {
            staffOptions += `<option value="${staff.displayName}">${staff.displayName}</option>`;
        });
        staffOptions += `</optgroup><optgroup label="All Staff">`;
    }

    // Add the rest of the staff
    staffList.forEach(staff => {
        if (!matchedNames.includes(staff.displayName)) {
            staffOptions += `<option value="${staff.displayName}">${staff.displayName}</option>`;
        }
    });

    if (matchedNames.length > 0) {
        staffOptions += `</optgroup>`;
    }

    return staffOptions;
}