// js/main-student.js
import { handleGoogleLogin, initAuthListener } from "./modules/auth-roles.js";
import { renderHeader } from "./modules/ui-widgets.js";
import { 
    renderStudentIdleScreen, 
    renderStudentSidebar, 
    renderRecentTravelsSidebar,
    renderMapModal, 
    renderStudentWaitingScreen, 
    renderStudentActiveScreen 
} from "./modules/student-ui.js";
import { createNewPass, listenToStudentPass, updatePassStatus, fetchStudentProfileByEmail } from "./modules/pass-engine.js";
import { 
    initializeTimeEngine, 
    fetchTodaysSchedule, 
    evaluateCurrentTime, 
    getAdjustedNow 
} from "./modules/time-engine.js";

let activeTimerInterval = null; 
let elapsedSeconds = 0; 
let selectedDestination = null; 

initializeTimeEngine();

// --- 1. PROXY MODE DETECTION ---
const urlParams = new URLSearchParams(window.location.search);
const isProxy = urlParams.get('proxy') === 'true';
const proxyName = urlParams.get('studentName');
const proxyEmail = urlParams.get('studentEmail');
const proxyTeacher = urlParams.get('teacherName');

if (isProxy) {
    console.log("Running in VIRTUAL KIOSK Mode for:", proxyName);
    
    // 1. Manually hide the login screen and show the dashboard!
    document.getElementById("screen-login").style.display = "none";
    document.getElementById("screen-dashboard").style.display = "";
    
    // 2. Add visual red border so teacher knows they are in an emulator
    document.body.style.border = "4px solid var(--pirate-red)";
    
    // 3. Skip Firebase Auth and boot the app directly
    const fakeUser = { displayName: proxyName, email: proxyEmail };
    initStudentApp(fakeUser, "student");
    
} else {
    // NORMAL MODE (Only runs if NOT in an emulator)
    const btnLogin = document.getElementById("btn-google-login");
    if (btnLogin) btnLogin.addEventListener("click", handleGoogleLogin);
    
    initAuthListener("student", async (user, role) => {
        initStudentApp(user, role);
    });
}

// --- 2. THE MAIN BOOT SEQUENCE ---
async function initStudentApp(user, role) {
    window.currentUser = user;

    renderHeader(user, role);
    
    // Modify Header in Proxy Mode
    if (isProxy) {
        const headerName = document.getElementById("header-name");
        if (headerName) headerName.innerText = `${user.displayName} (Virtual Kiosk)`;
        const btnLogout = document.getElementById("btn-logout");
        if (btnLogout) btnLogout.style.display = 'none'; // Hide logout in proxy
    }

    renderMapModal();
    
    // Fetch their schedule based on their login email!
    const studentProfile = await fetchStudentProfileByEmail(user.email);
    window.currentStudentProfile = studentProfile; 
    
    renderStudentSidebar(studentProfile);

    // ==========================================================
    // --- LIVE TIME ENGINE TRACKING COLLABORATION ---
    // ==========================================================
    let activeSchedulePeriods = null;
    
    // Fetch today's schedule from Academic Calendar 
    const todayScheduleInfo = await fetchTodaysSchedule("HS"); 
    
    if (todayScheduleInfo.isNoSchool) {
        // Trigger a lockout state screen if marked as No School
        const container = document.getElementById("kiosk-main-display");
        if (container) {
            container.innerHTML = `
                <div class="panel text-center" style="border-top: 5px solid var(--pirate-red); padding: 40px;">
                    <h2>🛑 School is Not in Session</h2>
                    <p style="font-size: 1.2rem; color: #555;">Passes cannot be issued outside of school operation hours.</p>
                </div>`;
        }
        return; // Stops the initialization
    } else {
        activeSchedulePeriods = todayScheduleInfo.periods;
    }

    // Start a continuous 1-second interval to evaluate current time metrics
    setInterval(() => {
        if (!activeSchedulePeriods) return;

        const timeMetrics = evaluateCurrentTime(activeSchedulePeriods);
        window.currentTimeState = timeMetrics; // Save globally so pass generation can read it

        // Update the new Fieldset Schedule Widget dynamically!
        if (typeof window.updateStudentScheduleWidget === "function") {
            window.updateStudentScheduleWidget(timeMetrics);
        }
        
    }, 1000);
    // ==========================================================


    // LISTEN TO THE DATABASE IN REAL-TIME
    // In proxy mode, we format the name exactly as it saves in the database so the listener catches it!
    const activeListenerName = isProxy ? `${user.displayName} (Created by ${proxyTeacher})` : user.displayName;

    listenToStudentPass(activeListenerName, (currentPass) => {
        clearInterval(activeTimerInterval);

        if (!currentPass) {
            renderStudentIdleScreen();
            // Re-render sidebar to ensure it stays visible
            renderStudentSidebar(window.currentStudentProfile); 
        } 
        else if (currentPass.status.startsWith("pending")) {
            const statusData = {
                statusLevel: currentPass.restrictionLevel || 'green',
                restrictionType: currentPass.restrictionType || null,
                recentTravels: currentPass.recentTravels || [],
                waitlistPosition: currentPass.waitlistPosition || null
            };
            renderStudentWaitingScreen(currentPass, statusData);
        }
        else if (currentPass.status === "active") {
            renderStudentActiveScreen(currentPass);
            
            // Start the massive timer
            const startTime = currentPass.createdAt ? currentPass.createdAt.toDate() : new Date();
            activeTimerInterval = setInterval(() => {
                elapsedSeconds = Math.floor((new Date() - startTime) / 1000);
                const mins = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
                const secs = String(elapsedSeconds % 60).padStart(2, '0');
                
                const timerDisplay = document.getElementById("student-timer-display");
                if (timerDisplay) {
                    timerDisplay.innerText = `${mins}:${secs}`;
                    if (elapsedSeconds > 300) { // Over 5 minutes turns red
                        timerDisplay.style.color = "var(--pirate-red)";
                        timerDisplay.classList.add("pulse-warning");
                    }
                }
            }, 1000);
        }
    });
}

// --- COUNT-UP STOPWATCH ---
function startStopwatchTimer() {
    elapsedSeconds = 0;
    
    activeTimerInterval = setInterval(() => {
        elapsedSeconds++;
        const timerDisplay = document.getElementById("student-timer-display");
        
        if (timerDisplay) {
            const minutes = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
            const seconds = (elapsedSeconds % 60).toString().padStart(2, '0');
            timerDisplay.innerText = `${minutes}:${seconds}`;
            
            if (elapsedSeconds >= 300) {
                timerDisplay.style.color = "var(--pirate-red)";
            }
        }
    }, 1000);
}

// --- MOCK EVALUATION ENGINE ---
function evaluateRestrictions(destination) {
    if (destination.includes("Restroom")) {
        return { statusLevel: "yellow", restrictionType: null, recentTravels: [{ destination: "Restroom", time: "15 mins ago" }], restrictionReason: null, waitlistPosition: null };
    } else if (destination.includes("Nurse")) {
        return { statusLevel: "red", restrictionType: "capacity", recentTravels: [], restrictionReason: "Destination at Maximum Capacity", waitlistPosition: 3 };
    } else if (destination.includes("Gym")) {
        return { statusLevel: "red", restrictionType: "temporary", recentTravels: [], restrictionReason: "Admin locked hallway due to spill.", waitlistPosition: null };
    } else if (destination.includes("Parking") || destination.includes("Outside")) {
        return { statusLevel: "red", restrictionType: "permanent", recentTravels: [], restrictionReason: "Student not permitted in unstructured outside areas.", waitlistPosition: null };
    } else {
        return { statusLevel: "green", restrictionType: null, recentTravels: [], restrictionReason: null, waitlistPosition: null };
    }
}

// Global Event Listeners
document.addEventListener("click", async (e) => {
    const mapModal = document.getElementById("map-modal");

    // --- MAP CONTROLS ---
    if (e.target.id === "btn-open-map") mapModal.classList.remove("hidden");
    if (e.target.id === "close-map-modal") mapModal.classList.add("hidden");

    // --- FULL SCHEDULE TOGGLES ---
    if (e.target.closest("#btn-open-full-schedule")) {
        const schedModal = document.getElementById("full-schedule-modal");
        if (schedModal) schedModal.classList.remove("hidden");
    }
    
    if (e.target.id === "close-full-schedule") {
        const schedModal = document.getElementById("full-schedule-modal");
        if (schedModal) schedModal.classList.add("hidden");
    }

    const mapNode = e.target.closest(".map-node"); 
    if (mapNode) {
        
        // --- BULLETPROOF HALLWAY CHECK ---
        const mapId = (mapNode.getAttribute("data-id") || "").toLowerCase();
        const isCorridor = mapNode.querySelector(".corridor-box") || 
                           mapNode.innerHTML.includes("corridor-box") ||
                           mapId.includes("hallway") || 
                           mapId.includes("corridor") ||
                           mapId.includes("block");
                           
        if (isCorridor) {
            // SILENTLY IGNORE. No alert, no UI changes.
            return; 
        }

        document.querySelectorAll(".map-node").forEach(node => node.classList.remove("selected"));
        mapNode.classList.add("selected");
        selectedDestination = mapNode.getAttribute("data-id");
        document.getElementById("selected-room-label").innerText = `Destination: ${selectedDestination}`;
        document.getElementById("btn-confirm-destination").disabled = false;
    }

    // --- 1. STUDENT CONFIRMS MAP DESTINATION ---
    if (e.target.id === "btn-confirm-destination") {
        if (!selectedDestination) return;
        
        e.target.innerText = "⏳ Requesting...";
        e.target.disabled = true;

        const evaluation = evaluateRestrictions(selectedDestination);

        // Determine period log target based on active passing periods
        let assignedPeriod = "Unknown";
        if (window.currentTimeState) {
            if (window.currentTimeState.isPassing && window.currentTimeState.nextPeriod) {
                // If in passing period, count it against their UPCOMING period assignment
                assignedPeriod = window.currentTimeState.nextPeriod;
            } else if (window.currentTimeState.currentPeriod) {
                assignedPeriod = window.currentTimeState.currentPeriod;
            }
        }

        // FORMAT THE NAME TO INCLUDE THE TEACHER IF IN PROXY MODE!
        const finalDisplayName = isProxy ? `${window.currentUser.displayName} (Created by ${proxyTeacher})` : window.currentUser.displayName;

        const passData = {
            studentDisplayName: finalDisplayName,
            destination: selectedDestination,
            period: assignedPeriod, // <-- This successfully tags the class period to the pass!
            type: "standard",
            initiatedBy: isProxy ? "teacher_proxy" : "student",
            status: evaluation.statusLevel === 'red' ? "pending_restricted" : "pending", 
            restrictionLevel: evaluation.statusLevel,
            restrictionType: evaluation.restrictionType,
            restrictionReason: evaluation.restrictionReason,
            waitlistPosition: evaluation.waitlistPosition,
            recentTravels: evaluation.recentTravels
        };

        const success = await createNewPass(passData);
        
        if (success) {
            mapModal.classList.add("hidden");
            document.querySelectorAll(".map-node").forEach(node => node.classList.remove("selected"));
            document.getElementById("selected-room-label").innerText = "Select a room on the map";
            selectedDestination = null;
        }
        e.target.innerText = "Confirm Destination";
    }

    // --- 2. TEACHER APPROVAL HANDOFF CONTROLS ---
    if (e.target.id === "btn-teacher-approve") {
        const passId = e.target.getAttribute("data-id");
        updatePassStatus(passId, "active");
    }
    if (e.target.id === "btn-teacher-reject") {
        const passId = e.target.getAttribute("data-id");
        updatePassStatus(passId, "rejected");
    }

    // --- 3. TEACHER RETURN HANDOFF CONTROL ---
    if (e.target.id === "btn-teacher-return") {
        const passId = e.target.getAttribute("data-id");
        updatePassStatus(passId, "returned");
    }
});