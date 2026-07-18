// js/main-teacher.js
import { handleGoogleLogin, initAuthListener } from "./modules/auth-roles.js";
import { renderHeader, renderPassList, setupStudentAutocomplete } from "./modules/ui-widgets.js";
// 🌟 FIX: Added listenToScheduledPasses to the import list
import { listenToPendingPasses, listenToActivePasses, listenToScheduledPasses, updatePassStatus, cancelScheduledPass, fetchAllStudents, listenToPassHistory, editPassHistory, flagPassFraudulent } from "./modules/pass-engine.js";
import { createNewPass } from "./modules/create-pass.js";
import { MapController } from "./modules/map-engine.js";
import { initLockdownListener } from "./features/f-lockdowns.js";
import { collection, query, where, onSnapshot, updateDoc, doc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { initSendPassFeature } from './features/f-send-pass.js';
import { initTeacherHistoryControls, updateTeacherHistoryData } from "./features/f-teacher-history.js";
import { getAdjustedNow } from "./modules/time-engine.js";
import { checkMissingRoomsWarning } from "./features/f-staff-rooms.js";
import { renderRetroPassModal } from "./features/f-retro-pass.js";
import { initFixIssuesTab, processStuckPasses } from './features/f-edit-pass.js';

window.cancelPass = cancelScheduledPass;

// 📢 1. DEFINE THE MESSAGE CENTER RENDERER FIRST! (So it is ready immediately)
window.renderTeacherMessageCenter = function() {
    const announcementContainer = document.getElementById("admin-messages-container"); 
    if (!announcementContainer) return;

    if (window.currentAdminAnnouncementText) {
        // PRIORITY 1: Real Admin Announcements
        announcementContainer.innerHTML = `<div style="padding: 5px;">${window.currentAdminAnnouncementText}</div>`;
    } else if (window.staffRoomWarningText) {
        // PRIORITY 2: Room Warning
        announcementContainer.innerHTML = window.staffRoomWarningText;
    } else {
        // Default Empty State
        announcementContainer.innerHTML = `<p style="color: #888; font-style: italic; margin: 5px 0; text-align: center;">No active announcements.</p>`;
    }
};

// --- INIT AUTH & UI ---
const btnLogin = document.getElementById("btn-google-login");
if (btnLogin) btnLogin.addEventListener("click", handleGoogleLogin);

initAuthListener("teacher", async (user, role) => {
    console.log(`Welcome Teacher: ${user.displayName}`);

    // 🚀 2. CHECK ROOMS ON LOGIN 
    // Wait a tiny fraction of a second to ensure the DOM is fully un-hidden
    if (user) {
        setTimeout(() => {
            // Check if roomAssignments exists, if not pass null to force the full warning
            checkMissingRoomsWarning(user.roomAssignments || null);
        }, 500); 
    }
    
    // renderHeader handles rendering both the global top header and the role toolbar ribbon
    renderHeader(user, role);

    // Initialize the newly self-contained Send Pass Feature
    initSendPassFeature();

    // =======================================================
    // PRE-LOAD STUDENTS FOR VIRTUAL KIOSK
    // =======================================================
    try {
        const studentList = await fetchAllStudents();
        
        // Setup Autocomplete for Virtual Kiosk (Existing)
        const nameInput = document.getElementById("input-proxy-name");
        const dropdown = document.getElementById("proxy-autocomplete-list");
        const emailDisplay = document.getElementById("display-proxy-email");
        const emailHidden = document.getElementById("input-proxy-email");
        
        if (nameInput && dropdown) {
            setupStudentAutocomplete(nameInput, dropdown, studentList, null, emailDisplay, emailHidden);
        }
    } catch (err) {
        console.error("Failed to setup virtual kiosk autocomplete:", err);
    }

    // 📢 NEW: UNIFIED MESSAGE CENTER RENDERER
    // This safely decides what to show without overwriting things!
    window.renderTeacherMessageCenter = function() {
        const announcementContainer = document.getElementById("admin-messages-container"); 
        if (!announcementContainer) return;

        if (window.currentAdminAnnouncementText) {
            // PRIORITY 1: Real Admin Announcements
            announcementContainer.innerHTML = `<div style="padding: 5px;">${window.currentAdminAnnouncementText}</div>`;
        } else if (window.staffRoomWarningText) {
            // PRIORITY 2: Room Warning (Only shows if no admin announcements exist!)
            announcementContainer.innerHTML = window.staffRoomWarningText;
        } else {
            // Default Empty State
            announcementContainer.innerHTML = `<p style="color: #888; font-style: italic; margin: 5px 0; text-align: center;">No active announcements.</p>`;
        }
    };

    // 📢 ANNOUNCEMENTS LISTENER
    const qAnnouncements = query(collection(db, "announcements"), where("active", "==", true));
    
    onSnapshot(qAnnouncements, (snapshot) => {
        let validMessages = [];
        const userEmail = window.currentUser?.email;
        
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const docId = docSnap.id;
            
            // 🛑 Check if this specific user has already cleared it
            if (data.readBy && data.readBy.includes(userEmail)) {
                return; // Skip drawing this message!
            }
            
            // Check if this user is supposed to see it
            let isTarget = false;
            if (data.audience === 'everyone' || data.audience === 'teachers') { 
                isTarget = true;
            } else if (data.audience === 'specific' && userEmail && (data.targets.includes(userEmail) || data.targets.includes(window.currentUser.uid))) {
                isTarget = true; 
            }
            
            if (isTarget) {
                // 🎨 Red, bold text, optional link, and the Clear button
                let msgHtml = `<strong style="color: #c62828; font-weight: 900;">Admin: ${data.message}</strong>`;
                
                if (data.link) {
                    msgHtml += ` <a href="${data.link}" target="_blank" style="text-decoration: none; margin-left: 5px;" title="Open Link">🔗</a>`;
                }
                
                msgHtml += ` <button onclick="window.dismissAnnouncement('${docId}')" style="margin-left: 10px; padding: 2px 6px; font-size: 0.8rem; cursor: pointer; border: 1px solid #ccc; border-radius: 4px; background: white;">Clear</button>`;
                
                validMessages.push(msgHtml);
            }
        });
        
        // Store the admin text globally
        if (validMessages.length > 0) {
            window.currentAdminAnnouncementText = validMessages.join('<br><hr style="border: 0; border-top: 1px solid #eee; margin: 8px 0;"><br>');
        } else {
            window.currentAdminAnnouncementText = "";
        }
        
        // Let our new referee function draw the screen!
        window.renderTeacherMessageCenter();
    });

    // 🧹 NEW: Global function so the inline button can trigger the database update
    window.dismissAnnouncement = async (docId) => {
        if (!window.currentUser?.email) return;
        try {
            const { doc, updateDoc, arrayUnion } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
            await updateDoc(doc(db, "announcements", docId), {
                readBy: arrayUnion(window.currentUser.email)
            });
        } catch (error) {
            console.error("Error dismissing message:", error);
        }
    };

    // 🎯 INITIALIZE FIX ISSUES TAB
    initFixIssuesTab();

    // Hook up real-time Firestore listeners to UI components
    listenToPendingPasses((passes) => {
        const myName = user.displayName;
        
        // 🌟 Filter to only show passes where this teacher is involved
        const myPendingPasses = passes.filter(pass => 
            pass.targetTeacher === myName || 
            pass.originTeacher === myName ||
            pass.senderName === myName 
        );
        
        renderPassList(myPendingPasses, "list-pending-passes", "pending-count");
        
        // 🧹 REMOVED: legacy client-side date filters and updateIssuesTab()
    });

    // 🌟 UNVERIFIED STALE PASSES (Feeds the Fix Issues Tab)
    const qStale = query(collection(db, "passes"), where("needsVerification", "==", true));
    onSnapshot(qStale, (snapshot) => {
        const stalePasses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // 🔍 LOG 1: Did we find the passes?
        console.log(`[STALE LISTENER] Found ${stalePasses.length} passes needing verification.`);
        if (stalePasses.length > 0) {
            console.log(`[STALE LISTENER] First pass target teacher is:`, stalePasses[0].targetTeacher);
        }

        // 🔍 LOG 2: Is the function actually loaded?
        console.log(`[STALE LISTENER] Is processStuckPasses available?`, typeof processStuckPasses);

        if (typeof processStuckPasses === "function") {
            processStuckPasses(stalePasses, window.currentUser || user);
        } else {
            console.error("🚨 ERROR: processStuckPasses is not defined in main-teacher.js! Missing import?");
        }
    });
    
    // 🌟 ACTIVE PASSES: Unfiltered. Visible to all teachers for hallway monitoring!
    listenToActivePasses((passes) => {
        // Render all active passes seamlessly
        renderPassList(passes, "list-active-passes", "active-count");
        
        // 🧹 REMOVED: legacy client-side date filters and updateIssuesTab()
    });

    // =======================================================
    // 🌟 NEW: SCHEDULED / SENT PASSES (3rd Column)
    // =======================================================
    if (typeof listenToScheduledPasses === "function") {
        listenToScheduledPasses((passes) => {
            // 🌟 FIX: Fallback checks for both ID variations so it connects seamlessly to your layout
            const scheduledContainerTeacher = document.getElementById("scheduled-passes-container") || document.getElementById("list-sent-passes");
            const sentCountBadge = document.getElementById("sent-count");
            if (!scheduledContainerTeacher) return;
            
            scheduledContainerTeacher.innerHTML = "";
            const myName = user.displayName;
            const now = getAdjustedNow();

            // Filter: Must be sent by THIS teacher, and must not be expired
            const myScheduledPasses = passes.filter(p => {
                if (p.senderName !== myName) return false;
                
                if (!p.scheduledDate || !p.scheduledTime) return true; 
                const passDateTime = new Date(`${p.scheduledDate}T${p.scheduledTime}`);
                return passDateTime >= now;
            });

            // 🌟 FIX: Automatically update your 3rd column badge count!
            if (sentCountBadge) {
                sentCountBadge.innerText = myScheduledPasses.length;
            }

            if (myScheduledPasses.length === 0) {
                scheduledContainerTeacher.innerHTML = `<div style="padding: 15px; color: #777; text-align: center; border: 1px dashed #ccc; border-radius: 8px;">You have no active scheduled passes.</div>`;
                return;
            }

            myScheduledPasses.forEach(pass => {
                let timeText = pass.scheduledTime ? pass.scheduledTime : `Period ${pass.scheduledPeriod}`;
                let teacherText = pass.targetTeacher && pass.targetTeacher !== "Unknown" ? ` (${pass.targetTeacher})` : "";

                const card = document.createElement("div");
                card.style.cssText = "background: white; border: 1px solid #eaedf2; border-left: 5px solid #2196F3; padding: 15px; margin-bottom: 12px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);";
                
                card.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; font-weight: bold; margin-bottom: 5px;">
                        <span style="font-size: 1.1rem; color: #1a1a1a;">🧑‍🎓 ${pass.studentDisplayName || pass.studentName}</span>
                        <span class="badge" style="text-transform: uppercase; font-size: 0.75rem; background: #eee;">${pass.type || "Request"}</span>
                    </div>
                    <div style="color: #555; font-size: 0.95rem; margin-bottom: 5px;">
                        📍 To: <strong>${pass.destination}</strong>${teacherText}
                    </div>
                    <div style="color: #444; font-size: 0.85rem; margin-bottom: 5px;">
                        📅 <strong>${pass.scheduledDate}</strong> @ <strong>${timeText}</strong>
                    </div>
                    
                    <div style="margin-top: 10px; display: flex; gap: 8px;">
                        <button class="btn-cancel-scheduled" data-id="${pass.id}" style="background: #ef5350; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 0.8rem;">Cancel Pass</button>
                    </div>
                `;

                const cancelBtn = card.querySelector(".btn-cancel-scheduled");
                if (cancelBtn) {
                    cancelBtn.addEventListener("click", () => {
                        if (confirm("Are you sure you want to cancel this scheduled pass?")) {
                            if (typeof window.cancelPass === "function") window.cancelPass(pass.id);
                        }
                    });
                }

                scheduledContainerTeacher.appendChild(card);
            });
        });
    }
    
// =======================================================
    // 🌟 HISTORY PASSES (4th Column - Decoupled)
    // =======================================================
    
    // 1. Initialize the tab click listeners
    initTeacherHistoryControls();

    // 2. Activate the real-time Firebase Listener and feed it to our new feature module
    if (typeof listenToPassHistory === "function") {
        listenToPassHistory((passes) => {
            // We pass 'user' so the module knows exactly who the teacher is!
            updateTeacherHistoryData(passes, window.currentUser || user);
        });
    }

    // Save user info to window for the modal engine to use
    window.currentUser = user; 
    
    // Start the global lockdown engine (Automatically handles Teacher UI alerts)
    initLockdownListener();

    // Save user info to window for the modal engine to use
    window.currentUser = user; 
});

// --- 🎫 MODAL DYNAMIC UI LOGIC (TARDY vs REQUEST) ---
// This listens for changes in the dropdowns to hide/show fields
document.addEventListener("change", (e) => {
    // Handle Pass Type Change
    if (e.target.id === "proxy-pass-type") {
        const type = e.target.value;
        const purposeSection = document.getElementById("proxy-purpose").previousElementSibling;
        const purposeInput = document.getElementById("proxy-purpose");
        const destSection = document.getElementById("proxy-destination-input").parentElement.previousElementSibling;
        const destInput = document.getElementById("proxy-destination-input").parentElement;
        const futureOptions = document.getElementById("proxy-future-options");
        const submitBtn = document.getElementById("btn-submit-proxy-pass");

        if (type === "tardy") {
            // Hide everything except Student Name
            if (purposeSection) purposeSection.style.display = "none";
            if (purposeInput) purposeInput.style.display = "none";
            if (destSection) destSection.style.display = "none";
            if (destInput) destInput.style.display = "none";
            if (futureOptions) futureOptions.style.display = "none";
            if (submitBtn) {
                submitBtn.innerText = "Send Tardy Pass Now";
                submitBtn.style.backgroundColor = "#c62828"; // Red
            }
        } else {
            // Show everything for Request/Required
            if (purposeSection) purposeSection.style.display = "block";
            if (purposeInput) purposeInput.style.display = "block";
            if (destSection) destSection.style.display = "block";
            if (destInput) destInput.style.display = "flex";
            if (futureOptions) futureOptions.style.display = "flex";
            if (submitBtn) {
                submitBtn.innerText = "Send Pass";
                submitBtn.style.backgroundColor = "#2e7d32"; // Green
            }
        }
    }

    // Handle "When" Dropdown Change (Specific Time vs Class Period)
    if (e.target.id === "proxy-when") {
        const whenType = e.target.value;
        const timeInput = document.getElementById("proxy-when-time");
        const periodInput = document.getElementById("proxy-when-period");

        if (timeInput) timeInput.classList.add("hidden");
        if (periodInput) periodInput.classList.add("hidden");

        if (whenType === "specific_time" && timeInput) {
            timeInput.classList.remove("hidden");
        } else if (whenType === "class_period" && periodInput) {
            periodInput.classList.remove("hidden");
        }
    }
});

// Global Event Delegation for buttons
document.addEventListener("click", async (e) => {
    // 🕰️ Open Retroactive Pass Modal
    if (e.target.id === "btn-open-retro-pass" || e.target.closest("#btn-open-retro-pass")) {
        e.preventDefault();
        renderRetroPassModal();
    }
    // --- PASS ACTION BUTTONS ---
const btn = e.target.closest(".card-btn");
if (btn && btn.id !== "btn-submit-proxy-pass" && btn.id !== "btn-submit-pass") {
    const passId = btn.getAttribute("data-id");
    let action = btn.getAttribute("data-action");
    const currentStatus = btn.getAttribute("data-current-status"); 
    
    if (passId && action && typeof updatePassStatus === "function") {
        let extraData = {}; // 🌟 Create a container for extra fields
        
        // 🌟 1. THE WARNING POP-UP INTERCEPT
        if (currentStatus === "pending_restricted" && action === "active") {
            const proceed = confirm("⚠️ ADMIN WARNING: You are about to override a restricted pass. Admin will be notified and may inquire why. Do you wish to proceed?");
            if (!proceed) return; 
            action = "active_bypassed"; 
            extraData.bypassedBy = window.currentUser?.displayName || "Staff";
        }
        
        // 🌟 2. CHECK-IN TIMELINE INTERCEPTS
        if (action === "arrived") {
            action = currentStatus; 
            extraData.arrivedAt = true; // 🎯 FIX: Changed from getAdjustedNow()
        } else if (action === "departed") {
            action = currentStatus; 
            extraData.departedAt = true; // 🎯 FIX: Changed from getAdjustedNow()
        }
        
        // 🌟 3. THE RETURN INTERCEPT
        if (currentStatus === "active_bypassed" && action === "returned") {
            action = "returned_bypassed"; 
        }

        // Pass extraData as the 3rd argument
        if (typeof updatePassStatus === "function") {
             updatePassStatus(passId, action, extraData);
        }
    }
}

    // --- MODAL CONTROLS ---
    const modal = document.getElementById("new-pass-modal");
    
    // Open Modal
    if (e.target.id === "btn-create-pass") {
        if (modal) modal.classList.remove("hidden");
    }
    
    // Close Modal
    if (e.target.id === "close-pass-modal") {
        if (modal) modal.classList.add("hidden");
    }

    // --- VIRTUAL KIOSK CONTROLS ---
    const proxySetupModal = document.getElementById("proxy-setup-modal");
    const proxyEmulatorModal = document.getElementById("proxy-emulator-modal");

    if (e.target.id === "btn-open-proxy-setup") {
        if (proxySetupModal) proxySetupModal.classList.remove("hidden");
    }
    
    if (e.target.id === "close-proxy-setup") {
        if (proxySetupModal) proxySetupModal.classList.add("hidden");
    }
    
    if (e.target.id === "btn-close-emulator") {
        if (proxyEmulatorModal) proxyEmulatorModal.classList.add("hidden");
        const iframe = document.getElementById("proxy-iframe");
        if (iframe) iframe.src = ""; // Clear the iframe to stop background processes
    }

    // 🌟 VIRTUAL KIOSK LAUNCH (Consolidated & Cleaned)
    if (e.target.id === "btn-launch-proxy") {
        const rawName = document.getElementById("input-proxy-name").value.trim();
        const pEmail = document.getElementById("input-proxy-email").value.trim();
        
        if (!rawName || !pEmail) return alert("Please enter both the student's name and email.");
        
        // 🌟 Apply Name Cleaner: Strip tags and fix double spaces
        const pName = rawName.replace(/\s*\(Created by.*?\)\s*/gi, "").replace(/\s+/g, ' ').trim();
        
        // Note: For teachers, we use currentUser.displayName
        const creatorName = window.currentUser?.displayName || "Teacher"; 
        const iframe = document.getElementById("proxy-iframe");
        
        // Pass the perfectly clean name to the student screen!
        const proxyUrl = `student.html?proxy=true&studentName=${encodeURIComponent(pName)}&studentEmail=${encodeURIComponent(pEmail)}&teacherName=${encodeURIComponent(creatorName)}`;
        
        if (iframe) iframe.src = proxyUrl;
        
        if (proxySetupModal) proxySetupModal.classList.add("hidden");
        if (proxyEmulatorModal) proxyEmulatorModal.classList.remove("hidden");
    }

    // Map Popout Modal (Now only handles Admin Restrictions natively!)
    if (e.target.id === "btn-open-map-popout") {
        e.preventDefault(); 
        const mapModal = document.getElementById("map-popout-modal");
        
        if (mapModal) {
            mapModal.classList.remove("hidden");
            mapModal.style.zIndex = "10000"; 
            const modalTitle = mapModal.querySelector("h2");

            // 🔴 ADMIN RESTRICTION MODE
            if (modalTitle) modalTitle.innerText = "🗺️ Click Rooms to Restrict";
            new MapController({
                containerId: "full-map-container",
                mode: "admin_restrict",
                selectedRooms: typeof selectedRooms !== "undefined" ? selectedRooms : [], 
                onRoomSelect: (updatedRoomsArray) => {
                    if (typeof selectedRooms !== "undefined") selectedRooms = updatedRoomsArray; 
                    if (typeof updateRoomDisplay === "function") updateRoomDisplay(); 
                }
            });
        }
    }

    // Close Map Button
    if (e.target.id === "btn-close-map-popout") {
        const mapModal = document.getElementById("map-popout-modal");
        if (mapModal) mapModal.classList.add("hidden");
    }

        // Submit New Pass
    if (e.target.id === "btn-submit-pass") {
        const nameInput = document.getElementById("input-student-name");
        const destination = document.getElementById("input-destination").value;
        const type = document.getElementById("input-pass-type").value;
        const name = nameInput.value.trim();
        
        if (!name) return alert("Please enter a student name.");

        // Visual loading state
        e.target.innerText = "⏳ Sending...";
        e.target.disabled = true;

        const passData = {
            studentDisplayName: name,
            destination: destination,
            type: type,
            initiatedBy: "teacher",
            senderName: window.currentUser.displayName,
            proxyBy: window.currentUser.displayName, // 🌟 NEW: Bulletproof teacher name
            status: type === "tardy" ? "active" : "pending_student"
        };

        const success = await createNewPass(passData);
        
        if (success) {
            if (modal) modal.classList.add("hidden");
            nameInput.value = ""; // Clear input field
        }
        
        // Reset button
        e.target.innerText = "Send Pass";
        e.target.disabled = false;
    }
});

// =======================================================
// ✏️ EDIT HISTORY & FRAUD FLAG MODAL LOGIC
// =======================================================
document.addEventListener("click", async (e) => {
    
    // =======================================================
    // 🗺️ MAP LAUNCHER FOR EDIT HISTORY MODAL
    // =======================================================
    if (e.target.id === "btn-edit-history-map") {
        const mapModal = document.getElementById("map-popout-modal");
        const mapContainer = document.getElementById("full-map-container");
        
        if (mapModal && mapContainer) {
            mapContainer.innerHTML = ""; // Clear existing map to prevent duplicates
            mapModal.classList.remove("hidden");
            
            // Launch the map in 'student' mode so it allows single-room selection
            new MapController({
                containerId: "full-map-container",
                mode: "student",
                onRoomSelect: (data) => { // 🟢 FIX: Handle the object passed by map-engine.js
                    const destInput = document.getElementById("edit-history-destination");
                    if (destInput && data && data.room) {
                        destInput.value = data.room; // Pull the room string out of the object
                        
                        // 🔥 FIX: Dispatch events to wake up the UI listeners
                        destInput.dispatchEvent(new Event('input', { bubbles: true }));
                        destInput.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    mapModal.classList.add("hidden"); // Auto-close map after selection
                }
            });
        }
    }
    
    // 1. Open the Edit Modal
    if (e.target.closest(".btn-edit-history")) {
        const btn = e.target.closest(".btn-edit-history");
        const passId = btn.getAttribute("data-id");
        const currentDest = btn.getAttribute("data-dest");
        
        document.getElementById("edit-history-pass-id").value = passId;
        document.getElementById("edit-history-destination").value = currentDest;
        document.getElementById("edit-history-destination").setAttribute("data-original", currentDest);
        
        // Store millisecond timestamps AND string values
        document.getElementById("edit-history-pass-id").setAttribute("data-start-ms", btn.getAttribute("data-start-ms"));
        document.getElementById("edit-history-pass-id").setAttribute("data-end-ms", btn.getAttribute("data-end-ms"));
        document.getElementById("edit-history-pass-id").setAttribute("data-orig-start-ms", btn.getAttribute("data-orig-start-ms"));
        document.getElementById("edit-history-pass-id").setAttribute("data-orig-end-ms", btn.getAttribute("data-orig-end-ms"));
        
        // 🟢 FIX: Store the "HH:MM" string to prevent false-positive edits
        document.getElementById("edit-history-pass-id").setAttribute("data-start-str", btn.getAttribute("data-start-val"));
        document.getElementById("edit-history-pass-id").setAttribute("data-end-str", btn.getAttribute("data-end-val"));
        
        // Pre-fill the time inputs
        const startInput = document.getElementById("edit-history-start-time");
        const endInput = document.getElementById("edit-history-end-time");
        if(startInput) startInput.value = btn.getAttribute("data-start-val");
        if(endInput) endInput.value = btn.getAttribute("data-end-val");

        // Reset Fraud toggle state
        document.getElementById("fraud-explanation-container").classList.add("hidden");
        document.getElementById("edit-history-fraud-reason").value = "";
        document.getElementById("btn-toggle-fraud").innerText = "🚩 Flag as Fraudulent";
        
        document.getElementById("modal-edit-history").classList.remove("hidden");
    }

    // 2. Close the Edit Modal
    if (e.target.id === "close-edit-history-modal") {
        document.getElementById("modal-edit-history").classList.add("hidden");
    }

    // 3. Toggle the Fraud Explanation Textbox
    if (e.target.id === "btn-toggle-fraud") {
        const container = document.getElementById("fraud-explanation-container");
        if (container.classList.contains("hidden")) {
            container.classList.remove("hidden");
            e.target.innerText = "❌ Cancel Fraud Flag";
        } else {
            container.classList.add("hidden");
            e.target.innerText = "🚩 Flag as Fraudulent";
            document.getElementById("edit-history-fraud-reason").value = "";
        }
    }

    // 4. Save Changes to Firebase
    if (e.target.id === "btn-save-history-edit") {
        const passId = document.getElementById("edit-history-pass-id").value;
        const originalDest = document.getElementById("edit-history-destination").getAttribute("data-original");
        const newDest = document.getElementById("edit-history-destination").value.trim();
        
        const startInput = document.getElementById("edit-history-start-time")?.value;
        const endInput = document.getElementById("edit-history-end-time")?.value;
        
        const startMs = document.getElementById("edit-history-pass-id").getAttribute("data-start-ms");
        const endMs = document.getElementById("edit-history-pass-id").getAttribute("data-end-ms");
        const origStartMs = document.getElementById("edit-history-pass-id").getAttribute("data-orig-start-ms");
        const origEndMs = document.getElementById("edit-history-pass-id").getAttribute("data-orig-end-ms");
        
        // 🟢 FIX: Fetch original strings to compare
        const origStartStr = document.getElementById("edit-history-pass-id").getAttribute("data-start-str");
        const origEndStr = document.getElementById("edit-history-pass-id").getAttribute("data-end-str");
        
        const isFraudOpen = !document.getElementById("fraud-explanation-container").classList.contains("hidden");
        const fraudReason = document.getElementById("edit-history-fraud-reason").value.trim();

        if (!passId) return;

        e.target.innerText = "⏳ Saving...";
        e.target.disabled = true;

        let success = true;
        let updates = {};

        // Process Destination Change
        if (newDest && newDest !== originalDest) {
            updates.destination = newDest;
            if (!document.getElementById("edit-history-destination").getAttribute("data-has-orig")) {
                 updates.originalDestination = originalDest;
            }
        }

        // Helper to apply a new "HH:MM" string to an existing date
        const applyTimeToDate = (msString, timeString) => {
            if (!msString || !timeString) return null;
            const dateObj = new Date(parseInt(msString));
            const [hours, minutes] = timeString.split(":");
            dateObj.setHours(hours, minutes, 0, 0);
            return dateObj;
        };

        // 🟢 Process Start Time Change (ONLY if the text actually changed)
        if (startInput && startInput !== origStartStr) {
            const newStartDate = applyTimeToDate(startMs, startInput);
            if (newStartDate) {
                updates.acceptedAt = newStartDate;
                if (!origStartMs && startMs) {
                    updates.originalAcceptedAt = new Date(parseInt(startMs));
                }
            }
        }
        
        // 🟢 Process End Time Change (ONLY if the text actually changed)
        if (endInput && endInput !== origEndStr) {
            const newEndDate = applyTimeToDate(endMs, endInput);
            if (newEndDate) {
                updates.returnedAt = newEndDate;
                if (!origEndMs && endMs) {
                    updates.originalReturnedAt = new Date(parseInt(endMs));
                }
            }
        }

        // Execute Updates
        if (Object.keys(updates).length > 0) {
            success = await editPassHistory(passId, updates, window.currentUser.displayName);
        }

        // Process Fraud Flag
        if (isFraudOpen && fraudReason) {
            success = await flagPassFraudulent(passId, fraudReason);
        } else if (isFraudOpen && !fraudReason) {
            alert("Please provide an explanation for the admin regarding this fraud flag.");
            e.target.innerText = "Save Changes";
            e.target.disabled = false;
            return;
        }

        if (success) {
            document.getElementById("modal-edit-history").classList.add("hidden");
        } else {
            alert("Error saving changes.");
        }
        
        // Reset button
        e.target.innerText = "Save Changes";
        e.target.disabled = false;
    }
});