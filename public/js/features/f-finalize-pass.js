// =======================================================
// 🚀 FINAL PASS BUILDER & DISPATCHER
// =======================================================


import { createNewPass } from "../modules/create-pass.js";
import { fallbackFormatName, fallbackLastName, getCorridorForRoom, getTeacherProfileFromDB } from '../main-student.js';


export async function finalizePassCreation(dest, targetTeacher, passType) {
    // Safely update Map Confirm Button
    const mapBtn = document.getElementById("btn-confirm-destination");
    if (mapBtn) {
        mapBtn.innerText = "Creating...";
        mapBtn.disabled = true;
    }

    // Safely update Staff Confirm Button
    const staffBtn = document.getElementById("btn-confirm-staff-destination");
    if (staffBtn) {
        staffBtn.innerText = "Creating...";
        staffBtn.disabled = true;
    }

    const isProxyActive = passType === "proxy";
    const proxyTeacherName = isProxyActive ? (window.currentUser?.displayName || "Teacher") : "";
    
    // --- 1. IDENTIFY THE STUDENT ---
    const safeStudentId = window.currentStudentProfile?.id || window.currentUser?.uid || "unknown";
    const studentName = window.currentStudentProfile?.displayName || window.currentUser?.displayName || "Student";
    const studentEmail = window.currentStudentProfile?.email || window.currentUser?.email || "unknown@student.com";

    // --- 2. IDENTIFY THE TIME & PERIOD ---
    const currentPeriod = window.currentTimeState?.currentPeriod || "Unknown";
    const activeBasePeriod = window.currentTimeState?.activeBasePeriod || currentPeriod; 

    // --- 3. IDENTIFY THE ORIGIN (Clever Schedule Engine) ---
    let originRoom = "Unknown";
    let rawOriginTeacher = "Unknown";
    let matchedOriginProfile = null;

    // A. Check schedule to find the Teacher (and their room) via Clever ID
    if (window.currentStudentProfile && window.currentStudentProfile.schedule && currentPeriod !== "Unknown") {
        const sched = window.currentStudentProfile.schedule;
        let currentClass = null;

        if (Array.isArray(sched)) {
            currentClass = sched.find(c => String(c.period) === String(currentPeriod));
        } else if (typeof sched === 'object') {
            currentClass = sched[currentPeriod] || Object.values(sched).find(c => String(c?.period) === String(currentPeriod));
        }

        if (currentClass) {
            const tCleverId = currentClass.teacherCleverId;
            
            // 1. Try to find the exact teacher profile using the Clever ID
            if (tCleverId && Array.isArray(window.activeStaffList)) {
                matchedOriginProfile = window.activeStaffList.find(t => t.cleverId === tCleverId);
                
                if (matchedOriginProfile) {
                    rawOriginTeacher = matchedOriginProfile.displayName;
                    
                    // Now that we have the teacher, find WHERE they are teaching this period!
                    if (matchedOriginProfile.roomAssignments && matchedOriginProfile.roomAssignments[currentPeriod]) {
                        originRoom = matchedOriginProfile.roomAssignments[currentPeriod].room;
                    } else if (matchedOriginProfile.roomAssignments && matchedOriginProfile.roomAssignments[activeBasePeriod]) {
                        originRoom = matchedOriginProfile.roomAssignments[activeBasePeriod].room;
                    } else {
                        originRoom = matchedOriginProfile.room || "Unknown";
                    }
                    console.log(`🎯 [ORIGIN FLOW] Matched via CleverID! Teacher: ${rawOriginTeacher}, Room: ${originRoom}`);
                }
            }
            
            // 2. Fallback: If CleverID fails, extract the name from "ClassName - TeacherName - Period"
            if (!matchedOriginProfile && currentClass.className) {
                const parts = currentClass.className.split(" - ");
                if (parts.length >= 2) {
                    rawOriginTeacher = parts[1].trim(); 
                    console.log(`ℹ️ [ORIGIN FLOW] Parsed teacher name from class string: ${rawOriginTeacher}`);
                }
            }
        }
    }

    // B. Kiosk / Proxy Fallback (If a teacher is making this, the origin is THEIR assigned room!)
    if ((!originRoom || originRoom === "Unknown") && window.currentUser) {
        if (window.currentUser.roomAssignments && window.currentUser.roomAssignments[currentPeriod]) {
            originRoom = window.currentUser.roomAssignments[currentPeriod].room;
            rawOriginTeacher = window.currentUser.displayName || "Unknown";
            matchedOriginProfile = window.currentUser;
            console.log(`ℹ️ [ORIGIN FLOW] Used proxy Teacher's room assignment: ${originRoom}`);
        } else if (window.currentUser.room) {
            originRoom = window.currentUser.room;
            rawOriginTeacher = window.currentUser.displayName || "Unknown";
            matchedOriginProfile = window.currentUser;
        }
    }

    // C. 🍔 LUNCH & WIN TIME ORIGIN OVERRIDE 
    if (currentPeriod.toLowerCase().includes("lunch")) {
        originRoom = "Cafeteria";
        rawOriginTeacher = "Lunch Staff";
        matchedOriginProfile = null;
    } else if (currentPeriod === "WIN Time" && (!originRoom || originRoom === "Unknown")) {
        originRoom = "TBA";
        rawOriginTeacher = "WIN Time";
        matchedOriginProfile = null;
    }

    // --- 4. SECURE DATABASE LOOKUPS FOR EXACT NAMES ---
    const originTeacherProfile = matchedOriginProfile || await getTeacherProfileFromDB(rawOriginTeacher);
    const destTeacherProfile = await getTeacherProfileFromDB(targetTeacher);

    // 🚀 DYNAMIC ROOM ROUTING ENGINE (Overrides incoming 'dest')
    if (destTeacherProfile && destTeacherProfile.roomAssignments) {
        if (destTeacherProfile.roomAssignments[currentPeriod]) {
            dest = destTeacherProfile.roomAssignments[currentPeriod].room;
        } else if (destTeacherProfile.roomAssignments[activeBasePeriod]) {
            dest = destTeacherProfile.roomAssignments[activeBasePeriod].room;
        }
    }
    
    if (!dest || dest === "TBA" || dest === "No Room") {
        dest = destTeacherProfile?.mapName || destTeacherProfile?.room || destTeacherProfile?.roomNumber || "TBA";
    }
    if (dest === "No Room") dest = "TBA";

    // Build Origin Names 
    const finalOriginTeacher = originTeacherProfile?.displayName || fallbackFormatName(rawOriginTeacher);
    const originTeacherLastName = originTeacherProfile?.lastName || fallbackLastName(rawOriginTeacher);

    // Build Destination Names 
    const finalDestinationTeacher = destTeacherProfile?.displayName || fallbackFormatName(targetTeacher);
    const destTeacherLastName = destTeacherProfile?.lastName || fallbackLastName(targetTeacher);

    // --- 5. BUILD THE HARDCODED PAYLOAD ---
    const passData = {
        studentId: safeStudentId, 
        studentName: studentName,
        studentDisplayName: studentName,
        studentEmail: studentEmail,
        
        destination: dest,
        destinationRoom: dest,
        destinationTeacher: finalDestinationTeacher, 
        destTeacherLastName: destTeacherLastName, 
        targetTeacher: finalDestinationTeacher, 
        
        origin: originRoom, 
        originRoom: originRoom,
        originTeacher: finalOriginTeacher, 
        originTeacherLastName: originTeacherLastName, 
        period: currentPeriod, 
        
        type: passType,
        initiatedBy: isProxyActive ? "teacher_proxy" : "student",
        senderName: isProxyActive ? proxyTeacherName : studentName, 
        
        destCorridor: typeof getCorridorForRoom === "function" ? getCorridorForRoom(dest) : "Unknown",
        originCorridor: typeof getCorridorForRoom === "function" ? getCorridorForRoom(originRoom) : "Unknown",
        
        status: passType === "tardy" ? "active" : "pending", 
        uiLocation: passType === "scheduled" ? "message_center" : "pass_section", 
        restrictionLevel: "none",
        restrictionType: "",
        restrictionReason: "",
        waitlistPosition: 0,
        recentTravels: []
    };

    console.log("📤 [FINAL PAYLOAD] Ready to dispatch pass creation:", passData);

    // --- 6. SEND TO THE PASS ENGINE ---
    const result = await createNewPass(passData);

    if (result.success) {
        document.getElementById("map-modal").classList.add("hidden");
        document.getElementById("map-modal-container").innerHTML = '';
    } else {
        document.getElementById("map-modal").classList.add("hidden");
        document.getElementById("map-modal-container").innerHTML = '';

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

            document.getElementById("btn-cancel-denied-request").addEventListener("click", () => {
                import("../student-ui.js").then(module => {
                    if (typeof module.renderStudentIdleScreen === "function") {
                        module.renderStudentIdleScreen();
                    } else {
                        location.reload(); 
                    }
                }).catch(() => location.reload()); 
            });
        }
    }
}