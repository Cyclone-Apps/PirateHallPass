// js/modules/student-ui.js
import { schoolMapSVG } from "../map.js"; 

export function renderStudentIdleScreen() {
    const container = document.getElementById("kiosk-main-widget");
    if (!container) return;
    
    container.style.backgroundColor = ""; 

    // Safely grab the student's full name from the global user object!
    let displayName = "Pirate";
    if (window.currentUser && window.currentUser.displayName) {
        // Uses their exact full name
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
    const container = document.getElementById("kiosk-sidebar-widget");
    if (!container) return;

    let scheduleHtml = `<p style="color: #666; font-style: italic; font-size: 0.85rem;">Schedule not available.</p>`;
    let fullScheduleRows = "";

    // Standard high school bell schedule times (Periods 1-9)
    const standardTimes = {
        "1": { start: "8:15 AM", end: "9:00 AM" },
        "2": { start: "9:05 AM", end: "9:50 AM" },
        "3": { start: "9:55 AM", end: "10:40 AM" },
        "4": { start: "10:45 AM", end: "11:30 AM" },
        "5": { start: "11:35 AM", end: "12:20 PM" },
        "6": { start: "12:25 PM", end: "1:10 PM" },
        "7": { start: "1:15 PM", end: "2:00 PM" },
        "8": { start: "2:05 PM", end: "2:50 PM" },
        "9": { start: "2:55 PM", end: "3:40 PM" }
    };

    if (studentProfile && studentProfile.schedule) {
        const scheduleData = studentProfile.schedule;
        let itemsHtml = "";

        // Build the Current/Next list AND the Full Schedule Popup list simultaneously
        for (let p = 1; p <= 9; p++) {
            const periodKey = String(p);
            if (scheduleData[periodKey]) {
                const classInfo = scheduleData[periodKey];
                const className = classInfo.courseName || "Class";
                const roomNum = classInfo.room || "TBA";
                const times = standardTimes[periodKey] || { start: "—", end: "—" };

                // Build the Widget View (Compact 1-line format)
                itemsHtml += `
                    <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-bottom: 1px dashed #eee; padding-bottom: 2px;">
                        <span><strong>P${p}:</strong> ${className}</span>
                        <span style="color: #666; font-family: monospace; font-size: 0.75rem; margin-left: 8px;">Rm ${roomNum}</span>
                    </div>
                `;

                // Build the Popup View (Full Details)
                fullScheduleRows += `
                    <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee;">
                        <span style="font-weight: bold; width: 60px; color: #0277bd;">Per ${p}</span>
                        <span style="flex: 1; text-align: left; padding-left: 10px; font-weight: 500;">${className}</span>
                        <span style="width: 120px; text-align: right; color: #555;">Rm ${roomNum} <br><span style="font-size: 0.75rem; color: #888;">${times.start} - ${times.end}</span></span>
                    </div>
                `;
            }
        }

        if (itemsHtml) {
            scheduleHtml = `
                <div class="student-schedule-widget" style="padding: 5px 0;">
                    ${itemsHtml}
                </div>
            `;
        }
    }

    container.innerHTML = `
        <div class="kiosk-card" style="padding: 15px; margin-bottom: 15px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                    <h2 style="font-size: 1.1rem; margin-top: 0; margin-bottom: 3px; color: #333; font-weight: bold;">${studentProfile?.fullName || "Student Profile"}</h2>
                    <p style="font-size: 0.8rem; color: #777; margin-bottom: 12px; margin-top: 0;">Grade ${studentProfile?.grade || "10"}</p>
                </div>
                <button id="btn-open-full-schedule" style="background: #f0f8ff; border: 1px solid #bbdefb; border-radius: 4px; padding: 4px 8px; font-size: 1.2rem; cursor: pointer; color: #0277bd;" title="View Full Schedule">📋</button>
            </div>
            
            <h3 style="font-size: 0.9rem; margin-top: 5px; margin-bottom: 8px; color: var(--pirate-red); border-bottom: 2px solid var(--pirate-red); padding-bottom: 3px; font-weight: bold;">📅 Today's Schedule</h3>
            ${scheduleHtml}
        </div>
    `;

    // Ensure the Full Schedule Modal exists in the HTML
    if (!document.getElementById("full-schedule-modal")) {
        const modalDiv = document.createElement("div");
        modalDiv.id = "full-schedule-modal";
        modalDiv.className = "hidden";
        modalDiv.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 3000;";
        modalDiv.innerHTML = `
            <div style="background: white; padding: 20px; border-radius: 8px; width: 90%; max-width: 400px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); position: relative; max-height: 80vh; display: flex; flex-direction: column;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0277bd; padding-bottom: 10px; margin-bottom: 10px;">
                    <h3 style="margin: 0; color: #0277bd;">📋 Full Schedule</h3>
                    <span id="close-full-schedule" style="cursor: pointer; font-size: 1.5rem; color: #666; font-weight: bold;">&times;</span>
                </div>
                <div id="full-schedule-content" style="overflow-y: auto; flex-grow: 1; padding-right: 5px;"></div>
            </div>
        `;
        document.body.appendChild(modalDiv);
    }

    // Fill the popup with the rows we just built
    const contentBox = document.getElementById("full-schedule-content");
    if (contentBox) contentBox.innerHTML = fullScheduleRows || "<p>No schedule data found.</p>";
}

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