// js/main-student.js
import { handleGoogleLogin, initAuthListener } from "./modules/auth-roles.js";
import { renderHeader } from "./modules/ui-widgets.js";
import { 
    renderStudentIdleScreen, 
    renderStudentSidebar, 
    renderRecentTravelsSidebar,
    renderMapModal,
    renderStaffModal, 
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
import { loadStaffForMap, showTeacherNamesOnMap, hideTeacherNamesOnMap, getTeachersForRoom, isNoCheckInRoom, buildStaffDropdownHTML } from "./features/f-room-names.js";
import { finalizePassCreation } from './features/f-finalize-pass.js';
import { 
    initializeTimeEngine, 
    fetchTodaysSchedule, 
    evaluateCurrentTime, 
    getSpoofSafeTimestamp,
    getAdjustedNow 
} from "./modules/time-engine.js";
import { db } from "./firebase-config.js";
import { doc, getDoc, onSnapshot, collection, query, where, updateDoc, arrayUnion, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import './features/f-scheduled-pass-engine.js';

window.db = db;

// Map the imported functions to the global window object so the zoom button can find them
window.showTeacherNamesOnMap = showTeacherNamesOnMap;
window.hideTeacherNamesOnMap = hideTeacherNamesOnMap;
window.getTeachersForRoom = getTeachersForRoom;
window.isNoCheckInRoom = isNoCheckInRoom;
window.buildStaffDropdownHTML = buildStaffDropdownHTML;

// Immediately fetch the staff list in the background
loadStaffForMap();

let activeTimerInterval = null; 
let elapsedSeconds = 0; 
let selectedDestination = null; 

initializeTimeEngine();

// 📍 Helper: Get Corridor from Map Node
export function getCorridorForRoom(roomName) {
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
    
    // ==========================================================
    // 🛑 SAFETY NET: 2-Second Kill Switch for Broken Fetches
    // Forces the app to load even if the database fetches hang
    // ==========================================================
    const withTimeout = (promise, fallback, ms = 2000) => {
        return Promise.race([
            promise,
            new Promise(resolve => setTimeout(() => resolve(fallback), ms))
        ]);
    };

    console.log("🚀 Fetching student profile...");
    const studentProfile = await withTimeout(
        fetchStudentProfileByEmail(user.email), 
        { email: user.email, schedule: {} } // Safe fallback if it hangs
    );
    window.currentStudentProfile = studentProfile; 
    
    renderStudentSidebar(studentProfile);

    // Start the live rotation day & menu Firestore listener
    initializeRotationDayEngine(db, onSnapshot, doc);

    // 🎯 LIVE LUNCH TRACK LISTENER
    onSnapshot(doc(db, "settings", "bell_schedule"), (docSnap) => {
        if (docSnap.exists() && docSnap.data().teacherLunchTracks) {
            window.liveTeacherLunchMap = docSnap.data().teacherLunchTracks;
            console.log("🥪 Live Teacher Lunch Map updated!", window.liveTeacherLunchMap);
        } else {
            window.liveTeacherLunchMap = {}; // Failsafe
        }
    });

    let activeSchedulePeriods = null;
    
    console.log("🚀 Fetching today's schedule...");
    // 🛑 Wrap the broken schedule fetch in our 2-second Kill Switch
    const todayScheduleInfo = await withTimeout(
        fetchTodaysSchedule("HS"),
        { isNoSchool: false, periods: {} } // 👈 CHANGED TO EMPTY OBJECT
    );
    
    if (todayScheduleInfo.isNoSchool) {
        const container = document.getElementById("kiosk-main-display");
        if (container) {
            container.innerHTML = `
                <div class="panel text-center" style="border-top: 5px solid var(--pirate-red); padding: 40px;">
                    <h2>🛑 School is Not in Session</h2>
                    <p style="font-size: 1.2rem; color: #555;">Passes cannot be issued outside of school operation hours.</p>
                </div>`;
        }
        return; 
    } else {
        activeSchedulePeriods = todayScheduleInfo.periods;
    }

    // 🚀 UNIFIED RENDERER
    window.renderMessageCenter = () => {
        // ... (Keep the rest of your function exactly the same from here down!)
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
                        const today = getAdjustedNow();
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
                const now = getAdjustedNow();
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
            let startTime = getAdjustedNow();
            if (currentPass.departedAt) {
                startTime = currentPass.departedAt.toDate(); // Phase 3 (Returning) Timer
            } else if (currentPass.acceptedAt) {
                startTime = currentPass.acceptedAt.toDate(); // Phase 1 (Transit) Timer
            } else if (currentPass.createdAt) {
                startTime = currentPass.createdAt.toDate();
            }

            activeTimerInterval = setInterval(() => {
                elapsedSeconds = Math.floor((getAdjustedNow() - startTime) / 1000);
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

    // --- MAP CONTROLS ---
    if (e.target.id === "btn-open-map") {
        // 1. Check the DOM right at the moment of the click
        let mapModal = document.getElementById("map-modal");

        // 2. If it was deleted, trigger your native builder to restore it
        if (!mapModal) {
            console.warn("⚠️ Map modal missing! Triggering renderMapModal()...");
            
            if (typeof renderMapModal === "function") {
                renderMapModal(); // Rebuilds the map inside #map-modal-container
            }
            
            // Re-grab the modal now that it has been freshly injected
            mapModal = document.getElementById("map-modal");
        }
        
        // 3. Unhide it safely
        if (mapModal) {
            mapModal.classList.remove("hidden");
        }
    }
    
    if (e.target.id === "close-map-modal") {
        const mapModal = document.getElementById("map-modal");
        if (mapModal) mapModal.classList.add("hidden");
    }
    
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
        const staffList = window.activeStaffList || [];

        for (const staff of staffList) {
            let activeRoom = null;
            
            if (staff.roomAssignments && staff.roomAssignments[activePeriod] && staff.roomAssignments[activePeriod].room !== "No Room") {
                activeRoom = staff.roomAssignments[activePeriod].room;
            } else {
                activeRoom = staff.mapName || staff.room || staff.roomNumber || null;
            }

            if (activeRoom) {
                const cleanActiveRoom = activeRoom.toLowerCase().replace(/^room\s+/i, '').trim();
                if (cleanActiveRoom === matchKey) {
                    rawName = staff.lastName || staff.displayName;
                    break;
                }
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

    // --- STAFF SELECT CONTROLS ---
    if (e.target.id === "btn-open-staff") {
        let staffModal = document.getElementById("staff-modal");

        if (!staffModal) {
            if (typeof renderStaffModal === "function") renderStaffModal();
            staffModal = document.getElementById("staff-modal");
        }

        const searchInput = document.getElementById("staff-search-input");
        const selectDropdown = document.getElementById("staff-dropdown-select");
        const btnConfirmStaff = document.getElementById("btn-confirm-staff-destination");
        
        if (searchInput && selectDropdown && window.activeStaffList) {
            const sortedStaff = [...window.activeStaffList].sort((a, b) => a.displayName.localeCompare(b.displayName));
            
            // This function builds the native <select> options
            const renderOptions = (filterText = "") => {
                const query = filterText.toLowerCase();
                let optionsHTML = "";
                let hasMatches = false;

                sortedStaff.forEach(staff => {
                    const roomText = staff.room ? ` (${staff.room})` : "";
                    
                    // 1. Format the name: STRICTLY Title + Last Name (fallback to displayName)
                    let formattedName = staff.displayName;
                    if (staff.title && staff.lastName) {
                        formattedName = `${staff.title} ${staff.lastName}`;
                    }

                    const displayValue = `${formattedName}${roomText}`;
                    const destinationValue = staff.room ? staff.room : staff.displayName; 
                    
                    // 2. Search logic: Check if they typed the formal name OR their real first name!
                    if (displayValue.toLowerCase().includes(query) || staff.displayName.toLowerCase().includes(query)) {
                        optionsHTML += `<option value="${destinationValue}" data-teacher="${staff.displayName}" style="padding: 8px; margin-bottom: 2px;">${displayValue}</option>`;
                        hasMatches = true;
                    }
                });

                if (!hasMatches) {
                    optionsHTML = `<option disabled style="padding: 8px; color: #888;">No staff found matching "${filterText}"...</option>`;
                }

                selectDropdown.innerHTML = optionsHTML;
            };

            // Reset modal on open
            renderOptions("");
            searchInput.value = "";
            btnConfirmStaff.disabled = true;

            // Live filter when typing
            searchInput.oninput = (e) => {
                renderOptions(e.target.value);
                btnConfirmStaff.disabled = true; // Lock confirm button until they click a name in the list
            };

            // Unlock confirm button when they click a name
            selectDropdown.onchange = () => {
                btnConfirmStaff.disabled = false;
            };
        }

        if (staffModal) staffModal.style.display = "flex";
    }
    
    // Close Staff Modal
    if (e.target.id === "close-staff-modal" || e.target.id === "staff-modal") {
        const staffModal = document.getElementById("staff-modal");
        if (staffModal) staffModal.style.display = "none";
    }

    // --- CONFIRM STAFF DESTINATION ---
    if (e.target.id === "btn-confirm-staff-destination") {
        const selectDropdown = document.getElementById("staff-dropdown-select");
        
        if (selectDropdown && selectDropdown.value && selectDropdown.selectedIndex >= 0) {
            const selectedOption = selectDropdown.options[selectDropdown.selectedIndex];
            
            // Prevent crash if they somehow confirm the "No matches" text
            if (selectedOption.disabled) return;

            const destinationValue = selectDropdown.value;
            const teacherName = selectedOption.getAttribute("data-teacher");

            // Close modal
            const staffModal = document.getElementById("staff-modal");
            if (staffModal) staffModal.style.display = "none";

            console.log(`🎯 [CONFIRM FLOW] Staff selected: ${teacherName}, Destination: ${destinationValue}`);

            // Direct pass creation
            const passType = window.currentUser?.role === "teacher" || window.currentUser?.role === "admin" ? "proxy" : "standard";

            try {
                if (typeof finalizePassCreation === "function") {
                    finalizePassCreation(destinationValue, teacherName, passType);
                }
            } catch (err) {
                console.error("❌ Error running finalizePassCreation:", err);
            }
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
                arrivedAt: getSpoofSafeTimestamp()
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
                departedAt: getSpoofSafeTimestamp()
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
        const dest = window.selectedDestination;
        if (!dest) return; 

        const passType = window.currentUser?.role === "teacher" || window.currentUser?.role === "admin" ? "proxy" : "standard";

        // 🟢 1. FETCH THE NO-CHECK-IN ROOMS DIRECTLY FROM FIREBASE
        let skipRoomsMap = {};
        try {
            // Force a fresh fetch of the settings document right now!
            const settingsSnap = await getDoc(doc(db, "system", "settings"));
            if (settingsSnap.exists()) {
                skipRoomsMap = settingsSnap.data().skipCheckInRooms || {};
            }
        } catch (error) {
            console.warn("⚠️ Couldn't fetch settings natively, falling back to sysInfo...", error);
            skipRoomsMap = window.sysInfo?.skipCheckInRooms || {};
        }
        
        let isNoCheckIn = false;
        
        // Force lowercase comparison so "108 Fountain" matches "108 fountain"
        const destLower = dest.toLowerCase();

        if (skipRoomsMap[destLower] === true) {
            isNoCheckIn = true;
        } else if (typeof isNoCheckInRoom === "function") {
            isNoCheckIn = isNoCheckInRoom(dest, window.sysInfo);
        }

        // 🐛 DEBUG CONSOLE LOGS 
        console.log("=== 🕵️‍♂️ DESTINATION DEBUG ===");
        console.log("1. Exact Clicked Dest:", `"${dest}"`);
        console.log("2. Lowercase Dest (for DB matching):", `"${destLower}"`);
        console.log("3. FRESH Database skipCheckInRooms:", skipRoomsMap);
        console.log("4. Did it trigger isNoCheckIn?", isNoCheckIn);
        console.log("===============================");

        // 🟢 2. Determine who is assigned to this room right now
        let targetTeacher = "Unknown";
        const teachers = getTeachersForRoom(dest);
        
        if (teachers.length === 1) {
            targetTeacher = teachers[0].displayName;
            console.log(`🎯 [CONFIRM FLOW] Found single teacher: ${targetTeacher}`);
        }

        // 🟢 3. THE POPUP: If no teacher (or multiple) is found and it requires one!
        if (targetTeacher === "Unknown" && !isNoCheckIn) {
            
            // Build dropdown using our feature-file helper!
            const staffOptions = buildStaffDropdownHTML(dest);

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

            return; // Wait for popup
        } 
        
        // If it's a no-check-in room or already has a single teacher, bypass!
        if (isNoCheckIn) targetTeacher = "No Receiving Teacher";
        await finalizePassCreation(dest, targetTeacher, passType);
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

// =======================================================
// 🧠 HELPER: EMERGENCY STRING FALLBACKS (Now safely outside!)
// =======================================================
export function fallbackFormatName(rawName) {
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

export function fallbackLastName(rawName) {
    if (!rawName || rawName === "Unknown" || rawName === "No Receiving Teacher") return rawName;
    let cleanName = rawName.trim();
    if (cleanName.includes(",")) return cleanName.split(",")[0].trim();
    const parts = cleanName.split(/\s+/);
    return parts[parts.length - 1]; 
}

// =======================================================
// 🧠 HELPER: DATABASE TEACHER LOOKUP
// =======================================================
export async function getTeacherProfileFromDB(searchName) {
    if (!searchName || searchName === "Unknown" || searchName === "No Receiving Teacher") return null;
    
    try {
        const usersRef = collection(db, "users");
        let snapshot;
        
        // 1. Try matching by displayName first (e.g., "Brian Orr")
        let q = query(usersRef, where("displayName", "==", searchName));
        snapshot = await getDocs(q);
        
        // 2. If no match, try matching strictly by lastName (e.g., "Orr")
        if (snapshot.empty) {
            q = query(usersRef, where("lastName", "==", searchName));
            snapshot = await getDocs(q);
        }
        
        // 3. Smart Fallback: If it's a title format (e.g., "Mr. Orr" or "Coach Orr"),
        //    isolate the last word and run an exact check against lastName.
        if (snapshot.empty && searchName.includes(" ")) {
            const isolatedLastName = searchName.trim().split(" ").pop();
            if (isolatedLastName) {
                q = query(usersRef, where("lastName", "==", isolatedLastName));
                snapshot = await getDocs(q);
            }
        }

        if (!snapshot.empty) {
            const docSnap = snapshot.docs[0];
            return { id: docSnap.id, ...docSnap.data() }; // Return profile with ID bound
        }
    } catch (error) {
        console.warn("⚠️ DB Teacher Lookup failed, using fallbacks.", error);
    }
    return null;
}

// ==========================================
// 🟢 MAP OVERLAY: Swap Room Numbers for Teacher Names (WITH DEBUG)
// ==========================================
window.showTeacherNamesOnMap = function() {
    console.log("\n🔍 [MAP OVERLAY] Zoom button clicked! Injecting names...");
    
    const mapSvg = document.getElementById("interactive-school-map");
    if (!mapSvg) {
        console.error("❌ [MAP OVERLAY] Could not find the SVG map element.");
        return;
    }
    
    // 1. Get current period
    let p = "1"; 
    if (window.currentTimeState && window.currentTimeState.currentPeriod) {
        p = String(window.currentTimeState.currentPeriod).trim();
    }
    const baseP = p.replace(/\D/g, '') || "1";
    
    console.log(`👉 [MAP OVERLAY] Active Period: ${p} (Base: ${baseP})`);
    
    const staffList = window.activeStaffList || [];
    if (staffList.length === 0) {
        console.error("❌ [MAP OVERLAY] FAILED: window.activeStaffList is empty!");
        return;
    }

    let matchCount = 0;

    // 2. Loop through every room on the map
    mapSvg.querySelectorAll(".map-node").forEach(node => {
        const dataId = node.getAttribute("data-id") || "";
        const matchKey = dataId.toLowerCase().replace(/^room\s+/i, '').trim();
        if (!matchKey) return;

        let rawName = null;

        // 3. Search the active staff list for a match
        for (const staff of staffList) {
            let activeRoom = null;
            
            if (staff.roomAssignments) {
                if (staff.roomAssignments[p] && staff.roomAssignments[p].room !== "No Room") {
                    activeRoom = staff.roomAssignments[p].room;
                } else if (staff.roomAssignments[baseP] && staff.roomAssignments[baseP].room !== "No Room") {
                    activeRoom = staff.roomAssignments[baseP].room;
                }
            } else {
                activeRoom = staff.room || staff.roomNumber || null;
            }

            if (activeRoom) {
                const cleanActiveRoom = activeRoom.toLowerCase().replace(/^room\s+/i, '').trim();
                if (cleanActiveRoom === matchKey) {
                    rawName = staff.mapName && staff.mapName.trim() !== "" ? staff.mapName : (staff.lastName || staff.displayName);
                    matchCount++;
                    break; // Stop looking, we found the teacher for this room!
                }
            }
        }

        // 4. If we found a teacher, update the map text!
        if (rawName) {
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
    
    console.log(`✅ [MAP OVERLAY] Finished! Successfully replaced ${matchCount} room labels.`);
};