// js/main-admin.js

// ==========================================
// 📦 CORE IMPORTS
// ==========================================
import { db } from "./firebase-config.js";
import { doc, setDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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
    
    // --- 🚪 Close Map Popout Modal ("Done" Button) ---
    const closeMapBtn = e.target.closest("#btn-close-map-popout"); 
    if (closeMapBtn) {
        e.preventDefault();
        const mapModal = document.getElementById("map-popout-modal");
        if (mapModal) {
            mapModal.classList.add("hidden"); // Hide the modal
            
            // Clear the map container so it loads fresh next time you open it
            const mapContainer = document.getElementById("full-map-container");
            if (mapContainer) mapContainer.innerHTML = "";
        }
    }

    // --- 🚦 Admin Location Capacity Limits Trigger ---
    const capacityBtn = e.target.closest("#btn-location-limits");
    if (capacityBtn) {
        e.preventDefault();
        const mapModal = document.getElementById("map-popout-modal");
        if (!mapModal) return;

        mapModal.classList.remove("hidden");
        mapModal.style.zIndex = "10000";
        
        const modalTitle = mapModal.querySelector("h2");
        if (modalTitle) modalTitle.innerText = "🚦 Click Room to Set Capacity Limit";

        // Fetch existing limits FIRST before drawing the map
        const fetchAndRenderMap = async () => {
            const limitsSnap = await getDocs(collection(db, "location_limits"));
            const currentLimits = {};
            limitsSnap.forEach(document => {
                currentLimits[document.id] = document.data().maxCapacity;
            });

            // CLEAR the container to prevent the "double click listener" bug!
            const mapContainer = document.getElementById("full-map-container");
            mapContainer.innerHTML = ""; 

            window.currentCapacityMap = new MapController({
                containerId: "full-map-container",
                mode: "admin_capacity",
                capacityLimits: currentLimits, // Pass existing limits to the map
                onRoomSelect: async (selection) => {
                    // Show current limit in the prompt if it exists
                    const existingLimit = currentLimits[selection.room] !== undefined ? currentLimits[selection.room] : "None";
                    const limitStr = prompt(`Set maximum capacity for ${selection.room}:\n(Currently: ${existingLimit} | Enter 0 to close room, leave blank to cancel)`);
                    
                    if (limitStr !== null && limitStr.trim() !== "") {
                        const maxCapacity = parseInt(limitStr, 10);
                        
                        if (!isNaN(maxCapacity)) {
                            try {
                                const limitRef = doc(db, "location_limits", selection.room);
                                await setDoc(limitRef, { maxCapacity: maxCapacity });
                                
                                // Update the map live without closing the window!
                                currentLimits[selection.room] = maxCapacity;
                                window.currentCapacityMap.capacityLimits = currentLimits;
                                window.currentCapacityMap.applyHighlights();
                                
                            } catch (error) {
                                console.error("Error setting limit:", error);
                                alert("Failed to save location limit.");
                            }
                        } else {
                            alert("Please enter a valid number.");
                        }
                    }
                }
            });
        };
        
        fetchAndRenderMap();
    }

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