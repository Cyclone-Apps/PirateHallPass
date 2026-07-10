// public/js/features/f-staff-sync.js
import { db } from "../firebase-config.js";
import { collection, doc, setDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { activeStaffList } from "./f-staff-roster.js"; // Importing the live list!

export function initStaffSync() {
    document.addEventListener("click", async (e) => {
        // --- 1. Auto-Match trigger ---
        if (e.target.id === "btn-sync-schedules") {
            runAutoMatchSync(e.target);
        }

        // --- 2. Manual Link trigger (Moved from renderUnmappedUI) ---
        if (e.target.classList.contains("btn-save-manual-map")) {
            const btn = e.target;
            const row = btn.closest(".unmapped-row");
            const select = row.querySelector(".manual-map-select");
            const schedName = select.getAttribute("data-schedname");
            const staffId = select.value;

            if (!staffId) return alert("Please select a staff member.");

            btn.innerText = "⏳...";
            btn.disabled = true;

            try {
                // Save the link to Firebase
                await setDoc(doc(db, "users", staffId), { scheduleAlias: schedName }, { merge: true });
                row.remove(); // Remove it from the alert box
                
                // Update the badge count
                const container = document.getElementById("unmapped-teachers-container");
                const countBadge = document.getElementById("unmapped-count-badge");
                const alertBox = document.getElementById("teacher-mapping-alert");

                if (countBadge && container) {
                    countBadge.innerText = container.children.length;
                    if (container.children.length === 0) {
                        alertBox?.classList.add("hidden");
                        alert("✅ All schedule names linked successfully!");
                    }
                }
            } catch (err) {
                console.error("Manual link failed:", err);
                alert("Failed to save assignment details.");
                btn.innerText = "💾 Link";
                btn.disabled = false;
            }
        }
    });
}

// ==========================================
// 🔄 2. AUTO-MATCH SCHEDULE SYNC ENGINE
// ==========================================
async function runAutoMatchSync(btnSync) {
    btnSync.innerText = "⏳ Scanning...";
    btnSync.disabled = true;

    try {
        // 🎯 MIGRATION FIX: Fetch all students from the unified "users" collection
        const q = query(collection(db, "users"), where("role", "==", "student"));
        const snap = await getDocs(q);
        
        const uniqueScheduleNames = new Set();
        
        snap.forEach(docSnap => {
            const student = docSnap.data();
            if (student.schedule) {
                Object.values(student.schedule).forEach(classInfo => {
                    if (classInfo.teacher && classInfo.teacher.trim() !== "" && classInfo.teacher !== "N/A") {
                        uniqueScheduleNames.add(classInfo.teacher.trim());
                    }
                });
            }
        });

        const unmappedNames = [];
        const staffList = activeStaffList || []; // 🌟 Uses imported list, no window object!

        for (const schedName of uniqueScheduleNames) {
            if (staffList.find(staff => staff.scheduleAlias === schedName)) continue;

            const lastNameTarget = schedName.split(" ").pop().toLowerCase();
            const potentialMatches = staffList.filter(staff => (staff.displayName || "").split(" ").pop().toLowerCase() === lastNameTarget);

            if (potentialMatches.length === 1) {
                const matchedStaff = potentialMatches[0];
                await setDoc(doc(db, "users", matchedStaff.id), { scheduleAlias: schedName }, { merge: true });
            } else {
                unmappedNames.push(schedName);
            }
        }

        renderUnmappedUI(unmappedNames, staffList);

    } catch (err) {
        console.error("Error running schedule synchronization engine:", err);
        alert("Error running schedule match scan. See console.");
    }

    btnSync.innerText = "🔄 Auto-Match Schedules";
    btnSync.disabled = false;
}

function renderUnmappedUI(unmappedNames, staffList) {
    const alertBox = document.getElementById("teacher-mapping-alert");
    const container = document.getElementById("unmapped-teachers-container");
    const countBadge = document.getElementById("unmapped-count-badge");
    
    if (!alertBox || !container || !countBadge) return;

    if (unmappedNames.length === 0) {
        alertBox.classList.add("hidden");
        alert("✅ Schedule Sync Complete! All schedule names matched successfully.");
        return;
    }

    alertBox.classList.remove("hidden");
    countBadge.innerText = unmappedNames.length;

    let optionsHtml = `<option value="">-- Select Staff Account --</option>`;
    [...staffList].sort((a, b) => (a.displayName || "").localeCompare(b.displayName || "")).forEach(staff => {
        optionsHtml += `<option value="${staff.id}">${staff.displayName} (${staff.email})</option>`;
    });

    container.innerHTML = unmappedNames.map(name => `
        <div class="unmapped-row" style="display: flex; align-items: center; gap: 15px; background: white; padding: 10px; border-radius: 4px; border: 1px solid #ffeeba;">
            <strong style="width: 150px; color: #333;">${name}</strong>
            <span style="font-size: 1.5rem;">➡️</span>
            <select class="manual-map-select" data-schedname="${name}" style="flex: 1; padding: 8px; border-radius: 4px; border: 1px solid #ccc; font-size: 1rem;">
                ${optionsHtml}
            </select>
            <button class="primary-btn btn-save-manual-map" style="padding: 8px 15px; background: #2e7d32; border: none; color: white; cursor: pointer; border-radius: 4px;">💾 Link</button>
        </div>
    `).join("");

    // 🌟 EVENT LISTENER LOOP REMOVED! It is now handled cleanly in initStaffSync()
}