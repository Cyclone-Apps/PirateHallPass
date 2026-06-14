// js/main-admin.js

// ==========================================
// 📦 CORE IMPORTS
// ==========================================
import { db } from "./firebase-config.js";
import { handleGoogleLogin, initAuthListener } from "./modules/auth-roles.js";
import { initializeTimeEngine } from "./modules/time-engine.js";
import { renderHeader } from "./modules/ui-widgets.js";
import { MapController } from "./modules/map-engine.js";

// ==========================================
// 🧩 ADMIN MODULE IMPORTS
// ==========================================
import { initStudentManagement } from "./admin/admin-students.js";
import { initSettingsManagement } from "./admin/admin-settings.js";
import { initPassesManagement } from "./admin/admin-passes.js";
import { initDashboardManagement } from "./admin/admin-dashboard.js";
import { initStaffManagement } from "./admin/admin-staff.js";

// ==========================================
// 🚀 APP INITIALIZATION
// ==========================================

// Start the background clock for the entire app
initializeTimeEngine(); 

// Bind Google Login
const btnLogin = document.getElementById("btn-google-login");
if (btnLogin) {
    btnLogin.addEventListener("click", handleGoogleLogin);
}

// Initialize Auth & Load Modules
initAuthListener("admin", async (user, role) => {
    // 1. Set Global User State & Render Nav
    window.currentUser = user;
    renderHeader(user, role);

    // 2. Boot up all Admin Sub-Systems
    initStudentManagement();
    initSettingsManagement();
    initPassesManagement();
    initDashboardManagement();
    initStaffManagement();
});

// ==========================================
// 🗺️ LEFTOVER GLOBAL LISTENERS (Admin Map)
// ==========================================
document.addEventListener("click", (e) => {
    
    // Admin Restrictions Map Popout
    const triggerBtn = e.target.closest("#btn-open-map-popout");
    if (triggerBtn) {
        e.preventDefault(); 
        const mapModal = document.getElementById("map-popout-modal");
        if (!mapModal) return;
        
        mapModal.classList.remove("hidden");
        mapModal.style.zIndex = "10000"; 
        
        const modalTitle = mapModal.querySelector("h2");
        if (modalTitle) modalTitle.innerText = "🗺️ Select Restricted Rooms";

        new MapController({
            containerId: "full-map-container",
            mode: "admin_restrictions",
            onRoomSelect: (selection) => {
                const roomsInput = document.getElementById("input-restricted-rooms");
                if (roomsInput) {
                    let currentRooms = roomsInput.value ? roomsInput.value.split(",").map(r => r.trim()).filter(r => r) : [];
                    
                    if (!currentRooms.includes(selection.room)) {
                        currentRooms.push(selection.room);
                        roomsInput.value = currentRooms.join(", ");
                        // Dispatch an input event so admin-students.js registers the change
                        roomsInput.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }
                mapModal.classList.add("hidden"); 
            }
        });
    }
});