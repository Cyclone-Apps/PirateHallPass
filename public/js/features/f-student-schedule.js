// =====================================================================
// 🏫 SHARED SCHEDULE UTILITIES & POPUP MODAL
// FILE: public/js/features/f-student-schedule.js
// =====================================================================
import { db } from "../firebase-config.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

window.ScheduleUtils = {
    // 🪚 Extract just the class name
    extractClassName: function(rawName) {
        if (!rawName) return "Unknown Class";
        return rawName.split(" - ")[0].trim();
    },

    // 🪚 Extract the teacher from the Clever string as a fallback
    extractTeacher: function(rawName) {
        if (!rawName) return "N/A";
        const parts = rawName.split(" - ");
        if (parts.length >= 2) return parts[parts.length - 2].trim();
        return "N/A";
    },

    // 🎨 Build a single, perfectly formatted row for the Full Schedule list
    buildScheduleRowHTML: function(periodString, classData, fetchedRoom = null, fetchedTeacher = null) {
        if (!classData) return "";

        const rawName = classData.className || classData.courseName || "Class";
        const cleanClassName = this.extractClassName(rawName);
        const teacherName = fetchedTeacher || classData.teacher || this.extractTeacher(rawName);

        // 🚀 AGGRESSIVE ROOM SEARCH
        let roomNum = fetchedRoom || classData.room || classData.roomNumber || classData.mapName || "";
        roomNum = String(roomNum).trim(); 
        
        // Only show the Room text if a real room number exists!
        const roomDisplay = (roomNum && roomNum !== "TBA" && roomNum !== "N/A" && roomNum !== "Unknown" && roomNum !== "null" && roomNum !== "undefined") 
            ? `Room: <strong>${roomNum}</strong> <span style="color: #ccc; margin: 0 4px;">|</span> ` 
            : ``;

        return `
            <div style="background: #f8f9fa; border-left: 4px solid var(--pirate-silver); padding: 10px; margin-bottom: 8px; border-radius: 4px;">
                <strong style="color: #333;">Period ${periodString}:</strong> ${cleanClassName}<br>
                <div style="font-size: 0.85rem; color: #555; margin-top: 2px;">${roomDisplay}Teacher: ${teacherName}</div>
            </div>
        `;
    }
};

// ==========================================
// 📅 GLOBAL FULL SCHEDULE POP-UP
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
        
        for (const p of periods) {
            const classData = sched[p];
            let teacherName = null; 
            let roomName = null;
            let teacherData = null;

            // Grab the last name from the string (e.g. "Uhal")
            const extractedLastName = window.ScheduleUtils.extractTeacher(classData.className || "");

            // 1. Try to find the teacher by Clever ID
            if (classData.teacherCleverId) {
                const q = query(collection(db, "users"), where("cleverId", "==", classData.teacherCleverId));
                const snap = await getDocs(q);
                if (!snap.empty) teacherData = snap.docs[0].data();
            }

            // 2. FALLBACK: If Clever ID is missing, search Firebase for the Last Name!
            if (!teacherData && extractedLastName && extractedLastName !== "N/A") {
                const q2 = query(collection(db, "users"), where("role", "==", "teacher"), where("lastName", "==", extractedLastName));
                const snap2 = await getDocs(q2);
                if (!snap2.empty) teacherData = snap2.docs[0].data();
            }

            // 3. Construct the Name & Room WITHOUT using scheduleAlias
            if (teacherData) {
                // 🎯 Dynamically construct "Title + Last Name"
                const title = teacherData.title ? teacherData.title.trim() + " " : "";
                const lastName = teacherData.lastName || extractedLastName;
                teacherName = (title + lastName).trim();
                
                // Keep hunting for the room
                roomName = teacherData.mapName || teacherData.room || teacherData.roomNumber || null;
            } else {
                teacherName = extractedLastName; // Clean fallback
            }

            schedHtml += window.ScheduleUtils.buildScheduleRowHTML(p, classData, roomName, teacherName);
        }
        
        document.getElementById("schedule-loading-indicator").style.display = "none";
        const contentArea = document.getElementById("schedule-content-area");
        contentArea.innerHTML = schedHtml;
        contentArea.style.display = "block";
    }
}