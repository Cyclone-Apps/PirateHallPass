// ==========================================================
// 📅 SCHEDULED PASS ENGINE 
// File: public/js/features/f-scheduled-pass-engine.js
// ==========================================================

/**
 * Global function to activate the scheduled pass from the Message Center
 */
window.viewScheduledPass = async (passId) => {
    try {
        const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
        // Ensure db is accessible (usually globally defined as window.db or imported)
        const firestoreDb = typeof db !== 'undefined' ? db : window.db; 
        
        await updateDoc(doc(firestoreDb, "passes", passId), {
            uiLocation: "pass_section"
        });
        
        console.log(`✅ Scheduled Pass ${passId} activated! Moving to pass_section.`);
    } catch (error) {
        console.error("Error viewing scheduled pass:", error);
    }
};

/**
 * Global function to move a scheduled pass to the main stage for Teacher Authorization
 */
window.useScheduledPass = async (passId) => {
    try {
        const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
        const firestoreDb = typeof db !== 'undefined' ? db : window.db;
        
        // Changing status to "pending" shifts it to the Teacher Approve/Reject authorization screen
        await updateDoc(doc(firestoreDb, "passes", passId), {
            status: "pending", 
            uiLocation: "pass_section"
        });
        
        console.log(`🚀 Scheduled Pass ${passId} sent to main screen for Teacher Authorization!`);
    } catch (error) {
        console.error("Error initiating scheduled pass:", error);
    }
};

/**
 * Global function to return the scheduled pass to the Message Center
 */
window.hideScheduledPass = async (passId) => {
    try {
        const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
        const firestoreDb = typeof db !== 'undefined' ? db : window.db;

        await updateDoc(doc(firestoreDb, "passes", passId), {
            uiLocation: "message_center"
        });
        
        console.log(`🔙 Scheduled Pass ${passId} hidden! Returning to message_center.`);
    } catch (error) {
        console.error("Error hiding scheduled pass:", error);
    }
};

/**
 * Renders the Edge-to-Edge Blue Scheduled Pass Screen
 */
window.renderStudentScheduledScreen = function(pass) {
    console.log("🎯 Isolated target workspace area: kiosk-main-widget");
    const mainContainer = document.getElementById("kiosk-main-widget");
    if (!mainContainer) return;

    // 1. Format the Teacher Name 
    let teacherName = pass.proxyTeacherName || pass.teacherName || pass.senderName || "Teacher";

    // 2. Format the Date
    let dateStr = "an upcoming date";
    if (pass.scheduledDate) {
        const d = new Date(pass.scheduledDate + "T12:00:00");
        if (!isNaN(d)) {
            dateStr = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        }
    }

    // 3. Format the Time
    let timeStr = "when available";
    if (pass.scheduledPeriod && pass.scheduledPeriod !== "None") {
        timeStr = `${pass.scheduledPeriod} period`;
    } else if (pass.scheduledTime) {
        const [hourStr, minStr] = pass.scheduledTime.split(':');
        if (hourStr && minStr) {
            let h = parseInt(hourStr, 10);
            const ampm = h >= 12 ? 'pm' : 'am';
            h = h % 12 || 12;
            timeStr = `${h}:${minStr} ${ampm}`;
        }
    }

    // 4. Check if Required or Requested
    const reqType = (pass.passType && pass.passType.toLowerCase() === 'required') ? 'required' : 'requested';
    // Use yellow to make "required" pop against the blue background, white for requested
    const reqColor = reqType === 'required' ? '#ffc107' : '#ffffff';

    // 5. Build the UI
    mainContainer.style.backgroundColor = ""; 
    mainContainer.style.padding = "0";

    const purposeHtml = (pass.purpose && pass.purpose.trim() !== "") 
        ? `<h3 style="color: #e3f2fd; font-size: 1.2rem; margin-bottom: 20px; font-weight: 400; font-style: italic;">"${pass.purpose}"</h3>` 
        : '';

    mainContainer.innerHTML = `
        <div style="background-color: #4593F1; color: white; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 20px; box-sizing: border-box; text-align: center;">
            
            <p style="color: #e3f2fd; font-size: 1.1rem; font-weight: 500; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 1px;">
                Scheduled Pass from ${teacherName}<br>
                <span style="font-size: 0.95rem; opacity: 0.9; text-transform: none; letter-spacing: 0;">on ${dateStr} at ${timeStr}</span>
            </p>
            
            <h1 style="color: #ffffff; font-size: 2.8rem; margin: 10px 0; line-height: 1.1; font-weight: 700;">
                ${pass.studentDisplayName || "Student"}
            </h1>
            
            <h2 style="color: #f1f8ff; font-size: 1.8rem; margin-bottom: 15px; font-weight: 500;">
                Is <span style="color: ${reqColor}; font-weight: 700; text-decoration: underline;">${reqType}</span> to go to <strong>${pass.destination}</strong>
            </h2>
            
            ${purposeHtml}
            
            <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.3); width: 80%; max-width: 400px;">
                <span style="font-size: 1rem; color: #e3f2fd;">
                    📢 Scheduled By: ${teacherName}
                </span>
            </div>

            <button onclick="window.hideScheduledPass('${pass.id}')" style="margin-top: 30px; background: rgba(255,255,255,0.2); color: white; border: 2px solid white; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 1rem; transition: background 0.2s;">
                🔙 Show Pass Later
            </button>
        </div>
    `;
};

// Aliased as a global safety fallback
window.fallbackRenderScheduledScreen = window.renderStudentScheduledScreen;

/**
 * Global click handlers for Scheduled Pass buttons
 */
document.addEventListener('click', (e) => {
    // 1. Use Scheduled Pass
    if (e.target.id === "btn-use-scheduled-pass") {
        const passId = e.target.getAttribute("data-id");
        if (!passId) return;
        
        e.target.innerText = "Requesting...";
        e.target.disabled = true;
        if (typeof window.useScheduledPass === "function") {
            window.useScheduledPass(passId);
        } else if (typeof updatePassStatus === "function") {
            updatePassStatus(passId, "pending");
        }
    }

    // 2. View Scheduled Pass
    if (e.target.closest('.btn-view-scheduled-pass')) {
        const btn = e.target.closest('.btn-view-scheduled-pass');
        const teacher = btn.getAttribute("data-teacher");
        const purpose = btn.getAttribute("data-purpose");
        const dest = btn.getAttribute("data-dest");
        const time = btn.getAttribute("data-time");
        alert(`📨 SCHEDULED PASS DETAILS\n\nSent By: ${teacher}\nDestination: ${dest}\nTime: ${time}\nPurpose: ${purpose}`);
    }

    // 3. Delete Scheduled Pass
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