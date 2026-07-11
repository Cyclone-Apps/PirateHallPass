// ==========================================
// MASTER UI UPDATER
// ==========================================
export function updateAllUI(lockdownState) {
    updateStudentUI(lockdownState);
    updateTeacherUI(lockdownState);
    updateAdminUI(lockdownState);
}

// ==========================================
// DASHBOARD-SPECIFIC UPDATERS
// ==========================================
export function updateStudentUI(state) {
    const announcementWidget = document.getElementById("admin-messages-widget");
    const announcementContainer = document.getElementById("admin-messages-container");
    const mapBtn = document.getElementById("btn-open-map");
    
    // 1. MAP BUTTON LOGIC (Only lock visibly for LOUD lockdowns)
    if (mapBtn) {
        if (state.isLoud) {
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

    // 2. MESSAGE CENTER LOGIC
    if (announcementWidget && announcementContainer) {
        const blinkerCSS = `<style>@keyframes blinker { 50% { opacity: 0.2; } }</style>`;

        if (state.isLoud) {
            announcementWidget.style.background = "#ffebee"; 
            announcementWidget.style.borderColor = "var(--pirate-red)";
            
            const introHTML = state.loudStudentIntro ? `<div style="text-align: center; font-weight: 900; color: var(--pirate-red); font-size: 1.1rem; padding: 5px 0; animation: blinker 1.5s linear infinite;">${state.loudStudentIntro}</div>` : "";
            const msgHTML = state.loudStudentMsg ? `<p style="color: #c62828; margin: 5px 0 0 0; font-size: 0.85rem; text-align: center; font-weight: bold;">${state.loudStudentMsg}</p>` : "";

            announcementContainer.innerHTML = introHTML + msgHTML + blinkerCSS;
            
        } else if (state.isQuiet && state.quietShowToStudents === true) {
            // Admin flipped the switch to show a message during a Quiet Lockdown!
            announcementWidget.style.background = "#fff3e0"; // Soft orange warning bg
            announcementWidget.style.borderColor = "#f57f17";

            const introHTML = state.quietStudentIntro ? `<div style="text-align: center; font-weight: 900; color: #f57f17; font-size: 1.1rem; padding: 5px 0; animation: blinker 1.5s linear infinite;">${state.quietStudentIntro}</div>` : "";
            const msgHTML = state.quietStudentMsg ? `<p style="color: #e65100; margin: 5px 0 0 0; font-size: 0.85rem; text-align: center; font-weight: bold;">${state.quietStudentMsg}</p>` : "";

            announcementContainer.innerHTML = introHTML + msgHTML + blinkerCSS;
            
        } else {
            // Normal state (or Quiet lockdown with the toggle turned OFF)
            announcementWidget.style.background = "white";
            announcementWidget.style.borderColor = "var(--pirate-silver)";
            announcementContainer.innerHTML = window.currentAdminAnnouncementText 
                ? `<div style="padding: 5px;">${window.currentAdminAnnouncementText}</div>`
                : `<p style="color: #888; font-style: italic; margin: 5px 0; text-align: center;">No active announcements.</p>`;
        }
    }
}

function updateTeacherUI(state) {
    const banner = document.getElementById("emergency-alert-banner");
    const ribbon = document.getElementById("message-center-widget");
    
    if (!banner) return; 

    // Inject the CSS animation rule just in case it doesn't exist globally
    const blinkerCSS = `<style>@keyframes blinker { 50% { opacity: 0.2; } }</style>`;

    if (state.isLoud) {
        banner.classList.remove("hidden");
        banner.style.backgroundColor = "#c62828"; 
        banner.style.color = "white";
        banner.style.padding = "15px";
        banner.style.textAlign = "center";
        
        const introHTML = state.loudTeacherIntro ? `<span style="animation: blinker 1.5s linear infinite; font-weight: 900;">${state.loudTeacherIntro}</span>` : "";
        const msgHTML = state.loudTeacherMsg || "🚨 <strong>LOUD LOCKDOWN ACTIVE</strong> - Lock doors, turn off lights, and seek cover immediately! 🚨";
        
        banner.innerHTML = `${introHTML} ${msgHTML} ${blinkerCSS}`;
        
        if (ribbon) {
            ribbon.classList.add("lockdown-mode"); 
            ribbon.classList.remove("quiet-lockdown-mode");
        }
    } else if (state.isQuiet) {
        banner.classList.remove("hidden");
        banner.style.backgroundColor = "#ef6c00"; 
        banner.style.color = "white";
        banner.style.padding = "15px";
        banner.style.textAlign = "center";
        
        const introHTML = state.quietTeacherIntro ? `<span style="animation: blinker 1.5s linear infinite; font-weight: 900;">${state.quietTeacherIntro}</span>` : "";
        const msgHTML = state.quietTeacherMsg || "⚠️ <strong>QUIET LOCKDOWN ACTIVE</strong> - Lock classroom doors. NO hall passes permitted. ⚠️";
        
        banner.innerHTML = `${introHTML} ${msgHTML} ${blinkerCSS}`;
        
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

function updateAdminUI(state) {
    const title = document.getElementById("emergency-status-title");
    const msg = document.getElementById("emergency-status-msg");
    const box = document.getElementById("emergency-status-box");
    const btnLoud = document.getElementById("btn-toggle-loud-lockdown");
    const btnQuiet = document.getElementById("btn-toggle-quiet-lockdown");

    if (!title || !msg || !box || !btnLoud || !btnQuiet) return; 

    if (state.isLoud) {
        box.style.background = "#ffebee";
        box.style.borderColor = "var(--pirate-red)";
        title.style.color = "var(--pirate-red)";
        title.innerText = "🚨 LOUD LOCK DOWN ACTIVE";
        msg.innerText = "All rooms are in LOUD LOCK DOWN. Visible to both Students and Teachers.";
        
        btnLoud.innerText = "🔓 Remove Loud Lockdown";
        btnLoud.style.backgroundColor = "#2e7d32"; 
        btnQuiet.style.display = "none"; 
    } 
    else if (state.isQuiet) {
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