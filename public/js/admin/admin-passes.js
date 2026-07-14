// js/admin/admin-passes.js

// 🌟 FIX: Combined the imports to ensure createNewPass is actively loaded
import { fetchAllStudents } from "../modules/pass-engine.js";
import { createNewPass } from "../modules/create-pass.js";
import { setupStudentAutocomplete } from "../modules/ui-widgets.js";
import { MapController } from "../modules/map-engine.js";
import { initSendPassFeature } from '../features/f-send-pass.js';
import { getAdjustedNow } from "../modules/time-engine.js";

// ==========================================
// 🚀 INITIALIZATION & EVENT BINDING
// ==========================================
export async function initPassesManagement() {
    
    initSendPassFeature();

    // 1. Pre-load students for both Autocomplete contexts
    try {
        const studentList = await fetchAllStudents();
        
        // Setup Virtual Kiosk Autocomplete
        const kioskNameInput = document.getElementById("input-proxy-name");
        const kioskDropdown = document.getElementById("proxy-autocomplete-list");
        const kioskEmailDisplay = document.getElementById("display-proxy-email");
        const kioskEmailHidden = document.getElementById("input-proxy-email");
        
        if (kioskNameInput && kioskDropdown) {
            setupStudentAutocomplete(kioskNameInput, kioskDropdown, studentList, null, kioskEmailDisplay, kioskEmailHidden);
        }
    } catch (err) {
        console.error("Failed to setup proxy autocomplete:", err);
    }

    // 3 & 4. EVENT DELEGATION for Dynamically Rendered Header Buttons
    document.addEventListener("click", (e) => {

        // Virtual Kiosk Setup Button
        if (e.target.closest("#btn-open-proxy-setup")) {
            document.getElementById("proxy-setup-modal")?.classList.remove("hidden");
        }
    });

    // These buttons are safe to keep as standard listeners because they live inside the Modals 
    // (which are hardcoded in the HTML, not dynamically rendered)

    document.getElementById("close-proxy-setup")?.addEventListener("click", () => document.getElementById("proxy-setup-modal")?.classList.add("hidden"));
    document.getElementById("btn-close-emulator")?.addEventListener("click", closeEmulator);
    document.getElementById("btn-launch-proxy")?.addEventListener("click", launchVirtualKiosk);
}

// ==========================================
// 🎫 SEND PASS MODAL UI LOGIC
// ==========================================
function handlePassTypeChange(e) {
    const type = e.target.value;
    const purposeSection = document.getElementById("proxy-purpose")?.previousElementSibling;
    const purposeInput = document.getElementById("proxy-purpose");
    const destSection = document.getElementById("proxy-destination-input")?.parentElement?.previousElementSibling;
    const destInput = document.getElementById("proxy-destination-input")?.parentElement;
    const futureOptions = document.getElementById("proxy-future-options");
    const submitBtn = document.getElementById("btn-submit-proxy-pass");

    if (type === "tardy") {
        if (purposeSection) purposeSection.style.display = "none";
        if (purposeInput) purposeInput.style.display = "none";
        if (destSection) destSection.style.display = "none";
        if (destInput) destInput.style.display = "none";
        if (futureOptions) futureOptions.style.display = "none";
        if (submitBtn) {
            submitBtn.innerText = "Send Tardy Pass Now";
            submitBtn.style.backgroundColor = "#c62828"; 
        }
    } else {
        if (purposeSection) purposeSection.style.display = "block";
        if (purposeInput) purposeInput.style.display = "block";
        if (destSection) destSection.style.display = "block";
        if (destInput) destInput.style.display = "flex";
        if (futureOptions) futureOptions.style.display = "flex";
        if (submitBtn) {
            submitBtn.innerText = "Send Pass";
            submitBtn.style.backgroundColor = "#2e7d32"; 
        }
    }
}

function handleWhenChange(e) {
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

function openSendPassModal() {
    const sendPassModal = document.getElementById("modal-proxy-search");
    if (!sendPassModal) return;
    
    sendPassModal.classList.remove("hidden");
    
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

    document.getElementById("proxy-pass-type").dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById("proxy-when").dispatchEvent(new Event('change', { bubbles: true }));
}

async function submitProxyPass(e) {
    const rawName = document.getElementById("proxy-search-input").value.trim();
    const studentEmail = document.getElementById("proxy-email-input").value.trim();
    const passType = document.getElementById("proxy-pass-type").value;

    // 🌟 Apply Name Cleaner: Strip "(Created by...)" tags and fix double spaces
    const studentName = rawName.replace(/\s*\(Created by.*?\)\s*/gi, "").replace(/\s+/g, ' ').trim();

    if (!studentName || !studentEmail) {
        return alert("Please select a student from the list.");
    }

    e.target.innerText = "⏳ Sending...";
    e.target.disabled = true;

    let passData = {
        studentDisplayName: studentName,
        studentEmail: studentEmail.toLowerCase(),
        type: passType,
        initiatedBy: "admin_proxy",
        senderName: window.currentUser?.displayName || "Admin",
        proxyBy: window.currentUser?.displayName || "Admin", // 🌟 NEW: Bulletproof Admin name
        isProxy: true,
        createdAt: getAdjustedNow().toISOString()
    };

    if (passType === "tardy") {
        passData.status = "active";
        passData.destination = "Current Class";
    } else {
        const purpose = document.getElementById("proxy-purpose").value.trim();
        const destInput = document.getElementById("proxy-destination-input");
        const destination = destInput ? destInput.value.trim() : "";
        const date = document.getElementById("proxy-date").value;
        const when = document.getElementById("proxy-when").value;
        const duration = document.getElementById("proxy-duration").value;

        if (!destination) {
            e.target.innerText = passType === "tardy" ? "Send Tardy Pass Now" : "Send Pass";
            e.target.disabled = false;
            return alert("Please select a destination from the map.");
        }

        passData.status = "scheduled";
        passData.purpose = purpose;
        passData.destination = destination;
        passData.targetTeacher = destInput?.dataset?.teacher || "Unknown";
        passData.scheduledDate = date;
        passData.scheduledWhen = when;
        passData.duration = duration;

        if (when === "specific_time") passData.scheduledTime = document.getElementById("proxy-when-time").value;
        if (when === "class_period") passData.scheduledPeriod = document.getElementById("proxy-when-period").value;
    }

    if (typeof createNewPass === "function" || typeof window.createNewPass === "function") {
        const fn = typeof createNewPass === "function" ? createNewPass : window.createNewPass;
        const success = await fn(passData);
        if (success) {
            document.getElementById("modal-proxy-search")?.classList.add("hidden");
            alert(`✅ Pass successfully pushed to ${studentName}!`);
        }
    } else {
        console.error("CRITICAL ERROR: 'createNewPass' function is completely unavailable.");
        alert("❌ Error: The database pass engine could not be reached. Check import links.");
    }
    
    e.target.innerText = passType === "tardy" ? "Send Tardy Pass Now" : "Send Pass";
    e.target.disabled = false;
}

// ==========================================
// 💻 VIRTUAL KIOSK CONTROLS
// ==========================================
function closeEmulator() {
    document.getElementById("proxy-emulator-modal")?.classList.add("hidden");
    const iframe = document.getElementById("proxy-iframe");
    if (iframe) iframe.src = ""; // Clears the iframe to stop background processes
}

function launchVirtualKiosk() {
    const rawName = document.getElementById("input-proxy-name").value.trim();
    const pEmail = document.getElementById("input-proxy-email").value.trim();
    
    if (!rawName || !pEmail) return alert("Please enter both the student's name and email.");
    
    // 🌟 Apply Name Cleaner: Strip tags and fix double spaces
    const pName = rawName.replace(/\s*\(Created by.*?\)\s*/gi, "").replace(/\s+/g, ' ').trim();
    
    const creatorName = window.currentUser?.displayName || "Admin"; 
    const iframe = document.getElementById("proxy-iframe");
    
    // Pass the perfectly clean name to the student screen!
    const proxyUrl = `student.html?proxy=true&studentName=${encodeURIComponent(pName)}&studentEmail=${encodeURIComponent(pEmail)}&teacherName=${encodeURIComponent(creatorName)}`;
    
    if (iframe) iframe.src = proxyUrl;
    document.getElementById("proxy-setup-modal")?.classList.add("hidden");
    document.getElementById("proxy-emulator-modal")?.classList.remove("hidden");
}