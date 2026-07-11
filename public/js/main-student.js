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
import { listenToStudentPass, updatePassStatus, fetchStudentProfileByEmail } from "./modules/pass-engine.js";
import { createNewPass } from "./modules/create-pass.js";
import { initLockdownListener } from "./features/f-lockdowns.js";
import { 
    initializeTimeEngine, 
    fetchTodaysSchedule, 
    evaluateCurrentTime, 
    getAdjustedNow 
} from "./modules/time-engine.js";
import { db } from "./firebase-config.js";
import { doc, onSnapshot, collection, query, where, updateDoc, arrayUnion, serverTimestamp, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import './features/f-scheduled-pass-engine.js';

window.db = db;

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
    // 🎯 LIVE LUNCH TRACK LISTENER
    // Downloads the teacher A/B lunch map so the clock can sync correctly
    // ==========================================================
    onSnapshot(doc(db, "settings", "bell_schedule"), (docSnap) => {
        if (docSnap.exists() && docSnap.data().teacherLunchTracks) {
            window.liveTeacherLunchMap = docSnap.data().teacherLunchTracks;
            console.log("🥪 Live Teacher Lunch Map updated!", window.liveTeacherLunchMap);
        } else {
            window.liveTeacherLunchMap = {}; // Failsafe
        }
    });

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

    
    // 🚀 UNIFIED RENDERER
    window.renderMessageCenter = () => {
            // 🛑 EMERGENCY OVERRIDE: Stop drawing normal messages if a lockdown is actively displaying!
            if (window.currentLoudLockdown || (window.currentQuietLockdown && window.emergencyState?.quietShowToStudents)) {
                console.log("🛑 renderMessageCenter: Emergency active. Yielding to lockdown UI.");
                return; // This completely stops the normal widget from drawing over our custom HTML!
            }

        console.log("🎨 renderMessageCenter CALLED!");
        const container = document.getElementById("admin-messages-container");
        
        if (!container) {
            console.error("❌ renderMessageCenter ERROR: 'admin-messages-container' not found in DOM!");
            return;
        }

        let finalHTML = "";

        if (window.currentProxyPassesHTML) {
            console.log("   ✅ Preparing Proxy Passes HTML...");
            finalHTML += window.currentProxyPassesHTML;
        }

        if (window.currentAdminAnnouncementText) {
            console.log("   ✅ Preparing Admin Announcements HTML...");
            finalHTML += `<div style="padding: 5px; margin-top: 5px;">${window.currentAdminAnnouncementText}</div>`;
        }

        if (!window.currentProxyPassesHTML && !window.currentAdminAnnouncementText) {
            console.log("   ⚠️ Both empty, using default text.");
            finalHTML += `<p style="color: #888; font-style: italic; margin: 5px 0; text-align: center;">No active announcements.</p>`;
        }

        container.innerHTML = finalHTML;
        console.log("🎨 renderMessageCenter FINISHED! Container updated.");
    };
    
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
        
        // 🚀 INSTEAD of injecting directly, call our new renderer!
        if (typeof window.renderMessageCenter === "function") window.renderMessageCenter();
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

   // ==========================================================
    // 🎫 PROXY PASS INBOX LISTENER (Message Center)
    // ==========================================================
    
    const targetStudentEmail = window.currentStudentProfile?.email || window.currentUser?.email;
    console.log("🕵️ Inbox Listener is searching for passes for:", targetStudentEmail);

    if (targetStudentEmail) {
        const qProxyPasses = query(
            collection(db, "passes"), 
            where("studentEmail", "==", targetStudentEmail.toLowerCase())
        );
        
        onSnapshot(qProxyPasses, (snapshot) => {
            let passMessages = [];
            
            snapshot.forEach((docSnap) => {
                const passData = docSnap.data();
                const passId = docSnap.id;
                
                if (passData.uiLocation === "message_center") {
                    // 1. Human-readable Date Formatting (e.g., "2026-07-15" ➡️ "Wed, Jul 15")
                    let dateStr = "upcoming date";
                    if (passData.scheduledDate) {
                        const d = new Date(passData.scheduledDate + "T12:00:00");
                        if (!isNaN(d)) {
                            dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                        }
                    }

                    // 2. Human-readable Time/Period Formatting
                    let timeStr = "";
                    if (passData.scheduledPeriod && passData.scheduledPeriod !== "None") {
                        timeStr = ` during ${passData.scheduledPeriod} period`;
                    } else if (passData.scheduledTime) {
                        const [hourStr, minStr] = passData.scheduledTime.split(':');
                        if (hourStr && minStr) {
                            let h = parseInt(hourStr, 10);
                            const ampm = h >= 12 ? 'pm' : 'am';
                            h = h % 12 || 12;
                            timeStr = ` at ${h}:${minStr} ${ampm}`;
                        }
                    }

                    // 3. Dynamic layout strings based on type
                    const isTardy = passData.type === "tardy";
                    const isRequired = passData.passType && passData.passType.toLowerCase() === "required";
                    const teacherName = passData.senderName || passData.teacherName || "Teacher";
                    
                    let headerTitle = "";
                    let middleText = "";
                    let actionButtonsHtml = "";
                    
                    if (isTardy) {
                        // Keep tardy passes looking the same just in case
                        headerTitle = `⏳ Tardy Pass from ${teacherName}:`;
                        middleText = `<span style="font-size: 0.95rem; color: #333; display: inline-block; margin-top: 4px;">You received a Tardy Pass to <strong>${passData.destination}</strong>.</span>`;
                        
                        // Tardy passes only get a view button
                        actionButtonsHtml = `
                            <button onclick="window.viewScheduledPass('${passId}')" style="background: #4593F1; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; width: 100%; font-weight: bold; font-size: 0.9rem; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); transition: opacity 0.2s;">
                                👁️ View
                            </button>
                        `;
                    } else {
                        // 🌟 Your new streamlined layout for Scheduled/Required passes!
                        const passLabel = isRequired ? "Required Pass" : "Scheduled Pass";
                        headerTitle = `🎫 ${passLabel} from ${teacherName} on ${dateStr}.`;
                        // middleText remains empty because you requested to remove the middle text!

                        // 📅 Calculate today's local date string (YYYY-MM-DD)
                        const today = new Date();
                        const yyyy = today.getFullYear();
                        const mm = String(today.getMonth() + 1).padStart(2, '0');
                        const dd = String(today.getDate()).padStart(2, '0');
                        const todayStr = `${yyyy}-${mm}-${dd}`;

                        // Check if the scheduled pass is valid to use today
                        const isToday = passData.scheduledDate === todayStr;

                        if (isToday) {
                            // If it's today, show both buttons side-by-side using Flexbox
                            actionButtonsHtml = `
                                <div style="display: flex; gap: 8px; width: 100%;">
                                    <button onclick="window.viewScheduledPass('${passId}')" style="flex: 1; background: #4593F1; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 0.9rem; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); transition: opacity 0.2s;">
                                        👁️ View
                                    </button>
                                    <button onclick="window.useScheduledPass('${passId}')" style="flex: 1; background: #28a745; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 0.9rem; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); transition: opacity 0.2s;">
                                        🚀 Use
                                    </button>
                                </div>
                            `;
                        } else {
                            // If it's a future date, only show the full-width View button
                            actionButtonsHtml = `
                                <button onclick="window.viewScheduledPass('${passId}')" style="background: #4593F1; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; width: 100%; font-weight: bold; font-size: 0.9rem; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); transition: opacity 0.2s;">
                                    👁️ View
                                </button>
                            `;
                        }
                    }
                    
                    let msgHtml = `
                        <div style="background: #ebf4ff; border: 1px solid #4593F1; padding: 12px; border-radius: 8px; margin-bottom: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                            <strong style="color: #0d47a1; font-weight: 800; font-size: 1rem; display: block; margin-bottom: ${middleText ? '4px' : '10px'};">${headerTitle}</strong>
                            ${middleText}
                            <div style="margin-top: 10px;">
                                ${actionButtonsHtml}
                            </div>
                        </div>
                    `;
                    passMessages.push(msgHtml);
                }
            });

            // 🚀 INSTEAD of injecting directly, save to memory and call our new renderer!
            window.currentProxyPassesHTML = passMessages.join("");
            if (typeof window.renderMessageCenter === "function") window.renderMessageCenter();
        });
    }

   // Start the global lockdown engine (Automatically handles Student UI alerts)
    initLockdownListener();

    // Start a continuous 1-second interval to evaluate current time metrics
    setInterval(() => {
        if (!activeSchedulePeriods) return;

        // =========================================================
        // 🎯 LUNCH TRACK RESOLVER 
        // Automatically calculate whether this student is 6A or 6B
        // =========================================================
        let studentLunchTrack = null;
        
        // Ensure we have both the student's profile and the live teacher lunch map loaded
        if (window.currentStudentProfile && window.currentStudentProfile.schedule && window.liveTeacherLunchMap) {
            // Find the Period 6 class in their schedule
            const p6Class = window.currentStudentProfile.schedule["Period 6"] || window.currentStudentProfile.schedule["6"];
            
            if (p6Class && p6Class.teacher) {
                // If the teacher has a mapped track, use it. Otherwise gracefully fallback to "A"
                studentLunchTrack = window.liveTeacherLunchMap[p6Class.teacher] || "A";
            }
        }

        // Pass the dynamically calculated track into the time engine!
        const timeMetrics = evaluateCurrentTime(activeSchedulePeriods, studentLunchTrack);
        
        // =========================================================

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
            
            // 🎯 NEW: Use the 'activeBasePeriod' (e.g. "Period 6") to check if scheduled passes unlock, 
            // so we don't accidentally block them during split lunch tracks!
            const currentPeriodCheck = timeMetrics?.activeBasePeriod || timeMetrics?.currentPeriod;
            
            if (pass.scheduledWhen === "class_period" && currentPeriodCheck == pass.scheduledPeriod) {
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
            
            // 🚀 NEW: Re-inject our messages in case the sidebar redraw just erased them!
            if (typeof window.renderMessageCenter === "function") {
                console.log("🔄 Sidebar was redrawn! Forcing Message Center to render again...");
                window.renderMessageCenter();
            }
        }
        else if (currentPass.status === "scheduled") {
            console.log("📅 Scheduled pass activated! Directing to left-side renderer...");
            
            // Look for the renderer locally or globally on the window object
            const renderer = (typeof renderStudentScheduledScreen === "function") 
                ? renderStudentScheduledScreen 
                : window.renderStudentScheduledScreen;

            if (typeof renderer === "function") {
                renderer(currentPass);
            } else {
                console.warn("⚠️ renderStudentScheduledScreen was not found! Using fallback layout.");
                if (typeof window.fallbackRenderScheduledScreen === "function") {
                    window.fallbackRenderScheduledScreen(currentPass);
                }
            }
            
            // Ensure the message center updates alongside the new screen
            if (typeof window.renderMessageCenter === "function") window.renderMessageCenter();
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
            if (typeof window.renderMessageCenter === "function") window.renderMessageCenter(); // 👈 ADD THIS
        }
        else if (currentPass.status === "pending_restricted") {
            renderStudentBlindRestrictionScreen(currentPass);
            if (typeof window.renderMessageCenter === "function") window.renderMessageCenter(); // 👈 ADD THIS
        }
        else if (currentPass.status === "pending_warning") {
            renderStudentYellowWarningScreen(currentPass);
            if (typeof window.renderMessageCenter === "function") window.renderMessageCenter(); // 👈 ADD THIS
        }
        else if (currentPass.status.startsWith("pending")) {
            const statusData = {
                statusLevel: currentPass.restrictionLevel || 'green',
                restrictionType: currentPass.restrictionType || null,
                recentTravels: currentPass.recentTravels || [],
                waitlistPosition: currentPass.waitlistPosition || null
            };
            renderStudentWaitingScreen(currentPass, statusData);
            if (typeof window.renderMessageCenter === "function") window.renderMessageCenter(); // 👈 ADD THIS
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

    // =======================================================
    // 🧠 HELPER: EMERGENCY STRING FALLBACKS (Only used if DB lookup fails)
    // =======================================================
    function fallbackFormatName(rawName) {
        if (!rawName || rawName === "Unknown" || rawName === "No Receiving Teacher") return rawName;
        let cleanName = rawName.trim();
        if (cleanName.includes(",")) return cleanName.split(",")[0].trim();
        
        const parts = cleanName.split(/\s+/);
        if (parts.length > 1) {
            const titles = ["mr.", "mrs.", "ms.", "miss", "dr.", "coach"];
            const firstWord = parts[0].toLowerCase();
            if (titles.includes(firstWord)) {
                return firstWord.charAt(0).toUpperCase() + firstWord.slice(1) + " " + parts[parts.length - 1];
            }
            return parts[parts.length - 1];
        }
        return cleanName;
    }

    function fallbackLastName(rawName) {
        if (!rawName || rawName === "Unknown" || rawName === "No Receiving Teacher") return rawName;
        let cleanName = rawName.trim();
        if (cleanName.includes(",")) return cleanName.split(",")[0].trim();
        const parts = cleanName.split(/\s+/);
        return parts[parts.length - 1]; 
    }

    // =======================================================
    // 🧠 HELPER: DATABASE TEACHER LOOKUP
    // =======================================================
    async function getTeacherProfileFromDB(searchName) {
        if (!searchName || searchName === "Unknown" || searchName === "No Receiving Teacher") return null;
        
        try {
            const usersRef = collection(db, "users");
            
            // 1. Try matching by scheduleAlias first (e.g., "Mr. Orr")
            let q = query(usersRef, where("scheduleAlias", "==", searchName));
            let snapshot = await getDocs(q);
            
            // 2. If no match, try matching by displayName (e.g., "Brian Orr")
            if (snapshot.empty) {
                q = query(usersRef, where("displayName", "==", searchName));
                snapshot = await getDocs(q);
            }
            
            // 3. If still no match, try matching strictly by lastName (e.g., "Orr")
            if (snapshot.empty) {
                q = query(usersRef, where("lastName", "==", searchName));
                snapshot = await getDocs(q);
            }

            if (!snapshot.empty) {
                return snapshot.docs[0].data(); // Return the exact Clever DB profile!
            }
        } catch (error) {
            console.warn("⚠️ DB Teacher Lookup failed, using fallbacks.", error);
        }
        return null;
    }

    // =======================================================
    // 🚀 FINAL PASS BUILDER & DISPATCHER
    // =======================================================
    async function finalizePassCreation(dest, targetTeacher, passType) {
        document.getElementById("btn-confirm-destination").innerText = "Creating...";
        document.getElementById("btn-confirm-destination").disabled = true;

        const isProxyActive = passType === "proxy";
        const proxyTeacherName = isProxyActive ? (window.currentUser?.displayName || "Teacher") : "";
        
        // --- 1. IDENTIFY THE STUDENT ---
        const safeStudentId = window.currentStudentProfile?.id || window.currentUser?.uid || "unknown";
        const studentName = window.currentStudentProfile?.displayName || window.currentUser?.displayName || "Student";
        const studentEmail = window.currentStudentProfile?.email || window.currentUser?.email || "unknown@student.com";

        // --- 2. IDENTIFY THE TIME & PERIOD ---
        const currentPeriod = window.currentTimeState?.currentPeriod || "Unknown";

        // --- 3. IDENTIFY THE ORIGIN (Clever Schedule Engine) ---
        let originRoom = "Unknown";
        let rawOriginTeacher = "Unknown";

        if (window.currentStudentProfile && window.currentStudentProfile.schedule && currentPeriod !== "Unknown") {
            const sched = window.currentStudentProfile.schedule;
            let currentClass = null;

            if (Array.isArray(sched)) {
                currentClass = sched.find(c => String(c.period) === String(currentPeriod));
            } else if (typeof sched === 'object') {
                currentClass = sched[currentPeriod] || Object.values(sched).find(c => String(c?.period) === String(currentPeriod));
            }
            
            if (currentClass) {
                originRoom = currentClass.room || currentClass.ROOM || "Unknown";
                rawOriginTeacher = currentClass.teacher || currentClass.TEACHER || "Unknown";
            }
        }

        // --- 4. SECURE DATABASE LOOKUPS FOR EXACT NAMES ---
        // Fetch official profiles from the 'users' collection
        const originTeacherProfile = await getTeacherProfileFromDB(rawOriginTeacher);
        const destTeacherProfile = await getTeacherProfileFromDB(targetTeacher);

        // Build Origin Names (Prefer DB -> Fallback to String formatting)
        const finalOriginTeacher = originTeacherProfile?.scheduleAlias || originTeacherProfile?.displayName || fallbackFormatName(rawOriginTeacher);
        const originTeacherLastName = originTeacherProfile?.lastName || fallbackLastName(rawOriginTeacher);

        // Build Destination Names (Prefer DB -> Fallback to String formatting)
        const finalDestinationTeacher = destTeacherProfile?.scheduleAlias || destTeacherProfile?.displayName || fallbackFormatName(targetTeacher);
        const destTeacherLastName = destTeacherProfile?.lastName || fallbackLastName(targetTeacher);

        // --- 5. BUILD THE HARDCODED PAYLOAD ---
        const passData = {
            studentId: safeStudentId, 
            studentName: studentName,
            studentDisplayName: studentName,
            studentEmail: studentEmail,
            
            // 📍 Destination Data
            destination: dest, 
            destinationRoom: dest,
            destinationTeacher: finalDestinationTeacher, 
            destTeacherLastName: destTeacherLastName, // Stored for UI injection
            targetTeacher: finalDestinationTeacher, // Legacy support
            
            // 📍 Origin & Time Data
            origin: originRoom, 
            originRoom: originRoom,
            originTeacher: finalOriginTeacher, 
            originTeacherLastName: originTeacherLastName, // Stored for UI injection
            period: currentPeriod, 
            
            type: passType,
            initiatedBy: isProxyActive ? "teacher_proxy" : "student",
            senderName: isProxyActive ? proxyTeacherName : studentName, 
            
            destCorridor: typeof getCorridorForRoom === "function" ? getCorridorForRoom(dest) : "Unknown",
            originCorridor: typeof getCorridorForRoom === "function" ? getCorridorForRoom(originRoom) : "Unknown",
            
            // 🚦 State Controls
            status: passType === "tardy" ? "active" : "pending", 
            // 🎯 ROUTING FIX: Scheduled passes go to message center, immediate passes go to green screen!
            uiLocation: passType === "scheduled" ? "message_center" : "pass_section", 
            restrictionLevel: "none",
            restrictionType: "",
            restrictionReason: "",
            waitlistPosition: 0,
            recentTravels: []
        };

        // --- 6. SEND TO THE PASS ENGINE ---
        const result = await createNewPass(passData);

        if (result.success) {
            document.getElementById("map-modal").classList.add("hidden");
            document.getElementById("map-modal-container").innerHTML = '';
        } else {
            // 1. Hide the map modal immediately
            document.getElementById("map-modal").classList.add("hidden");
            document.getElementById("map-modal-container").innerHTML = '';

            // 2. Inject the custom restriction screen from image_de653b.png
            const container = document.getElementById("kiosk-main-widget");
            if (container) {
                container.innerHTML = `
                    <div style="background-color: #fff1f1; border: 4px solid #c62828; border-radius: 12px; padding: 40px 20px; text-align: center; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                        <h1 style="color: #c62828; font-size: 3rem; margin-bottom: 20px; font-weight: 900; line-height: 1.1;">
                            <span style="display: inline-block; transform: translateY(5px);">🛑</span> Request<br>temporarily<br>denied.
                        </h1>
                        <p style="color: #333; font-size: 1.5rem; margin-bottom: 40px;">
                            ${result.message}
                        </p>
                        <button id="btn-cancel-denied-request" style="background-color: #c62828; color: white; border: none; font-size: 1.5rem; padding: 15px 40px; border-radius: 8px; width: 80%; cursor: pointer; font-weight: bold; box-shadow: 0 4px 6px rgba(0,0,0,0.2);">
                            ❌ Cancel Request
                        </button>
                    </div>
                `;

                // 3. Bind the cancel button to return to the normal screen
                document.getElementById("btn-cancel-denied-request").addEventListener("click", () => {
                    // This calls your existing UI function to redraw the normal "Where to?" screen!
                    import("./student-ui.js").then(module => {
                        if (typeof module.renderStudentIdleScreen === "function") {
                            module.renderStudentIdleScreen();
                        } else {
                            location.reload(); // Failsafe fallback
                        }
                    }).catch(() => location.reload()); 
                });
            }
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
});