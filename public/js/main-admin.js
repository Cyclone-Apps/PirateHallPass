// js/main-admin.js

// ==========================================
// 📦 CORE IMPORTS
// ==========================================
import { db } from "./firebase-config.js";
import { doc, setDoc, collection, getDocs, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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

    // ==========================================
    // 🚦 LOCATION SETTINGS & WAITLIST MENUS
    // ==========================================

    // 1. Open the Intermediate Menu (Fetches current saved time)
    const capacityBtn = e.target.closest("#btn-location-limits");
    if (capacityBtn) {
        e.preventDefault();
        const settingsModal = document.getElementById("location-settings-modal");
        if (!settingsModal) return;

        // Fetch the current saved timeout from database so the input box is accurate
        getDoc(doc(db, "system", "settings")).then(snap => {
            const timeoutInput = document.getElementById("input-waitlist-timeout");
            if (snap.exists() && snap.data().waitlistTimeoutSeconds) {
                timeoutInput.value = snap.data().waitlistTimeoutSeconds;
            } else {
                timeoutInput.value = 120; // Default to 120 if never set
            }
            settingsModal.classList.remove("hidden");
        }).catch(err => console.error("Error fetching settings:", err));
    }

    // 2. Close the Intermediate Menu
    if (e.target.closest("#btn-close-location-settings")) {
        e.preventDefault();
        document.getElementById("location-settings-modal").classList.add("hidden");
    }

   // 3. Save Global Restriction Settings (Waitlist, Cooldown, Daily Limits)
    if (e.target.closest("#btn-save-global-restrictions")) {
        e.preventDefault();
        
        // Grab all three input values
        const timeoutInput = document.getElementById("input-waitlist-timeout").value;
        const cooldownInput = document.getElementById("input-cooldown-time").value;
        const maxPassesInput = document.getElementById("input-max-passes").value;
        
        const seconds = parseInt(timeoutInput, 10);
        const cooldownMinutes = parseInt(cooldownInput, 10);
        const maxPasses = parseInt(maxPassesInput, 10);
        
        if (!isNaN(seconds) && seconds > 0 && !isNaN(cooldownMinutes) && !isNaN(maxPasses)) {
            const settingsPayload = {
                waitlistTimeoutSeconds: seconds,
                cooldownMinutes: cooldownMinutes,
                dailyMaxPasses: maxPasses
            };

            // Save to the global 'system' -> 'settings' document
            setDoc(doc(db, "system", "settings"), settingsPayload, { merge: true })
                .then(() => alert(`✅ Global Restrictions Saved!\nWaitlist: ${seconds}s\nCooldown: ${cooldownMinutes}m\nWarning Limit: ${maxPasses} passes`))
                .catch(err => console.error("Error saving global settings:", err));
        } else {
            alert("Please enter valid numbers in all fields.");
        }
    }

    // 4. Open the Map to set Room Limits (The old logic moved here!)
    if (e.target.closest("#btn-open-capacity-map")) {
        e.preventDefault();
        
        // Hide the intermediate menu
        document.getElementById("location-settings-modal").classList.add("hidden");
        
        // Show the map popout
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

            const mapContainer = document.getElementById("full-map-container");
            mapContainer.innerHTML = ""; 

            window.currentCapacityMap = new MapController({
                containerId: "full-map-container",
                mode: "admin_capacity",
                capacityLimits: currentLimits, 
                onRoomSelect: async (selection) => {
                    const existingLimit = currentLimits[selection.room] !== undefined ? currentLimits[selection.room] : "None";
                    const limitStr = prompt(`Set maximum capacity for ${selection.room}:\n(Currently: ${existingLimit} | Enter 0 to close room, leave blank to cancel)`);
                    
                    if (limitStr !== null && limitStr.trim() !== "") {
                        const maxCapacity = parseInt(limitStr, 10);
                        
                        if (!isNaN(maxCapacity)) {
                            try {
                                const limitRef = doc(db, "location_limits", selection.room);
                                await setDoc(limitRef, { maxCapacity: maxCapacity });
                                
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
                        
                        // 🔥 FIX: Dispatch both events to guarantee the UI registers the change
                        roomsInput.dispatchEvent(new Event('input', { bubbles: true }));
                        roomsInput.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
                mapModal.classList.add("hidden"); 
            }
        });
    }

    // 🚨 Area Lockdown Map Popout (Multi-Select & Visual Toggle)
    const areaLockdownBtn = e.target.closest("#btn-modify-area-lockdown");
    if (areaLockdownBtn) {
        e.preventDefault(); 
        const mapModal = document.getElementById("map-popout-modal");
        if (!mapModal) return;
        
        // Close the emergency modal if it's sitting on top of the map
        const emergencyModal = document.getElementById("emergency-modal");
        if (emergencyModal) emergencyModal.classList.add("hidden");
        
        mapModal.classList.remove("hidden");
        mapModal.style.zIndex = "10000"; 
        
        const modalTitle = mapModal.querySelector("h2");
        if (modalTitle) {
            modalTitle.innerHTML = "🗺️ Select Corridors to Toggle Lockdown";
            // 🚫 Green button code completely removed from here! Use your existing red button!
        }

        // Helper function to paint the map using your built-in SVG hazard stripes!
        const paintLockedCorridors = async () => {
            const settingsRef = doc(db, "settings", "emergencyState");
            const snap = await getDoc(settingsRef);
            const currentLocked = snap.exists() ? snap.data().lockedCorridors || [] : [];
            
            const mapSvg = document.getElementById("interactive-school-map");
            if (!mapSvg) return;

            mapSvg.querySelectorAll(".map-node").forEach(node => {
                const id = node.getAttribute("data-id");
                const box = node.querySelector(".corridor-box, .zone-box");
                
                if (box) {
                    if (currentLocked.includes(id)) {
                        box.style.fill = "url(#hazard-stripes)";
                    } else {
                        box.style.fill = ""; 
                    }
                }
            });
        };

        // Initialize Map Controller JUST for the UI/Zoom rendering
        new MapController({
            containerId: "full-map-container",
            mode: "admin_restrictions", 
            onRoomSelect: () => {} // We ignore this now because it blocks hallways!
        });

        // 🌟 THE FIX: We bypass MapController's filters and attach a direct listener!
        const mapContainer = document.getElementById("full-map-container");
        
        // Remove old listener if it exists to prevent double-clicks
        if (window.lockdownClickListener) {
            mapContainer.removeEventListener("click", window.lockdownClickListener);
        }

        window.lockdownClickListener = async (e) => {
            // 🛑 SELF-DESTRUCT: If your red "Done" button hid the modal, clean up and stop!
            if (mapModal.classList.contains("hidden") || modalTitle.innerHTML !== "🗺️ Select Corridors to Toggle Lockdown") {
                mapContainer.removeEventListener("click", window.lockdownClickListener);
                return;
            }

            const mapNode = e.target.closest(".map-node");
            if (!mapNode) return;

            // Grab the EXACT ID of what was clicked
            const selectedCorridor = mapNode.getAttribute("data-id");
            if (!selectedCorridor) return;

            // Fetch the current lockdown list
            const settingsRef = doc(db, "settings", "emergencyState");
            const snap = await getDoc(settingsRef);
            let currentLocked = snap.exists() ? snap.data().lockedCorridors || [] : [];
            
            // 🔄 TOGGLE LOGIC: If it's locked, unlock it. If it's unlocked, lock it!
            if (currentLocked.includes(selectedCorridor)) {
                currentLocked = currentLocked.filter(c => c !== selectedCorridor);
            } else {
                currentLocked.push(selectedCorridor);
            }
            
            // Save to Firebase and instantly repaint the map
            await setDoc(settingsRef, { lockedCorridors: currentLocked }, { merge: true });
            paintLockedCorridors();
        };

        // Attach it to the container to catch the raw clicks
        mapContainer.addEventListener("click", window.lockdownClickListener);

        // Paint the map as soon as it opens
        setTimeout(paintLockedCorridors, 150); 
    }

});