// js/modules/student-ui.js
import { schoolMapSVG } from "../map.js"; 
import { doc, onSnapshot, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../firebase-config.js";

// Keep a global reference to the student's profile so the 1-second interval can read it!
window.currentStudentProfile = null;
// Pre-initialize global variables so re-renders don't wipe data out!
window.menuData = window.menuData || { today: "🔄 Loading...", tomorrow: "🔄 Loading..." };
window.showingTomorrow = window.showingTomorrow || false;
window.currentRotationDayText = window.currentRotationDayText || "🔄 Loading Day...";
window.currentAdminAnnouncementText = window.currentAdminAnnouncementText || "";

export function renderStudentIdleScreen() {
    const container = document.getElementById("kiosk-main-widget");
    if (!container) return;
    
    container.style.backgroundColor = ""; 

    let displayName = "Pirate";
    if (window.currentUser && window.currentUser.displayName) {
        displayName = window.currentUser.displayName;
    }

    // Check if ANY lockdown is active
    const isLockedDown = window.currentLoudLockdown || window.currentQuietLockdown;

    // Draw the button differently based on the lockdown state
    let buttonHTML = isLockedDown 
        ? `<button id="btn-open-map" class="primary-btn" style="font-size: 1.5rem; padding: 20px 40px; width: 100%; background-color: #c62828; cursor: not-allowed; opacity: 0.8;" disabled>
               🛑 No Passes Are Allowed At This Moment
           </button>`
        : `<button id="btn-open-map" class="primary-btn" style="font-size: 1.5rem; padding: 20px 40px; width: 100%;">
               🗺️ Open School Map
           </button>`;

    container.innerHTML = `
        <div class="kiosk-card">
            <h1 style="color: var(--pirate-red); font-size: 2.5rem; margin-bottom: 10px;">Where to, ${displayName}?</h1>
            <p style="color: #666; margin-bottom: 30px;">Select a destination to request a hall pass.</p>
            ${buttonHTML}
            <p style="margin-top: 20px; font-size: 0.9rem; color: #888;">Your teacher must approve the request before you leave.</p>
        </div>
    `;
    
    // Ensure the message center also checks its state if a redraw happens
    if (typeof window.updateEmergencyUI === "function") {
        window.updateEmergencyUI();
    }
}

export function renderStudentSidebar(studentProfile = null) {
    window.currentStudentProfile = studentProfile; // Store for dynamic time updates!
    
    const container = document.getElementById("kiosk-sidebar-widget");
    if (!container) return;

    let fullScheduleRows = "";

    // Generate the Full Schedule Data for the Popup Modal
    if (studentProfile && studentProfile.schedule) {
        const scheduleData = studentProfile.schedule;
        
        // Safely sort periods numerically
        const periods = Object.keys(scheduleData).sort((a, b) => {
            const numA = parseInt(a);
            const numB = parseInt(b);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.localeCompare(b);
        });

        periods.forEach(p => {
            const classInfo = scheduleData[p];
            const className = classInfo.courseName || "Class";
            const roomNum = classInfo.room || "TBA";
            const teacher = classInfo.teacher || "N/A";

            fullScheduleRows += `
                <div style="background: #f8f9fa; border-left: 4px solid var(--pirate-silver); padding: 10px; margin-bottom: 8px; border-radius: 4px;">
                    <strong style="color: #333;">Period ${p}:</strong> ${className}<br>
                    <div style="font-size: 0.85rem; color: #555; margin-top: 2px;">Rm: ${roomNum} | Teacher: ${teacher}</div>
                </div>
            `;
        });
    }

    // Render the Sidebar with the Message Center, Schedule, and Meal Menu fieldsets
    container.innerHTML = `
        <fieldset id="admin-messages-widget" style="border: 2px solid var(--pirate-silver); border-radius: 8px; padding: 5px 15px 10px 15px; margin-bottom: 8px; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.05); position: relative; box-sizing: border-box; transition: all 0.3s ease;">
            <legend style="font-weight: bold; color: #444; padding: 0 8px; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px; margin-left: 8px;">
                📢 Message Center
            </legend>
            <div id="admin-messages-container" style="font-size: 0.95rem; color: #444; line-height: 1.4; margin-top: 5px;">
                ${window.currentAdminAnnouncementText ? `<div style="padding: 5px;">${window.currentAdminAnnouncementText}</div>` : "<p style='color: #888; font-style: italic; margin: 5px 0; text-align: center;'>Loading announcements...</p>"}
            </div>
        </fieldset>

        <fieldset style="border: 2px solid var(--pirate-silver); border-radius: 8px; padding: 15px; margin-bottom: 15px; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.05); position: relative; box-sizing: border-box;">
            <legend style="font-weight: bold; color: #444; padding: 0 8px; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px; margin-left: 8px;">
                Schedule
            </legend>
            
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid #f0f0f0;">
                <span id="schedule-rotation-display" style="color: var(--pirate-red); font-size: 1.25rem; font-weight: 900; letter-spacing: 0.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${window.currentRotationDayText}
                </span>
                <button id="btn-open-full-schedule" style="background: white; border: 1px solid #ced4da; border-radius: 4px; padding: 4px 8px; font-size: 1.1rem; cursor: pointer; transition: 0.2s;" title="View Full Schedule" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='white'">📅</button>
            </div>
            
            <div id="dynamic-schedule-container" style="margin-top: 5px;">
                <p style="color: #888; font-size: 0.85rem; text-align: center; margin: 5px 0; font-style: italic;">Syncing clock...</p>
            </div>
        </fieldset>

        <fieldset style="border: 2px solid var(--pirate-silver); border-radius: 8px; padding: 15px; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.05); position: relative; box-sizing: border-box;">
            <legend style="font-weight: bold; color: #444; padding: 0 8px; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px; margin-left: 8px;">
                🍽️ Menus (<span id="menu-rotation-display">${window.currentRotationDayText}</span>)
            </legend>
            
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid #f0f0f0;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span id="menu-day-title" style="color: #333; font-size: 1.15rem; font-weight: bold; white-space: nowrap;">
                        ${window.showingTomorrow ? "Tomorrow's Meals" : "Today's Meals"}
                    </span>
                    <button id="btn-toggle-menu-day" onclick="window.toggleMenuDay()" style="background: none; border: none; cursor: pointer; font-size: 1.1rem; padding: 0; line-height: 1; transition: 0.2s;" title="Toggle Day">${window.showingTomorrow ? "⬅️" : "➡️"}</button>
                </div>
                <a href="https://calendar.google.com/calendar/embed?src=postville.k12.ia.us_500jtlgkca5rfjv1qq310d7c2o%40group.calendar.google.com&ctz=America%2FChicago" target="_blank" style="text-decoration: none; display: flex;">
                    <button style="background: white; border: 1px solid #ced4da; border-radius: 4px; padding: 4px 8px; font-size: 1.1rem; cursor: pointer; transition: 0.2s;" title="View Full Menu Calendar" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='white'">📅</button>
                </a>
            </div>
            
            <div id="active-menu-display" style="font-size: 0.9rem; line-height: 1.4; background: #f8f9fa; padding: 10px; border-radius: 4px; border-left: 3px solid var(--pirate-red);">
                ${window.showingTomorrow ? window.menuData.tomorrow : window.menuData.today}
            </div>
        </fieldset>
    `;

    // Ensure the Full Schedule Modal exists in the DOM
    if (!document.getElementById("full-schedule-modal")) {
        const modalDiv = document.createElement("div");
        modalDiv.id = "full-schedule-modal";
        modalDiv.className = "hidden";
        modalDiv.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 9999;";
        modalDiv.innerHTML = `
            <div style="background: white; padding: 25px; border-radius: 12px; width: 90%; max-width: 420px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); position: relative; max-height: 80vh; display: flex; flex-direction: column;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #eee; padding-bottom: 10px; margin-bottom: 15px;">
                    <h3 style="margin: 0; color: var(--pirate-red);">📋 Full Schedule</h3>
                    <span id="close-full-schedule" style="cursor: pointer; font-size: 1.5rem; color: #666; font-weight: bold; line-height: 1;">&times;</span>
                </div>
                <div id="full-schedule-content" style="overflow-y: auto; flex-grow: 1; padding-right: 5px;"></div>
            </div>
        `;
        document.body.appendChild(modalDiv);

        document.getElementById("close-full-schedule").addEventListener("click", () => {
            modalDiv.classList.add("hidden");
        });
    }

    const contentBox = document.getElementById("full-schedule-content");
    if (contentBox) contentBox.innerHTML = fullScheduleRows || "<p style='color: #777;'>No schedule data found.</p>";

    document.getElementById("btn-open-full-schedule").addEventListener("click", () => {
        document.getElementById("full-schedule-modal").classList.remove("hidden");
    });

    // ✨ GUARANTEE: Force checking emergency status every time sidebar redraws
    if (typeof window.updateEmergencyUI === "function") {
        window.updateEmergencyUI();
    }
}

/**
 * 1-SECOND INTERVAL HOOK: Dynamically calculates Current/Next classes.
 * Treats Passing Periods as the start of the next class!
 */
window.updateStudentScheduleWidget = function(timeMetrics) {
    const container = document.getElementById("dynamic-schedule-container");
    if (!container) return;

    const profile = window.currentStudentProfile;
    if (!profile || !profile.schedule) {
        container.innerHTML = `<p style="color: #666; font-size: 0.85rem; text-align: center; margin: 5px 0;">Schedule unavailable.</p>`;
        return;
    }

    // Direct extraction of processed data provided by the active time interval loop
    const currentPeriod = timeMetrics?.currentPeriod || null;
    const nextPeriod = timeMetrics?.nextPeriod || null;
    const sched = profile.schedule;

    let html = '';
    
    if (currentPeriod && sched[currentPeriod]) {
        html += `
            <div style="margin-bottom: 10px;">
                <div style="font-size: 0.7rem; color: #2e7d32; font-weight: bold; text-transform: uppercase; margin-bottom: 2px;">📍 Current</div>
                <div style="background: #e8f5e9; border-left: 3px solid #4caf50; padding: 6px 8px; border-radius: 4px; font-size: 0.85rem; line-height: 1.3;">
                    <strong style="color: #1b5e20;">P${currentPeriod}:</strong> ${sched[currentPeriod].courseName}<br>
                    <span style="color: #555;">Room: ${sched[currentPeriod].room || "N/A"}</span>
                </div>
            </div>`;
    }

    if (nextPeriod && sched[nextPeriod]) {
        html += `
            <div>
                <div style="font-size: 0.7rem; color: #1565c0; font-weight: bold; text-transform: uppercase; margin-bottom: 2px;">➡️ Next</div>
                <div style="background: #e3f2fd; border-left: 3px solid #2196f3; padding: 6px 8px; border-radius: 4px; font-size: 0.85rem; line-height: 1.3;">
                    <strong style="color: #0d47a1;">P${nextPeriod}:</strong> ${sched[nextPeriod].courseName}<br>
                    <span style="color: #555;">Room: ${sched[nextPeriod].room || "N/A"}</span>
                </div>
            </div>`;
    }

    if (!html) {
         html = `<p style="color: #777; font-style: italic; font-size: 0.85rem; margin: 5px 0; text-align: center;">Outside active schedule.</p>`;
    }

    container.innerHTML = html;
};

export function renderRecentTravelsSidebar(recentTravels) {
    const container = document.getElementById("kiosk-sidebar-widget");
    if (!container) return;

    let historyHTML = recentTravels.map(t => 
        `<div style="background: white; padding: 15px; border-radius: 8px; margin-bottom: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            <strong style="font-size: 1.2rem; color: #333;">${t.destination}</strong><br>
            <span style="color: #666; font-size: 0.9rem;">🕒 ${t.time}</span>
        </div>`
    ).join("");

    container.innerHTML = `
        <div style="background: #fff3cd; border: 2px solid #ffeeba; padding: 20px; border-radius: var(--radius); height: 100%;">
            <h2 style="color: #856404; margin-top: 0; border-bottom: 2px solid #ffeeba; padding-bottom: 10px;">
                ⚠️ Recent Travels (Past 2 Hrs)
            </h2>
            <div style="margin-top: 15px;">
                ${historyHTML}
            </div>
        </div>
    `;
}

export function renderMapModal() {
    const container = document.getElementById("map-modal-container");
    if (!container) return;

    container.innerHTML = `
        <div id="map-modal" class="hidden">
            <div class="map-header">
                <h2 style="margin: 0; color: var(--pirate-red);">Select Destination</h2>
                <span class="close-modal" id="close-map-modal" style="cursor: pointer; font-size: 1.5rem; font-weight: bold;">✖</span>
            </div>
            <div class="map-viewport">
                <div class="map-canvas-container">
                    ${schoolMapSVG}
                </div>
            </div>
            <div style="padding: 20px; background: white; text-align: center; border-top: 2px solid var(--pirate-silver); display: flex; flex-direction: column; align-items: center; gap: 15px;">
                <p id="selected-room-label" style="font-size: 1.3rem; font-weight: bold; margin: 0; color: #333;">Select a room on the map</p>
                <button id="btn-confirm-destination" class="primary-btn" style="padding: 15px 30px; font-size: 1.1rem;" disabled>Confirm Destination</button>
            </div>
        </div>
    `;
}

export function renderStudentWaitingScreen(pass, statusData) {
    const container = document.getElementById("kiosk-main-widget");
    if (!container) return;

    let bgColor, textColor, titleColor;
    let buttonsHtml = '';
    let extraInfoHtml = '';

    if (statusData.statusLevel === 'red') {
        bgColor = "#f8d7da"; textColor = "#721c24"; titleColor = "#721c24";
        
        let studentMessage = "This pass is currently not allowed for you.";
        if (statusData.restrictionType === 'temporary') {
            studentMessage += "<br><br><span style='font-size: 1.2rem; opacity: 0.9;'>Please try again in 5 minutes.</span>";
        } else if (statusData.restrictionType === 'capacity') {
            studentMessage += `<br><br><span style='font-size: 1.2rem; opacity: 0.9;'>⏳ Waitlist Position: <strong>${statusData.waitlistPosition}</strong></span>`;
        }

        extraInfoHtml = `
            <div style="background: white; color: #721c24; padding: 20px; border-radius: 8px; margin: 20px auto; max-width: 80%; border: 2px solid #f5c6cb;">
                <strong style="font-size: 1.2rem;">🛑 RESTRICTED REQUEST</strong><br><br>
                ${studentMessage}
            </div>
        `;

        buttonsHtml = `
            <button id="btn-teacher-reject" data-id="${pass.id}" class="danger-btn" style="width: 100%; max-width: 300px; font-size: 1.4rem; padding: 20px;">
                ❌ Cancel Request
            </button>
        `;
    } else {
        bgColor = statusData.statusLevel === 'yellow' ? "#fff3cd" : "#d4edda"; 
        textColor = statusData.statusLevel === 'yellow' ? "#856404" : "#155724"; 
        titleColor = statusData.statusLevel === 'yellow' ? "#856404" : "#155724";
        
        buttonsHtml = `
            <div style="display: flex; gap: 15px; justify-content: center; width: 100%; max-width: 500px; margin: 0 auto;">
                <button id="btn-teacher-approve" data-id="${pass.id}" class="primary-btn" style="flex: 1; font-size: 1.4rem; padding: 20px;">✅ Approve</button>
                <button id="btn-teacher-reject" data-id="${pass.id}" class="danger-btn" style="flex: 1; font-size: 1.4rem; padding: 20px;">❌ Reject</button>
            </div>
        `;
    }

    // 🌟 NEW: Inject the requesting teacher's comment if this pass was scheduled by someone else!
    let teacherNoteHtml = '';
    if (pass.isProxy || pass.senderName) {
        teacherNoteHtml = `
            <div style="background: rgba(255,255,255,0.6); padding: 15px; border-radius: 8px; margin-bottom: 20px; font-size: 1.1rem; color: #444; border: 1px solid rgba(0,0,0,0.1); text-align: left; max-width: 80%; margin-left: auto; margin-right: auto;">
                <strong style="color: #1565c0;">📢 Scheduled By:</strong> ${pass.senderName || "A Teacher"}<br>
                <strong style="color: #1565c0;">Purpose:</strong> ${pass.purpose || "Not specified"}
            </div>
        `;
    }

    container.style.backgroundColor = bgColor;

    container.innerHTML = `
        <div style="width: 100%; max-width: 600px; text-align: center;">
            <p style="color: ${titleColor}; font-size: 1.4rem; font-weight: 500; margin-bottom: 20px; text-transform: uppercase;">
                Teacher Authorization Required<br>
                <span style="font-size: 1.1rem; opacity: 0.8; text-transform: none;">please hand your iPad to your teacher</span>
            </p>
            
            <h1 style="color: ${textColor}; font-size: 4rem; margin: 10px 0; line-height: 1;">
                ${pass.studentDisplayName}
            </h1>
            
            <p style="color: ${textColor}; font-size: 1.8rem; margin-bottom: 15px;">
                Requests to go to <strong>${pass.destination}</strong>
            </p>

            ${teacherNoteHtml}
            ${extraInfoHtml}
            ${buttonsHtml}

            <p style="margin-top: 15px; font-size: 0.9rem; color: ${textColor}; opacity: 0.8;">
                ${statusData.statusLevel === 'red' ? 'Teacher can override restriction from their Teacher Dashboard.' : ''}
            </p>
        </div>
    `;
}

export function renderStudentActiveScreen(pass) {
    const container = document.getElementById("kiosk-main-widget");
    if (!container) return;

    container.style.backgroundColor = ""; 

    container.innerHTML = `
        <div class="active-pass-container">
            <h2 style="color: #e65100; margin-top: 0; font-size: 2rem;">ACTIVE PASS</h2>
            <p style="font-size: 1.2rem; color: #333; margin-bottom: 5px;">
                Destination: <strong>${pass.destination}</strong>
            </p>
            
            <div id="student-timer-display" class="huge-timer" style="color: #333;">00:00</div>
            
            <p style="color: #666; margin-top: 10px; font-weight: bold;">Proceed directly to your destination.</p>
            <div style="margin-top: 30px; border-top: 2px solid #ffe0b2; padding-top: 25px;">
                <h4 style="margin-top: 0; margin-bottom: 15px; color: #e65100;">Teacher Use Only</h4>
                <button id="btn-teacher-return" data-id="${pass.id}" class="toolbar-btn primary-btn" style="width: 100%; padding: 15px; font-size: 1.2rem;">
                    🛑 End Pass (Student Returned)
                </button>
            </div>
        </div>
    `;
}

// --- MEAL MENU ENGINE & PARSERS --- //

window.menuData = { today: "Loading...", tomorrow: "Loading..." };
window.showingTomorrow = false;

window.toggleMenuDay = function() {
    window.showingTomorrow = !window.showingTomorrow;
    window.updateMenuUI();
};

window.updateMenuUI = function() {
    const displayEl = document.getElementById("active-menu-display");
    const titleEl = document.getElementById("menu-day-title");
    const btnEl = document.getElementById("btn-toggle-menu-day");

    if (!displayEl || !titleEl || !btnEl) return;

    if (window.showingTomorrow) {
        titleEl.innerText = "Tomorrow's Meals";
        btnEl.innerText = "⬅️"; 
        displayEl.innerHTML = window.menuData.tomorrow;
    } else {
        titleEl.innerText = "Today's Meals";
        btnEl.innerText = "➡️"; 
        displayEl.innerHTML = window.menuData.today;
    }
};

/**
 * Splits Firestore string by <br> and formats B- and L- prefixes
 */
function parseMenuData(menuStr) {
    if (!menuStr) return "<div style='color: #666;'>Menu data unavailable.</div>";
    
    const parts = menuStr.split('<br>');
    let html = '';
    
    parts.forEach(part => {
        let cleanPart = part.trim();
        if (cleanPart.toUpperCase().startsWith('B-')) {
            html += `<div style="margin-bottom: 8px;"><strong style="color: var(--pirate-red);">Breakfast:</strong> <span style="color: black;">${cleanPart.substring(2).trim()}</span></div>`;
        } 
        else if (cleanPart.toUpperCase().startsWith('L-')) {
            html += `<div style="margin-bottom: 8px;"><strong style="color: var(--pirate-red);">Lunch:</strong> <span style="color: black;">${cleanPart.substring(2).trim()}</span></div>`;
        } 
        else {
            html += `<div style="margin-bottom: 8px; color: black;">${cleanPart}</div>`;
        }
    });
    
    return html;
}

// --- EMERGENCY UI ENGINE --- //
window.updateEmergencyUI = function() {
    const announcementWidget = document.getElementById("admin-messages-widget");
    const announcementContainer = document.getElementById("admin-messages-container");
    const mapBtn = document.getElementById("btn-open-map");
    
    // The button locks if EITHER lockdown is active
    const isLockedDown = window.currentLoudLockdown || window.currentQuietLockdown;

    // 1. INSTANTLY TOGGLE THE MAP BUTTON (If they are on the idle screen)
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
            mapBtn.style.backgroundColor = ""; // Restores to CSS default
            mapBtn.style.opacity = "1";
            mapBtn.style.cursor = "pointer";
        }
    }

    // 2. TOGGLE THE MESSAGE CENTER 
    if (!announcementWidget || !announcementContainer) return; 

    // ONLY Loud Lockdowns trigger the blinking red alert
    if (window.currentLoudLockdown) {
        announcementWidget.style.background = "#ffebee"; 
        announcementWidget.style.borderColor = "var(--pirate-red)";
        
        announcementContainer.innerHTML = `
            <div style="text-align: center; font-weight: 900; color: var(--pirate-red); font-size: 1.1rem; padding: 5px 0; animation: blinker 1.5s linear infinite;">
                🚨 EMERGENCY LOCKDOWN ACTIVE 🚨
            </div>
            <p style="color: #c62828; margin: 5px 0 0 0; font-size: 0.85rem; text-align: center; font-weight: bold;">
                Please remain in your classroom until cleared by administration.
            </p>
            <style>
                @keyframes blinker { 50% { opacity: 0.2; } }
            </style>
        `;
    } else {
        // Restore standard aesthetics (Used for Normal days AND Quiet Lockdowns)
        announcementWidget.style.background = "white";
        announcementWidget.style.borderColor = "var(--pirate-silver)";
        
        // Ensure standard announcements return
        announcementContainer.innerHTML = window.currentAdminAnnouncementText 
            ? `<div style="padding: 5px;">${window.currentAdminAnnouncementText}</div>`
            : `<p style="color: #888; font-style: italic; margin: 5px 0; text-align: center;">No active announcements.</p>`;
    }
};

/**
 * Real-time connection hook that subscribes to system/daily_info
 */
export function initializeRotationDayEngine(db, onSnapshot, doc) {
    if (!db || !onSnapshot || !doc) return;

    onSnapshot(doc(db, "system", "daily_info"), (docSnap) => {
        const schedRotationEl = document.getElementById("schedule-rotation-display");
        const menuRotationEl = document.getElementById("menu-rotation-display");
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Save to memory
            window.currentRotationDayText = data.rotationDay || "Regular Day";
            
            // Save Announcements to Memory
            window.currentAdminAnnouncementText = data.announcements || "";
            
            const announcementContainer = document.getElementById("admin-messages-container");
            const adminWidget = document.getElementById("admin-messages-widget");
            
            // Safety guard checking if widget exists and isn't actively displaying a red loud lockdown alert
            if (announcementContainer && adminWidget && !adminWidget.style.background.includes("ffebee")) {
                announcementContainer.innerHTML = window.currentAdminAnnouncementText 
                    ? `<div style="padding: 5px;">${window.currentAdminAnnouncementText}</div>`
                    : `<p style="color: #888; font-style: italic; margin: 5px 0; text-align: center;">No active announcements.</p>`;
            }
            
            // Update BOTH locations on the screen
            if (schedRotationEl) schedRotationEl.innerText = window.currentRotationDayText;
            if (menuRotationEl) menuRotationEl.innerText = window.currentRotationDayText;
            
            // Parse the data and store it globally
            window.menuData.today = parseMenuData(data.lunchMenu);
            window.menuData.tomorrow = parseMenuData(data.tomorrowMenu);
            
        } else {
            window.currentRotationDayText = "Regular Schedule";
            if (schedRotationEl) schedRotationEl.innerText = window.currentRotationDayText;
            if (menuRotationEl) menuRotationEl.innerText = window.currentRotationDayText;
            
            window.menuData.today = "<div style='color: #666;'>Menu data unavailable.</div>";
            window.menuData.tomorrow = "<div style='color: #666;'>Menu data unavailable.</div>";
        }
        
        // Push the update to the UI immediately
        if (typeof window.updateMenuUI === "function") {
            window.updateMenuUI();
        }

        // Check and apply emergency color filters right after updating data templates
        if (typeof window.updateEmergencyUI === "function") {
            window.updateEmergencyUI();
        }
    });
}

// ==========================================
// FIREBASE MAP TEACHER OVERLAY ENGINE (Rotation Day Aware)
// ==========================================

window.liveMasterSchedule = {};
onSnapshot(doc(db, "settings", "master_schedule"), (docSnap) => {
    if (docSnap.exists()) {
        window.liveMasterSchedule = docSnap.data();
    }
});

window.showTeacherNamesOnMap = function() {
    // 1. Identify current running school period
    let activePeriod = "1"; 
    if (window.currentTimeState) {
        if (window.currentTimeState.isPassing && window.currentTimeState.nextPeriod) {
            activePeriod = String(window.currentTimeState.nextPeriod);
        } else if (window.currentTimeState.currentPeriod) {
            activePeriod = String(window.currentTimeState.currentPeriod);
        }
    }

    // 2. Identify the current Rotation Day (Extracting the number from "Day 2", "Day 6", etc.)
    let currentDayNum = 1; // Default fallback
    if (window.currentRotationDayText) {
        // Strip out letters, leaving just the number
        const parsed = parseInt(window.currentRotationDayText.replace(/\D/g, ''));
        if (!isNaN(parsed)) currentDayNum = parsed;
    }

    // 3. Pull the period directory from Firebase
    const periodMap = window.liveMasterSchedule[activePeriod];
    if (!periodMap) return;

    // 4. Inject dynamically into SVG Map Nodes
    const mapNodes = document.querySelectorAll(".map-node");
    mapNodes.forEach(node => {
        const dataId = node.getAttribute("data-id") || "";
        const matchKey = dataId.toLowerCase().replace(/^room\s+/i, '').trim();
        
        const assignments = periodMap[matchKey];

        if (assignments && assignments.length > 0) {
            // Find the specific teacher assigned to THIS rotation day
            let activeTeacherAssignment = assignments.find(a => a.days.includes(currentDayNum));
            
            // Fallback: If for some reason the day doesn't match, pick the first teacher in the array
            if (!activeTeacherAssignment) activeTeacherAssignment = assignments[0];
            
            const teacherName = activeTeacherAssignment.teacher;

            const textEl = node.querySelector("text.lbl-room, text.lbl-large");
            if (textEl) {
                // Backup original attributes
                if (!textEl.hasAttribute("data-orig-text")) {
                    textEl.setAttribute("data-orig-text", textEl.textContent);
                    textEl.setAttribute("data-orig-font", textEl.getAttribute("font-size") || "");
                    textEl.setAttribute("data-orig-fill", textEl.getAttribute("fill") || "");
                }
                
                // Swap text and styling
                textEl.textContent = teacherName;
                textEl.setAttribute("fill", "#0277bd"); // Pirate Blue
                textEl.setAttribute("font-size", teacherName.length > 12 ? "10" : "13");
            }
        }
    });
};

window.hideTeacherNamesOnMap = function() {
    const mapNodes = document.querySelectorAll(".map-node");
    mapNodes.forEach(node => {
        const textEl = node.querySelector("text.lbl-room, text.lbl-large");
        if (textEl && textEl.hasAttribute("data-orig-text")) {
            textEl.textContent = textEl.getAttribute("data-orig-text");
            const origFont = textEl.getAttribute("data-orig-font");
            const origFill = textEl.getAttribute("data-orig-fill");
            
            if (origFont) textEl.setAttribute("font-size", origFont);
            else textEl.removeAttribute("font-size");
            
            if (origFill) textEl.setAttribute("fill", origFill);
            else textEl.removeAttribute("fill");
        }
    });
};

// Add these to js/modules/student-ui.js

export function renderStudentWaitlistScreen(pass) {
    const container = document.getElementById("kiosk-main-widget");
    container.innerHTML = `
        <div class="kiosk-card panel" style="text-align: center; border-left: 10px solid #f57c00;">
            <h2>⏳ You are in the Queue</h2>
            <p>The <strong>${pass.destination}</strong> is currently at full capacity.</p>
            
            <div id="queue-pos-display" style="font-size: 3.5rem; font-weight: bold; margin: 20px 0; color: #f57c00;">
                #${pass.queuePosition}
            </div>
            
            <p>You will be notified automatically when a spot opens up.</p>
            
            <button id="btn-cancel-waitlist" data-id="${pass.id}" 
                style="padding: 15px 30px; font-size: 1.2rem; background: #c62828; color: white; border: none; border-radius: 8px; cursor: pointer; margin-top: 30px;">
                ❌ Cancel Request
            </button>
        </div>
    `;
}

export function renderStudentAcceptScreen(pass) {
    const container = document.getElementById("kiosk-main-widget");
    container.innerHTML = `
        <div class="kiosk-card panel" style="text-align: center; border-left: 10px solid #2e7d32; background: #e8f5e9;">
            <h2 style="color: #2e7d32;">🎉 Your Spot is Ready!</h2>
            <p>A spot opened up in <strong>${pass.destination}</strong>.</p>
            <p>You have 2 minutes to claim this pass before it is offered to the next student.</p>
            <button id="btn-accept-waitlist" data-id="${pass.id}" 
                style="padding: 20px 40px; font-size: 1.5rem; background: #2e7d32; color: white; border: none; border-radius: 8px; cursor: pointer; margin-top: 20px;">
                ✅ Claim My Spot
            </button>
        </div>
    `;
}

/**
 * Dynamically calculates a student's place in line based on their timestamp
 */
export function calculateDynamicQueuePosition(myPass, allPasses) {
    // 1. Get everyone waiting for the same destination
    const othersWaiting = allPasses.filter(p => 
        p.destination === myPass.destination && 
        p.status === "waitlist"
    );

    // 2. Sort by time (oldest first)
    othersWaiting.sort((a, b) => {
        const timeA = a.createdAt?.toDate?.() || new Date(0);
        const timeB = b.createdAt?.toDate?.() || new Date(0);
        return timeA - timeB;
    });

    // 3. Find our index in that sorted list (+1 because humans count from 1)
    const myIndex = othersWaiting.findIndex(p => p.id === myPass.id);
    return myIndex + 1; // e.g., index 0 = #1 in line
}

/**
 * Renders the Blind Restriction Screen (Generic Denial Message)
 */
export function renderStudentBlindRestrictionScreen(pass) {
    const container = document.getElementById("kiosk-main-widget");
    if (!container) return;
    
    // Clear out background styling
    container.style.backgroundColor = "";
    
    container.innerHTML = `
        <div class="kiosk-card panel" style="text-align: center; border: 4px solid #c62828; background: #ffebee; padding: 40px; border-radius: 12px; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center;">
            <h1 style="color: #c62828; font-size: 3rem; margin-bottom: 10px;">🛑 Request temporarily denied.</h1>
            <p style="font-size: 1.5rem; color: #333; margin-top: 20px; max-width: 80%;">
                Please wait 5 minutes and try again.
            </p>
            <button id="btn-cancel-restricted" data-id="${pass.id}" style="margin-top: 40px; font-size: 1.5rem; padding: 20px 40px; background-color: #c62828; color: white; border: none; border-radius: 8px; cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                ❌ Cancel Request
            </button>
        </div>
    `;
}

/**
 * Renders the Yellow Frequent Flyer Warning Screen & Sidebar Log
 */
export async function renderStudentYellowWarningScreen(pass) {
    const mainContainer = document.getElementById("kiosk-main-widget");
    const sidebar = document.getElementById("kiosk-sidebar-widget");

    // 1. Paint the Left Side Yellow
    if (mainContainer) {
        mainContainer.style.backgroundColor = ""; // Clear existing
        mainContainer.innerHTML = `
            <div class="kiosk-card panel" style="text-align: center; border: 4px solid #fbc02d; background: #fffde7; padding: 40px; border-radius: 12px; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                <h1 style="color: #f57f17; font-size: 3rem; margin-bottom: 10px;">⚠️ Request Flagged</h1>
                <h2 style="color: #f9a825; font-size: 1.8rem; margin-bottom: 20px;">${pass.warningReason || "High pass volume detected."}</h2>
                <p style="font-size: 1.5rem; color: #333; margin-top: 20px; max-width: 80%;">
                    Your teacher has been notified and is reviewing your pass history. Please wait for approval.
                </p>
                <button id="btn-cancel-restricted" data-id="${pass.id}" style="margin-top: 40px; font-size: 1.5rem; padding: 20px 40px; background-color: #c62828; color: white; border: none; border-radius: 8px; cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                    ❌ Cancel Request
                </button>
            </div>
        `;
    }

    // 2. Build the Daily Log for the Right Side
    if (sidebar) {
        sidebar.innerHTML = `<div class="kiosk-card panel" style="height: 100%; display: flex; justify-content: center; align-items: center;"><h2>Loading Log...</h2></div>`;

        // Fetch today's log from Firebase
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const q = query(
            collection(db, "passes"),
            where("studentId", "==", pass.studentId),
            where("createdAt", ">=", startOfDay)
        );

        try {
            const snaps = await getDocs(q);
            let logHtml = `<div class="kiosk-card panel" style="height: 100%; overflow-y: auto;">
                <h2 style="margin-top: 0; color: #333; border-bottom: 2px solid #eee; padding-bottom: 10px;">📅 Today's Pass Log</h2>
                <ul style="list-style: none; padding: 0;">`;

            let count = 0;
            
            // Sort by most recent first
            const sortedDocs = snaps.docs.map(d => d.data()).sort((a, b) => {
                const timeA = a.createdAt?.toMillis() || 0;
                const timeB = b.createdAt?.toMillis() || 0;
                return timeB - timeA;
            });

            sortedDocs.forEach(p => {
                // Only show passes that were actually used
                if (p.status.includes("active") || p.status.includes("returned") || p.status === "archived") {
                    count++;
                    // Safely format timestamp
                    let timeStr = "Unknown Time";
                    if (p.acceptedAt) timeStr = new Date(p.acceptedAt.toDate()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    else if (p.createdAt) timeStr = new Date(p.createdAt.toDate()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

                    let displayStatus = p.status.replace('_', ' ').toUpperCase();

                    logHtml += `
                        <li style="margin-bottom: 15px; padding: 15px; background: #f9f9f9; border-left: 5px solid #fbc02d; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                            <strong style="font-size: 1.1rem; color: #111;">📍 ${p.destination}</strong><br>
                            <span style="font-size: 0.9rem; color: #555;">Approved: <strong>${timeStr}</strong></span><br>
                            <span style="font-size: 0.8rem; color: #888;">Status: ${displayStatus}</span>
                        </li>
                    `;
                }
            });

            if (count === 0) {
                logHtml += `<p style="color: #666; font-style: italic; padding: 10px;">No completed passes today.</p>`;
            }

            logHtml += `</ul></div>`;
            sidebar.innerHTML = logHtml; // Inject the log into the sidebar!

        } catch (err) {
            console.error("Error loading log:", err);
            sidebar.innerHTML = `<div style="padding: 20px; color: red;">Failed to load log.</div>`;
        }
    }
}