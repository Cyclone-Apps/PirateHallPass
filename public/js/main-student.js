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
            // WE CLICKED PLUS -> ZOOM IN (Massive 4x Scale)
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
    
});