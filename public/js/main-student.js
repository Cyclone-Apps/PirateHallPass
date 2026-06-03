// js/main-student.js
import { handleGoogleLogin, initAuthListener } from "./modules/auth-roles.js";
import { renderHeader } from "./modules/ui-widgets.js";
import { 
    renderStudentIdleScreen, 
    renderStudentSidebar, 
    renderRecentTravelsSidebar,
    renderMapModal, 
    renderStudentWaitingScreen, 
    renderStudentActiveScreen,
    initializeRotationDayEngine // <-- ADD THIS IMPORT
} from "./modules/student-ui.js";
import { createNewPass, listenToStudentPass, updatePassStatus, fetchStudentProfileByEmail } from "./modules/pass-engine.js";
import { 
    initializeTimeEngine, 
    fetchTodaysSchedule, 
    evaluateCurrentTime, 
    getAdjustedNow 
} from "./modules/time-engine.js";
import { db } from "./firebase-config.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

    

    // Start the live rotation day & menu Firestore listener
    initializeRotationDayEngine(db, onSnapshot, doc);

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

   // 🚨 STUDENT EMERGENCY ENGINE 🚨
    onSnapshot(doc(db, "settings", "emergencyState"), (docSnap) => {
        const state = docSnap.exists() ? docSnap.data() : { globalLockdown: false, quietLockdown: false };
        
        // Track BOTH lockdown states in global memory
        window.currentLoudLockdown = state.globalLockdown;
        window.currentQuietLockdown = state.quietLockdown;
        
        // Trigger the visual update instantly
        if (typeof window.updateEmergencyUI === "function") {
            window.updateEmergencyUI();
        }
    });

    // Start a continuous 1-second interval to evaluate current time metrics
    setInterval(() => {
        if (!activeSchedulePeriods) return;

        const timeMetrics = evaluateCurrentTime(activeSchedulePeriods);
        window.currentTimeState = timeMetrics; // Save globally so pass generation can read it

        // Update the new Fieldset Schedule Widget dynamically!
        if (typeof window.updateStudentScheduleWidget === "function") {
            window.updateStudentScheduleWidget(timeMetrics);
        }
        
        // ✨ BULLETPROOF BANNER HIDER: Finds any element containing this text and hides it
        document.querySelectorAll("*").forEach(el => {
            if (el.innerHTML === "⏳ Synchronizing Time Engine...") {
                el.style.display = "none";
            }
        });
        
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

    // ==========================================
    // NEW: MAP ZOOM ENGINE (Native Panning & Scrolling)
    // ==========================================
    const zoomGlass = e.target.closest(".map-zoom-glass");
    if (zoomGlass) {
        e.preventDefault();
        e.stopPropagation(); 
        
        const mapSvg = document.getElementById("interactive-school-map");
        if (!mapSvg) return;

        const mapContainer = mapSvg.parentElement; 
        const iconText = zoomGlass.querySelector(".zoom-icon-text");

        if (!mapContainer) return;

        mapContainer.style.overflow = "auto";
        mapSvg.style.transition = "width 0.3s ease";

        if (mapSvg.style.width === "150vw") {
            // ------------------------------------------
            // WE ARE ZOOMED IN -> ZOOM OUT
            // ------------------------------------------
            mapSvg.style.width = "100%";
            mapSvg.style.height = "100%";
            
            // Restore Flexbox centering for the zoomed-out view
            mapContainer.style.display = "flex";
            mapContainer.style.justifyContent = "center";
            mapContainer.style.alignItems = "center";

            iconText.textContent = "🔍+"; 
            
            if (typeof window.hideTeacherNamesOnMap === "function") window.hideTeacherNamesOnMap();
        } else {
            // ------------------------------------------
            // WE CLICKED PLUS -> ZOOM IN (Massive 1.5x Scale)
            // ------------------------------------------
            
            // CRITICAL FIX 1: Turn off Flexbox layout. This guarantees 
            // scrollbars will generate for all 4 directions natively.
            mapContainer.style.display = "block";
            
            // Clear any restrictive CSS or SVG cropping rules
            mapSvg.style.maxWidth = "none";
            mapSvg.style.maxHeight = "none";
            mapSvg.removeAttribute("preserveAspectRatio");

            // CRITICAL FIX 2: Set Width to 400vw (Massive Zoom) and Height to 'auto'.
            // 'auto' forces the map to retain its exact natural shape without 
            // ANY cropping or generating empty white space!
            mapSvg.style.width = "150vw";
            mapSvg.style.height = "auto";
            
            iconText.textContent = "🔍-"; 
            
            if (typeof window.showTeacherNamesOnMap === "function") window.showTeacherNamesOnMap();
            
            // Wait 320ms for the animation to finish growing before calculating the center!
            setTimeout(() => {
                mapContainer.scrollLeft = (mapContainer.scrollWidth - mapContainer.clientWidth) / 2;
                mapContainer.scrollTop = (mapContainer.scrollHeight - mapContainer.clientHeight) / 2;
            }, 320);
        }
        return; 
    }

    const mapModal = document.getElementById("map-modal");

    // --- MAP CONTROLS ---
    if (e.target.id === "btn-open-map") mapModal.classList.remove("hidden");
    if (e.target.id === "close-map-modal") mapModal.classList.add("hidden");
    
    // ==========================================
    // ROOM SELECTION ON MAP (With Teacher Lookup)
    // ==========================================
    const mapNode = e.target.closest(".map-node");
    if (mapNode) {
        e.preventDefault();
        
        // 1. Get the room identifier exactly how your map stores it
        const selectedDestination = mapNode.getAttribute("data-id") || mapNode.id || "";
        const matchKey = selectedDestination.toLowerCase().replace(/^room\s+/i, '').trim();
        
        if (!selectedDestination) return;

        // 2. Use your existing CSS rules to handle the selection highlight perfectly!
        document.querySelectorAll(".map-node").forEach(node => node.classList.remove("selected"));
        mapNode.classList.add("selected");

        // 3. Figure out which Teacher is in this room right now!
        let activePeriod = "1"; 
        if (window.currentTimeState && window.currentTimeState.currentPeriod) {
            activePeriod = String(window.currentTimeState.currentPeriod);
        }
        
        let currentDayNum = 1; 
        if (window.currentRotationDayText) {
            const parsed = parseInt(window.currentRotationDayText.replace(/\D/g, ''));
            if (!isNaN(parsed)) currentDayNum = parsed;
        }

        let teacherDisplay = "";

        if (window.liveMasterSchedule && window.liveMasterSchedule[activePeriod]) {
            const assignments = window.liveMasterSchedule[activePeriod][matchKey];
            if (assignments && assignments.length > 0) {
                let activeTeacher = assignments.find(a => a.days.includes(currentDayNum));
                if (!activeTeacher) activeTeacher = assignments[0]; 
                teacherDisplay = ` (${activeTeacher.teacher})`; 
            }
        }

        // 4. Update your exact text label with the Room + Teacher Name
        const labelElement = document.getElementById("selected-room-label");
        if (labelElement) {
            labelElement.innerText = `Destination: Room ${selectedDestination.toUpperCase()}${teacherDisplay}`;
        }

        // 5. Unlock the confirm button exactly like your old code did
        const confirmBtn = document.getElementById("btn-confirm-destination");
        if (confirmBtn) {
            confirmBtn.disabled = false;
        }

        // 6. Save selection globally so the submit pass code can read it
        window.selectedDestination = selectedDestination;
        if (teacherDisplay) {
            window.selectedDestinationTeacher = teacherDisplay.replace(/[()]/g, '').trim();
        }
    }

    // ==========================================
    // --- 1. STUDENT CONFIRMS MAP DESTINATION ---
    // ==========================================
    if (e.target.id === "btn-confirm-destination") {
        const dest = window.selectedDestination;
        if (!dest) return;
        
        e.target.innerText = "⏳ Requesting...";
        e.target.disabled = true;

        const evaluation = typeof evaluateRestrictions === "function" 
            ? evaluateRestrictions(dest) 
            : { statusLevel: "pending", restrictionType: "", restrictionReason: "", waitlistPosition: 0, recentTravels: [] };

        let assignedPeriod = "Unknown";
        if (window.currentTimeState) {
            if (window.currentTimeState.isPassing && window.currentTimeState.nextPeriod) {
                assignedPeriod = window.currentTimeState.nextPeriod;
            } else if (window.currentTimeState.currentPeriod) {
                assignedPeriod = window.currentTimeState.currentPeriod;
            }
        }

        const isProxyActive = typeof isProxy !== "undefined" ? isProxy : false;
        const proxyTeacherName = typeof proxyTeacher !== "undefined" ? proxyTeacher : "";
        
        let studentName = "Student";
        if (window.currentUser && window.currentUser.displayName) {
            studentName = window.currentUser.displayName;
        }
        const finalDisplayName = isProxyActive ? `${studentName} (Created by ${proxyTeacherName})` : studentName;

        const passData = {
            studentDisplayName: finalDisplayName,
            destination: dest,
            targetTeacher: window.selectedDestinationTeacher || "Unknown", 
            period: assignedPeriod, 
            type: "standard",
            initiatedBy: isProxyActive ? "teacher_proxy" : "student",
            status: evaluation.statusLevel === 'red' ? "pending_restricted" : "pending", 
            restrictionLevel: evaluation.statusLevel || "none",
            restrictionType: evaluation.restrictionType || "",
            restrictionReason: evaluation.restrictionReason || "",
            waitlistPosition: evaluation.waitlistPosition || 0,
            recentTravels: evaluation.recentTravels || []
        };

        const success = await createNewPass(passData);
        
        if (success) {
            const mapModalElement = document.getElementById("map-modal");
            if (mapModalElement) mapModalElement.classList.add("hidden");
            
            document.querySelectorAll(".map-node").forEach(node => node.classList.remove("selected"));
            
            const labelElement = document.getElementById("selected-room-label");
            if (labelElement) labelElement.innerText = "Select a room on the map";
            
            window.selectedDestination = null;
            window.selectedDestinationTeacher = null;
        }
        
        e.target.innerText = "Confirm Destination";
        e.target.disabled = false;
    }

    // ==========================================
    // --- 2. TEACHER APPROVAL HANDOFF CONTROLS ---
    // ==========================================
    if (e.target.id === "btn-teacher-approve") {
        const passId = e.target.getAttribute("data-id");
        if (typeof updatePassStatus === "function") updatePassStatus(passId, "active");
    }
    if (e.target.id === "btn-teacher-reject") {
        const passId = e.target.getAttribute("data-id");
        if (typeof updatePassStatus === "function") updatePassStatus(passId, "rejected");
    }

    // ==========================================
    // --- 3. TEACHER RETURN HANDOFF CONTROL ---
    // ==========================================
    if (e.target.id === "btn-teacher-return") {
        const passId = e.target.getAttribute("data-id");
        if (typeof updatePassStatus === "function") updatePassStatus(passId, "returned");
    }

});