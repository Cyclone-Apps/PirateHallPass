// =====================================================================
// 🏫 SHARED SCHEDULE UTILITIES & POPUP MODAL
// FILE: public/js/features/f-student-schedule.js
// =====================================================================
import { db } from "../firebase-config.js";
import { collection, query, where, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
    buildScheduleRowHTML: function(periodString, classData, fetchedRoom = null, fetchedTeacher = null, customTime = null) {
        const isLunch = periodString.toLowerCase().includes("lunch");

        // 🍔 LUNCH ROW FORMAT
        if (isLunch) {
            const lunchBadge = periodString.replace(" Lunch", "").trim() || "🍔";
            return `
                <div style="display: flex; align-items: center; border-bottom: 1px solid #eee; padding: 10px 0;">
                    <div style="width: 50px; font-weight: bold; color: #ef1a14; font-size: 1.1rem; text-align: center;">${lunchBadge}</div>
                    <div style="flex: 1; padding-left: 15px;">
                        <div style="font-weight: 600; font-size: 1.05rem; color: #111;">${periodString}</div>
                        <div style="font-size: 0.85rem; color: #666; margin-top: 2px;">
                            <span>🕒 ${customTime || "Time varies"}</span> &nbsp;|&nbsp; <span>🚪 Cafeteria</span>
                        </div>
                    </div>
                </div>
            `;
        }

        // 📚 REGULAR CLASS FORMAT
        if (!classData) return "";
        const rawName = classData.className || classData.courseName || "Class";
        const cleanClassName = this.extractClassName(rawName);
        const teacherName = fetchedTeacher || classData.teacher || this.extractTeacher(rawName);
        const roomName = fetchedRoom || classData.room || "TBA";

        // Strips "Period " and " Class" to leave you perfectly with "1", "6A", "WIN Time", etc.
        let displayPeriod = periodString.replace(/Period /gi, "").replace(/ Class/gi, "");

        return `
            <div style="display: flex; align-items: center; border-bottom: 1px solid #eee; padding: 10px 0;">
                <div style="width: 50px; font-weight: bold; color: #ef1a14; font-size: 1.1rem; text-align: center;">${displayPeriod}</div>
                <div style="flex: 1; padding-left: 15px;">
                    <div style="font-weight: 600; font-size: 1.05rem; color: #111;">${cleanClassName}</div>
                    <div style="font-size: 0.85rem; color: #666; margin-top: 2px;">
                        <span>🕒 ${customTime || "Time varies"}</span> &nbsp;|&nbsp; <span>🚪 ${roomName}</span> &nbsp;|&nbsp; <span>👤 ${teacherName}</span>
                    </div>
                </div>
            </div>
        `;
    },

    // 🕒 RESTORED: Needed for dashboard widgets!
    getWidgetData: function(timeMetrics, studentProfile) {
        if (!studentProfile || !studentProfile.schedule) return null;

        let currentDisplay = timeMetrics?.currentPeriod || null;
        let nextDisplay = timeMetrics?.nextPeriod || null;
        let currentBase = timeMetrics?.activeBasePeriod || currentDisplay;
        let nextBase = timeMetrics?.nextBasePeriod || nextDisplay;
        const sched = studentProfile.schedule;

        const getClassData = (pName) => {
            if (!pName) return { data: null, key: null };
            const stripped = String(pName).replace(/Period /gi, "").replace(/ Class/gi, "");
            const possibleKeys = [
                pName, stripped, `Period ${stripped}`, 
                `${stripped}A Class`, `${stripped}B Class`, `${stripped}C Class`, 
                `${stripped}A`, `${stripped}B`, `${stripped}C`, `${stripped} Class`
            ];
            for (let key of possibleKeys) {
                if (sched[key]) return { data: sched[key], key: key };
            }
            return { data: null, key: null };
        };

        let currentMatch = getClassData(currentBase);
        let nextMatch = getClassData(nextBase);

        if (currentBase && !nextMatch.data) {
            const match = String(currentBase).match(/\d+/);
            if (match) {
                const pNum = parseInt(match[0], 10);
                if (pNum < 9) nextMatch = getClassData(String(pNum + 1));
            }
        }

        let currentLabel = currentMatch.key || currentDisplay || currentBase || "Class";
        let nextLabel = nextMatch.key || nextDisplay || nextBase || "Class";

        const isLunch = (str) => str && str.toLowerCase().includes("lunch");
        if (isLunch(currentDisplay)) currentLabel = currentDisplay;
        if (isLunch(nextDisplay)) nextLabel = nextDisplay;
        if (currentDisplay === "WIN Time") currentLabel = "WIN Time";
        if (nextDisplay === "WIN Time") nextLabel = "WIN Time";

        const resolveRoom = (classData, periodKey, extractedTeacher) => {
            if (classData.room && classData.room !== "Unknown" && classData.room !== "TBA") return classData.room; 
            if (!window.activeStaffList || !extractedTeacher) return "TBA";
            
            const searchLower = extractedTeacher.toLowerCase().trim();
            const profile = window.activeStaffList.find(staff => {
                const lName = (staff.lastName || "").toLowerCase().trim();
                const dName = (staff.displayName || "").toLowerCase().trim();
                return (lName && searchLower.includes(lName)) || (dName && searchLower === dName);
            });

            if (profile) {
                const p = String(periodKey).trim();
                if (profile.roomAssignments && profile.roomAssignments[p]) {
                    return profile.roomAssignments[p].room === "No Room" ? "TBA" : profile.roomAssignments[p].room;
                }
                const baseP = p.replace(/\D/g, ''); 
                if (baseP && profile.roomAssignments && profile.roomAssignments[baseP]) {
                    return profile.roomAssignments[baseP].room === "No Room" ? "TBA" : profile.roomAssignments[baseP].room;
                }
                return profile.mapName || profile.room || profile.roomNumber || "TBA";
            }
            return "TBA";
        };

        // 🕒 NEW INTERNAL TIME HELPER: Fetches and formats the time string for the widget
        const getTimeString = (periodKey) => {
            const rawSchedule = (timeMetrics && timeMetrics.schedule) || 
                                  window.activeBellSchedule || 
                                  (window.sysInfo && window.sysInfo.bellSchedule) || 
                                  null;
                                  
            if (!rawSchedule) return "Time varies";

            const target = String(periodKey).replace(/Period/gi, "").replace(/Class/gi, "").trim().toLowerCase();
            let bell = null;

            // Handle both Arrays and Firebase Objects seamlessly
            if (Array.isArray(rawSchedule)) {
                bell = rawSchedule.find(b => {
                    const cleanBell = String(b.period).replace(/Period/gi, "").replace(/Class/gi, "").trim().toLowerCase();
                    return cleanBell === target || target.startsWith(cleanBell) || cleanBell.startsWith(target);
                });
            } else {
                const matchedKey = Object.keys(rawSchedule).find(k => {
                    const cleanKey = String(k).replace(/Period/gi, "").replace(/Class/gi, "").trim().toLowerCase();
                    return cleanKey === target || target.startsWith(cleanKey) || cleanKey.startsWith(target);
                });
                if (matchedKey) bell = rawSchedule[matchedKey];
            }

            if (bell && bell.start && bell.end) {
                const formatTime = (timeStr) => {
                    if (!timeStr) return "";
                    if (timeStr.toLowerCase().includes("m")) return timeStr; 
                    let [h, m] = timeStr.split(":");
                    let hour = parseInt(h, 10);
                    let ampm = hour >= 12 ? "PM" : "AM";
                    hour = hour % 12 || 12;
                    return `${hour}:${m || "00"} ${ampm}`;
                };
                return `${formatTime(bell.start)} - ${formatTime(bell.end)}`;
            }
            return "Time varies";
        };

        const formatBlock = (matchObj, label, displayStr) => {
            if (!matchObj.data && !isLunch(displayStr) && displayStr !== "WIN Time") return null;
            
            let packageData = {
                label: label,
                className: "Unknown",
                teacher: "Unknown",
                room: "TBA",
                rawKey: matchObj.key || displayStr,
                timeString: "Time varies" // 🕒 Added new property
            };

            if (isLunch(displayStr)) {
                packageData.className = "Lunch 🍔";
                packageData.teacher = "Lunch Staff";
                packageData.room = "Cafeteria";
                packageData.label = displayStr; 
            } else if (displayStr === "WIN Time" || matchObj.key === "WIN Time") {
                packageData.className = matchObj.data ? `${this.extractClassName(matchObj.data.className)} (WIN Time 🦅)` : "WIN Time 🦅";
                packageData.teacher = matchObj.data ? (matchObj.data.teacher || this.extractTeacher(matchObj.data.className)) : "WIN Time";
                packageData.room = matchObj.data ? resolveRoom(matchObj.data, "WIN Time", packageData.teacher) : "TBA";
            } else if (matchObj.data) {
                packageData.className = this.extractClassName(matchObj.data.className);
                packageData.teacher = matchObj.data.teacher || this.extractTeacher(matchObj.data.className);
                packageData.room = resolveRoom(matchObj.data, packageData.rawKey, packageData.teacher);
            }
            
            // 🕒 Attach the generated time string directly to the data payload
            packageData.timeString = getTimeString(packageData.rawKey);
            
            return packageData;
        };

        return {
            current: formatBlock(currentMatch, currentLabel, currentDisplay),
            next: formatBlock(nextMatch, nextLabel, nextDisplay),
            currentBasePeriod: currentBase
        };
    }
};

// ==========================================
// 📅 GLOBAL FULL SCHEDULE POP-UP
// ==========================================
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
    // Now that lunch is injected, we can accurately see if they are a high schooler
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
        
        // 🎯 EXACT MATCH PRIORITY
        if (scheduleObj[rawTrimmed]) return scheduleObj[rawTrimmed];
        
        const target = rawTrimmed.replace(/Period/gi, "").replace(/Class/gi, "").trim().toLowerCase();
        
        for (const [key, val] of Object.entries(scheduleObj)) {
            const cleanKey = String(key).replace(/Period/gi, "").replace(/Class/gi, "").trim().toLowerCase();
            
            // Strictly isolate Lunch matching so Class doesn't match Lunch
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
    for (const p of Object.keys(sched)) {
        let bell = null;
        if (bellSchedules) {
            bell = getBellData(p, activeSchedObj) || getBellData(p, fallbackSchedObj);
        }
        
        if (bell && bell.start && bell.end) {
            periodTimes[p] = {
                startMinutes: parseTimeForSort(bell.start),
                displayString: `${formatTime(bell.start)} - ${formatTime(bell.end)}`
            };
        } else {
            console.warn(`⚠️ [SCHEDULE MODAL] Could not find times for: ${p}`);
            periodTimes[p] = { startMinutes: 9999, displayString: "Time varies" };
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