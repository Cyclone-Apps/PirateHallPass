// js/modules/time-engine.js
import { db } from "../firebase-config.js";
import { doc, getDoc, onSnapshot, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let globalTimeOffsetSeconds = 0;
let hardwareDriftMs = 0;       // 🎯 Auto-sync hardware drift
let globalSpoofOffsetMs = null; // 🌍 Global School-Wide Override

// ==========================================================
// 🕵️‍♂️ INSTANT LOAD: Fixes the Race Condition!
// By putting this outside a function, it loads instantly before 
// any student schedules or calendars can try to fetch the time.
// ==========================================================
const savedSpoof = localStorage.getItem("dev_spoof_time_ms");
let localSpoofOffsetMs = savedSpoof ? parseInt(savedSpoof, 10) : null;
if (localSpoofOffsetMs !== null) {
    console.warn("🕰️ TIME MACHINE INSTANT LOAD: Your app time is being spoofed!");
}

/**
 * 🎯 Instantly syncs the device's clock with the web server 
 * Protected by a 1.5-second Kill Switch to prevent school web filters from lagging the app!
 */
async function syncHardwareClock() {
    try {
        const start = Date.now();
        
        // 🛑 1. Setup the Kill Switch (AbortController)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500); // Max wait: 1.5 seconds

        // 2. Ping the server, but attach the Kill Switch signal
        const response = await fetch(window.location.href, { 
            method: 'HEAD', 
            cache: 'no-store',
            signal: controller.signal
        });
        
        // 3. If we made it here quickly, turn off the Kill Switch
        clearTimeout(timeoutId);

        const serverDateStr = response.headers.get('Date');
        
        if (serverDateStr) {
            const end = Date.now();
            const latency = (end - start) / 2; // Estimate network travel time
            const serverTimeMs = new Date(serverDateStr).getTime() + latency;
            hardwareDriftMs = serverTimeMs - end;
            console.log(`⏱️ Clock Sync: Tablet clock is off by ${hardwareDriftMs}ms. Auto-corrected!`);
        }
    } catch (error) {
        // 4. Handle failures gracefully without crashing the app
        if (error.name === 'AbortError') {
            console.warn("⚠️ Clock Sync Timeout: School network filter delayed the request. Falling back to local time instantly.");
        } else {
            console.warn("⚠️ Could not sync hardware clock, falling back to pure local time.", error);
        }
    }
}

/**
 * Listens to Firebase and sets up all time variables on load
 */
export function initializeTimeEngine() {
    // 1. Auto-sync the hardware clock on load
    syncHardwareClock();

    // (Note: The Developer Spoof check was moved to the very top of the file!)

    // 2. Keep listening to the global school offset as usual
    const settingsDoc = doc(db, "settings", "timeConfig");
    onSnapshot(settingsDoc, (docSnap) => {
        if (docSnap.exists()) {
            globalTimeOffsetSeconds = docSnap.data().offsetSeconds || 0;
            globalSpoofOffsetMs = docSnap.data().globalSpoofOffsetMs || null; // 🌍 NEW
        }
    });
}

/**
 * Returns the current Date object adjusted by:
 * 1. The automatic hardware drift sync (Always applies)
 * 2. The admin's SECONDS offset (Or the Developer Spoof override)
 */
export function getAdjustedNow() {
    // 🎯 Step 1: Fix the hardware inaccuracy FIRST
    const realTimeMs = Date.now() + hardwareDriftMs;
    const now = new Date(realTimeMs);
    
    // 🕵️‍♂️ Step 2: Local Sandbox Spoof (Highest Priority)
    if (localSpoofOffsetMs !== null) {
        return new Date(now.getTime() + localSpoofOffsetMs);
    }
    
    // 🌍 Step 3: Global School-Wide Spoof
    if (globalSpoofOffsetMs !== null) {
        return new Date(now.getTime() + globalSpoofOffsetMs);
    }
    
    // 🏫 Step 4: Normal Time + Bell Offset
    now.setSeconds(now.getSeconds() + globalTimeOffsetSeconds);
    return now;
}

/**
 * 🕵️‍♂️ Dev Time Machine: Calculates the offset and saves to localStorage
 */
export function setDevSpoofTime(targetDateObj) {
    console.log("🛠️ TIME MACHINE TRIGGERED!");
    console.log("🛠️ 1. Received Target Date:", targetDateObj);

    if (!targetDateObj) {
        console.log("🛠️ 2. Target date is empty. Clearing Local Storage.");
        localStorage.removeItem("dev_spoof_time_ms");
        localSpoofOffsetMs = null;
        return;
    }

    const realNow = new Date().getTime();
    const targetTime = targetDateObj.getTime();
    
    // Check if the date is invalid (NaN)
    if (isNaN(targetTime)) {
        console.error("❌ ERROR: The date provided is invalid! Cannot save.");
        return;
    }

    localSpoofOffsetMs = targetTime - realNow;
    console.log(`🛠️ 3. Calculated Offset: ${localSpoofOffsetMs}ms. Attempting to save...`);
    
    try {
        localStorage.setItem("dev_spoof_time_ms", localSpoofOffsetMs.toString());
        console.log("🛠️ 4. Successfully wrote to localStorage!");
        
        // Let's force it to read it back just to prove it worked
        const verify = localStorage.getItem("dev_spoof_time_ms");
        console.log(`🛠️ 5. Verification Read-back: ${verify}`);
    } catch (e) {
        console.error("❌ ERROR: Browser blocked writing to localStorage!", e);
    }
}

/**
 * BULLETPROOF time conversion: 
 * Handles "15:30", "03:30 PM", "3:30 pm", and "11:30 PM" flawlessly.
 */
export function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    
    const isPM = timeStr.toLowerCase().includes('pm');
    const isAM = timeStr.toLowerCase().includes('am');
    
    const cleanStr = timeStr.replace(/[^0-9:]/g, '');
    let [hours, minutes] = cleanStr.split(':').map(Number);
    
    if (isNaN(hours)) hours = 0;
    if (isNaN(minutes)) minutes = 0;

    if (isPM && hours < 12) hours += 12;
    if (isAM && hours === 12) hours = 0;
    
    return (hours * 60) + minutes;
}

/**
 * CORE LOGIC: Fetches today's date, checks the calendar, and loads the Bell Schedule
 * Defaults to "F" (Regular Day) if the calendar is empty.
 */
export async function fetchTodaysSchedule(schoolLevel = "HS") {
    const now = getAdjustedNow();
    
    // Format today as YYYY-MM-DD
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;

    let dayCode = "F"; // Default assumption is a regular day

    // 1. Fetch Calendar Code (Bypass PWA Cache using source: 'server')
    try {
        const calDoc = await getDoc(doc(db, "system", "calendar"), { source: 'server' });
        if (calDoc.exists() && calDoc.data().days) {
            const days = calDoc.data().days;
            if (days[todayStr]) {
                dayCode = days[todayStr];
            }
        }
    } catch (e) { console.warn("⚠️ Error fetching calendar:", e); }

    // 2. If it's No School, return immediately
    if (dayCode === "N") {
        return { isNoSchool: true, scheduleName: "No School", dayCode: "N", periods: {} };
    }

    // 3. Map Code to the exact schedule names we built
    let scheduleName = `${schoolLevel} - Regular`;
    if (dayCode === "E") scheduleName = `${schoolLevel} - Early Out`;
    if (dayCode === "L") scheduleName = `${schoolLevel} - Late Start`;

    // 4. Fetch the actual Bell Times (Bypass PWA Cache using source: 'server')
    let scheduleTimes = {};
    try {
        const bellDoc = await getDoc(doc(db, "settings", "bellSchedules"), { source: 'server' });
        if (bellDoc.exists()) {
            scheduleTimes = bellDoc.data()[scheduleName] || {};
        }
    } catch (e) { console.warn("⚠️ Error fetching bell times:", e); }

    return {
        isNoSchool: false,
        scheduleName: scheduleName,
        dayCode: dayCode,
        periods: scheduleTimes
    };
}

/**
 * Evaluates the adjusted time against the active bell schedule layout.
 * 🌟 UPGRADED: Now accepts an optional 'lunchTrack' ("A", "B", or "JH") to filter split blocks!
 */
export function evaluateCurrentTime(scheduleData, lunchTrack = null) {
    if (!scheduleData || Object.keys(scheduleData).length === 0) {
        return { currentPeriod: null, isPassing: false, nextPeriod: null, minutesLeft: 0 };
    }

    const now = getAdjustedNow(); 
    const currentMins = (now.getHours() * 60) + now.getMinutes();

    let activePeriod = null;
    let nextPeriod = null;
    let isPassing = false;
    let minsLeft = 0;

    let periods = [];
    
    if (Array.isArray(scheduleData)) {
        periods = scheduleData.map(p => ({
            name: p.period, 
            startStr: p.start,
            endStr: p.end,
            startMins: timeToMinutes(p.start),
            endMins: timeToMinutes(p.end)
        }));
    } else {
        periods = Object.keys(scheduleData).map(key => ({
            name: key,
            startStr: scheduleData[key].start,
            endStr: scheduleData[key].end,
            startMins: timeToMinutes(scheduleData[key].start),
            endMins: timeToMinutes(scheduleData[key].end)
        }));
    }

    // ==========================================================
    // 🎯 A/B / JH LUNCH TRACK FILTER
    // ==========================================================
    if (lunchTrack) {
        periods = periods.filter(p => {
            const pName = p.name.toUpperCase();
            if (lunchTrack.toUpperCase() === "A") {
                if (pName.startsWith("6B") || pName === "WIN" || pName === "LUNCH" || pName === "6-ADVISOR") return false;
            } else if (lunchTrack.toUpperCase() === "B") {
                if (pName.startsWith("6A") || pName === "WIN" || pName === "LUNCH" || pName === "6-ADVISOR") return false;
            } else if (lunchTrack.toUpperCase() === "JH") {
                if (pName.startsWith("6A") || pName.startsWith("6B")) return false;
            }
            return true; 
        });
    }

    // Sort chronologically
    periods.sort((a, b) => a.startMins - b.startMins);

    for (let i = 0; i < periods.length; i++) {
        const p = periods[i];

        if (currentMins >= p.startMins && currentMins < p.endMins) {
            activePeriod = p.name;
            minsLeft = p.endMins - currentMins;
            isPassing = false;
            // 🌟 FIX: Grab the actual next chronological period before breaking!
            if (i + 1 < periods.length) {
                nextPeriod = periods[i + 1].name;
            }
            break;
        }

        if (currentMins < p.startMins) {
            isPassing = true;
            nextPeriod = p.name;
            minsLeft = p.startMins - currentMins;
            if (i > 0) activePeriod = periods[i - 1].name;
            break;
        }
    }

    if (!activePeriod && !isPassing && periods.length > 0) {
        if (currentMins >= periods[periods.length - 1].endMins) {
            activePeriod = "After School";
        }
    }

    const getBasePeriod = (pName) => {
        if (!pName) return null;
        const upperName = pName.toUpperCase();
        if (upperName.startsWith("6A") || upperName.startsWith("6B") || upperName === "6-ADVISOR") return "Period 6";
        if (upperName === "WIN") return "WIN";
        if (upperName === "LUNCH") return "Lunch";
        if (!upperName.includes("PERIOD") && !isNaN(pName.charAt(0))) return `Period ${pName}`;
        return pName;
    };

    return {
        currentPeriod: activePeriod,
        isPassing: isPassing,
        nextPeriod: nextPeriod,
        minutesLeft: minsLeft,
        activeBasePeriod: getBasePeriod(activePeriod), 
        nextBasePeriod: getBasePeriod(nextPeriod),
        schedule: scheduleData,
        currentMins: currentMins
    };
}

// ==========================================================
// 🕵️‍♂️ TIME MACHINE HELPERS
// ==========================================================

/**
 * Returns true if the developer Time Machine is currently active
 */
export function isTimeSpoofed() {
    return localSpoofOffsetMs !== null || globalSpoofOffsetMs !== null;
}

/**
 * 🎯 The Ultimate Timestamp Fix:
 * If we are spoofing, it creates a fake Firestore timestamp matching our time travel.
 * If we are NOT spoofing, it uses Firebase's highly secure serverTimestamp().
 */
export function getSpoofSafeTimestamp() {
    if (localSpoofOffsetMs !== null || globalSpoofOffsetMs !== null) {
        return Timestamp.fromDate(getAdjustedNow());
    }
    return serverTimestamp();
}