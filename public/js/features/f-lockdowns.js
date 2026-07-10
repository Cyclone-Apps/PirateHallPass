import { doc, onSnapshot, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../firebase-config.js"; 

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

        // Auto-update UI based on whichever dashboard is currently open
        updateStudentUI();
        updateTeacherUI();
        updateAdminUI();

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
        // Quiet lockdown hides the exact reason from the student
        return { 
            allowed: false, 
            message: "Pass creation and returning is temporarily disabled. Please wait and try again shortly." 
        };
    }
    return { allowed: true };
}

// ==========================================
// 5. DASHBOARD UI UPDATERS
// ==========================================

function updateStudentUI() {
    const announcementWidget = document.getElementById("admin-messages-widget");
    const announcementContainer = document.getElementById("admin-messages-container");
    const mapBtn = document.getElementById("btn-open-map");
    
    const isLockedDown = isLoudLockdownActive || isQuietLockdownActive;

    // Toggle Map Button
    if (mapBtn) {
        if (isLockedDown) {
            mapBtn.innerHTML = "🛑 No Passes Are Allowed At This Moment";
            mapBtn.disabled = true;
            mapBtn.style.backgroundColor = "#c62828";
            mapBtn.style.opacity = "0.8";
            mapBtn.style.cursor = "not-allowed";
        } else {
            mapBtn.innerHTML = "🗺️ Open School Map";
            mapBtn.disabled = false;
            mapBtn.style.backgroundColor = ""; 
            mapBtn.style.opacity = "1";
            mapBtn.style.cursor = "pointer";
        }
    }

    // Toggle Announcement Box
    if (announcementWidget && announcementContainer) {
        if (isLoudLockdownActive) {
            announcementWidget.style.background = "#ffebee"; 
            announcementWidget.style.borderColor = "var(--pirate-red)";
            announcementContainer.innerHTML = `
                <div style="text-align: center; font-weight: 900; color: var(--pirate-red); font-size: 1.1rem; padding: 5px 0; animation: blinker 1.5s linear infinite;">
                    🚨 EMERGENCY LOCKDOWN ACTIVE 🚨
                </div>
                <p style="color: #c62828; margin: 5px 0 0 0; font-size: 0.85rem; text-align: center; font-weight: bold;">
                    Please remain in your classroom until cleared by administration.
                </p>
                <style>@keyframes blinker { 50% { opacity: 0.2; } }</style>
            `;
        } else {
            announcementWidget.style.background = "white";
            announcementWidget.style.borderColor = "var(--pirate-silver)";
            announcementContainer.innerHTML = window.currentAdminAnnouncementText 
                ? `<div style="padding: 5px;">${window.currentAdminAnnouncementText}</div>`
                : `<p style="color: #888; font-style: italic; margin: 5px 0; text-align: center;">No active announcements.</p>`;
        }
    }
}

function updateTeacherUI() {
    const banner = document.getElementById("emergency-alert-banner");
    const ribbon = document.getElementById("message-center-widget");
    
    if (!banner) return; // Not on Teacher page

    if (isLoudLockdownActive) {
        banner.classList.remove("hidden");
        banner.style.backgroundColor = "#c62828"; 
        banner.style.color = "white";
        banner.style.padding = "15px";
        banner.style.textAlign = "center";
        banner.innerHTML = "🚨 <strong>LOUD LOCKDOWN ACTIVE</strong> - Lock doors, turn off lights, and seek cover immediately! 🚨";
        
        if (ribbon) {
            ribbon.classList.add("lockdown-mode"); 
            ribbon.classList.remove("quiet-lockdown-mode");
        }
    } else if (isQuietLockdownActive) {
        banner.classList.remove("hidden");
        banner.style.backgroundColor = "#ef6c00"; 
        banner.style.color = "white";
        banner.style.padding = "15px";
        banner.style.textAlign = "center";
        banner.innerHTML = "⚠️ <strong>QUIET LOCKDOWN ACTIVE</strong> - Lock classroom doors. Continue teaching, but NO hall passes permitted. ⚠️";
        
        if (ribbon) {
            ribbon.classList.add("lockdown-mode"); 
            ribbon.classList.add("quiet-lockdown-mode");
        }
    } else {
        banner.classList.add("hidden");
        banner.innerHTML = "";
        
        if (ribbon) {
            ribbon.classList.remove("lockdown-mode");
            ribbon.classList.remove("quiet-lockdown-mode");
        }
    }
}

function updateAdminUI() {
    const title = document.getElementById("emergency-status-title");
    const msg = document.getElementById("emergency-status-msg");
    const box = document.getElementById("emergency-status-box");
    const btnLoud = document.getElementById("btn-toggle-loud-lockdown");
    const btnQuiet = document.getElementById("btn-toggle-quiet-lockdown");

    if (!title || !msg || !box || !btnLoud || !btnQuiet) return; // Not on Admin page

    if (isLoudLockdownActive) {
        box.style.background = "#ffebee";
        box.style.borderColor = "var(--pirate-red)";
        title.style.color = "var(--pirate-red)";
        title.innerText = "🚨 LOUD LOCK DOWN ACTIVE";
        msg.innerText = "All rooms are in LOUD LOCK DOWN. Visible to both Students and Teachers.";
        
        btnLoud.innerText = "🔓 Remove Loud Lockdown";
        btnLoud.style.backgroundColor = "#2e7d32"; 
        btnQuiet.style.display = "none"; 
    } 
    else if (isQuietLockdownActive) {
        box.style.background = "#fff3cd"; 
        box.style.borderColor = "#ffa000";
        title.style.color = "#b78103";
        title.innerText = "🤫 QUIET LOCK DOWN ACTIVE";
        msg.innerText = "All rooms are in QUIET LOCK DOWN. Visible ONLY to Teachers.";
        
        btnQuiet.innerText = "🔓 Remove Quiet Lockdown";
        btnQuiet.style.backgroundColor = "#2e7d32"; 
        btnLoud.style.display = "none"; 
    } 
    else {
        box.style.background = "#e8f5e9"; 
        box.style.borderColor = "#4caf50";
        title.style.color = "#2e7d32";
        title.innerText = "✅ System Operating Normally";
        msg.innerText = "The building is operating normal.";
        
        btnLoud.style.display = "block";
        btnLoud.innerText = "🚨 Loud Lock Down All Rooms";
        btnLoud.style.backgroundColor = "var(--pirate-red)";
        
        btnQuiet.style.display = "block";
        btnQuiet.innerText = "🤫 Quiet Lock Down All Rooms";
        btnQuiet.style.backgroundColor = "#616161"; 
    }
}