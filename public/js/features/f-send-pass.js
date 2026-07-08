import { setupStudentAutocomplete } from "../modules/ui-widgets.js";
import { fetchAllStudents, createNewPass } from "../modules/pass-engine.js";
import { MapController } from "../modules/map-engine.js";

// ==========================================
// 🏗️ HTML TEMPLATE
// ==========================================
const sendPassModalHTML = `
    <div id="modal-proxy-search" class="modal-overlay hidden" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
        <div class="modal" style="background: #ffffff !important; color: #333333 !important; padding: 25px; border-radius: 10px; width: 100%; max-width: 550px; max-height: 90vh; overflow-y: auto; box-shadow: 0 5px 15px rgba(0,0,0,0.3); box-sizing: border-box;">
            <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h2 style="margin: 0; color: #1a1a1a;">🎫 Send/Schedule a Pass</h2>
                <button class="close-btn" id="close-proxy-search" style="background: none; border: none; font-size: 1.5rem; cursor: pointer;">&times;</button>
            </div>
            
            <div class="modal-body" style="display: flex; flex-direction: column; gap: 12px;">
                <label style="font-size: 0.85rem; font-weight: bold; color: #555; text-transform: uppercase;">1. Select Student</label>
                <div style="position: relative;">
                    <input type="text" id="proxy-search-input" placeholder="Start typing name..." style="padding: 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 1rem; width: 100%; box-sizing: border-box;" autocomplete="off">
                    <div id="proxy-datalist" class="hidden" style="position: absolute; top: 100%; left: 0; width: 100%; max-height: 200px; overflow-y: auto; background: white; border: 1px solid #ccc; border-top: none; z-index: 10000; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border-radius: 0 0 4px 4px;"></div>
                </div>
                <input type="hidden" id="proxy-email-input">

                <label style="font-size: 0.85rem; font-weight: bold; color: #555; text-transform: uppercase;">2. Pass Type</label>
                <select id="proxy-pass-type" style="padding: 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 1rem; width: 100%;">
                    <option value="tardy">Tardy Pass (Immediate Override)</option>
                    <option value="request" selected>Request Pass (Optional / Future)</option>
                    <option value="required">Required Pass (Mandatory / Future)</option>
                </select>

                <label style="font-size: 0.85rem; font-weight: bold; color: #555; text-transform: uppercase;">3. Purpose</label>
                <input type="text" id="proxy-purpose" placeholder="e.g., Make up quiz, counselor meeting..." style="padding: 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 1rem; width: 100%; box-sizing: border-box;">

                <div id="proxy-future-options" style="display: flex; flex-direction: column; gap: 12px; margin-top: 10px; padding-top: 15px; border-top: 1px dashed #ccc;">
                    <label style="font-size: 0.85rem; font-weight: bold; color: #555; text-transform: uppercase;">4. Date</label>
                    <input type="date" id="proxy-date" style="padding: 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 1rem; width: 100%; box-sizing: border-box;">

                    <label style="font-size: 0.85rem; font-weight: bold; color: #555; text-transform: uppercase;">5. When</label>
                    <select id="proxy-when" style="padding: 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 1rem; width: 100%;">
                        <option value="available">When Available</option>
                        <option value="specific_time">Specific Time</option>
                        <option value="class_period">Class Period</option>
                    </select>
                    
                    <input type="time" id="proxy-when-time" class="hidden" style="padding: 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 1rem; width: 100%; box-sizing: border-box; margin-top: 5px;">
                    <select id="proxy-when-period" class="hidden" style="padding: 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 1rem; width: 100%; margin-top: 5px;">
                        <option value="" disabled selected>Select Period...</option>
                        <option value="1">1st Period</option>
                        <option value="2">2nd Period</option>
                        <option value="3">3rd Period</option>
                        <option value="4">4th Period</option>
                        <option value="5">5th Period</option>
                        <option value="6">6th Period</option>
                        <option value="7">7th Period</option>
                        <option value="8">8th Period</option>
                        <option value="9">9th Period</option>
                    </select>

                    <label style="font-size: 0.85rem; font-weight: bold; color: #555; text-transform: uppercase; margin-top: 5px;">6. Destination</label>
                    <div style="display: flex; gap: 10px;">
                        <input type="text" id="proxy-destination-input" readonly placeholder="Click Map to select..." style="padding: 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 1rem; flex-grow: 1; background: #f9f9f9; cursor: not-allowed;">
                        <button id="btn-proxy-open-map" class="toolbar-btn" style="background: var(--pirate-blue); color: white; border: none; padding: 10px 15px; border-radius: 6px; cursor: pointer;">🗺️ Map</button>
                    </div>

                    <label style="font-size: 0.85rem; font-weight: bold; color: #555; text-transform: uppercase;">7. Duration</label>
                    <select id="proxy-duration" style="padding: 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 1rem; width: 100%;">
                        <option value="1">1 Minute</option>
                        <option value="5" selected>5 Minutes</option>
                        <option value="10">10 Minutes</option>
                        <option value="rest_of_class">Rest of Class (Will not return)</option>
                    </select>
                </div>
                <button class="card-btn" id="btn-submit-proxy-pass" style="width: 100%; padding: 15px; margin-top: 10px; background-color: #2e7d32; color: white; border: none; font-weight: bold; font-size: 1.1rem; border-radius: 6px; cursor: pointer;" disabled>Send Pass</button>
            </div>
        </div>
    </div>
`;

function injectModalHTML() {
    // Only inject if it doesn't already exist on the page
    if (!document.getElementById("modal-proxy-search")) {
        const wrapper = document.createElement("div");
        wrapper.innerHTML = sendPassModalHTML.trim();
        document.body.appendChild(wrapper.firstChild);
    }
}

export async function initSendPassFeature() {
    // 1. Inject the HTML into the document body
    injectModalHTML();

    // 2. Pre-load students and setup Autocomplete
    try {
        const studentList = await fetchAllStudents();
        
        // 🚀 THE FIX: Save this list to global memory so the submit function can find the ID!
        window.cachedStudentListForPasses = studentList; 
        
        const pushNameInput = document.getElementById("proxy-search-input");
        const pushDropdown = document.getElementById("proxy-datalist");
        const pushHiddenEmail = document.getElementById("proxy-email-input");
        const pushSubmitBtn = document.getElementById("btn-submit-proxy-pass");

        if (pushNameInput && pushDropdown) {
            setupStudentAutocomplete(
                pushNameInput, pushDropdown, studentList, 
                () => { if (pushSubmitBtn) pushSubmitBtn.disabled = false; }, 
                null, pushHiddenEmail
            );
        }
    } catch (err) {
        console.error("Failed to setup send pass autocomplete:", err);
    }

    // 2. Bind Modal UI Event Listeners
    document.getElementById("proxy-pass-type")?.addEventListener("change", handlePassTypeChange);
    document.getElementById("proxy-when")?.addEventListener("change", handleWhenChange);
    document.getElementById("close-proxy-search")?.addEventListener("click", closeSendPassModal);
    document.getElementById("btn-proxy-open-map")?.addEventListener("click", openProxyMapPopout);
    document.getElementById("btn-submit-proxy-pass")?.addEventListener("click", submitProxyPass);

    // 3. Bind Open Modal Event (Using Event Delegation for dynamically injected buttons)
    document.addEventListener("click", (e) => {
        if (e.target.closest("#btn-open-send-pass")) {
            openSendPassModal();
        }
    });
}

// ==========================================
// 🎫 MODAL UI LOGIC
// ==========================================

function openSendPassModal() {
    const sendPassModal = document.getElementById("modal-proxy-search");
    if (!sendPassModal) return;
    
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

function closeSendPassModal() {
    const sendPassModal = document.getElementById("modal-proxy-search");
    if (sendPassModal) sendPassModal.classList.add("hidden");
}

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

export function openProxyMapPopout(e) {
    e.preventDefault(); 
    const mapModal = document.getElementById("map-popout-modal");
    if (!mapModal) return;
    
    mapModal.classList.remove("hidden");
    mapModal.style.zIndex = "10000"; 
    const modalTitle = mapModal.querySelector("h2");
    if (modalTitle) modalTitle.innerText = "🗺️ Select Destination";
    
    let selectedPeriod = null;
    const whenType = document.getElementById("proxy-when")?.value;
    if (whenType === "class_period") {
        selectedPeriod = document.getElementById("proxy-when-period")?.value;
    }

    new MapController({
        containerId: "full-map-container",
        mode: "proxy_pass",
        periodOverride: selectedPeriod,
        onRoomSelect: (selection) => {
            const proxyInput = document.getElementById("proxy-destination-input") || 
                               document.getElementById("input-proxy-destination");
            if (proxyInput) {
                proxyInput.value = selection.room;
                proxyInput.dataset.teacher = selection.teacher || "Unknown";
                
                // 🔥 THE FIX: Force the app to recognize the programmatic change
                proxyInput.dispatchEvent(new Event('input', { bubbles: true }));
                proxyInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
            mapModal.classList.add("hidden"); 
        }
    });
}

// ==========================================
// 🚀 SUBMISSION LOGIC
// ==========================================

function submitProxyPass(e) {
    const rawName = document.getElementById("proxy-search-input").value.trim();
    const studentEmail = document.getElementById("proxy-email-input").value.trim().toLowerCase();
    const passType = document.getElementById("proxy-pass-type").value; 

    // Apply Name Cleaner
    const studentName = rawName.replace(/\s*\(Created by.*?\)\s*/gi, "").replace(/\s+/g, ' ').trim();

    if (!studentName || !studentEmail) {
        return alert("Please select a student from the list.");
    }

    // 🚀 THE FIX: Look up the student's ID from the memory we saved earlier!
    let matchedStudentId = "";
    if (window.cachedStudentListForPasses) {
        const foundStudent = window.cachedStudentListForPasses.find(s => s.email?.toLowerCase() === studentEmail);
        if (foundStudent) {
            matchedStudentId = foundStudent.id || foundStudent.uid || ""; 
        }
    }

    // 🛑 SECURITY GUARD: Stop the pass from sending if the ID is missing!
    if (!matchedStudentId) {
        alert("⚠️ CRITICAL ERROR: Could not find the student's ID in the database. Pass aborted so it doesn't get lost.");
        console.error("Missing ID for:", studentEmail);
        console.log("Cached Student List:", window.cachedStudentListForPasses);
        return; 
    }

    e.target.innerText = "⏳ Sending...";
    e.target.disabled = true;

    // Base data for all proxy passes
    let passData = {
        studentId: matchedStudentId, // <--- If this is missing, the student screen will ignore it forever!
        studentDisplayName: studentName,
        studentEmail: studentEmail,
        type: passType,
        initiatedBy: "teacher_proxy",
        senderName: window.currentUser?.displayName || "Unknown Teacher",
        proxyBy: window.currentUser?.displayName || "Unknown Teacher", 
        isProxy: true,
        uiLocation: "message_center", // <--- Start in the inbox
        createdAt: new Date().toISOString()
    };

    // Add specific data based on pass type
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
            e.target.innerText = "Send Pass";
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

    if (typeof createNewPass === "function") {
        createNewPass(passData).then(success => {
            if (success) {
                closeSendPassModal();
                alert(`✅ Pass successfully sent to ${studentName}!`);
            }
            e.target.innerText = "Send Pass";
            e.target.disabled = false;
        }).catch(err => {
            console.error(err);
            e.target.innerText = "Send Pass";
            e.target.disabled = false;
        });
    } else {
        console.error("createNewPass function is missing.");
        e.target.disabled = false;
    }
}