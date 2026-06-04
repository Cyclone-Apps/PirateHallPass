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
            <!-- Row 1: Active Pass & Student Operations -->
            <div class="toolbar-row" style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button id="btn-emergency" class="danger-btn toolbar-btn" style="border: none;">🚨 Emergency Controls</button>
                <button id="btn-open-send-pass" class="toolbar-btn" style="background-color: #2e7d32; color: white; border: none;">🎫 Send Student a Pass</button>
                <button id="btn-open-proxy-setup" class="toolbar-btn" style="background-color: #8e24aa; color: white; border: none;">💻 Open Pass As Student</button>
                <button id="btn-open-management" class="toolbar-btn" style="background-color: #0277bd; color: white; border: none;">👥 Student Management</button>
            </div>
            
            <!-- Row 2: Schedules & Building Management Settings -->
            <div class="toolbar-row" style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button id="btn-open-teacher-management" class="toolbar-btn" style="background-color: #f57c00; color: white; border: none;">👨‍🏫 Teacher Management</button>            
                <button id="btn-open-teacher-schedule" class="toolbar-btn" style="background-color: #f57c00; color: white; border: none;">📋 Teacher Schedule</button>
                <button id="btn-open-bell-schedule" class="toolbar-btn" style="background-color: #4caf50; color: white; border: none;">⏱️ Bell Schedules</button>
                <button id="btn-open-academic-cal-modal" class="toolbar-btn" style="background-color: var(--pirate-red); color: white; border: none;">📅 Academic Calendar</button>
                <button id="btn-open-gcal-modal" class="toolbar-btn" style="background-color: #333; color: white; border: none;">⚙️ Google Calendar Setup</button>
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
} // End of renderHeader function

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
        container.innerHTML = `<p style="color: #666; font-style: italic; padding: 15px 5px;">No active or pending passes.</p>`;
        return;
    }
    
    container.innerHTML = passes.map(pass => {
        let actionButtons = '';
        
        // Render control buttons depending on status context
        if (pass.status === 'pending' || pass.status === 'pending_student') {
            actionButtons = `
                <div style="display: flex; gap: 10px; margin-top: 10px;">
                    <button class="card-btn" data-id="${pass.id}" data-action="active" style="padding: 8px 15px; font-size: 0.9rem; background-color: #2e7d32; border: none; color: white; border-radius: 4px; cursor: pointer; font-weight: bold;">Approve</button>
                    <button class="card-btn" data-id="${pass.id}" data-action="rejected" style="padding: 8px 15px; font-size: 0.9rem; background-color: #c62828; border: none; color: white; border-radius: 4px; cursor: pointer; font-weight: bold;">Reject</button>
                </div>
            `;
        } else if (pass.status === 'active') {
            actionButtons = `
                <div style="display: flex; gap: 10px; margin-top: 10px;">
                    <button class="card-btn" data-id="${pass.id}" data-action="returned" style="padding: 8px 15px; font-size: 0.9rem; background-color: #0277bd; border: none; color: white; border-radius: 4px; cursor: pointer; font-weight: bold;">End Pass (Return)</button>
                </div>
            `;
        }
        
        return `
            <div class="pass-card" style="background: white; border: 1px solid #eaedf2; border-left: 5px solid ${pass.status === 'active' ? '#4caf50' : '#ff9800'}; padding: 15px; margin-bottom: 12px; border-radius: var(--radius, 8px); box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                <div style="display: flex; justify-content: space-between; align-items: center; font-weight: bold; margin-bottom: 5px;">
                    <span style="font-size: 1.1rem; color: var(--text-dark, #1a1a1a);">👤 ${pass.studentDisplayName}</span>
                    <span class="badge" style="text-transform: uppercase; font-size: 0.75rem; background: #eee;">${pass.type}</span>
                </div>
                <div style="color: #555; font-size: 0.95rem; margin-bottom: 5px;">
                    📍 Destination: <strong>${pass.destination}</strong>
                </div>
                ${pass.senderName ? `<div style="color: #888; font-size: 0.85rem; font-style: italic;">Initiated by: ${pass.senderName}</div>` : ''}
                ${actionButtons}
            </div>
        `;
    }).join('');
}

/**
 * UNIVERSAL AUTOCOMPLETE TOOL
 * Attaches a dynamic dropdown to any input field.
 * @param {HTMLElement} inputElement - The search text box
 * @param {HTMLElement} dropdownElement - The empty div for the dropdown list
 * @param {Array} studentList - The array of student objects from Firebase
 * @param {Function} onSelectCallback - A function to run when a student is clicked
 * @param {HTMLElement} displayEmailElement - (Optional) Element to visually show the email
 * @param {HTMLElement} hiddenEmailElement - (Optional) Hidden input to store the email value
 */
export function setupStudentAutocomplete(inputElement, dropdownElement, studentList, onSelectCallback = null, displayEmailElement = null, hiddenEmailElement = null) {
    if (!inputElement || !dropdownElement) return;

    // Show list when clicked
    inputElement.addEventListener("focus", () => renderList(inputElement.value));
    
    // Filter list as they type
    inputElement.addEventListener("input", () => {
        renderList(inputElement.value);
        if (hiddenEmailElement) hiddenEmailElement.value = "";
        if (displayEmailElement) {
            displayEmailElement.innerText = "Select a student from the list";
            displayEmailElement.style.color = "#666";
        }
    });

    // Hide dropdown if clicked outside
    document.addEventListener("click", (evt) => {
        if (evt.target !== inputElement && !dropdownElement.contains(evt.target)) {
            dropdownElement.classList.add("hidden");
        }
    });

    function renderList(searchTerm) {
        dropdownElement.innerHTML = "";
        const term = searchTerm.toLowerCase();

        // Check name OR email
        const filtered = studentList.filter(s => 
            (s.displayName || "").toLowerCase().includes(term) || 
            (s.email || "").toLowerCase().includes(term)
        );

        if (filtered.length === 0) {
            dropdownElement.innerHTML = `<div style="padding: 10px; color: #888; font-style: italic;">No students found...</div>`;
            dropdownElement.classList.remove("hidden");
            return;
        }

        // Build the dropdown options
        filtered.forEach(student => {
            const div = document.createElement("div");
            div.style.padding = "10px";
            div.style.cursor = "pointer";
            div.style.borderBottom = "1px solid #eee";
            div.innerHTML = `<strong>${student.displayName || "Unknown"}</strong> <span style="font-size: 0.85rem; color: #888; margin-left: 5px;">(${student.email || "No Email"})</span>`;

            // Click behavior
            div.addEventListener("click", () => {
                inputElement.value = student.displayName || "";
                if (hiddenEmailElement) hiddenEmailElement.value = student.email || "";
                if (displayEmailElement) {
                    displayEmailElement.innerText = student.email || "No Email";
                    displayEmailElement.style.color = "#000";
                }
                dropdownElement.classList.add("hidden");
                
                // Trigger any custom action the specific page asked for
                if (onSelectCallback) onSelectCallback(student);
            });

            div.addEventListener("mouseover", () => div.style.background = "#f0f8ff");
            div.addEventListener("mouseout", () => div.style.background = "white");

            dropdownElement.appendChild(div);
        });

        dropdownElement.classList.remove("hidden");
    }
}