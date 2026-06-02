// js/main-teacher.js
import { handleGoogleLogin, initAuthListener } from "./modules/auth-roles.js";
import { renderHeader, renderPassList, setupStudentAutocomplete } from "./modules/ui-widgets.js";
import { listenToPendingPasses, listenToActivePasses, updatePassStatus, createNewPass, fetchAllStudents } from "./modules/pass-engine.js";
import { listenToEmergencyState } from "./modules/admin-engine.js";

// --- INIT AUTH & UI ---
const btnLogin = document.getElementById("btn-google-login");
if (btnLogin) btnLogin.addEventListener("click", handleGoogleLogin);

initAuthListener("teacher", async (user, role) => {
    console.log(`Welcome Teacher: ${user.displayName}`);
    
    // renderHeader handles rendering both the global top header and the role toolbar ribbon
    renderHeader(user, role);

    // =======================================================
    // PRE-LOAD STUDENTS FOR VIRTUAL KIOSK
    // =======================================================
    try {
        const studentList = await fetchAllStudents();
        const nameInput = document.getElementById("input-proxy-name");
        const dropdown = document.getElementById("proxy-autocomplete-list");
        const emailDisplay = document.getElementById("display-proxy-email");
        const emailHidden = document.getElementById("input-proxy-email");
        
        if (nameInput && dropdown) {
            setupStudentAutocomplete(nameInput, dropdown, studentList, null, emailDisplay, emailHidden);
        }
    } catch (err) {
        console.error("Failed to setup proxy autocomplete:", err);
    }

    // Hook up real-time Firestore listeners to UI components
    listenToPendingPasses((passes) => renderPassList(passes, "list-pending-passes", "pending-count"));
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

// Global Event Delegation for buttons
document.addEventListener("click", async (e) => {
    
    // --- PASS ACTION BUTTONS ---
    const btn = e.target.closest(".card-btn");
    if (btn) {
        const passId = btn.getAttribute("data-id");
        const action = btn.getAttribute("data-action");
        if (passId && action) updatePassStatus(passId, action);
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