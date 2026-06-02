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
 * Converts a time string "08:15" into total minutes since midnight
 */
export function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
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

    const now = getAdjustedNow(); // <-- Uses the Offset Time!
    const currentMins = (now.getHours() * 60) + now.getMinutes();

    let activePeriod = null;
    let nextPeriod = null;
    let isPassing = false;
    let minsLeft = 0;

    const periods = Object.keys(scheduleData).map(p => ({
        name: p,
        startMins: timeToMinutes(scheduleData[p].start),
        endMins: timeToMinutes(scheduleData[p].end)
    })).sort((a, b) => a.startMins - b.startMins);

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