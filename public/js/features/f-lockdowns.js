import { doc, onSnapshot, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../firebase-config.js"; 
import { updateAllUI } from "./f-lockdowns-ui.js";

// ==========================================
// 1. GLOBAL STATE VARIABLES
// ==========================================
export let isLoudLockdownActive = false;
export let isQuietLockdownActive = false;
export let lockedCorridorsList = [];

// ==========================================
// 2. FIREBASE LISTENER (Runs on all dashboards)
// ==========================================
export function initLockdownListener(onStateChangeCallback = null) {
    const settingsDoc = doc(db, "settings", "emergencyState");
    
    return onSnapshot(settingsDoc, (docSnap) => {
        const state = docSnap.exists() ? docSnap.data() : { globalLockdown: false, quietLockdown: false, lockedAreas: [] };
        
        isLoudLockdownActive = state.globalLockdown || false;
        isQuietLockdownActive = state.quietLockdown || false;
        lockedCorridorsList = state.lockedCorridors || [];

        // Track in window for legacy support while we transition
        window.currentLoudLockdown = isLoudLockdownActive;
        window.currentQuietLockdown = isQuietLockdownActive;
        window.lockedCorridors = lockedCorridorsList;
        window.emergencyState = state;

        // Auto-update UI based on whichever dashboard is currently open
        updateAllUI({ 
            isLoud: isLoudLockdownActive, 
            isQuiet: isQuietLockdownActive,
            // 🌟 NEW: Pass the intros AND the messages!
            loudTeacherIntro: state.loudTeacherIntro,
            loudTeacherMsg: state.loudTeacherMsg,
            quietTeacherIntro: state.quietTeacherIntro,
            quietTeacherMsg: state.quietTeacherMsg,
            loudStudentIntro: state.loudStudentIntro,
            loudStudentMsg: state.loudStudentMsg,
            quietStudentIntro: state.quietStudentIntro,
            quietStudentMsg: state.quietStudentMsg,
            quietShowToStudents: state.quietShowToStudents
        });

        if (onStateChangeCallback) onStateChangeCallback(state);
    });
}

// ==========================================
// 3. FIREBASE SETTER (Used by Admin Dashboard)
// ==========================================
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

// ==========================================
// 3.5. TOGGLE HELPER (Used by Admin Buttons)
// ==========================================
export async function triggerEmergencyToggle(type) {
    if (type === "loud") {
        return await setEmergencyState({ 
            globalLockdown: !isLoudLockdownActive, 
            quietLockdown: false 
        });
    } else if (type === "quiet") {
        return await setEmergencyState({ 
            quietLockdown: !isQuietLockdownActive, 
            globalLockdown: false 
        });
    }
}

// ==========================================
// 4. GATEKEEPER CHECK (For Create & Return Pass)
// ==========================================
export function evaluateLockdownState() {
    if (isLoudLockdownActive) {
        return { 
            allowed: false, 
            message: "🚨 LOUD LOCKDOWN ACTIVE: Movement in the hallways is currently restricted. Please remain where you are. Do not create or use passes." 
        };
    }
    if (isQuietLockdownActive) {
        // Quiet lockdown acts like a standard timeout so students don't panic
        return { 
            allowed: false, 
            message: "This pass is temporarily unavailable. Please try again in 5 minutes." 
        };
    }
    return { allowed: true };
}