// js/modules/admin-engine.js
import { db } from "../firebase-config.js";
import { collection, doc, setDoc, getDoc, getDocs, onSnapshot, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const studentsRef = collection(db, "students");

/**
 * Saves a student to Firebase. Uses { merge: true } so manual restrictions are NOT overwritten.
 */
export async function upsertStudentData(studentId, studentData) {
    try {
        const studentDoc = doc(db, "students", studentId);
        // merge: true is the magic that protects your manually entered restrictions!
        await setDoc(studentDoc, studentData, { merge: true });
        return true;
    } catch (error) {
        console.error("Error upserting student:", error);
        return false;
    }
}

/**
 * Updates JUST the restriction fields for a specific student in a dedicated decoupled collection.
 */
export async function updateStudentRestrictions(studentId, restrictions, oldPeers = []) {
    try {
        // 1. Save primary restrictions to the dedicated collection
        const restrictionDoc = doc(db, "restrictions", studentId);
        await setDoc(restrictionDoc, restrictions);

        const newPeers = restrictions.noContact || [];

        // 2. Mirror System: Find newly added peers and append this student to their lists!
        const addedPeers = newPeers.filter(p => !oldPeers.includes(p));
        for (const peerId of addedPeers) {
            const peerDoc = doc(db, "restrictions", peerId);
            await setDoc(peerDoc, { noContact: arrayUnion(studentId) }, { merge: true });
        }

        // 3. Mirror System: Find removed peers and scrub this student from their lists!
        const removedPeers = oldPeers.filter(p => !newPeers.includes(p));
        for (const peerId of removedPeers) {
            const peerDoc = doc(db, "restrictions", peerId);
            await setDoc(peerDoc, { noContact: arrayRemove(studentId) }, { merge: true });
        }

        return true;
    } catch (error) {
        console.error("Error saving restrictions:", error);
        return false;
    }
}

/**
 * Listens to all decoupled restrictions in real-time
 */
export function listenToAllRestrictions(callback) {
    const restrictionsRef = collection(db, "restrictions");
    return onSnapshot(restrictionsRef, (snapshot) => {
        const restrictionsMap = {};
        snapshot.forEach(doc => {
            restrictionsMap[doc.id] = doc.data();
        });
        callback(restrictionsMap);
    });
}

/**
 * Listens to all students for the Admin UI list
 */
export function listenToAllStudents(callback) {
    return onSnapshot(studentsRef, (snapshot) => {
        const students = [];
        snapshot.forEach(doc => {
            students.push({ id: doc.id, ...doc.data() });
        });
        callback(students);
    });
}

/**
 * Saves a specific Bell Schedule type to the global settings document.
 */
export async function saveBellSchedule(scheduleType, timeData) {
    try {
        const settingsDoc = doc(db, "settings", "bellSchedules");
        // We use merge: true so saving "Regular" doesn't overwrite "Late Start"
        await setDoc(settingsDoc, { [scheduleType]: timeData }, { merge: true });
        return true;
    } catch (error) {
        console.error("Error saving bell schedule:", error);
        return false;
    }
}

/**
 * Fetches all saved Bell Schedules
 */
export async function fetchBellSchedules() {
    try {
        const snapshot = await getDocs(collection(db, "settings"));
        
        let schedules = null;
        snapshot.forEach(doc => {
            if (doc.id === "bellSchedules") schedules = doc.data();
        });
        return schedules || {}; 
    } catch (error) {
        console.error("Error fetching bell schedules:", error);
        return {};
    }
}

/**
 * Sets the Global Emergency State
 * @param {Object} emergencyData - e.g., { globalLockdown: true, lockedAreas: [] }
 */
export async function setEmergencyState(emergencyData) {
    try {
        const settingsDoc = doc(db, "settings", "emergencyState");
        await setDoc(settingsDoc, emergencyData, { merge: true });
        return true;
    } catch (error) {
        console.error("Error setting emergency state:", error);
        return false;
    }
}

/**
 * Listens for Emergency State changes in real-time
 */
export function listenToEmergencyState(callback) {
    const settingsDoc = doc(db, "settings", "emergencyState");
    return onSnapshot(settingsDoc, (docSnap) => {
        if (docSnap.exists()) {
            callback(docSnap.data());
        } else {
            // Added quietLockdown to the default fallback state
            callback({ globalLockdown: false, quietLockdown: false, lockedAreas: [] });
        }
    });
}

/**
 * Sets the active global schedule for the day (e.g., "HS - Regular")
 */
export async function setActiveDailySchedule(scheduleName) {
    try {
        const settingsDoc = doc(db, "settings", "dailyConfig");
        await setDoc(settingsDoc, { activeSchedule: scheduleName }, { merge: true });
        return true;
    } catch (error) {
        console.error("Error setting daily schedule:", error);
        return false;
    }
}

/**
 * Listens for changes to the active daily schedule
 */
export function listenToDailyConfig(callback) {
    const settingsDoc = doc(db, "settings", "dailyConfig");
    return onSnapshot(settingsDoc, (docSnap) => {
        if (docSnap.exists()) {
            callback(docSnap.data());
        } else {
            callback({ activeSchedule: "HS - Regular" }); // Default fallback
        }
    });
}

/**
 * Saves the global time offset (in SECONDS)
 */
export async function saveTimeOffset(offsetSeconds) {
    try {
        const settingsDoc = doc(db, "settings", "timeConfig");
        await setDoc(settingsDoc, { offsetSeconds: parseInt(offsetSeconds) || 0 }, { merge: true });
        return true;
    } catch (error) {
        console.error("Error saving time offset:", error);
        return false;
    }
}

/**
 * Listens for changes to the time offset globally (in SECONDS)
 */
export function listenToTimeOffset(callback) {
    const settingsDoc = doc(db, "settings", "timeConfig");
    return onSnapshot(settingsDoc, (docSnap) => {
        if (docSnap.exists()) {
            callback(docSnap.data().offsetSeconds || 0);
        } else {
            callback(0);
        }
    });
}

/**
 * Saves the compiled Academic Calendar mapping to Firestore
 */
export async function saveAcademicCalendar(calendarData) {
    try {
        const calDoc = doc(db, "system", "calendar");
        await setDoc(calDoc, calendarData); 
        return true;
    } catch (error) {
        console.error("Error saving calendar:", error);
        return false;
    }
}

/**
 * Fetches the entire Academic Calendar dictionary from Firestore
 */
export async function fetchAcademicCalendar() {
    try {
        const calDoc = doc(db, "system", "calendar");
        const snap = await getDoc(calDoc);
        if (snap.exists()) return snap.data();
        return {};
    } catch (error) {
        console.error("Error fetching calendar:", error);
        return {};
    }
}

/**
 * Fetches the Google Calendar Configuration
 */
export async function fetchGCalConfig() {
    try {
        // Corrected path from your original code!
        const docRef = doc(db, "system", "settings");
        const snap = await getDoc(docRef);
        if (snap.exists()) return snap.data();
        return null;
    } catch (error) {
        console.error("Error fetching GCal config:", error);
        return null;
    }
}

/**
 * Saves the Google Calendar Configuration
 */
export async function saveGCalConfig(configData) {
    try {
        // Corrected path from your original code!
        const docRef = doc(db, "system", "settings");
        await setDoc(docRef, configData, { merge: true });
        return true;
    } catch (error) {
        console.error("Error saving GCal config:", error);
        return false;
    }
}