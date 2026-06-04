// js/main-teacher.js
import { handleGoogleLogin, initAuthListener } from "./modules/auth-roles.js";
import { renderHeader, renderPassList, setupStudentAutocomplete } from "./modules/ui-widgets.js";
import { listenToPendingPasses, listenToActivePasses, updatePassStatus, createNewPass, fetchAllStudents } from "./modules/pass-engine.js";
import { listenToEmergencyState } from "./modules/admin-engine.js";
import { schoolMapSVG } from "./map.js";

// --- INIT AUTH & UI ---
const btnLogin = document.getElementById("btn-google-login");
if (btnLogin) btnLogin.addEventListener("click", handleGoogleLogin);

initAuthListener("teacher", async (user, role) => {
    console.log(`Welcome Teacher: ${user.displayName}`);
    
    // renderHeader handles rendering both the global top header and the role toolbar ribbon
    renderHeader(user, role);

    // =======================================================
    // PRE-LOAD STUDENTS FOR VIRTUAL KIOSK & SEND PASS MODAL
    // =======================================================
    try {
        const studentList = await fetchAllStudents();
        
        // 1. Setup Autocomplete for Virtual Kiosk (Existing)
        const nameInput = document.getElementById("input-proxy-name");
        const dropdown = document.getElementById("proxy-autocomplete-list");
        const emailDisplay = document.getElementById("display-proxy-email");
        const emailHidden = document.getElementById("input-proxy-email");
        
        if (nameInput && dropdown) {
            setupStudentAutocomplete(nameInput, dropdown, studentList, null, emailDisplay, emailHidden);
        }

        // 🌟 2. NEW: Setup Autocomplete for the "Send a Pass" modal
        const pushNameInput = document.getElementById("proxy-search-input");
        const pushDropdown = document.getElementById("proxy-datalist");
        const pushHiddenEmail = document.getElementById("proxy-email-input");
        const pushSubmitBtn = document.getElementById("btn-submit-proxy-pass");

        if (pushNameInput && pushDropdown) {
            setupStudentAutocomplete(
                pushNameInput, 
                pushDropdown, 
                studentList, 
                // Callback function: Unlock the submit button when a student is selected!
                (student) => { 
                    if (pushSubmitBtn) pushSubmitBtn.disabled = false; 
                }, 
                null, 
                pushHiddenEmail
            );
        }
    } catch (err) {
        console.error("Failed to setup proxy autocomplete:", err);
    }

    // Hook up real-time Firestore listeners to UI components
    listenToPendingPasses((passes) => {
        // 🌟 TEACHER FILTER: Only show passes where they are the Origin or Target
        const myName = user.displayName;
        const myPendingPasses = passes.filter(pass => 
            pass.targetTeacher === myName || pass.originTeacher === myName
        );
        
        renderPassList(myPendingPasses, "list-pending-passes", "pending-count");
    });

    // 🌟 ACTIVE PASSES: Unfiltered. Visible to all teachers for hallway monitoring!
    listenToActivePasses((passes) => renderPassList(passes, "list-active-passes", "active-count"));
    
    // Listen for Emergencies and drop down the banner
    listenToEmergencyState((state) => {
        const banner = document.getElementById("emergency-alert-banner");
        const ribbon = document.getElementById("message-center-widget");
        
        if (banner) {
            if (state.globalLockdown) {
                // 🔴 1. LOUD LOCKDOWN EMERGENCY ACTIVE
                banner.classList.remove("hidden");
                banner.style.backgroundColor = "#c62828"; // Emergency Red
                banner.style.color = "white";
                banner.style.padding = "15px";
                banner.style.textAlign = "center";
                banner.innerHTML = "🚨 <strong>LOUD LOCKDOWN ACTIVE</strong> - Lock doors, turn off lights, and seek cover immediately! 🚨";
                
                // Turns the entire Message Center box red
                if (ribbon) {
                    ribbon.classList.add("lockdown-mode"); 
                    ribbon.classList.remove("quiet-lockdown-mode");
                }
            } else if (state.quietLockdown) {
                // 🟠 2. QUIET LOCKDOWN EMERGENCY ACTIVE
                banner.classList.remove("hidden");
                banner.style.backgroundColor = "#ef6c00"; // Alert Orange / Amber
                banner.style.color = "white";
                banner.style.padding = "15px";
                banner.style.textAlign = "center";
                banner.innerHTML = "⚠️ <strong>QUIET LOCKDOWN ACTIVE</strong> - Lock classroom doors. Continue teaching, but NO hall passes permitted. ⚠️";
                
                // Style the message center widget for caution
                if (ribbon) {
                    ribbon.classList.add("lockdown-mode"); 
                    ribbon.classList.add("quiet-lockdown-mode");
                }
            } else {
                // 🟢 3. NO EMERGENCY STATUS ACTIVE
                banner.classList.add("hidden");
                banner.innerHTML = "";
                
                // Returns the Message Center to normal white/gray
                if (ribbon) {
                    ribbon.classList.remove("lockdown-mode");
                    ribbon.classList.remove("quiet-lockdown-mode");
                }
            }
        }
    });

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
    
    // --- PASS ACTION BUTTONS ---
    const btn = e.target.closest(".card-btn");
    // Ensure we don't accidentally trigger pass actions on our submit buttons
    if (btn && btn.id !== "btn-submit-proxy-pass" && btn.id !== "btn-submit-pass") {
        const passId = btn.getAttribute("data-id");
        const action = btn.getAttribute("data-action");
        if (passId && action && typeof updatePassStatus === "function") updatePassStatus(passId, action);
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

    // --- 🎫 NEW: SEND STUDENT A PASS (PROXY) MODAL CONTROLS ---
    const sendPassModal = document.getElementById("modal-proxy-search");

    // 1. Open the Modal
    if (e.target.id === "btn-open-send-pass") {
        if (sendPassModal) {
            sendPassModal.classList.remove("hidden");
            
            // Clear out all new inputs when opening
            document.getElementById("proxy-search-input").value = "";
            document.getElementById("proxy-email-input").value = "";
            document.getElementById("proxy-pass-type").value = "request";
            document.getElementById("proxy-purpose").value = "";
            document.getElementById("proxy-destination-input").value = "";
            document.getElementById("proxy-date").value = "";
            document.getElementById("proxy-when").value = "available";
            document.getElementById("proxy-when-time").value = "";
            document.getElementById("proxy-when-period").value = "";
            document.getElementById("proxy-duration").value = "5";
            document.getElementById("btn-submit-proxy-pass").disabled = true;

            // Trigger the UI change to reset hide/show elements
            document.getElementById("proxy-pass-type").dispatchEvent(new Event('change', { bubbles: true }));
            document.getElementById("proxy-when").dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    // 2. Close the Modal
    if (e.target.id === "close-proxy-search") {
        if (sendPassModal) sendPassModal.classList.add("hidden");
    }

    // 3. Submit the Push Pass
    if (e.target.id === "btn-submit-proxy-pass") {
        const studentName = document.getElementById("proxy-search-input").value.trim();
        const studentEmail = document.getElementById("proxy-email-input").value.trim();
        const passType = document.getElementById("proxy-pass-type").value; // tardy, request, required

        if (!studentName || !studentEmail) {
            return alert("Please select a student from the list.");
        }

        e.target.innerText = "⏳ Sending...";
        e.target.disabled = true;

        // Base data for all proxy passes
        let passData = {
            studentDisplayName: studentName,
            studentEmail: studentEmail.toLowerCase(),
            type: passType,
            initiatedBy: "teacher_proxy",
            senderName: window.currentUser.displayName,
            isProxy: true,
            createdAt: new Date().toISOString() // Great for the Tardy stopwatch feature!
        };

        // Add specific data based on pass type
        if (passType === "tardy") {
            passData.status = "active"; // Force directly to student screen
            passData.destination = "Current Class";
        } else {
            // It's a Request or Required pass
            const purpose = document.getElementById("proxy-purpose").value.trim();
            const destination = document.getElementById("proxy-destination-input").value.trim();
            const date = document.getElementById("proxy-date").value;
            const when = document.getElementById("proxy-when").value;
            const duration = document.getElementById("proxy-duration").value;

            if (!destination) {
                e.target.innerText = "Send Pass";
                e.target.disabled = false;
                return alert("Please select a destination from the map.");
            }

            passData.status = "scheduled"; // Goes to Message Center
            passData.purpose = purpose;
            passData.destination = destination;
            passData.scheduledDate = date;
            passData.scheduledWhen = when;
            passData.duration = duration;

            if (when === "specific_time") passData.scheduledTime = document.getElementById("proxy-when-time").value;
            if (when === "class_period") passData.scheduledPeriod = document.getElementById("proxy-when-period").value;
        }

        if (typeof createNewPass === "function") {
            createNewPass(passData).then(success => {
                if (success) {
                    if (sendPassModal) sendPassModal.classList.add("hidden");
                    alert(`✅ Pass successfully sent to ${studentName}!`);
                }
                e.target.innerText = "Send Pass";
                e.target.disabled = false;
            });
        } else {
            console.error("createNewPass function is not available.");
            e.target.disabled = false;
        }
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

    // Map Popout Modal (Now supports both the main dashboard button and the Proxy Modal button)
    if (e.target.id === "btn-open-map-popout" || e.target.id === "btn-proxy-open-map") {
        e.preventDefault(); // Prevents page reload if inside a form
        const mapModal = document.getElementById("map-popout-modal");
        if (mapModal) {
            mapModal.classList.remove("hidden");
            // Make sure the map has a high enough z-index to appear OVER the send pass modal
            mapModal.style.zIndex = "10000"; 
            
            // NEW: Directly inject the map since teachers don't use the Admin restriction function
            const mapContainer = document.getElementById("full-map-container");
            if (mapContainer && !mapContainer.querySelector("svg")) {
                mapContainer.innerHTML = schoolMapSVG;
                
                // Add the pointer cursor to show rooms are clickable
                const mapNodes = mapContainer.querySelectorAll(".map-node"); 
                mapNodes.forEach(node => node.style.cursor = "pointer");
            }
        }
    }
    if (e.target.id === "btn-close-map-popout") {
        document.getElementById("map-popout-modal").classList.add("hidden");
    }
    
    if (e.target.id === "btn-launch-proxy") {
        const pName = document.getElementById("input-proxy-name").value.trim();
        const pEmail = document.getElementById("input-proxy-email").value.trim();
        
        if (!pName || !pEmail) return alert("Please enter both the student's name and email.");
        
        // Grab the Admin or Teacher's name automatically!
        const creatorName = window.currentUser.displayName; 
        const iframe = document.getElementById("proxy-iframe");
        
        // Build the URL with the proxy flag so the student app knows it's being emulated
        const proxyUrl = `student.html?proxy=true&studentName=${encodeURIComponent(pName)}&studentEmail=${encodeURIComponent(pEmail)}&teacherName=${encodeURIComponent(creatorName)}`;
        
        if (iframe) iframe.src = proxyUrl;
        if (proxySetupModal) proxySetupModal.classList.add("hidden");
        if (proxyEmulatorModal) proxyEmulatorModal.classList.remove("hidden");
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