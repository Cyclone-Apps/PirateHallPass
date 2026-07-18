// =====================================================================
// 🏫 SHARED SCHEDULE UTILITIES ENGINE
// FILE: public/js/features/f-schedule-utils.js
// =====================================================================
import { db } from "../firebase-config.js";
import { collection, query, where, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

window.ScheduleUtils = {
    // 🧠 Silent Daily Schedule Cache Fetcher
    fetchTodaySchedule: async function() {
        if (window.isFetchingSchedule || window.verifiedBellSchedules) return;
        window.isFetchingSchedule = true; // Lock to prevent spam
        
        try {
            const today = new Date();
            const offset = today.getTimezoneOffset() * 60000;
            const localISODate = (new Date(today - offset)).toISOString().split('T')[0];

            const [calSnap, bellSnap] = await Promise.all([
                getDoc(doc(db, "system", "calendar")),
                getDoc(doc(db, "settings", "bellSchedules"))
            ]);

            let dbLookupType = "Regular";
            if (calSnap.exists()) {
                const dbDayCode = calSnap.data()[localISODate];
                if (dbDayCode === "E") dbLookupType = "Early Out";
                else if (dbDayCode === "L") dbLookupType = "Late Start";
            }

            if (bellSnap.exists()) {
                window.verifiedBellSchedules = bellSnap.data();
                window.verifiedScheduleType = dbLookupType;
                console.log(`✅ [WIDGET CACHE] Silently cached ${dbLookupType} schedule.`);
            }
        } catch (error) {
            console.error("Error fetching daily schedule cache for widget:", error);
            window.isFetchingSchedule = false; 
        }
    },

    // 🧠 Silent Teacher Cache Fetcher
    fetchTeacherProfile: async function(cleverId) {
        if (!cleverId) return;
        window.teacherCache = window.teacherCache || {};
        if (window.teacherCache[cleverId] !== undefined) return; 

        window.teacherCache[cleverId] = "fetching"; 
        try {
            const q = query(collection(db, "users"), where("cleverId", "==", cleverId));
            const snap = await getDocs(q);
            if (!snap.empty) {
                window.teacherCache[cleverId] = snap.docs[0].data();
            } else {
                window.teacherCache[cleverId] = null; 
            }
        } catch (error) {
            window.teacherCache[cleverId] = null;
        }
    },
    
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

        if (!classData) return "";
        const rawName = classData.className || classData.courseName || "Class";
        const cleanClassName = this.extractClassName(rawName);
        const teacherName = fetchedTeacher || classData.teacher || this.extractTeacher(rawName);
        const roomName = fetchedRoom || classData.room || "TBA";

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

    // 🕒 Widget Data Generator
    getWidgetData: function(timeMetrics, studentProfile) {
        if (!studentProfile || !studentProfile.schedule) return null;

        // 🚀 1. Trigger the background cache if it hasn't loaded!
        if (!window.verifiedBellSchedules && this.fetchTodaySchedule) {
            this.fetchTodaySchedule();
        }
        
        let sched = JSON.parse(JSON.stringify(studentProfile.schedule));
        const hasLunchAlready = Object.keys(sched).some(k => k.toLowerCase().includes("lunch"));
        
        if (!hasLunchAlready) {
            let p6Key = Object.keys(sched).find(k => k === "6" || k === "Period 6" || k === "6 Class");
            if (p6Key) {
                let track = studentProfile.lunchTrack || studentProfile.track || "A";
                sched[`6${track} Class`] = sched[p6Key];
                delete sched[p6Key];
                sched[`6${track} Lunch`] = { isSyntheticLunch: true };
            }
        }

        // 🚀 2. DYNAMIC SCHEDULE INJECTION
        let rawSchedule = null;
        if (window.verifiedBellSchedules && window.verifiedScheduleType) {
            const isHS = Object.keys(sched).some(p => p.includes("6A") || p.includes("6B") || p.includes("6C"));
            const level = isHS ? "HS" : "JH";
            let activeSchedKey = `${level} - ${window.verifiedScheduleType}`;

            if (window.verifiedBellSchedules[activeSchedKey]) {
                rawSchedule = window.verifiedBellSchedules[activeSchedKey];
            } else {
                const fuzzyKey = Object.keys(window.verifiedBellSchedules).find(k => k.startsWith(level) && k.toLowerCase().includes(window.verifiedScheduleType.toLowerCase()));
                if (fuzzyKey) rawSchedule = window.verifiedBellSchedules[fuzzyKey];
            }
        }

        if (!rawSchedule) {
            rawSchedule = (timeMetrics && timeMetrics.schedule) || window.activeBellSchedule || null;
        }

        // 🎯 3. Pre-calculate times for sorting
        const parseTimeForSort = (timeStr) => {
            if (!timeStr) return 9999;
            let clean = timeStr.trim().toLowerCase().replace(/[a-z]/gi, "").trim();
            let isPM = timeStr.toLowerCase().includes("pm");
            let isAM = timeStr.toLowerCase().includes("am");
            let [h, m] = clean.split(":");
            let hour = parseInt(h, 10) || 0;
            let min = parseInt(m, 10) || 0;
            if (isPM && hour < 12) hour += 12;
            if (isAM && hour === 12) hour = 0;
            return (hour * 60) + min; 
        };

        const formatTime = (timeStr) => {
            if (!timeStr) return "";
            if (timeStr.toLowerCase().includes("m")) return timeStr; 
            let [h, m] = timeStr.split(":");
            let hour = parseInt(h, 10);
            let ampm = hour >= 12 ? "PM" : "AM";
            hour = hour % 12 || 12;
            return `${hour}:${m || "00"} ${ampm}`;
        };

        const getBellData = (rawPeriod, scheduleObj) => {
            if (!scheduleObj) return null;
            const rawList = Array.isArray(scheduleObj) ? scheduleObj : Object.keys(scheduleObj).map(k => ({period: k || scheduleObj[k].period, ...scheduleObj[k]}));
            const target = String(rawPeriod).replace(/Period/gi, "").replace(/Class/gi, "").trim().toLowerCase(); 

            for (const val of rawList) {
                const cleanKey = String(val.period || val.name).replace(/Period/gi, "").replace(/Class/gi, "").trim().toLowerCase();
                if (target.includes("lunch") || cleanKey.includes("lunch")) {
                    if (target.includes("lunch") && cleanKey.includes("lunch")) {
                        const targetTrack = target.match(/[a-c]/i);
                        const keyTrack = cleanKey.match(/[a-c]/i);
                        if (targetTrack && keyTrack && targetTrack[0].toLowerCase() === keyTrack[0].toLowerCase()) return val;
                    }
                    continue; 
                }
                if (cleanKey === target || cleanKey.startsWith(target + " ") || cleanKey.startsWith(target + "-")) return val;
            }
            return null;
        };

        // 🎯 4. Build the Chronological Array
        const periodList = [];
        for (const p of Object.keys(sched)) {
            let bell = getBellData(p, rawSchedule);
            let startMinutes = 9999;
            let endMinutes = 9999;
            let displayString = "Time varies";

            if (!bell || !bell.start || !bell.end) {
                const lowerP = p.toLowerCase();
                if (lowerP.includes("6a lunch")) { startMinutes = 11*60+45; endMinutes = 12*60+10; displayString = "11:45 AM - 12:10 PM"; }
                else if (lowerP.includes("6a")) { startMinutes = 12*60+14; endMinutes = 13*60+0; displayString = "12:14 PM - 1:00 PM"; }
                else if (lowerP.includes("6b lunch")) { startMinutes = 12*60+35; endMinutes = 13*60+0; displayString = "12:35 PM - 1:00 PM"; }
                else if (lowerP.includes("6b")) { startMinutes = 11*60+49; endMinutes = 12*60+35; displayString = "11:49 AM - 12:35 PM"; }
                else continue; // Drop missing classes
            } else {
                startMinutes = parseTimeForSort(bell.start);
                endMinutes = parseTimeForSort(bell.end);
                displayString = `${formatTime(bell.start)} - ${formatTime(bell.end)}`;
            }
            periodList.push({ rawKey: p, data: sched[p], startMinutes, endMinutes, displayString });
        }
        periodList.sort((a, b) => a.startMinutes - b.startMinutes);

        // 🎯 5. Look at the clock
        let currentMins = 0;
        if (timeMetrics && timeMetrics.currentMins !== undefined) {
            currentMins = timeMetrics.currentMins;
        } else if (window.sysInfo && window.sysInfo.spoofedTime) {
            const spoof = new Date(window.sysInfo.spoofedTime);
            currentMins = (spoof.getHours() * 60) + spoof.getMinutes();
        } else {
            const now = new Date();
            currentMins = (now.getHours() * 60) + now.getMinutes();
        }

        let currentIndex = periodList.length - 1; 
        for (let i = 0; i < periodList.length; i++) {
            if (currentMins < periodList[i].endMinutes) {
                currentIndex = i;
                break;
            }
        }

        const currentObj = periodList[currentIndex] || null;
        const nextObj = periodList[currentIndex + 1] || null;

        // 🎯 6. Format Data for the UI
        const resolveRoom = (classData, periodKey, extractedTeacher) => {
            if (classData.room && classData.room !== "Unknown" && classData.room !== "TBA") return classData.room; 
            
            let profile = null;
            
            if (window.activeStaffList) {
                if (classData.teacherCleverId) {
                    profile = window.activeStaffList.find(staff => staff.cleverId === classData.teacherCleverId || staff.id === classData.teacherCleverId);
                }
                if (!profile && extractedTeacher) {
                    const searchLower = extractedTeacher.toLowerCase().trim();
                    profile = window.activeStaffList.find(staff => {
                        const lName = (staff.lastName || "").toLowerCase().trim();
                        const dName = (staff.displayName || "").toLowerCase().trim();
                        return (lName && searchLower.includes(lName)) || (dName && searchLower === dName);
                    });
                }
            } 
            
            if (!profile && classData.teacherCleverId) {
                window.teacherCache = window.teacherCache || {};
                const cached = window.teacherCache[classData.teacherCleverId];
                if (cached && cached !== "fetching") profile = cached; 
                else if (cached === undefined && this.fetchTeacherProfile) this.fetchTeacherProfile(classData.teacherCleverId);
            }

            if (profile) {
                const p = String(periodKey).trim();
                const baseP = p.replace(/\D/g, ''); 
                let roomName = null;
                if (profile.roomAssignments && profile.roomAssignments[p]) roomName = profile.roomAssignments[p].room;
                else if (baseP && profile.roomAssignments && profile.roomAssignments[baseP]) roomName = profile.roomAssignments[baseP].room;
                else roomName = profile.mapName || profile.room || profile.roomNumber || null;
                return (roomName && roomName !== "No Room") ? roomName : "TBA";
            }
            return "TBA";
        };

        const formatBlock = (block) => {
            if (!block) return null;
            const pName = block.rawKey;
            const displayStr = pName.replace(/Period /gi, "").replace(/ Class/gi, "");
            const isLunch = pName.toLowerCase().includes("lunch");
            
            let packageData = { label: displayStr, className: "Unknown", teacher: "Unknown", room: "TBA", rawKey: pName, timeString: block.displayString };

            if (isLunch) {
                packageData.className = "Lunch 🍔";
                packageData.teacher = "Lunch Staff";
                packageData.room = "Cafeteria";
                packageData.label = displayStr.replace(" Lunch", "").trim() || "🍔";
            } else if (pName === "WIN Time") {
                packageData.className = block.data ? `${this.extractClassName(block.data.className)} (WIN Time 🦅)` : "WIN Time 🦅";
                packageData.teacher = block.data ? (block.data.teacher || this.extractTeacher(block.data.className)) : "WIN Time";
                packageData.room = block.data ? resolveRoom(block.data, "WIN Time", packageData.teacher) : "TBA";
                packageData.label = "WIN";
            } else if (block.data) {
                packageData.className = this.extractClassName(block.data.className);
                packageData.teacher = block.data.teacher || this.extractTeacher(block.data.className);
                packageData.room = resolveRoom(block.data, packageData.rawKey, packageData.teacher);
            }
            return packageData;
        };

        return {
            current: formatBlock(currentObj),
            next: formatBlock(nextObj),
            currentBasePeriod: currentObj ? currentObj.rawKey : null
        };
    }
};