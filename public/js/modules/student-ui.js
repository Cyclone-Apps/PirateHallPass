// js/modules/student-ui.js
import { schoolMapSVG } from "../map.js"; 
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Keep a global reference to the student's profile so the 1-second interval can read it!
window.currentStudentProfile = null;
// Pre-initialize global variables so re-renders don't wipe data out!
window.menuData = window.menuData || { today: "🔄 Loading...", tomorrow: "🔄 Loading..." };
window.showingTomorrow = window.showingTomorrow || false;
window.currentRotationDayText = window.currentRotationDayText || "🔄 Loading Day...";

export function renderStudentIdleScreen() {
    const container = document.getElementById("kiosk-main-widget");
    if (!container) return;
    
    container.style.backgroundColor = ""; 

    let displayName = "Pirate";
    if (window.currentUser && window.currentUser.displayName) {
        displayName = window.currentUser.displayName;
    }

    container.innerHTML = `
        <div class="kiosk-card">
            <h1 style="color: var(--pirate-red); font-size: 2.5rem; margin-bottom: 10px;">Where to, ${displayName}?</h1>
            <p style="color: #666; margin-bottom: 30px;">Select a destination to request a hall pass.</p>
            <button id="btn-open-map" class="primary-btn" style="font-size: 1.5rem; padding: 20px 40px; width: 100%;">
                🗺️ Open School Map
            </button>
            <p style="margin-top: 20px; font-size: 0.9rem; color: #888;">Your teacher must approve the request before you leave.</p>
        </div>
    `;
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

    // Render the Sidebar with both live Schedule and Menu widgets
    container.innerHTML = `
        <fieldset style="border: 2px solid var(--pirate-silver); border-radius: 8px; padding: 5px 15px 15px 15px; margin-bottom: 8px; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.05); position: relative; box-sizing: border-box;">
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

        <fieldset style="border: 2px solid var(--pirate-silver); border-radius: 8px; padding: 5px 15px 15px 15px; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.05); position: relative; box-sizing: border-box;">
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

// ... (Rest of your recent travels, map modal, active/waiting screens go here exactly as they were) ...

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
    } else if (statusData.statusLevel === 'yellow') {
        bgColor = "#fff3cd"; textColor = "#856404"; titleColor = "#856404";
        buttonsHtml = `
            <div style="display: flex; gap: 15px; justify-content: center; width: 100%; max-width: 500px; margin: 0 auto;">
                <button id="btn-teacher-approve" data-id="${pass.id}" class="primary-btn" style="flex: 1; font-size: 1.4rem; padding: 20px;">✅ Approve</button>
                <button id="btn-teacher-reject" data-id="${pass.id}" class="danger-btn" style="flex: 1; font-size: 1.4rem; padding: 20px;">❌ Reject</button>
            </div>
        `;
    } else {
        bgColor = "#d4edda"; textColor = "#155724"; titleColor = "#155724";
        buttonsHtml = `
            <div style="display: flex; gap: 15px; justify-content: center; width: 100%; max-width: 500px; margin: 0 auto;">
                <button id="btn-teacher-approve" data-id="${pass.id}" class="primary-btn" style="flex: 1; font-size: 1.4rem; padding: 20px;">✅ Approve</button>
                <button id="btn-teacher-reject" data-id="${pass.id}" class="danger-btn" style="flex: 1; font-size: 1.4rem; padding: 20px;">❌ Reject</button>
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
            
            <p style="color: ${textColor}; font-size: 1.8rem; margin-bottom: 20px;">
                Requests to go to <strong>${pass.destination}</strong>
            </p>

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
 * Splits Firestore string by <br> and formats B- and L- prefixes.
 * Guarantees Breakfast is always sorted and displayed before Lunch.
 */
function parseMenuData(menuStr) {
    if (!menuStr) return "<div style='color: #666;'>Menu data unavailable.</div>";
    
    const parts = menuStr.split('<br>');
    let breakfastHtml = '';
    let lunchHtml = '';
    let otherHtml = '';
    
    parts.forEach(part => {
        let cleanPart = part.trim();
        if (!cleanPart) return;

        // Check for Breakfast
        if (cleanPart.toUpperCase().startsWith('B-')) {
            breakfastHtml += `<div style="margin-bottom: 8px;"><strong style="color: var(--pirate-red);">Breakfast:</strong> <span style="color: black;">${cleanPart.substring(2).trim()}</span></div>`;
        } 
        // Check for Lunch
        else if (cleanPart.toUpperCase().startsWith('L-')) {
            lunchHtml += `<div style="margin-bottom: 8px;"><strong style="color: var(--pirate-red);">Lunch:</strong> <span style="color: black;">${cleanPart.substring(2).trim()}</span></div>`;
        } 
        // Anything else fallback
        else {
            otherHtml += `<div style="margin-bottom: 8px; color: black;">${cleanPart}</div>`;
        }
    });
    
    return breakfastHtml + lunchHtml + otherHtml;
}

/**
 * Real-time connection hook that subscribes to system/daily_info
 */
export function initializeRotationDayEngine(db, onSnapshot, doc) {
    if (!db || !onSnapshot || !doc) return;

    onSnapshot(doc(db, "system", "daily_info"), (docSnap) => {
        const schedRotationEl = document.getElementById("schedule-rotation-display");
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Save to memory
            window.currentRotationDayText = data.rotationDay || "Regular Day";
            
            // Update Schedule Widget header
            if (schedRotationEl) schedRotationEl.innerText = window.currentRotationDayText;
            
            // Parse and store to global memory variables
            window.menuData.today = parseMenuData(data.lunchMenu);
            window.menuData.tomorrow = parseMenuData(data.tomorrowMenu);
            
        } else {
            window.currentRotationDayText = "Regular Schedule";
            if (schedRotationEl) schedRotationEl.innerText = window.currentRotationDayText;
            
            window.menuData.today = "<div style='color: #666;'>Menu data unavailable.</div>";
            window.menuData.tomorrow = "<div style='color: #666;'>Menu data unavailable.</div>";
        }
        
        // Push the update to the UI immediately
        if (typeof window.updateMenuUI === "function") {
            window.updateMenuUI();
        }
    });
}