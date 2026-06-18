// js/main-student.js
import { handleGoogleLogin, initAuthListener } from "./modules/auth-roles.js";
import { renderHeader } from "./modules/ui-widgets.js";
import { 
    renderStudentIdleScreen, 
    renderStudentSidebar, 
    renderRecentTravelsSidebar,
    renderMapModal, 
    renderStudentWaitingScreen,
    renderStudentWaitlistScreen,
    renderStudentAcceptScreen, 
    renderStudentActiveScreen,
    renderStudentBlindRestrictionScreen,
    initializeRotationDayEngine,
    calculateDynamicQueuePosition
} from "./modules/student-ui.js";
import { createNewPass, listenToStudentPass, updatePassStatus, fetchStudentProfileByEmail } from "./modules/pass-engine.js";
import { 
    initializeTimeEngine, 
    fetchTodaysSchedule, 
    evaluateCurrentTime, 
    getAdjustedNow 
} from "./modules/time-engine.js";
import { db } from "./firebase-config.js";
import { doc, onSnapshot, collection, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
        
        // 🌟 NEW: Check Scheduled Pass Time Unlock dynamically
        const useBtn = document.getElementById("btn-use-scheduled-pass");
        if (useBtn && window.currentActivePass && window.currentActivePass.status === "scheduled") {
            const pass = window.currentActivePass;
            let canUse = false;
            
            if (pass.scheduledWhen === "class_period" && timeMetrics?.currentPeriod == pass.scheduledPeriod) {
                canUse = true; // Unlock if the requested period has started
            } else if (pass.scheduledWhen === "specific_time" && pass.scheduledTime) {
                const now = new Date();
                const passTime = new Date(`${pass.scheduledDate || now.toISOString().split('T')[0]}T${pass.scheduledTime}`);
                // Unlock exactly 5 minutes before the scheduled time
                if (now >= new Date(passTime.getTime() - 5 * 60000)) {
                    canUse = true;
                }
            } else if (pass.scheduledWhen === "available" || (!pass.scheduledTime && !pass.scheduledPeriod)) {
                canUse = true; // Unlock instantly if set to "whenever available"
            }

            useBtn.style.display = canUse ? "block" : "none";
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
    const activeListenerName = user.displayName;
    
    // 🟢 Keep track of the waitlist listener so we can turn it off when they leave the line
    let activeWaitlistListener = null; 

    listenToStudentPass(activeListenerName, (currentPass) => {
        clearInterval(activeTimerInterval);

        // 🟢 Clean up the waitlist listener if they are no longer waitlisted
        if (activeWaitlistListener && (!currentPass || currentPass.status !== "waitlist")) {
            activeWaitlistListener(); // Unsubscribe from the listener
            activeWaitlistListener = null;
        }

        window.currentActivePass = currentPass;

        if (!currentPass) {
            renderStudentIdleScreen();
            renderStudentSidebar(window.currentStudentProfile); 
            
            const msgCenter = document.getElementById("message-center");
            if (msgCenter) msgCenter.innerHTML = "";
        } 
        else if (currentPass.status === "scheduled") {
            // ... (keep your existing scheduled pass code here) ...
        }
        else if (currentPass.status === "waitlist") {
            renderStudentWaitlistScreen(currentPass);

            // 🟢 START THE DYNAMIC COUNTDOWN LISTENER
            if (!activeWaitlistListener) {
                // Optimized query: Only pull the waitlist for THIS specific room
                const q = query(
                    collection(db, "passes"), 
                    where("status", "==", "waitlist"),
                    where("destination", "==", currentPass.destination)
                );
                
                activeWaitlistListener = onSnapshot(q, (snapshot) => {
                    const allWaiting = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    
                    // Recalculate their specific position
                    const newPos = calculateDynamicQueuePosition(currentPass, allWaiting);
                    
                    // Update the giant number on the screen instantly
                    const posEl = document.getElementById("queue-pos-display");
                    if (posEl) posEl.innerText = `#${newPos}`;
                });
            }
        }
        else if (currentPass.status === "pending_student") {
            renderStudentAcceptScreen(currentPass);
        }
        // 🚨 ADD THIS BLOCK TO INTERCEPT RESTRICTED PASSES
        else if (currentPass.status === "pending_restricted") {
            renderStudentBlindRestrictionScreen(currentPass);
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
        else if (currentPass.status === "active" || currentPass.status === "active_bypassed") {
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
                    if (elapsedSeconds > 300) { 
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

        // 🟢 NEW: Student accepts their waitlist spot!
    if (e.target.id === "btn-accept-waitlist") {
        const passId = e.target.getAttribute("data-id");
        if (!passId) return;
        
        e.target.innerText = "Claiming...";
        e.target.disabled = true;
        
        if (typeof updatePassStatus === "function") {
            updatePassStatus(passId, "active");
        }
    }

    // 🟢 NEW: Student cancels their waitlist spot!
    if (e.target.id === "btn-cancel-waitlist") {
        const passId = e.target.getAttribute("data-id");
        if (!passId) return;
        
        if (confirm("Are you sure you want to cancel your pass request?")) {
            e.target.innerText = "Canceling...";
            e.target.disabled = true;
            
            if (typeof updatePassStatus === "function") {
                // Rejecting the pass removes them from the queue safely
                updatePassStatus(passId, "rejected");
            }
        }
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
        
        // 🌟 Stop appending "(Created by...)" to the display name so the proxy listener catches it!
        const finalDisplayName = studentName;

        let currentOriginTeacher = "Unknown";
        if (window.currentStudentProfile && window.currentStudentProfile.schedule) {
            const currentClass = window.currentStudentProfile.schedule[assignedPeriod];
            if (currentClass && currentClass.teacher) {
                currentOriginTeacher = currentClass.teacher;
            }
        }

        // 🌟 1. Safely extract the ID depending on if it's a Proxy or a Real Student
const safeStudentId = window.currentStudentProfile?.id || window.currentUser?.id || window.currentUser?.uid || "unknown";

// 🌟 2. Build your passData using the safe ID
const passData = {
    studentId: safeStudentId, // ✅ This will never be 'undefined' now!
    studentDisplayName: finalDisplayName,
    destination: dest,
    targetTeacher: window.selectedDestinationTeacher || "Unknown", 
    originTeacher: currentOriginTeacher, 
    period: assignedPeriod, 
    type: "standard",
    initiatedBy: isProxyActive ? "teacher_proxy" : "student",
    senderName: isProxyActive ? proxyTeacherName : studentName, 
    
    // Default Statuses
    status: "pending", 
    restrictionLevel: "none",
    restrictionType: "",
    restrictionReason: "",
    waitlistPosition: 0,
    recentTravels: []
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
    if (e.target && e.target.id === "btn-teacher-approve") {
        const passId = e.target.getAttribute("data-id");
        if (passId) {
            e.target.innerText = "⏳ Approving...";
            e.target.disabled = true;
            updatePassStatus(passId, "active").catch(err => {
                console.error(err);
                e.target.innerText = "✅ Approve";
                e.target.disabled = false;
            });
        }
    }
    
    if (e.target && e.target.id === "btn-teacher-reject") {
        const passId = e.target.getAttribute("data-id");
        if (passId) {
            e.target.innerText = "⏳ Rejecting...";
            e.target.disabled = true;
            updatePassStatus(passId, "rejected").catch(err => {
                console.error(err);
                e.target.innerText = "❌ Reject";
                e.target.disabled = false;
            });
        }
    }

    // ==========================================
    // --- 3. TEACHER RETURN HANDOFF CONTROL ---
    // ==========================================
    if (e.target && e.target.id === "btn-teacher-return") {
        const passId = e.target.getAttribute("data-id");
        if (passId) {
            e.target.innerText = "⏳ Ending Pass...";
            e.target.disabled = true;
            updatePassStatus(passId, "returned").catch(err => {
                console.error(err);
                e.target.innerText = "🛑 End Pass (Student Returned)";
                e.target.disabled = false;
            });
        }
    }

    // ==========================================
    // --- 4. STUDENT SCHEDULED PASS CONTROLS ---
    // ==========================================
    
    // 🟢 USE PASS (Routes to CURRENT teacher for approval first!)
    if (e.target.id === "btn-use-scheduled-pass") {
        const passId = e.target.getAttribute("data-id");
        if (!passId) return;
        
        e.target.innerText = "Requesting...";
        e.target.disabled = true;
        
        if (typeof updatePassStatus === "function") {
            // 🌟 Changed from "active" to "pending"
            updatePassStatus(passId, "pending");
        }
    }

    // 🔵 VIEW PASS (Shows details popup without accepting)
    if (e.target.classList.contains("btn-view-scheduled-pass")) {
        const teacher = e.target.getAttribute("data-teacher");
        const purpose = e.target.getAttribute("data-purpose");
        const dest = e.target.getAttribute("data-dest");
        const time = e.target.getAttribute("data-time");

        alert(`📨 SCHEDULED PASS DETAILS\n\nSent By: ${teacher}\nDestination: ${dest}\nTime: ${time}\nPurpose: ${purpose}`);
    }

    // 🛑 CANCEL BLIND RESTRICTED PASS
    if (e.target.id === "btn-cancel-restricted") {
        const passId = e.target.getAttribute("data-id");
        if (!passId) return;
        
        e.target.innerText = "Canceling...";
        e.target.disabled = true;
        
        if (typeof updatePassStatus === "function") {
            updatePassStatus(passId, "cancelled");
        }
    }

    // 🔴 DELETE PASS (Removes it from the queue)
    if (e.target.id === "btn-delete-scheduled-pass") {
        const passId = e.target.getAttribute("data-id");
        if (!passId) return;
        
        if (confirm("Are you sure you want to delete this scheduled pass?")) {
            e.target.innerText = "Deleting...";
            e.target.disabled = true;
            
            if (typeof updatePassStatus === "function") {
                updatePassStatus(passId, "cancelled");
            }
        }
    }

});