// js/modules/ui-widgets.js
import { handleLogout } from "./auth-roles.js";

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
        <div class="header-user">
            <span id="header-name">${user.displayName}</span>
            <button id="btn-logout" class="toolbar-btn">Logout</button>
        </div>
    `;

    const btnLogout = document.getElementById("btn-logout");
    if (btnLogout) {
        btnLogout.addEventListener("click", handleLogout);
    }

    // ==========================================
    // 2. DYNAMIC TOOLBAR RIBBONS
    // ==========================================
    // Render whichever toolbar physically exists on the HTML page!
    
    const adminToolbar = document.getElementById("admin-toolbar-widget");
    if (adminToolbar) {
        adminToolbar.className = "admin-toolbar"; 
        adminToolbar.style.display = "flex";
        adminToolbar.style.flexDirection = "column";
        adminToolbar.style.gap = "10px";

        adminToolbar.innerHTML = `
            <div class="toolbar-row" style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 10px;">
                <button id="btn-emergency" class="admin-dashboard-btn btn-critical">🚨 Emergency Controls</button>
                <button id="btn-location-limits" class="admin-dashboard-btn btn-critical">🚦 Restriction Settings</button>
                
                <button id="btn-open-send-pass" class="admin-dashboard-btn btn-primary">🎫 Send Student a Pass</button>
                <button id="btn-open-proxy-setup" class="admin-dashboard-btn btn-primary">💻 Open Pass As Student</button>
                
                <button id="btn-open-management" class="admin-dashboard-btn btn-base">👥 Student Management</button>
            </div>
            
            <div class="toolbar-row" style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button id="btn-open-teacher-management" class="admin-dashboard-btn btn-light">👨‍🏫 Teacher Management</button>            
                <button id="btn-open-teacher-schedule" class="admin-dashboard-btn btn-light">📋 Teacher Schedule</button>
                
                <button id="btn-open-bell-schedule" class="admin-dashboard-btn btn-base">⏱️ Bell Schedules</button>
                <button id="btn-open-academic-cal-modal" class="admin-dashboard-btn btn-base">📅 Academic Calendar</button>
                <button id="btn-open-gcal-modal" class="admin-dashboard-btn btn-base">⚙️ Google Calendar Setup</button>
            </div>
        `;
    }
    
    const teacherToolbar = document.getElementById("teacher-toolbar-widget");
    if (teacherToolbar) {
        teacherToolbar.className = "teacher-toolbar";
        teacherToolbar.innerHTML = `
            <button id="btn-create-pass" class="toolbar-btn" style="background-color: var(--pirate-red); color: white; border: none;">🎟️ Quick Outbound Pass</button>
            <button id="btn-open-send-pass" class="toolbar-btn" style="background-color: #2e7d32; color: white; border: none;">🎫 Send Student a Pass</button>
            <button id="btn-open-proxy-setup" class="toolbar-btn" style="background-color: #8e24aa; color: white; border: none;">💻 Open Pass As Student</button>
            <button id="btn-emergency" class="danger-btn toolbar-btn" style="border: none;">🚨 Emergency</button>
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
        
        // Render control buttons depending on status context
        if (pass.status === 'pending' || pass.status === 'pending_student' || pass.status === 'pending_restricted' || pass.status === 'waitlist') {
            
            let approveBtnText = pass.status === 'pending_restricted' ? "⚠️ Override & Approve" : "Approve";
            let approveBtnBg = pass.status === 'pending_restricted' ? "#f57c00" : "#2e7d32";

            actionButtons = `
                <div style="display: flex; gap: 10px; margin-top: 10px;">
                    <button class="card-btn" data-id="${pass.id}" data-action="active" data-current-status="${pass.status}" style="padding: 8px 15px; font-size: 0.9rem; background-color: ${approveBtnBg}; border: none; color: white; border-radius: 4px; cursor: pointer; font-weight: bold;">${approveBtnText}</button>
                    <button class="card-btn" data-id="${pass.id}" data-action="rejected" data-current-status="${pass.status}" style="padding: 8px 15px; font-size: 0.9rem; background-color: #c62828; border: none; color: white; border-radius: 4px; cursor: pointer; font-weight: bold;">Reject</button>
                </div>
            `;
        } else if (pass.status === 'active' || pass.status === 'active_bypassed') {
            actionButtons = `
                <div style="display: flex; gap: 10px; margin-top: 10px;">
                    <button class="card-btn" data-id="${pass.id}" data-action="returned" data-current-status="${pass.status}" style="padding: 8px 15px; font-size: 0.9rem; background-color: #0277bd; border: none; color: white; border-radius: 4px; cursor: pointer; font-weight: bold;">End Pass (Return)</button>
                </div>
            `;
        } else if (pass.status === 'returned_bypassed') {
            actionButtons = `
                <div style="display: flex; gap: 10px; margin-top: 10px;">
                    <button class="card-btn" data-id="${pass.id}" data-action="archived" data-current-status="${pass.status}" style="width: 100%; padding: 10px; font-size: 1rem; background-color: #757575; border: none; color: white; border-radius: 4px; cursor: pointer; font-weight: bold;">Clear Alert</button>
                </div>
            `;
        } else if (pass.status === 'returned' || pass.status === 'archived' || pass.status === 'fraudulent_review') {
            // NEW: Historical passes get an Edit button
            actionButtons = `
                <div style="display: flex; gap: 10px; margin-top: 10px;">
                    <button class="card-btn btn-edit-history" data-id="${pass.id}" data-dest="${pass.destination}" style="padding: 8px 15px; font-size: 0.9rem; background-color: #fbc02d; border: none; color: #333; border-radius: 4px; cursor: pointer; font-weight: bold; width: 100%;">✏️ Edit / Flag</button>
                </div>
            `;
        }
        
        const teacherText = (pass.targetTeacher && pass.targetTeacher !== "Unknown") ? ` (${pass.targetTeacher})` : "";
            
        // CHECK RESTRICTION STATUS FOR CARD BACKGROUND
        const isRestricted = ['pending_restricted', 'active_bypassed', 'returned_bypassed'].includes(pass.status);
        const cardBgColor = isRestricted ? '#ffebee' : '#ffffff'; 
        const cardBorderColor = isRestricted ? '#ef5350' : '#eaedf2'; 
        
        // LEFT BORDER PHASE COLORING
        let leftBorderColor = '#0277bd'; 
        if (pass.status.includes('pending') || pass.status === 'waitlist') leftBorderColor = '#ff9800'; 
        if (pass.status.includes('active')) leftBorderColor = '#4caf50'; 
        if (pass.status.includes('returned') || pass.status === 'archived' || pass.status === 'fraudulent_review') leftBorderColor = '#757575'; 
        if (pass.status === 'fraudulent_review') leftBorderColor = '#c62828'; // Make fraud border stark red
        
        // WAITLIST BADGE
        const waitlistBadgeHTML = pass.status === 'waitlist' 
            ? `<div style="margin-bottom: 8px;"><span style="background-color: #f57c00; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: bold;">⏳ Waitlisted (#${pass.queuePosition})</span></div>` 
            : '';

        // RESTRICTION WARNING BANNER 
        let restrictionBannerHTML = '';
        if (isRestricted) {
            const overrideText = pass.status === 'pending_restricted' 
                ? "<em>Overriding notifies admin.</em>" 
                : `<strong style='color: #c62828;'>⚠️ Restriction was bypassed by ${pass.bypassedBy || "Admin"}</strong>`;

            let restrictionReason = "";
            if (pass.restrictionType === "area_lockdown") {
                 restrictionReason = `Area Locked: <strong>${pass.lockedAreaName}</strong> is currently restricted.`;
            } else {
                 restrictionReason = `<strong style="font-size: 0.9rem;">🚨 RESTRICTED PEER CONFLICT WITH ${pass.restrictedPeerName || pass.restrictedPeer || "RESTRICTED PEER"}</strong><br>
                                      <span style="font-size: 0.8rem; color: #444;"><strong>Conflict:</strong> Student ID ${pass.restrictedPeer || "Admin Restriction"}</span>`;
            }

            restrictionBannerHTML = `
                <div style="background: #ffcdd2; border-left: 5px solid #b71c1c; padding: 8px; margin-bottom: 8px; border-radius: 4px; font-size: 0.85rem;">
                    <span style="color: #b71c1c; font-weight: 500;">
                        ${restrictionReason}
                    </span><br>
                    <span style="font-size: 0.8rem; color: #444;">${overrideText}</span>
                </div>
            `;
        }

        // ========================================================
        // NEW: STRIKETHROUGH EDITS & FRAUD FLAGS FOR HISTORICAL PASSES
        // ========================================================
        let destinationDisplay = `<strong>${pass.destination}${teacherText}</strong>`;
        let editNoteHTML = '';
        let fraudNoteHTML = '';

        // If the pass was edited, cross out the old one
        if (pass.originalDestination && pass.originalDestination !== pass.destination) {
            destinationDisplay = `<del style="color: #999;">${pass.originalDestination}</del> <strong style="color: #2e7d32;">${pass.destination}</strong>`;
        }
        
        // Show who edited it
        if (pass.editedBy) {
            editNoteHTML = `<div style="font-size: 0.8rem; color: #e65100; font-style: italic; margin-top: 4px;">✏️ Edited by ${pass.editedBy}</div>`;
        }

        // Show Fraudulent Flag Warning
        if (pass.status === 'fraudulent_review' || pass.fraudExplanation) {
            fraudNoteHTML = `<div style="background: #ffebee; border: 1px solid #ffcdd2; color: #c62828; padding: 6px; border-radius: 4px; font-size: 0.85rem; margin-top: 8px;">
                                <strong>🚩 Fraudulent Flag:</strong> ${pass.fraudExplanation || "Sent to Admin for review."}
                             </div>`;
        }

        return `
            <div class="pass-card" style="background: ${cardBgColor}; border: 1px solid ${cardBorderColor}; border-left: 5px solid ${leftBorderColor}; padding: 15px; margin-bottom: 12px; border-radius: var(--radius, 8px); box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                <div style="display: flex; justify-content: space-between; align-items: center; font-weight: bold; margin-bottom: 5px;">
                    <span style="font-size: 1.1rem; color: var(--text-dark, #1a1a1a);">👤 ${pass.studentDisplayName}</span>
                    <span class="badge" style="text-transform: uppercase; font-size: 0.75rem; background: #eee;">${pass.type}</span>
                </div>
                ${waitlistBadgeHTML}
                ${restrictionBannerHTML}
                <div style="color: #555; font-size: 0.95rem; margin-bottom: 5px;">
                    📍 Destination: ${destinationDisplay}
                </div>
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