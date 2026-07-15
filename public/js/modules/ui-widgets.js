// js/modules/ui-widgets.js
import { handleLogout } from "./auth-roles.js";
import { initOTAUpdater, openOTAModal } from "../features/f-ota-updater.js";
import { getAdjustedNow, isTimeSpoofed } from "./time-engine.js";

// ==========================================
// 🕒 LIVE CLOCK HELPER
// ==========================================
function startLiveClock() {
    const dateEl = document.getElementById("clock-date");
    const timeEl = document.getElementById("clock-time");

    if (!dateEl || !timeEl) return;

    function updateClock() {
        // 🎯 1. Use the Time Engine instead of new Date ()!
        const now = getAdjustedNow(); 
        const spoofed = isTimeSpoofed();
        
        // 2. Format Date: "Sunday, Jul 12, 2026"
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' };
        let dateStr = now.toLocaleDateString('en-US', dateOptions);
        
        // 🕵️‍♂️ 3. Add the visual indicator if Time Machine is active
        if (spoofed) {
            dateStr += ` <span style="color: #ffeb3b; font-weight: 900; margin-left: 5px;">(Spoofed)</span>`;
        }
        dateEl.innerHTML = dateStr;

        // 4. Format Time: "07:58:55 AM"
        const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };
        timeEl.innerText = now.toLocaleTimeString('en-US', timeOptions);
    }

    updateClock();
    if (window.liveClockInterval) clearInterval(window.liveClockInterval);
    window.liveClockInterval = setInterval(updateClock, 1000);
}


export function renderHeader(user, role) {
    const headerContainer = document.getElementById("global-header");
    if (!headerContainer) return;

    // Capitalize the role for display
    const displayRole = role.charAt(0).toUpperCase() + role.slice(1);

    // ==========================================
    // 1. GLOBAL NAV HEADER
    // ==========================================
    headerContainer.innerHTML = `
        <div class="header-logo">
            <img src="logo.png" alt="School Logo" class="school-logo">
            <h1>Pirate Hall Pass</h1>
            <span class="role-badge ${role}">${displayRole}</span>
        </div>
        
        <div style="flex: 1; display: flex; justify-content: center; align-items: center;">
            <div id="live-clock-widget" style="display: flex; flex-direction: column; align-items: center; justify-content: center; color: inherit; font-family: sans-serif; line-height: 1.1;">
                <div id="clock-date" style="font-size: 0.85rem; font-weight: 600; opacity: 0.9;">Loading...</div>
                <div id="clock-time" style="font-size: 1.4rem; font-weight: 900; letter-spacing: 0.5px;">--:--:--</div>
            </div>
        </div>

        <div class="header-user" style="display: flex; align-items: center; gap: 15px;">
            <span id="header-name">${user.displayName}</span>
            <button id="btn-logout" class="toolbar-btn">Logout</button>
            
            <button id="btn-open-ota" style="background: transparent; border: none; font-size: 1.5rem; cursor: pointer; padding: 0 5px;" title="System Settings">⚙️</button>
        </div>
    `;

    // 🚀 Start the clock immediately after injecting the HTML
    startLiveClock();

    const btnLogout = document.getElementById("btn-logout");
    if (btnLogout) {
        btnLogout.addEventListener("click", handleLogout);
    }

    // 🌟 NEW OTA UPDATE WIRING
    initOTAUpdater(); // Injects the modal HTML to the bottom of the page
    
    const btnOTA = document.getElementById("btn-open-ota");
    if (btnOTA) {
        btnOTA.addEventListener("click", openOTAModal);
    }

    // ==========================================
    // 2. DYNAMIC TOOLBAR RIBBONS
    // ==========================================
    // Render whichever toolbar physically exists on the HTML page!
    
    const adminToolbar = document.getElementById("admin-toolbar-widget");
    if (adminToolbar) {
        adminToolbar.className = "admin-toolbar"; 
        adminToolbar.style.display = "flex";
        adminToolbar.style.flexWrap = "wrap"; 
        adminToolbar.style.flexDirection = "row"; 
        adminToolbar.style.gap = "10px";

       adminToolbar.innerHTML = `
            <button id="btn-emergency" class="admin-dashboard-btn btn-critical">🚨 Emergency Controls</button>
            <button id="btn-location-limits" class="admin-dashboard-btn btn-critical">🚦 Restriction Settings</button>
            <button id="btn-send-message" class="admin-dashboard-btn btn-critical">✉️ Send Message</button>
            
            <button id="btn-open-send-pass" class="admin-dashboard-btn btn-primary">🎫 Send Student a Pass</button>
            <button id="btn-open-proxy-setup" class="admin-dashboard-btn btn-primary">💻 Open Pass As Student</button>
            <button id="btn-open-admin-history" class="admin-dashboard-btn btn-primary">📜 Pass History</button>
            
            <button id="btn-open-management" class="admin-dashboard-btn btn-base">👥 Student Management</button>
            <button id="btn-open-teacher-management" class="admin-dashboard-btn btn-light">👨‍🏫 Teacher Management</button>            
            <button id="btn-open-room-assignments" class="admin-dashboard-btn btn-light">🏫 Room Assignments</button>
            
            <button id="btn-open-bell-schedule" class="admin-dashboard-btn btn-base">⏱️ Bell Schedules</button>
            <button id="btn-open-academic-cal-modal" class="admin-dashboard-btn btn-base">📅 Academic Calendar</button>
            <button id="btn-open-gcal-modal" class="admin-dashboard-btn btn-base">⚙️ Google Calendar Setup</button>
        `;
    }
    
    const teacherToolbar = document.getElementById("teacher-toolbar-widget");
    if (teacherToolbar) {
        teacherToolbar.className = "teacher-toolbar";
        teacherToolbar.innerHTML = `
            <button id="btn-open-send-pass" class="toolbar-btn" style="background-color: #2e7d32; color: white; border: none;">🎫 Send Student a Pass</button>
            <button id="btn-open-proxy-setup" class="toolbar-btn" style="background-color: #8e24aa; color: white; border: none;">💻 Open Pass As Student</button>
            <button id="btn-open-room-assignments" class="toolbar-btn" style="background-color: #1976d2; color: white; border: none;">🏫 Room Assignments</button>
        `;
    }
}

/**
 * Dynamically renders pass cards into designated dashboard containers
 */
export function renderPassList(passes, containerId, countId) {
    const container = document.getElementById(containerId);
    const countBadge = document.getElementById(countId);
    
    if (countBadge) {
        countBadge.innerText = passes.length;
    }
    
    if (!container) return;
    
    if (passes.length === 0) {
        container.innerHTML = `<p style="color: #666; font-style: italic; padding: 15px 5px;">No passes.</p>`;
        return;
    }
    
    container.innerHTML = passes.map(pass => {
        let actionButtons = '';
        
        // Helper to format Firebase timestamps
        const formatTime = (ts) => ts ? new Date(ts.toDate()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--';
        
        // Calculate the 4 Timestamps
        const tLeft = formatTime(pass.acceptedAt);
        const tArrived = formatTime(pass.arrivedAt);
        const tDeparted = formatTime(pass.departedAt);
        const tReturned = formatTime(pass.returnedAt);

        // Determine if this room operates like a Restroom (No check-in required)
        const requiresCheckIn = pass.requiresCheckIn !== false && pass.targetTeacher && pass.targetTeacher !== "No Receiving Teacher" && pass.targetTeacher !== "Unknown";
        
        // 🟢 BUTTON RENDERER
        if (['pending', 'pending_student', 'pending_restricted', 'pending_warning', 'waitlist'].includes(pass.status)) {
            
            let approveBtnText = "Approve";
            let approveBtnBg = "#2e7d32";

            if (pass.status === 'pending_restricted') {
                approveBtnText = "⚠️ Override & Approve";
                approveBtnBg = "#f57c00";
            } else if (pass.status === 'pending_warning') {
                approveBtnText = "⚠️ Approve Warning";
                approveBtnBg = "#fbc02d";
            }

            actionButtons = `
                <div style="display: flex; gap: 10px; margin-top: 10px;">
                    <button class="card-btn" data-id="${pass.id}" data-action="active" data-current-status="${pass.status}" style="padding: 8px 15px; font-size: 0.9rem; background-color: ${approveBtnBg}; border: none; color: white; border-radius: 4px; cursor: pointer; font-weight: bold; flex: 1;">${approveBtnText}</button>
                    <button class="card-btn" data-id="${pass.id}" data-action="rejected" data-current-status="${pass.status}" style="padding: 8px 15px; font-size: 0.9rem; background-color: #c62828; border: none; color: white; border-radius: 4px; cursor: pointer; font-weight: bold;">Reject</button>
                </div>
            `;
        } else if (pass.status === 'active' || pass.status === 'active_bypassed') {
            if (requiresCheckIn) {
                if (!pass.arrivedAt) {
                    actionButtons = `
                        <div style="display: flex; gap: 10px; margin-top: 10px;">
                            <button class="card-btn" data-id="${pass.id}" data-action="arrived" data-current-status="${pass.status}" style="padding: 8px 15px; font-size: 0.9rem; background-color: #0288d1; border: none; color: white; border-radius: 4px; cursor: pointer; font-weight: bold; flex: 1;">📍 Arrived at Dest</button>
                        </div>
                    `;
                } else if (!pass.departedAt) {
                    actionButtons = `
                        <div style="display: flex; gap: 10px; margin-top: 10px;">
                            <button class="card-btn" data-id="${pass.id}" data-action="departed" data-current-status="${pass.status}" style="padding: 8px 15px; font-size: 0.9rem; background-color: #f57c00; border: none; color: white; border-radius: 4px; cursor: pointer; font-weight: bold; flex: 1;">🚶 Departed Dest</button>
                        </div>
                    `;
                } else {
                    actionButtons = `
                        <div style="display: flex; gap: 10px; margin-top: 10px;">
                            <button class="card-btn" data-id="${pass.id}" data-action="returned" data-current-status="${pass.status}" style="padding: 8px 15px; font-size: 0.9rem; background-color: #2e7d32; border: none; color: white; border-radius: 4px; cursor: pointer; font-weight: bold; width: 100%;">✅ Student Returned Home</button>
                        </div>
                    `;
                }
            } else {
                actionButtons = `
                    <div style="display: flex; gap: 10px; margin-top: 10px;">
                        <button class="card-btn" data-id="${pass.id}" data-action="returned" data-current-status="${pass.status}" style="padding: 8px 15px; font-size: 0.9rem; background-color: #2e7d32; border: none; color: white; border-radius: 4px; cursor: pointer; font-weight: bold; width: 100%;">✅ Student Returned</button>
                    </div>
                `;
            }
        } else if (pass.status === 'returned_bypassed') {
            actionButtons = `
                <div style="display: flex; gap: 10px; margin-top: 10px;">
                    <button class="card-btn" data-id="${pass.id}" data-action="archived" data-current-status="${pass.status}" style="width: 100%; padding: 10px; font-size: 1rem; background-color: #757575; border: none; color: white; border-radius: 4px; cursor: pointer; font-weight: bold;">Clear Alert</button>
                </div>
            `;
        } else if (pass.status === 'returned' || pass.status === 'archived' || pass.status === 'fraudulent_review') {
            actionButtons = `
                <div style="display: flex; gap: 10px; margin-top: 10px;">
                    <button class="card-btn btn-edit-history" data-id="${pass.id}" data-dest="${pass.destination}" style="padding: 8px 15px; font-size: 0.9rem; background-color: #fbc02d; border: none; color: #333; border-radius: 4px; cursor: pointer; font-weight: bold; width: 100%;">✏️ Edit / Flag</button>
                </div>
            `;
        }
        
        const teacherText = (pass.targetTeacher && pass.targetTeacher !== "Unknown" && pass.targetTeacher !== "No Receiving Teacher") ? ` (${pass.targetTeacher})` : "";
        
        // 🎯 NEW: Adds the origin teacher's last name specifically for the Teacher Dashboard Cards!
        const originRoom = pass.originRoom || pass.origin || "Unknown Room";
        const originTeacherText = (pass.originTeacherLastName && pass.originTeacherLastName !== "Unknown" && pass.originTeacherLastName !== "No Receiving Teacher") ? ` (${pass.originTeacherLastName})` : "";
        const originDisplay = `${originRoom}${originTeacherText}`;
            
        // DYNAMIC CARD BACKGROUND COLORS
        const isBypassedStatus = ['active_bypassed', 'returned_bypassed'].includes(pass.status);
        const isWarning = pass.status === 'pending_warning' || (isBypassedStatus && pass.warningReason);
        const isRestricted = pass.status === 'pending_restricted' || (isBypassedStatus && !pass.warningReason);
        const isNormalActiveOrPending = ['pending', 'pending_student', 'waitlist', 'active'].includes(pass.status);

        let cardBgColor = '#ffffff'; 
        let cardBorderColor = '#eaedf2'; 

        if (isRestricted) {
            cardBgColor = '#ffebee'; 
            cardBorderColor = '#ef5350';
        } else if (isWarning) {
            cardBgColor = '#fffde7'; 
            cardBorderColor = '#fbc02d';
        } else if (isNormalActiveOrPending) {
            cardBgColor = '#e8f5e9'; 
            cardBorderColor = '#81c784';
        }
        
        let leftBorderColor = '#0277bd'; 
        if (pass.status.includes('pending') || pass.status === 'waitlist') leftBorderColor = '#ff9800'; 
        if (pass.status.includes('active')) leftBorderColor = '#4caf50'; 
        if (pass.status.includes('returned') || pass.status === 'archived' || pass.status === 'fraudulent_review') leftBorderColor = '#757575'; 
        if (pass.status === 'fraudulent_review') leftBorderColor = '#c62828'; 
        
        const waitlistBadgeHTML = pass.status === 'waitlist' 
            ? `<div style="margin-bottom: 8px;"><span style="background-color: #f57c00; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: bold;">⏳ Waitlisted (#${pass.queuePosition})</span></div>` 
            : '';

        let restrictionBannerHTML = '';
        if (isRestricted) {
            const overrideText = pass.status === 'pending_restricted' 
                ? "<em>Overriding notifies admin.</em>" 
                : `<strong style='color: #c62828;'>⚠️ Restriction was bypassed by ${pass.bypassedBy || "Admin"}</strong>`;

            let restrictionReason = pass.restrictionType === "area_lockdown" 
                ? `Area Locked: <strong>${pass.lockedAreaName}</strong> is currently restricted.`
                : `<strong style="font-size: 0.9rem;">🚨 RESTRICTED PEER CONFLICT WITH ${pass.restrictedPeerName || pass.restrictedPeer || "RESTRICTED PEER"}</strong><br><span style="font-size: 0.8rem; color: #444;"><strong>Conflict:</strong> Student ID ${pass.restrictedPeer || "Admin Restriction"}</span>`;

            restrictionBannerHTML = `
                <div style="background: #ffcdd2; border-left: 5px solid #b71c1c; padding: 8px; margin-bottom: 8px; border-radius: 4px; font-size: 0.85rem;">
                    <span style="color: #b71c1c; font-weight: 500;">${restrictionReason}</span><br>
                    <span style="font-size: 0.8rem; color: #444;">${overrideText}</span>
                </div>
            `;
        } else if (isWarning) {
            const bypassNote = isBypassedStatus ? `<br><span style="font-size: 0.8rem; color: #444;"><em>Approved by teacher</em></span>` : "";
            restrictionBannerHTML = `
                <div style="background: #fff3cd; border-left: 5px solid #fbc02d; padding: 8px; margin-bottom: 8px; border-radius: 4px; font-size: 0.85rem;">
                    <span style="color: #856404; font-weight: 500;">⚠️ <strong>Flagged:</strong> ${pass.warningReason || "High pass volume detected."}</span>${bypassNote}
                </div>
            `;
        }

        let timelineHTML = '';
        if (pass.status !== 'waitlist' && pass.status !== 'pending' && pass.status !== 'pending_student' && pass.status !== 'pending_restricted' && pass.status !== 'pending_warning') {
            timelineHTML = `
                <div style="font-size: 0.8rem; color: #666; margin-top: 8px; background: rgba(255,255,255,0.6); padding: 6px; border-radius: 4px; border: 1px solid rgba(0,0,0,0.1);">
                    <div style="display: flex; justify-content: space-between;"><span>🛫 Left Origin:</span> <strong>${tLeft}</strong></div>
                    ${requiresCheckIn ? `<div style="display: flex; justify-content: space-between;"><span>📍 Arrived Dest:</span> <strong>${tArrived}</strong></div>` : ''}
                    ${requiresCheckIn ? `<div style="display: flex; justify-content: space-between;"><span>🚶 Left Dest:</span> <strong>${tDeparted}</strong></div>` : ''}
                    <div style="display: flex; justify-content: space-between;"><span>🏠 Returned:</span> <strong>${tReturned}</strong></div>
                </div>
            `;
        }

        let destinationDisplay = `<strong>${pass.destination}${teacherText}</strong>`;
        let editNoteHTML = '';
        let fraudNoteHTML = '';

        if (pass.originalDestination && pass.originalDestination !== pass.destination) {
            destinationDisplay = `<del style="color: #999;">${pass.originalDestination}</del> <strong style="color: #2e7d32;">${pass.destination}</strong>`;
        }
        
        if (pass.editedBy) editNoteHTML = `<div style="font-size: 0.8rem; color: #e65100; font-style: italic; margin-top: 4px;">✏️ Edited by ${pass.editedBy}</div>`;

        if (pass.status === 'fraudulent_review' || pass.fraudExplanation) {
            fraudNoteHTML = `<div style="background: #ffebee; border: 1px solid #ffcdd2; color: #c62828; padding: 6px; border-radius: 4px; font-size: 0.85rem; margin-top: 8px;">
                                <strong>🚩 Fraudulent Flag:</strong> ${pass.fraudExplanation || "Sent to Admin for review."}
                             </div>`;
        }

        // 🎯 INJECTS THE NEW originDisplay VARIABLE WE CREATED ABOVE!
        return `
            <div class="pass-card" style="background: ${cardBgColor}; border: 1px solid ${cardBorderColor}; border-left: 5px solid ${leftBorderColor}; padding: 15px; margin-bottom: 12px; border-radius: var(--radius, 8px); box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                <div style="display: flex; justify-content: space-between; align-items: center; font-weight: bold; margin-bottom: 5px;">
                    <span style="font-size: 1.1rem; color: var(--text-dark, #1a1a1a);">👤 ${pass.studentDisplayName}</span>
                    <span class="badge" style="text-transform: uppercase; font-size: 0.75rem; background: #eee;">${pass.type}</span>
                </div>
                ${waitlistBadgeHTML}
                ${restrictionBannerHTML}
                <div style="color: #555; font-size: 0.95rem; margin-bottom: 2px;">
                    🛫 Origin: <strong>${originDisplay}</strong>
                </div>
                <div style="color: #555; font-size: 0.95rem; margin-bottom: 5px;">
                    📍 Destination: ${destinationDisplay}
                </div>
                ${timelineHTML}
                ${editNoteHTML}
                ${fraudNoteHTML}
                ${pass.senderName ? `<div style="color: #888; font-size: 0.85rem; font-style: italic; margin-top: 4px;">Initiated by: ${pass.senderName}</div>` : ''}
                ${actionButtons}
            </div>
        `;
    }).join('');
}

/**
 * UNIVERSAL AUTOCOMPLETE TOOL
 * Attaches a dynamic dropdown to any input field.
 */
export function setupStudentAutocomplete(inputElement, dropdownElement, studentList, onSelectCallback = null, displayEmailElement = null, hiddenEmailElement = null) {
    if (!inputElement || !dropdownElement) return;

    dropdownElement.addEventListener("click", (evt) => {
        evt.stopPropagation();
    });

    inputElement.addEventListener("click", (evt) => {
        evt.stopPropagation();
        renderList(inputElement.value);
    });

    inputElement.addEventListener("focus", () => {
        renderList(inputElement.value);
    });
    
    inputElement.addEventListener("input", () => {
        renderList(inputElement.value);
        if (hiddenEmailElement) hiddenEmailElement.value = "";
        if (displayEmailElement) {
            displayEmailElement.innerText = "Select a student from the list";
            displayEmailElement.style.color = "#666";
        }
    });

    document.addEventListener("click", (evt) => {
        if (evt.target !== inputElement && !dropdownElement.contains(evt.target)) {
            dropdownElement.classList.add("hidden");
        }
    });

    function renderList(searchTerm) {
        dropdownElement.innerHTML = "";
        const term = (searchTerm || "").toLowerCase();

        const filtered = studentList.filter(s => 
            (s.displayName || "").toLowerCase().includes(term) || 
            (s.email || "").toLowerCase().includes(term)
        );

        if (filtered.length === 0) {
            dropdownElement.innerHTML = `<div style="padding: 10px; color: #888; font-style: italic;">No students found...</div>`;
            dropdownElement.classList.remove("hidden");
            return;
        }

        filtered.forEach(student => {
            const div = document.createElement("div");
            div.style.padding = "10px";
            div.style.cursor = "pointer";
            div.style.borderBottom = "1px solid #eee";
            
            div.innerHTML = `<strong>${student.displayName || "Unknown"}</strong> <span style="font-size: 0.85rem; color: #888; margin-left: 5px;">(${student.email || "No Email"})</span>`;

            div.addEventListener("click", (evt) => {
                evt.stopPropagation(); 
                inputElement.value = student.displayName || "";
                if (hiddenEmailElement) hiddenEmailElement.value = student.email || "";
                if (displayEmailElement) {
                    displayEmailElement.innerText = student.email || "No Email";
                    displayEmailElement.style.color = "#000";
                }
                dropdownElement.classList.add("hidden");
                
                if (onSelectCallback) onSelectCallback(student);
            });

            div.addEventListener("mouseover", () => div.style.background = "#f0f8ff");
            div.addEventListener("mouseout", () => div.style.background = "transparent");

            dropdownElement.appendChild(div);
        });

        dropdownElement.classList.remove("hidden");
    }
}