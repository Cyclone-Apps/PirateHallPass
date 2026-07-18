// =====================================================================
// 📅 GLOBAL FULL SCHEDULE POP-UP
// FILE: public/js/features/f-schedule-popup.js
// =====================================================================
import { db } from "../firebase-config.js";
import { collection, query, where, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

window.openSchedulePopup = async function(student) {
    console.log("🚀 [SCHEDULE MODAL] Opening for:", student.displayName);
    const existingModal = document.getElementById("student-schedule-popup-modal");
    if (existingModal) existingModal.remove();

    const modal = document.createElement("div");
    modal.id = "student-schedule-popup-modal";
    modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 9999; font-family: sans-serif;";

    const box = document.createElement("div");
    box.style.cssText = "background: white; padding: 25px; border-radius: 12px; width: 95%; max-width: 600px; box-shadow: 0 4px 15px rgba(0,0,0,0.2); max-height: 80vh; overflow-y: auto;";

    const sched = { ...(student.schedule || {}) };

    // 🚀 1. FETCH BELL SCHEDULES & CALENDAR
    let bellSchedules = null;
    try {
        const bellSnap = await getDoc(doc(db, "settings", "bellSchedules"));
        if (bellSnap.exists()) {
            bellSchedules = bellSnap.data();
            console.log("✅ [SCHEDULE MODAL] Fetched Bell Schedules from DB.");
        }
    } catch (e) { 
        console.warn("❌ [SCHEDULE MODAL] Could not fetch bell schedules:", e); 
    }

    const today = new Date();
    const offset = today.getTimezoneOffset() * 60000;
    const localISODate = (new Date(today - offset)).toISOString().split('T')[0];
    
    let dbDayCode = null;
    try {
        const calSnap = await getDoc(doc(db, "system", "calendar"));
        if (calSnap.exists()) {
            dbDayCode = calSnap.data()[localISODate];
            console.log(`📅 [SCHEDULE MODAL] DB Calendar Check for ${localISODate} returned code:`, dbDayCode || "None found");
        }
    } catch (e) {
        console.warn("❌ [SCHEDULE MODAL] Could not fetch system calendar:", e);
    }

    let uiDayType = "Normal"; 
    let dbLookupType = "Regular"; 

    if (dbDayCode === "E") {
        uiDayType = "Early Out";
        dbLookupType = "Early Out";
    } else if (dbDayCode === "L") {
        uiDayType = "Late Start";
        dbLookupType = "Late Start";
    } else if (dbDayCode === "F") {
        uiDayType = "Normal";
        dbLookupType = "Regular";
    } else if (window.currentDayScheduleType || (window.sysInfo && window.sysInfo.scheduleType)) {
        const fallback = window.currentDayScheduleType || window.sysInfo.scheduleType;
        if (fallback.includes("Early")) { uiDayType = "Early Out"; dbLookupType = "Early Out"; }
        else if (fallback.includes("Late")) { uiDayType = "Late Start"; dbLookupType = "Late Start"; }
    }
    
    console.log(`🛠️ [SCHEDULE MODAL] UI Label: "${uiDayType}", DB Lookup: "${dbLookupType}"`);
    let html = `<h3 style="margin-top: 0; color: var(--pirate-red, #c62828); border-bottom: 2px solid #eee; padding-bottom: 10px;">📋 ${uiDayType} Schedule: ${student.displayName || "Unknown"}</h3>`;

    // 🚀 2. DYNAMIC LUNCH INJECTION ENGINE (Must happen BEFORE level check!)
    const hasLunchAlready = Object.keys(sched).some(k => k.toLowerCase().includes("lunch"));
    if (!hasLunchAlready) {
        let p6Key = Object.keys(sched).find(k => k === "6" || k === "Period 6" || k === "6 Class");
        if (p6Key) {
            const p6Class = sched[p6Key];
            let p6TeacherProfile = null;

            if (window.activeStaffList) {
                if (p6Class.teacherCleverId) p6TeacherProfile = window.activeStaffList.find(t => t.cleverId === p6Class.teacherCleverId);
                else {
                    const extLast = window.ScheduleUtils.extractTeacher(p6Class.className);
                    p6TeacherProfile = window.activeStaffList.find(t => t.lastName === extLast);
                }
            }

            if (!p6TeacherProfile) {
                try {
                    if (p6Class.teacherCleverId) {
                        const q = query(collection(db, "users"), where("cleverId", "==", p6Class.teacherCleverId));
                        const snap = await getDocs(q);
                        if (!snap.empty) p6TeacherProfile = snap.docs[0].data();
                    } else {
                        const extLast = window.ScheduleUtils.extractTeacher(p6Class.className);
                        const q2 = query(collection(db, "users"), where("role", "==", "teacher"), where("lastName", "==", extLast));
                        const snap2 = await getDocs(q2);
                        if (!snap2.empty) p6TeacherProfile = snap2.docs[0].data();
                    }
                } catch (err) {}
            }

            const track = (p6TeacherProfile && p6TeacherProfile.lunchTrack) ? p6TeacherProfile.lunchTrack.toUpperCase() : "A";
            const classKey = `6${track} Class`;
            const lunchKey = `6${track} Lunch`;
            
            sched[classKey] = p6Class; 
            if (p6Key !== classKey) delete sched[p6Key]; 
            sched[lunchKey] = { isSyntheticLunch: true };
            console.log(`🍔 [SCHEDULE MODAL] Dynamically injected ${classKey} and ${lunchKey}.`);
        }
    }

    // 🚀 3. DETERMINE LEVEL & FIND BELL SCHEDULE
    const isHS = Object.keys(sched).some(p => p.includes("6A") || p.includes("6B") || p.includes("6C"));
    const level = isHS ? "HS" : "JH";
    console.log(`🎓 [SCHEDULE MODAL] Detected Level: ${level}`);

    let activeSchedKey = `${level} - ${dbLookupType}`;
    let activeSchedObj = null;

    if (bellSchedules) {
        if (bellSchedules[activeSchedKey]) {
            activeSchedObj = bellSchedules[activeSchedKey];
            console.log(`🎯 [SCHEDULE MODAL] Found exact DB schedule: ${activeSchedKey}`);
        } else {
            const fuzzyKey = Object.keys(bellSchedules).find(k => k.startsWith(level) && k.toLowerCase().includes(dbLookupType.toLowerCase()));
            if (fuzzyKey) {
                activeSchedKey = fuzzyKey;
                activeSchedObj = bellSchedules[activeSchedKey];
                console.log(`🎯 [SCHEDULE MODAL] Found fuzzy DB schedule: ${activeSchedKey}`);
            } else {
                console.warn(`❌ [SCHEDULE MODAL] Could not find any DB schedule matching: ${activeSchedKey}`);
            }
        }
    }
    
    const fallbackSchedObj = bellSchedules ? bellSchedules[`${level} - Regular`] : null;

    // 🚀 4. PRE-CALCULATE TIMES WITH STRICT MATCHING
    const formatTime = (timeStr) => {
        if (!timeStr) return "";
        if (timeStr.toLowerCase().includes("m")) return timeStr; 
        let [h, m] = timeStr.split(":");
        let hour = parseInt(h, 10);
        let ampm = hour >= 12 ? "PM" : "AM";
        hour = hour % 12 || 12;
        return `${hour}:${m || "00"} ${ampm}`;
    };

    const parseTimeForSort = (timeStr) => {
        if (!timeStr) return 9999;
        let clean = timeStr.trim().toLowerCase();
        let isPM = clean.includes("pm");
        let isAM = clean.includes("am");
        clean = clean.replace(/[a-z]/gi, "").trim();
        let [h, m] = clean.split(":");
        let hour = parseInt(h, 10) || 0;
        let min = parseInt(m, 10) || 0;
        if (isPM && hour < 12) hour += 12;
        if (isAM && hour === 12) hour = 0;
        return (hour * 60) + min; 
    };

    const getBellData = (rawPeriod, scheduleObj) => {
        if (!scheduleObj) return null;
        
        const rawTrimmed = String(rawPeriod).trim();
        if (scheduleObj[rawTrimmed]) return scheduleObj[rawTrimmed];
        
        const target = rawTrimmed.replace(/Period/gi, "").replace(/Class/gi, "").trim().toLowerCase();
        
        for (const [key, val] of Object.entries(scheduleObj)) {
            const cleanKey = String(key).replace(/Period/gi, "").replace(/Class/gi, "").trim().toLowerCase();
            if (target.includes("lunch") || cleanKey.includes("lunch")) {
                if (target.includes("lunch") && cleanKey.includes("lunch")) {
                    const targetTrack = target.match(/[a-c]/i);
                    const keyTrack = cleanKey.match(/[a-c]/i);
                    if (targetTrack && keyTrack && targetTrack[0].toLowerCase() === keyTrack[0].toLowerCase()) {
                        return val;
                    }
                }
                continue; 
            }
            if (cleanKey === target) return val; 
            if (cleanKey.startsWith(target + " ") || cleanKey.startsWith(target + "-")) return val;
        }
        return null;
    };

    const periodTimes = {};
    const keysToProcess = Object.keys(sched); 
    for (const p of keysToProcess) {
        let bell = null;
        if (bellSchedules) {
            bell = getBellData(p, activeSchedObj);
            
            if (!bell && fallbackSchedObj && (p.toLowerCase().includes("lunch") || p.toLowerCase().includes("6a") || p.toLowerCase().includes("6b"))) {
                bell = getBellData(p, fallbackSchedObj);
            }
        }
        
        if (bell && bell.start && bell.end) {
            periodTimes[p] = {
                startMinutes: parseTimeForSort(bell.start),
                displayString: `${formatTime(bell.start)} - ${formatTime(bell.end)}`
            };
        } else {
            console.log(`🗑️ [SCHEDULE MODAL] Dropping ${p} because it does not meet today.`);
            delete sched[p];
        }
    }

    const orderMap = { "1": 10, "2": 20, "3": 30, "4": 40, "5": 50, "6": 60, "7": 70, "8": 80, "9": 90, "WIN Time": 95 };

    const periods = Object.keys(sched).sort((a, b) => {
        const startA = periodTimes[a].startMinutes;
        const startB = periodTimes[b].startMinutes;
        if (startA !== startB) return startA - startB; 

        const valA = orderMap[a] || 100;
        const valB = orderMap[b] || 100;
        if (valA !== valB) return valA - valB;
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
            const isLunch = p.toLowerCase().includes("lunch");
            const timeString = periodTimes[p].displayString;

            if (isLunch) {
                schedHtml += window.ScheduleUtils.buildScheduleRowHTML(p, classData, "Cafeteria", "Lunch Staff", timeString);
                continue; 
            }

            let teacherName = null; 
            let roomName = null;
            let teacherData = null;
            const extractedLastName = window.ScheduleUtils.extractTeacher(classData.className || "");

            if (classData.teacherCleverId) {
                const q = query(collection(db, "users"), where("cleverId", "==", classData.teacherCleverId));
                const snap = await getDocs(q);
                if (!snap.empty) teacherData = snap.docs[0].data();
            }

            if (!teacherData && extractedLastName && extractedLastName !== "N/A") {
                const q2 = query(collection(db, "users"), where("role", "==", "teacher"), where("lastName", "==", extractedLastName));
                const snap2 = await getDocs(q2);
                if (!snap2.empty) teacherData = snap2.docs[0].data();
            }

            if (teacherData) {
                const title = teacherData.title ? teacherData.title.trim() + " " : "";
                const lastName = teacherData.lastName || extractedLastName;
                teacherName = (title + lastName).trim();
                
                const baseP = p.replace(/\D/g, ''); 
                if (teacherData.roomAssignments && teacherData.roomAssignments[p]) {
                    roomName = teacherData.roomAssignments[p].room;
                } else if (baseP && teacherData.roomAssignments && teacherData.roomAssignments[baseP]) {
                    roomName = teacherData.roomAssignments[baseP].room;
                } else {
                    roomName = teacherData.mapName || teacherData.room || teacherData.roomNumber || null;
                }
                if (roomName === "No Room") roomName = "TBA"; 
            } else {
                teacherName = extractedLastName; 
            }

            schedHtml += window.ScheduleUtils.buildScheduleRowHTML(p, classData, roomName, teacherName, timeString);
        }
        
        document.getElementById("schedule-loading-indicator").style.display = "none";
        const contentArea = document.getElementById("schedule-content-area");
        contentArea.innerHTML = schedHtml;
        contentArea.style.display = "block";
    }
}