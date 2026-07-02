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
    renderStudentYellowWarningScreen,
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
import { doc, onSnapshot, collection, query, where, updateDoc, arrayUnion, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let activeTimerInterval = null; 
let elapsedSeconds = 0; 
let selectedDestination = null; 

initializeTimeEngine();

// 📍 Helper: Get Corridor from Map Node
function getCorridorForRoom(roomName) {
    if (!roomName) return "Unknown";
    // Find the map node in the DOM using your exact data-id structure
    const node = document.querySelector(`.map-node[data-id="${roomName}"]`);
    if (node) {
        return node.getAttribute("data-corridor") || "Unknown";
    }
    return "Unknown";
}

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

    // ==========================================================
    // 📢 ANNOUNCEMENTS / MESSAGE CENTER LISTENER
    // ==========================================================
    const qAnnouncements = query(collection(db, "announcements"), where("active", "==", true));
    
    onSnapshot(qAnnouncements, (snapshot) => {
        let validMessages = [];
        const userEmail = window.currentUser?.email;
        
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const docId = docSnap.id;
            
            // 🛑 NEW: Check if this specific user has already cleared it
            if (data.readBy && data.readBy.includes(userEmail)) {
                return; // Skip drawing this message!
            }
            
            // Check if this user is supposed to see it
            let isTarget = false;
            if (data.audience === 'everyone' || data.audience === 'students') { // Use 'teachers' for the teacher file
                isTarget = true;
            } else if (data.audience === 'specific' && userEmail && (data.targets.includes(userEmail) || data.targets.includes(window.currentUser.uid))) {
                isTarget = true; 
            }
            
            if (isTarget) {
                // 🎨 NEW: Red, bold text, optional link, and the Clear button
                let msgHtml = `<strong style="color: #c62828; font-weight: 900;">Admin: ${data.message}</strong>`;
                
                if (data.link) {
                    msgHtml += ` <a href="${data.link}" target="_blank" style="text-decoration: none; margin-left: 5px;" title="Open Link">🔗</a>`;
                }
                
                msgHtml += ` <button onclick="window.dismissAnnouncement('${docId}')" style="margin-left: 10px; padding: 2px 6px; font-size: 0.8rem; cursor: pointer; border: 1px solid #ccc; border-radius: 4px; background: white;">Clear</button>`;
                
                validMessages.push(msgHtml);
            }
        });
        
        if (validMessages.length > 0) {
            window.currentAdminAnnouncementText = validMessages.join('<br><hr style="border: 0; border-top: 1px solid #eee; margin: 8px 0;"><br>');
        } else {
            window.currentAdminAnnouncementText = "";
        }
        
        const announcementContainer = document.getElementById("admin-messages-container"); 
        if (announcementContainer) {
            announcementContainer.innerHTML = window.currentAdminAnnouncementText 
                ? `<div style="padding: 5px;">${window.currentAdminAnnouncementText}</div>`
                : `<p style="color: #888; font-style: italic; margin: 5px 0; text-align: center;">No active announcements.</p>`;
        }
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

   // 🚨 STUDENT EMERGENCY ENGINE 🚨
    onSnapshot(doc(db, "settings", "emergencyState"), (docSnap) => {
        const state = docSnap.exists() ? docSnap.data() : { globalLockdown: false, quietLockdown: false };
        
        // Track BOTH lockdown states in global memory
        window.currentLoudLockdown = state.globalLockdown;
        window.currentQuietLockdown = state.quietLockdown;
        
        // 🌟 NEW: Track Area Lockdowns for pass-engine.js routing!
        window.lockedCorridors = state.lockedCorridors || [];
        
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
    // 🔒 CHANGED: Pass the actual studentId instead of their name
    const activeListenerId = window.currentStudentProfile?.id || user.uid;
    
    // 🟢 Keep track of the waitlist listener so we can turn it off when they leave the line
    let activeWaitlistListener = null; 

    listenToStudentPass(activeListenerId, (currentPass) => {
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
        // ⚠️ ADD THIS NEW YELLOW BLOCK
        else if (currentPass.status === "pending_warning") {
            renderStudentYellowWarningScreen(currentPass);
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
            // 🌟 NEW: Calculate time based on current phase
            let startTime = new Date();
            if (currentPass.departedAt) {
                startTime = currentPass.departedAt.toDate(); // Phase 3 (Returning) Timer
            } else if (currentPass.acceptedAt) {
                startTime = currentPass.acceptedAt.toDate(); // Phase 1 (Transit) Timer
            } else if (currentPass.createdAt) {
                startTime = currentPass.createdAt.toDate();
            }

            activeTimerInterval = setInterval(() => {
                elapsedSeconds = Math.floor((new Date() - startTime) / 1000);
                // Prevent negative numbers just in case of slight clock sync delays
                if (elapsedSeconds < 0) elapsedSeconds = 0; 

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

// ==========================================
// 🟢 OVERRIDE: FORCE CORRECT MAP LABELS ON ZOOM
// ==========================================
window.showTeacherNamesOnMap = function() {
    const mapSvg = document.getElementById("interactive-school-map");
    if (!mapSvg) return;
    
    let activePeriod = "1"; 
    if (window.currentTimeState && window.currentTimeState.currentPeriod) {
        activePeriod = String(window.currentTimeState.currentPeriod);
    }
    
    let currentDayNum = 1; 
    if (window.currentRotationDayText) {
        const parsed = parseInt(window.currentRotationDayText.replace(/\D/g, ''));
        if (!isNaN(parsed)) currentDayNum = parsed;
    }

    const scheduleData = window.liveMasterSchedule || window.currentLiveScheduleData;
    
    mapSvg.querySelectorAll(".map-node").forEach(node => {
        const dataId = node.getAttribute("data-id") || "";
        const matchKey = dataId.toLowerCase().replace(/^room\s+/i, '').trim();
        let rawName = null;

        // 1st Priority: Locked Rooms
        if (scheduleData && scheduleData.lockedRooms && scheduleData.lockedRooms[matchKey]) {
            rawName = scheduleData.lockedRooms[matchKey];
        } 
        // 2nd Priority: Normal Schedule
        else if (scheduleData && scheduleData[activePeriod]) {
            const assignments = scheduleData[activePeriod][matchKey];
            if (assignments && assignments.length > 0) {
                let activeTeacher = assignments.find(a => a.days.includes(currentDayNum));
                if (!activeTeacher) activeTeacher = assignments[0]; 
                rawName = activeTeacher.teacher;
            }
        }

        if (rawName) {
            // 🌟 TRIGGER THE BUILT-IN BYPASS: Save it to the exact DOM element your popup bypass is looking for!
            const destInput = document.getElementById("proxy-destination-input") || 
                              document.getElementById("input-proxy-destination") ||
                              document.getElementById("input-destination");
            if (destInput) destInput.dataset.teacher = rawName;

            // FORMAT NAME: Strip first name
            let cleanName = rawName.trim();
            if (cleanName.includes(",")) {
                cleanName = cleanName.split(",")[0].trim();
            } else {
                const parts = cleanName.split(/\s+/);
                if (parts.length > 1) {
                    const titles = ["mr.", "mrs.", "ms.", "miss", "dr.", "coach"];
                    const firstWord = parts[0].toLowerCase();
                    if (titles.includes(firstWord)) cleanName = parts[0] + " " + parts[parts.length - 1];
                    else cleanName = parts[parts.length - 1];
                }
            }

            const textEl = node.querySelector("text.lbl-room, text.lbl-large");
            if (textEl) {
                if (!textEl.hasAttribute("data-orig-text")) {
                    textEl.setAttribute("data-orig-text", textEl.textContent);
                    textEl.setAttribute("data-orig-font", textEl.getAttribute("font-size") || "");
                    textEl.setAttribute("data-orig-fill", textEl.getAttribute("fill") || "");
                }
                textEl.textContent = cleanName;
                textEl.setAttribute("fill", "#0277bd");
                textEl.setAttribute("font-size", cleanName.length > 12 ? "10" : "13");
            }
        }
    });
};

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
            mapSvg.style.width = "100%";
            mapSvg.style.height = "100%";
            mapContainer.style.display = "flex";
            mapContainer.style.justifyContent = "center";
            mapContainer.style.alignItems = "center";
            iconText.textContent = "🔍+"; 
            if (typeof window.hideTeacherNamesOnMap === "function") window.hideTeacherNamesOnMap();
        } else {
            mapContainer.style.display = "block";
            mapSvg.style.maxWidth = "none";
            mapSvg.style.maxHeight = "none";
            mapSvg.removeAttribute("preserveAspectRatio");
            mapSvg.style.width = "150vw";
            mapSvg.style.height = "auto";
            iconText.textContent = "🔍-"; 
            if (typeof window.showTeacherNamesOnMap === "function") window.showTeacherNamesOnMap();
            
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
        
        const selectedDestination = mapNode.getAttribute("data-id") || mapNode.id || "";
        const matchKey = selectedDestination.toLowerCase().replace(/^room\s+/i, '').trim();
        
        if (!selectedDestination) return;

        document.querySelectorAll(".map-node").forEach(node => node.classList.remove("selected"));
        mapNode.classList.add("selected");

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

        // 🟢 NEW: Unified Logic matching map-engine.js!
        let rawName = null;
        const scheduleData = window.liveMasterSchedule || window.currentLiveScheduleData;

        // 1st Priority - Locked Room Override
        if (scheduleData && scheduleData.lockedRooms && scheduleData.lockedRooms[matchKey]) {
            rawName = scheduleData.lockedRooms[matchKey];
        } 
        // 2nd Priority - Normal Schedule Check
        else if (scheduleData && scheduleData[activePeriod]) {
            const assignments = scheduleData[activePeriod][matchKey];
            if (assignments && assignments.length > 0) {
                let activeTeacher = assignments.find(a => a.days.includes(currentDayNum));
                if (!activeTeacher) activeTeacher = assignments[0]; 
                rawName = activeTeacher.teacher;
            }
        }

        if (rawName) {
            // 🌟 ULTIMATE FIX: Attach the database name straight to the room shape they clicked!
            mapNode.dataset.officialTeacher = rawName;

            // FORMAT NAME: Strip first name
            let cleanName = rawName.trim();
            if (cleanName.includes(",")) {
                cleanName = cleanName.split(",")[0].trim();
            } else {
                const parts = cleanName.split(/\s+/);
                if (parts.length > 1) {
                    const titles = ["mr.", "mrs.", "ms.", "miss", "dr.", "coach"];
                    const firstWord = parts[0].toLowerCase();
                    if (titles.includes(firstWord)) {
                        cleanName = parts[0] + " " + parts[parts.length - 1];
                    } else {
                        cleanName = parts[parts.length - 1];
                    }
                }
            }
            teacherDisplay = ` (${cleanName})`;
        }

        if (window.liveMasterSchedule && window.liveMasterSchedule[activePeriod]) {
            const assignments = window.liveMasterSchedule[activePeriod][matchKey];
            if (assignments && assignments.length > 0) {
                let activeTeacher = assignments.find(a => a.days.includes(currentDayNum));
                if (!activeTeacher) activeTeacher = assignments[0]; 
                teacherDisplay = ` (${activeTeacher.teacher})`; 
            }
        }

        const labelElement = document.getElementById("selected-room-label");
        if (labelElement) {
            labelElement.innerText = `Destination: Room ${selectedDestination.toUpperCase()}${teacherDisplay}`;
        }

        const confirmBtn = document.getElementById("btn-confirm-destination");
        if (confirmBtn) {
            confirmBtn.disabled = false;
        }

        window.selectedDestination = selectedDestination;
        if (teacherDisplay) {
            window.selectedDestinationTeacher = teacherDisplay.replace(/[()]/g, '').trim();
        }
    }

    // ==========================================
    // 🟢 FIXED: GLOBAL WAITLIST CONTROLS (Moved out of mapNode nesting!)
    // ==========================================
    if (e.target.id === "btn-accept-waitlist") {
        const passId = e.target.getAttribute("data-id");
        if (!passId) return;
        
        e.target.innerText = "Claiming...";
        e.target.disabled = true;
        
        if (typeof updatePassStatus === "function") {
            updatePassStatus(passId, "active");
        }
    }

    if (e.target.id === "btn-cancel-waitlist") {
        const passId = e.target.getAttribute("data-id");
        if (!passId) return;
        
        if (confirm("Are you sure you want to cancel your pass request?")) {
            e.target.innerText = "Canceling...";
            e.target.disabled = true;
            
            if (typeof updatePassStatus === "function") {
                updatePassStatus(passId, "rejected");
            }
        }
    }

    // =======================================================
    // 🏢 PHASE 1 -> 2: Teacher Check-In (Arrival)
    // =======================================================
    const checkInBtn = e.target.closest("#btn-teacher-checkin");
    if (checkInBtn) {
        const passId = checkInBtn.getAttribute("data-id");
        if (!passId) return;

        try {
            // Prevent double clicks
            checkInBtn.disabled = true;
            checkInBtn.innerText = "⏳ Checking in...";

            const passRef = doc(db, "passes", passId);
            await updateDoc(passRef, {
                arrivedAt: serverTimestamp()
            });
            // The onSnapshot listener will automatically detect this change and re-render the screen!
        } catch (error) {
            console.error("Error checking in:", error);
            alert("Failed to check in. Please try again.");
            checkInBtn.disabled = false;
            checkInBtn.innerText = "🏢 Check In Student (Dest. Teacher)";
        }
    }

    // =======================================================
    // 🚶 PHASE 2 -> 3: Teacher Depart (Return to Origin)
    // =======================================================
    const departBtn = e.target.closest("#btn-teacher-depart");
    if (departBtn) {
        const passId = departBtn.getAttribute("data-id");
        if (!passId) return;

        try {
            // Prevent double clicks
            departBtn.disabled = true;
            departBtn.innerText = "⏳ Updating...";

            const passRef = doc(db, "passes", passId);
            await updateDoc(passRef, {
                departedAt: serverTimestamp()
            });
            // The onSnapshot listener will catch this and flip to Phase 3
        } catch (error) {
            console.error("Error departing:", error);
            alert("Failed to update departure. Please try again.");
            departBtn.disabled = false;
            departBtn.innerText = "🚶 Depart Student (Return to Origin)";
        }
    }

    // ==========================================
    // --- 1. STUDENT CONFIRMS MAP DESTINATION ---
    // ==========================================
    if (e.target.id === "btn-confirm-destination") {
        const dest = window.selectedDestination; // 🟢 FIXED: Added window.
        if (!dest) return; // 🟢 FIXED: Safety check to prevent the null error

        const passType = window.currentUser?.role === "teacher" || window.currentUser?.role === "admin" ? "proxy" : "standard";

        // 1. Check if the room is a "No Check-in" room (Restroom, Fountain, etc.)
        const matchKey = dest.toLowerCase().replace(/^room\s+/i, '').trim();
        const sched = window.liveMasterSchedule || window.currentLiveScheduleData || {};
        const isNoCheckIn = sched.noCheckInRooms && sched.noCheckInRooms[matchKey];

        // 2. See if there is already a teacher natively mapped to this room right now
        let targetTeacher = "Unknown";
        
        // 🌟 ULTIMATE FIX: Look at the highlighted room on the map and grab the attached name!
        const selectedMapNode = document.querySelector(".map-node.selected");
        if (selectedMapNode && selectedMapNode.dataset.officialTeacher) {
            targetTeacher = selectedMapNode.dataset.officialTeacher;
            console.log("Successfully grabbed teacher directly from the map node:", targetTeacher);
        }

        // 3. THE POPUP: If no teacher is found and it requires one!
        if (targetTeacher === "Unknown" && !isNoCheckIn) {
            // ... (the rest of your popup code stays exactly the same)
            
            // Build the staff dropdown
            let staffOptions = `<option value="No Receiving Teacher" style="font-weight: bold; color: #d32f2f;">-- No Receiving Teacher --</option>`;
            if (window.activeStaffList) {
                window.activeStaffList.forEach(staff => {
                    staffOptions += `<option value="${staff.displayName}">${staff.displayName}</option>`;
                });
            }

            // 🔥 THE BYPASS: Did the map already tell us who the teacher is?
            const destInput = document.getElementById("proxy-destination-input") || 
                              document.getElementById("input-proxy-destination") ||
                              document.getElementById("input-destination"); // Catch both proxy and student flows
            
            let preSelectedTeacher = destInput ? destInput.dataset.teacher : null;

            // If the map found a specific teacher (and it's not "Unknown"), skip the popup entirely!
            if (preSelectedTeacher && preSelectedTeacher !== "Unknown" && preSelectedTeacher.trim() !== "") {
                console.log("Skipping popup! Map already provided teacher:", preSelectedTeacher);
                
                // If it's a proxy pass, we might just need to set the value. 
                // If it's the final step, call the finalization function.
                if (typeof finalizePassCreation === "function") {
                    await finalizePassCreation(dest, preSelectedTeacher, passType);
                    return; // Stop running this function, do NOT create the popup overlay!
                }
            }

            // Create Popup Overlay
            const overlay = document.createElement("div");
            overlay.style.cssText = "position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.8); z-index: 9999; display: flex; justify-content: center; align-items: center;";
            
            overlay.innerHTML = `
                <div style="background: white; padding: 30px; border-radius: 12px; max-width: 400px; width: 90%; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
                    <h2 style="margin-top: 0; color: #1565c0;">Who are you seeing?</h2>
                    <p style="color: #555; margin-bottom: 20px;">Please select the staff member you are visiting in <strong>${dest}</strong>.</p>
                    
                    <select id="popup-staff-select" style="width: 100%; padding: 12px; font-size: 1.1rem; border: 2px solid #ccc; border-radius: 8px; margin-bottom: 20px;">
                        ${staffOptions}
                    </select>

                    <div style="display: flex; gap: 10px;">
                        <button id="popup-btn-cancel" style="flex: 1; padding: 12px; font-size: 1.1rem; background: #eee; border: none; border-radius: 8px; cursor: pointer; color: #333; font-weight: bold;">Cancel</button>
                        <button id="popup-btn-confirm" style="flex: 1; padding: 12px; font-size: 1.1rem; background: #2e7d32; border: none; border-radius: 8px; cursor: pointer; color: white; font-weight: bold;">Continue</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            // Handle Popup Cancel
            document.getElementById("popup-btn-cancel").addEventListener("click", () => {
                document.body.removeChild(overlay);
                document.getElementById("btn-confirm-destination").innerText = "Confirm Destination";
                document.getElementById("btn-confirm-destination").disabled = false;
            });

            // Handle Popup Confirm
            document.getElementById("popup-btn-confirm").addEventListener("click", async () => {
                targetTeacher = document.getElementById("popup-staff-select").value;
                document.body.removeChild(overlay);
                await finalizePassCreation(dest, targetTeacher, passType);
            });

            return; // Stop here and wait for the popup
        } 
        
        // If it's a restroom or already had a teacher, proceed normally!
        if (isNoCheckIn) targetTeacher = "No Receiving Teacher";
        await finalizePassCreation(dest, targetTeacher, passType);
    }

    // Helper function to actually build the payload and send it to Firebase
    async function finalizePassCreation(dest, targetTeacher, passType) {
        document.getElementById("btn-confirm-destination").innerText = "Creating...";
        document.getElementById("btn-confirm-destination").disabled = true;

        const isProxyActive = passType === "proxy";
        const proxyTeacherName = isProxyActive ? (window.currentUser?.displayName || "Teacher") : "";
        
        // 🌟 FIXED: Prioritize the Student Profile data, fallback to currentUser
        const safeStudentId = window.currentStudentProfile?.id || window.currentUser?.uid || "unknown";
        const studentName = window.currentStudentProfile?.displayName || window.currentUser?.displayName || "Student";
        const studentEmail = window.currentStudentProfile?.email || window.currentUser?.email || "unknown@student.com";

        const passData = {
            studentId: safeStudentId, 
            studentName: studentName,
            studentDisplayName: studentName,
            studentEmail: studentEmail,
            
            destination: dest,
            targetTeacher: targetTeacher, 
            
            // Time Engine tracking values
            origin: window.currentRoom || "Unknown",
            originTeacher: window.currentOriginTeacher || "Unknown", 
            period: window.currentPeriod || "Unknown", 
            
            type: passType,
            initiatedBy: isProxyActive ? "teacher_proxy" : "student",
            senderName: isProxyActive ? proxyTeacherName : studentName, 
            
            // Dual Corridor Lockdown checks
            destCorridor: typeof getCorridorForRoom === "function" ? getCorridorForRoom(dest) : "Unknown",
            originCorridor: typeof getCorridorForRoom === "function" ? getCorridorForRoom(window.currentRoom || "Unknown") : "Unknown",
            
            // Default Statuses
            status: "pending", 
            restrictionLevel: "none",
            restrictionType: "",
            restrictionReason: "",
            waitlistPosition: 0,
            recentTravels: []
        };

        const result = await createNewPass(passData);

        if (result.success) {
            document.getElementById("map-modal").classList.add("hidden");
            document.getElementById("map-modal-container").innerHTML = '';
        } else {
            alert("Failed to create pass. Please try again.");
            document.getElementById("btn-confirm-destination").innerText = "Confirm Destination";
            document.getElementById("btn-confirm-destination").disabled = false;
        }
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
    if (e.target.id === "btn-use-scheduled-pass") {
        const passId = e.target.getAttribute("data-id");
        if (!passId) return;
        
        e.target.innerText = "Requesting...";
        e.target.disabled = true;
        if (typeof updatePassStatus === "function") {
            updatePassStatus(passId, "pending");
        }
    }

    if (e.target.classList.contains("btn-view-scheduled-pass")) {
        const teacher = e.target.getAttribute("data-teacher");
        const purpose = e.target.getAttribute("data-purpose");
        const dest = e.target.getAttribute("data-dest");
        const time = e.target.getAttribute("data-time");
        alert(`📨 SCHEDULED PASS DETAILS\n\nSent By: ${teacher}\nDestination: ${dest}\nTime: ${time}\nPurpose: ${purpose}`);
    }

    if (e.target.id === "btn-cancel-restricted") {
        const passId = e.target.getAttribute("data-id");
        if (!passId) return;
        e.target.innerText = "Canceling...";
        e.target.disabled = true;
        if (typeof updatePassStatus === "function") {
            updatePassStatus(passId, "cancelled");
        }
    }

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