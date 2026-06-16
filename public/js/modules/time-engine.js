// js/modules/time-engine.js
import { db } from "../firebase-config.js";
import { doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let globalTimeOffsetSeconds = 0;

/**
 * Listens to Firebase and instantly updates the offset variable in seconds
 */
export function initializeTimeEngine() {
    const settingsDoc = doc(db, "settings", "timeConfig");
    onSnapshot(settingsDoc, (docSnap) => {
        if (docSnap.exists()) {
            globalTimeOffsetSeconds = docSnap.data().offsetSeconds || 0;
        }
    });
}

/**
 * Returns the current Date object adjusted by the admin's SECONDS offset
 */
export function getAdjustedNow() {
    const now = new Date();
    now.setSeconds(now.getSeconds() + globalTimeOffsetSeconds);
    return now;
}

/**
 * BULLETPROOF time conversion: 
 * Handles "15:30", "03:30 PM", "3:30 pm", and "11:30 PM" flawlessly.
 */
export function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    
    // 1. Check if the string explicitly contains AM or PM
    const isPM = timeStr.toLowerCase().includes('pm');
    const isAM = timeStr.toLowerCase().includes('am');
    
    // 2. Strip out all letters/spaces, keeping only the numbers and colon
    const cleanStr = timeStr.replace(/[^0-9:]/g, '');
    let [hours, minutes] = cleanStr.split(':').map(Number);
    
    if (isNaN(hours)) hours = 0;
    if (isNaN(minutes)) minutes = 0;

    // 3. Convert to 24-hour time mathematically
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

    // 1. Fetch Calendar Code
    try {
        const calDoc = await getDoc(doc(db, "system", "calendar"));
        if (calDoc.exists() && calDoc.data().days) {
            const days = calDoc.data().days;
            if (days[todayStr]) {
                dayCode = days[todayStr];
            }
        }
    } catch (e) { console.error("Error fetching calendar:", e); }

    // 2. If it's No School, return immediately
    if (dayCode === "N") {
        return { isNoSchool: true, scheduleName: "No School", dayCode: "N", periods: null };
    }

    // 3. Map Code to the exact schedule names we built
    let scheduleName = `${schoolLevel} - Regular`;
    if (dayCode === "E") scheduleName = `${schoolLevel} - Early Out`;
    if (dayCode === "L") scheduleName = `${schoolLevel} - Late Start`;

    // 4. Fetch the actual Bell Times for that specific schedule
    let scheduleTimes = {};
    try {
        const bellDoc = await getDoc(doc(db, "settings", "bellSchedules"));
        if (bellDoc.exists()) {
            scheduleTimes = bellDoc.data()[scheduleName] || {};
        }
    } catch (e) { console.error("Error fetching bell times:", e); }

    return {
        isNoSchool: false,
        scheduleName: scheduleName,
        dayCode: dayCode,
        periods: scheduleTimes
    };
}

/**
 * Evaluates the adjusted time against the active bell schedule layout.
 */
export function evaluateCurrentTime(scheduleData) {
    if (!scheduleData || Object.keys(scheduleData).length === 0) {
        return { currentPeriod: null, isPassing: false, nextPeriod: null, minutesLeft: 0 };
    }

    const now = getAdjustedNow(); 
    const currentMins = (now.getHours() * 60) + now.getMinutes();

    let activePeriod = null;
    let nextPeriod = null;
    let isPassing = false;
    let minsLeft = 0;

    // 🌟 BULLETPROOF FIX: Check if the database gave us an Array or a Map
    let periods = [];
    
    if (Array.isArray(scheduleData)) {
        // If it's an array (HS - Regular), pull the name from the "period" field
        periods = scheduleData.map(p => ({
            name: p.period, 
            startStr: p.start,
            endStr: p.end,
            startMins: timeToMinutes(p.start),
            endMins: timeToMinutes(p.end)
        }));
    } else {
        // If it's a Map (HS - Early Out), pull the name from the Object Key
        periods = Object.keys(scheduleData).map(key => ({
            name: key,
            startStr: scheduleData[key].start,
            endStr: scheduleData[key].end,
            startMins: timeToMinutes(scheduleData[key].start),
            endMins: timeToMinutes(scheduleData[key].end)
        }));
    }

    // Sort chronologically
    periods.sort((a, b) => a.startMins - b.startMins);

    // 🕵️ DEBUG LOGGER: Let's see exactly what the engine sees!
    console.log(`⏱️ CURRENT TIME: ${now.toLocaleTimeString()} (Total Mins: ${currentMins})`);
    console.table(periods);

    for (let i = 0; i < periods.length; i++) {
        const p = periods[i];

        if (currentMins >= p.startMins && currentMins < p.endMins) {
            activePeriod = p.name;
            minsLeft = p.endMins - currentMins;
            isPassing = false;
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

    return {
        currentPeriod: activePeriod,
        isPassing: isPassing,
        nextPeriod: nextPeriod,
        minutesLeft: minsLeft
    };
}