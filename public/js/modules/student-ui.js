// js/modules/student-ui.js
import { schoolMapSVG } from "../map.js"; 
import { doc, getDoc, onSnapshot, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../firebase-config.js";
import { getAdjustedNow } from "./time-engine.js";

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

    const isLockedDown = window.currentLoudLockdown === true;

    // Draw the buttons side-by-side using Flexbox
    let buttonHTML = isLockedDown 
        ? `<div style="display: flex; gap: 10px; width: 100%;">
               <button id="btn-open-map" class="primary-btn" style="flex: 1; font-size: 1.2rem; padding: 15px; background-color: #c62828; cursor: not-allowed; opacity: 0.8;" disabled>
                   🛑 Map Locked
               </button>
               <button id="btn-open-staff" class="primary-btn" style="flex: 1; font-size: 1.2rem; padding: 15px; background-color: #c62828; cursor: not-allowed; opacity: 0.8;" disabled>
                   🛑 Staff Locked
               </button>
           </div>`
        : `<div style="display: flex; gap: 10px; width: 100%;">
               <button id="btn-open-map" class="primary-btn" style="flex: 1; font-size: 1.2rem; padding: 15px;">
                   🗺️ Map
               </button>
               <button id="btn-open-staff" class="primary-btn" style="flex: 1; font-size: 1.2rem; padding: 15px;">
                   👨‍🏫 Select Staff
               </button>
           </div>`;

    // This is the part that injects it all into the screen!
    container.innerHTML = `
        <div class="kiosk-card">
            <h1 style="color: var(--pirate-red); font-size: 2.5rem; margin-bottom: 10px;">Where to, ${displayName}?</h1>
            <p style="color: #666; margin-bottom: 30px;">Select a destination to request a hall pass.</p>
            ${buttonHTML}
            <p style="margin-top: 20px; font-size: 0.9rem; color: #888;">Your teacher must approve the request before you leave.</p>
        </div>
    `;
    
    if (typeof window.updateEmergencyUI === "function") {
        window.updateEmergencyUI();
    }
}

export function renderStudentSidebar(studentProfile = null) {
    window.currentStudentProfile = studentProfile; // Store for dynamic time updates!
    
    const container = document.getElementById("kiosk-sidebar-widget");
    if (!container) return;

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
                    ${window.currentRotationDayText} <span id="sidebar-schedule-indicator" style="font-size: 0.7em; color: #666; font-weight: normal; margin-left: 5px;"></span>
                </span>
                <button id="btn-open-full-schedule" style="background: white; border: 1px solid #ced4da; border-radius: 4px; padding: 4px 8px; font-size: 1.1rem; cursor: pointer; transition: 0.2s;" title="View Full Schedule" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='white'">📅</button>
            </div>
            
            <div id="dynamic-schedule-container" style="margin-top: 5px;">
                <p style="color: #888; font-size: 0.85rem; text-align: center; margin: 5px 0; font-style: italic;">Syncing clock...</p>
            </div>
        </fieldset>

        <fieldset style="border: 2px solid var(--pirate-silver); border-radius: 8px; padding: 15px; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.05); position: relative; box-sizing: border-box;">
            <legend style="font-weight: bold; color: #444; padding: 0 8px; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px; margin-left: 8px;">
                🍽️ Menus
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

    // 🚀 EXACT DATABASE MATCH LOGIC: Now fetches Bell Schedules too!
    (async () => {
        try {
            const today = new Date();
            const offset = today.getTimezoneOffset() * 60000;
            const localISODate = (new Date(today - offset)).toISOString().split('T')[0];
            
            // 🎯 Fetch BOTH the Calendar and the Bell Schedules at the exact same time
            const [calSnap, bellSnap] = await Promise.all([
                getDoc(doc(db, "system", "calendar")),
                getDoc(doc(db, "settings", "bellSchedules"))
            ]);
            
            let uiDayType = "Regular"; 
            let dbLookupType = "Regular"; 

            if (calSnap.exists()) {
                const dbDayCode = calSnap.data()[localISODate];
                
                if (dbDayCode === "E") { uiDayType = "Early Out"; dbLookupType = "Early Out"; } 
                else if (dbDayCode === "L") { uiDayType = "Late Start"; dbLookupType = "Late Start"; } 
                else if (dbDayCode === "F") { uiDayType = "Regular"; dbLookupType = "Regular"; } 
                else if (window.currentDayScheduleType || (window.sysInfo && window.sysInfo.scheduleType)) {
                    const fallback = window.currentDayScheduleType || window.sysInfo.scheduleType;
                    if (fallback.includes("Early")) { uiDayType = "Early Out"; dbLookupType = "Early Out"; }
                    else if (fallback.includes("Late")) { uiDayType = "Late Start"; dbLookupType = "Late Start"; }
                }
            }

            // 🧠 GLOBAL WIDGET OVERRIDE: Sync the widget's brain to the correct bell schedule!
            if (bellSnap.exists()) {
                const allBells = bellSnap.data();
                if (allBells[dbLookupType]) {
                    window.activeBellSchedule = allBells[dbLookupType]; // Overwrite generic schedule
                    if (window.timeMetrics) {
                        window.timeMetrics.schedule = allBells[dbLookupType]; // Overwrite time engine schedule
                        window.timeMetrics.scheduleName = uiDayType;
                    }
                }
            }

            // Inject the verified data straight into the sidebar UI
            const indicator = document.getElementById("sidebar-schedule-indicator");
            if (indicator) {
                indicator.innerText = `(${uiDayType} Schedule)`;
            }
        } catch (e) {
            console.warn("❌ Could not fetch DB calendar/bells for sidebar:", e);
        }
    })();

    // 🚀 BIND THE BUTTON TO OUR NEW GLOBAL POP-UP FILE!
    document.getElementById("btn-open-full-schedule").addEventListener("click", () => {
        if (window.openSchedulePopup) {
            window.openSchedulePopup(studentProfile);
        } else {
            console.error("⚠️ Schedule pop-up module not loaded! Ensure f-student-schedule.js is linked in the HTML.");
        }
    });

    // ✨ GUARANTEE: Force checking emergency status every time sidebar redraws
    if (typeof window.updateEmergencyUI === "function") {
        window.updateEmergencyUI();
    }
}

/**
 * 1-SECOND INTERVAL HOOK: Dynamically calculates Current/Next classes.
 */
window.updateStudentScheduleWidget = function(timeMetrics) {
    const container = document.getElementById("dynamic-schedule-container");
    if (!container) return;

    const profile = window.currentStudentProfile;
    if (!profile || !profile.schedule) {
        container.innerHTML = `<p style="color: #666; font-size: 0.85rem; text-align: center; margin: 5px 0;">Schedule unavailable.</p>`;
        return;
    }

    // 1. Get beautifully formatted data straight from the brain!
    const widgetData = window.ScheduleUtils.getWidgetData(timeMetrics, profile);

    // 2. Update Globals for Hall Passes
    const activeData = widgetData.current || widgetData.next;
    if (activeData) {
        window.currentRoom = activeData.room || "Unknown";
        window.currentOriginTeacher = activeData.teacher || "Unknown";
        window.currentPeriod = widgetData.currentBasePeriod || "Unknown";
    }

    // 3. The "Dumb" UI Painter (Now with lighter grays!)
    const buildRow = (title, dataObj, bgColor, titleColor, borderColor) => {
        if (!dataObj) return "";
        
        let displayPeriod = String(dataObj.label).replace(/Period /gi, "").replace(/ Class/gi, "");
        if (dataObj.className.includes("Lunch")) displayPeriod = displayPeriod.replace(" Lunch", "") || "🍔";

        // 🌟 Grab the perfectly calculated data directly! No more double-filtering!
        const roomName = dataObj.room || "TBA";
        const timeStr = dataObj.timeString || "Time varies";

        return `
            <div style="margin-bottom: 10px;">
                <div style="font-size: 0.75rem; color: ${titleColor}; font-weight: bold; text-transform: uppercase; margin-bottom: 3px;">
                    📌 ${title}
                </div>
                <div style="background: ${bgColor}; border-left: 4px solid ${borderColor}; padding: 10px; border-radius: 4px; display: flex; align-items: center; line-height: 1.4;">
                    <div style="width: 45px; font-weight: bold; color: #ef1a14; font-size: 1.1rem; text-align: center;">
                        ${displayPeriod}
                    </div>
                    <div style="flex: 1; padding-left: 10px; border-left: 1px solid rgba(0,0,0,0.1);">
                        <div style="font-weight: 600; font-size: 1.05rem; color: #111;">${dataObj.className}</div>
                        <div style="font-size: 0.85rem; color: #444; margin-top: 3px;">
                            <span>🕒 ${timeStr}</span> &nbsp;|&nbsp; 
                            <span>🚪 ${roomName}</span> &nbsp;|&nbsp; 
                            <span>👤 ${dataObj.teacher}</span>
                        </div>
                    </div>
                </div>
            </div>`;
    };

    let html = '';

    // 🎨 CURRENT: Lighter Gray (#eaeaea), Standard Red text/border
    if (widgetData.current) {
        html += buildRow("CURRENT", widgetData.current, "#eaeaea", "#ef1a14", "#ef1a14");
    }

    // 🎨 NEXT: Even Lighter Gray (#f7f7f7), Lighter Red text/border
    if (widgetData.next) {
        html += buildRow("NEXT", widgetData.next, "#f7f7f7", "#ff7961", "#ff7961");
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
            studentMessage += "<br><br><span style='font-size: 1.1rem; opacity: 0.9;'>Please try again in 5 minutes.</span>";
        } else if (statusData.restrictionType === 'capacity') {
            studentMessage += `<br><br><span style='font-size: 1.1rem; opacity: 0.9;'>⏳ Waitlist Position: <strong>${statusData.waitlistPosition}</strong></span>`;
        }

        extraInfoHtml = `
            <div style="background: white; color: #721c24; padding: 10px; border-radius: 8px; margin: 10px auto; max-width: 90%; border: 2px solid #f5c6cb;">
                <strong style="font-size: 1.1rem;">🛑 RESTRICTED REQUEST</strong><br>
                <span style="font-size: 1rem;">${studentMessage}</span>
            </div>
        `;

        buttonsHtml = `
            <button id="btn-teacher-reject" data-id="${pass.id}" class="danger-btn" style="width: 100%; max-width: 300px; font-size: 1.3rem; padding: 15px;">
                ❌ Cancel Request
            </button>
        `;
    } else {
        bgColor = statusData.statusLevel === 'yellow' ? "#fff3cd" : "#d4edda"; 
        textColor = statusData.statusLevel === 'yellow' ? "#856404" : "#155724"; 
        titleColor = statusData.statusLevel === 'yellow' ? "#856404" : "#155724";
        
        buttonsHtml = `
            <div style="display: flex; gap: 10px; justify-content: center; width: 100%; max-width: 500px; margin: 0 auto;">
                <button id="btn-teacher-approve" data-id="${pass.id}" class="primary-btn" style="flex: 1; font-size: 1.3rem; padding: 15px;">✅ Approve</button>
                <button id="btn-teacher-reject" data-id="${pass.id}" class="danger-btn" style="flex: 1; font-size: 1.3rem; padding: 15px;">❌ Reject</button>
            </div>
        `;
    }

    let teacherNoteHtml = '';
    if (pass.isProxy || pass.senderName) {
        teacherNoteHtml = `
            <div style="background: rgba(255,255,255,0.6); padding: 10px; border-radius: 8px; margin-bottom: 10px; font-size: 1rem; color: #444; border: 1px solid rgba(0,0,0,0.1); text-align: left; max-width: 90%; margin-left: auto; margin-right: auto;">
                <strong style="color: #1565c0;">📢 Scheduled By:</strong> ${pass.senderName || "A Teacher"}<br>
                <strong style="color: #1565c0;">Purpose:</strong> ${pass.purpose || "Not specified"}
            </div>
        `;
    }

    // 🟢 FORMAT THE TEACHER'S NAME FOR DISPLAY
    let displayTeacherName = pass.targetTeacher;
    if (displayTeacherName && displayTeacherName !== "Unknown" && window.activeStaffList) {
        // Look up this specific teacher in the global staff list
        const teacherProfile = window.activeStaffList.find(staff => staff.displayName === pass.targetTeacher);
        
        // If we found them, and they have a title and last name, override the display name!
        if (teacherProfile && teacherProfile.title && teacherProfile.lastName) {
            displayTeacherName = `${teacherProfile.title} ${teacherProfile.lastName}`;
        }
    }

    container.style.backgroundColor = bgColor;

    // 🎯 NO MORE SCROLLBAR: We use overflow: hidden and min(vw, vh) to force mathematical shrinking
    container.innerHTML = `
        <div style="width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box; padding: 10px; overflow: hidden;">
            
            <div style="flex-shrink: 0; text-align: center;">
                <p style="color: ${titleColor}; font-size: clamp(1.1rem, 3vh, 1.4rem); font-weight: 500; margin-bottom: 5px; text-transform: uppercase;">
                    Teacher Authorization Required<br>
                    <span style="font-size: 0.85em; opacity: 0.8; text-transform: none;">please hand your iPad to your teacher</span>
                </p>
            </div>
            
            <div style="flex-grow: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; text-align: center; padding: 5px 0;">
                
                <h1 style="color: ${textColor}; font-size: clamp(1.5rem, min(7vw, 7vh), 4rem); margin: 0 0 10px 0; line-height: 1.1; width: 100%; word-break: break-word; overflow-wrap: break-word; hyphens: auto;">
                    ${pass.studentDisplayName}
                </h1>
                
                <p style="color: ${textColor}; font-size: clamp(1.1rem, min(4vw, 4vh), 1.6rem); margin-bottom: 15px; word-break: break-word;">
                    Requests to go to <strong>${pass.destination}</strong>
                    ${displayTeacherName && displayTeacherName !== "Unknown" ? `<br><span style="font-size: 0.9em;">(${displayTeacherName})</span>` : ""}
                </p>

                ${teacherNoteHtml}
                ${extraInfoHtml}
            </div>

            <div style="flex-shrink: 0; text-align: center; padding-top: 5px;">
                ${buttonsHtml}
                <p style="margin-top: 10px; font-size: 0.85rem; color: ${textColor}; opacity: 0.8;">
                    ${statusData.statusLevel === 'red' ? 'Teacher can override restriction from their Teacher Dashboard.' : ''}
                </p>
            </div>

        </div>
    `;
}

export function renderStudentActiveScreen(pass) {
    const container = document.getElementById("kiosk-main-widget");
    if (!container) return;

    container.style.backgroundColor = ""; 

    const hasArrived = !!pass.arrivedAt;
    const hasDeparted = !!pass.departedAt;
    const skipCheckIn = pass.requiresCheckIn === false || pass.type === "tardy";

    let titleHTML = "";
    let timerHTML = "";
    let instructionHTML = "";
    let buttonHTML = "";

    if (skipCheckIn) {
        titleHTML = `<h2 style="color: #2e7d32; margin-top: 0; font-size: clamp(1.1rem, 3vh, 1.8rem); text-align: center; text-transform: uppercase;">ACTIVE PASS</h2>`;
        timerHTML = `<div id="student-timer-display" class="huge-timer" style="color: #333; text-align: center; margin: 5px 0;">00:00</div>`;
        instructionHTML = `<p style="color: #666; margin: 5px 0; font-weight: bold; text-align: center;">Return to your origin classroom when finished.</p>`;
        buttonHTML = `
            <button id="btn-teacher-return" data-id="${pass.id}" class="toolbar-btn primary-btn" style="width: 100%; padding: 15px; font-size: 1.2rem; background-color: #d32f2f; color: white; border: none; border-radius: 8px; cursor: pointer;">
                🛑 End Pass
            </button>
        `;
    } else if (hasDeparted) {
        titleHTML = `<h2 style="color: #e65100; margin-top: 0; font-size: clamp(1.1rem, 3vh, 1.8rem); text-align: center; text-transform: uppercase;">RETURNING TO CLASS</h2>`;
        timerHTML = `<div id="student-timer-display" class="huge-timer" style="color: #333; text-align: center; margin: 5px 0;">00:00</div>`;
        instructionHTML = `<p style="color: #666; margin: 5px 0; font-weight: bold; text-align: center;">Proceed directly back to your origin classroom.</p>`;
        buttonHTML = `
            <button id="btn-teacher-return" data-id="${pass.id}" class="toolbar-btn primary-btn" style="width: 100%; padding: 15px; font-size: 1.2rem; background-color: #d32f2f; color: white; border: none; border-radius: 8px; cursor: pointer;">
                🛑 End Pass
            </button>
        `;
    } else if (hasArrived) {
        let arrivalTime = "Just now";
        if (pass.arrivedAt && typeof pass.arrivedAt.toDate === 'function') {
            arrivalTime = pass.arrivedAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        
        titleHTML = `<h2 style="color: #1976d2; margin-top: 0; font-size: clamp(1.1rem, 3vh, 1.8rem); text-align: center; text-transform: uppercase;">AT DESTINATION</h2>`;
        timerHTML = `
            <div style="font-size: clamp(1.5rem, 4vh, 2rem); font-weight: bold; color: #1976d2; margin: 5px 0; text-align: center;">Checked In</div>
            <div style="font-size: clamp(1rem, 2vh, 1.1rem); color: #555; margin-bottom: 5px; text-align: center;">Arrival: ${arrivalTime}</div>
        `;
        instructionHTML = `<p style="color: #666; margin: 5px 0; font-weight: bold; text-align: center;">Destination Teacher: Click below when student leaves.</p>`;
        buttonHTML = `
            <button id="btn-teacher-depart" data-id="${pass.id}" class="toolbar-btn primary-btn" style="width: 100%; padding: 15px; font-size: 1.2rem; background-color: #f57c00; color: white; border: none; border-radius: 8px; cursor: pointer;">
                🚶 Depart Student
            </button>
        `;
    } else {
        titleHTML = `<h2 style="color: #e65100; margin-top: 0; font-size: clamp(1.1rem, 3vh, 1.8rem); text-align: center; text-transform: uppercase;">ACTIVE PASS</h2>`;
        timerHTML = `<div id="student-timer-display" class="huge-timer" style="color: #333; text-align: center; margin: 5px 0;">00:00</div>`;
        instructionHTML = `<p style="color: #666; margin: 5px 0; font-weight: bold; text-align: center;">Proceed directly to your destination.</p>`;
        buttonHTML = `
            <button id="btn-teacher-checkin" data-id="${pass.id}" class="toolbar-btn primary-btn" style="width: 100%; padding: 15px; font-size: 1.2rem; background-color: #1976d2; color: white; border: none; border-radius: 8px; cursor: pointer;">
                🏢 Check In Student
            </button>
        `;
    }

    let originText = pass.originRoom || "Unknown";
    if (pass.originTeacherLastName && pass.originTeacherLastName !== "Unknown" && pass.originTeacherLastName !== "No Receiving Teacher") {
        originText += ` (${pass.originTeacherLastName})`;
    }

    // 🎯 REPLACED WITH THE SAME STRICT FLEX LAYOUT & SCALING TEXT (NO SCROLLBAR)
    container.innerHTML = `
        <div class="active-pass-container" style="width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box; padding: 10px; overflow: hidden; background: #fff;">
            
            <div style="flex-shrink: 0; width: 100%; text-align: center;">
                ${titleHTML}
            </div>
            
            <div style="flex-grow: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; padding: 5px 0;">
                
                <h1 style="margin: 0 0 10px 0; color: #111; text-transform: uppercase; font-weight: 900; line-height: 1.1; font-size: clamp(1.5rem, min(7vw, 7vh), 4rem); text-align: center; width: 100%; word-break: break-word; overflow-wrap: break-word; hyphens: auto;">
                    ${pass.studentDisplayName || "Student"}
                </h1>

                <div style="background: rgba(0,0,0,0.04); padding: 10px; border-radius: 8px; text-align: center; border: 1px solid rgba(0,0,0,0.05); width: 100%; max-width: 100%; box-sizing: border-box;">
                    <div style="font-size: clamp(1rem, 3vh, 1.2rem); color: #333; margin-bottom: 5px; word-break: break-word;">
                        To: <strong style="color: #1976d2;">${pass.destination}</strong>
                    </div>
                    <div style="font-size: clamp(1rem, 3vh, 1.1rem); color: #555; word-break: break-word;">
                        From: <strong>${originText}</strong>
                    </div>
                </div>

            </div>
            
            <div style="flex-shrink: 0; width: 100%; text-align: center; padding-top: 5px;">
                ${timerHTML}
                ${instructionHTML}
                <div style="margin-top: 10px;">
                    ${buttonHTML}
                </div>
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
 * Renders the Gray Scheduled/Future Pass Screen
 */
export function renderStudentScheduledScreen(pass) {
    // 🚨 SANITY CHECK: If you don't see this in the console, your browser is running old code!
    console.log("🍓🍓🍓 BERRY BLASTER! The Gray Screen function is running! 🍓🍓🍓");

    const mainContainer = document.getElementById("kiosk-main-widget");
    if (!mainContainer) return;

    // 1. Format the Teacher Name 
    let teacherName = pass.proxyTeacherName || pass.teacherName || "Teacher";

    // 2. Format the Date
    let dateStr = "an upcoming date";
    if (pass.scheduledDate) {
        const d = new Date(pass.scheduledDate + "T12:00:00");
        if (!isNaN(d)) {
            dateStr = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        }
    }

    // 3. Format the Time
    let timeStr = "when available";
    if (pass.scheduledPeriod && pass.scheduledPeriod !== "None") {
        timeStr = `${pass.scheduledPeriod} period`;
    } else if (pass.scheduledTime) {
        const [hourStr, minStr] = pass.scheduledTime.split(':');
        if (hourStr && minStr) {
            let h = parseInt(hourStr, 10);
            const ampm = h >= 12 ? 'pm' : 'am';
            h = h % 12 || 12;
            timeStr = `${h}:${minStr} ${ampm}`;
        }
    }

    // 4. Check if Required or Requested
    const reqType = (pass.passType && pass.passType.toLowerCase() === 'required') ? 'required' : 'requested';
    const displayType = reqType.charAt(0).toUpperCase() + reqType.slice(1);

    // 5. Build the UI
    mainContainer.style.backgroundColor = ""; 
    mainContainer.innerHTML = `
        <div class="kiosk-card panel" style="text-align: center; border: 4px solid #9e9e9e; background: #f5f5f5; padding: 40px; border-radius: 12px; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center;">
            
            <p style="color: #616161; font-size: 1.4rem; font-weight: 500; margin-bottom: 20px; text-transform: uppercase;">
                Scheduled Pass from ${teacherName}<br>
                <span style="font-size: 1.1rem; opacity: 0.8; text-transform: none;">on ${dateStr} at ${timeStr}</span>
            </p>
            
            <h1 style="color: #212121; font-size: 4rem; margin: 10px 0; line-height: 1;">
                ${pass.studentDisplayName || "Student"}
            </h1>
            
            <h2 style="color: #424242; font-size: 2.5rem; margin-bottom: 10px;">
                Is <span style="color: var(--pirate-red, #d32f2f);">${reqType}</span> to go to <strong>${pass.destination}</strong>
            </h2>
            
            ${pass.purpose ? `<h3 style="color: #757575; font-size: 1.5rem; margin-bottom: 20px; font-weight: normal; font-style: italic;">"${pass.purpose}"</h3>` : ''}
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ccc; width: 80%;">
                <span style="font-size: 1.1rem; color: #616161;">
                    📢 Scheduled By: ${teacherName}
                </span>
            </div>
        </div>
    `;
}

// Ensure it's attached globally so main-student.js can always trigger it!
window.renderStudentScheduledScreen = renderStudentScheduledScreen;

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
                
                <p style="color: #856404; font-size: 1.4rem; font-weight: 500; margin-bottom: 20px; text-transform: uppercase;">
                    Teacher Authorization Required<br>
                    <span style="font-size: 1.1rem; opacity: 0.8; text-transform: none;">please hand your iPad to your teacher</span>
                </p>
                
                <h1 style="color: #f57f17; font-size: 3rem; margin-bottom: 10px;">⚠️ Request Flagged</h1>
                <h2 style="color: #f9a825; font-size: 1.8rem; margin-bottom: 20px;">${pass.warningReason || "High pass volume detected."}</h2>
                
                <div style="display: flex; gap: 15px; justify-content: center; width: 100%; max-width: 500px; margin-top: 20px;">
                    <button id="btn-teacher-approve" data-id="${pass.id}" class="primary-btn" style="flex: 1; font-size: 1.4rem; padding: 12px;">✅ Approve</button>
                    <button id="btn-teacher-reject" data-id="${pass.id}" class="danger-btn" style="flex: 1; font-size: 1.4rem; padding: 12px;">❌ Reject</button>
                </div>
            </div>
        `;
    }

    // 2. Build the Daily Log for the Right Side
    if (sidebar) {
        sidebar.innerHTML = `<div class="kiosk-card panel" style="height: 100%; display: flex; justify-content: center; align-items: center;"><h2>Loading Log...</h2></div>`;

        // Fetch today's log from Firebase
        const startOfDay = getAdjustedNow();
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

export function renderStaffModal() {
    const container = document.getElementById("staff-modal-container");
    if (!container) return;

    container.innerHTML = `
        <div id="staff-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.6); z-index: 9999; align-items: center; justify-content: center;">
            <div style="background: white; border-radius: 12px; width: 90%; max-width: 450px; box-shadow: 0 10px 25px rgba(0,0,0,0.4); display: flex; flex-direction: column;">
                
                <div class="map-header" style="display: flex; justify-content: space-between; align-items: center; padding: 15px 20px; background: #f5f5f5; border-bottom: 2px solid var(--pirate-silver, #ccc); border-radius: 12px 12px 0 0;">
                    <h2 style="margin: 0; color: var(--pirate-red, #c62828); font-size: 1.5rem;">Select Staff Member</h2>
                    <span class="close-modal" id="close-staff-modal" style="cursor: pointer; font-size: 1.5rem; font-weight: bold; color: #555;">✖</span>
                </div>
                
                <div style="padding: 20px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 15px;">
                    
                    <!-- Search Input -->
                    <input type="text" id="staff-search-input" autocomplete="off" placeholder="Start typing to filter names..." style="width: 100%; max-width: 350px; padding: 12px; font-size: 1.1rem; border: 2px solid var(--pirate-silver, #ccc); border-radius: 8px; outline: none; box-sizing: border-box;">
                    
                    <!-- Open List Box -->
                    <select id="staff-dropdown-select" size="6" style="width: 100%; max-width: 350px; padding: 8px; font-size: 1.1rem; border: 2px solid var(--pirate-silver, #ccc); border-radius: 8px; background: white; cursor: pointer; outline: none; box-sizing: border-box;">
                        <!-- Options injected dynamically -->
                    </select>
                    
                    <button id="btn-confirm-staff-destination" class="primary-btn" style="padding: 12px 30px; font-size: 1.1rem; border-radius: 8px; width: 100%; max-width: 350px; margin-top: 5px;" disabled>
                        Confirm Destination
                    </button>
                </div>
                
            </div>
        </div>
    `;
}