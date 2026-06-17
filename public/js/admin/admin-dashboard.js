// js/admin/admin-dashboard.js

import { 
    listenToPendingPasses, 
    listenToActivePasses, 
    listenToScheduledPasses,
    updatePassStatus // 🌟 IMPORTED: Needed for cancellation
} from "../modules/pass-engine.js";
import { renderPassList } from "../modules/ui-widgets.js";

// ==========================================
// 📦 STATE MANAGEMENT
// ==========================================
let cachedSentPasses = []; // We only need to cache Sent Passes for filtering

// ==========================================
// 🚀 INITIALIZATION & EVENT BINDING
// ==========================================
export function initDashboardManagement() {
    
    // 🌟 GLOBAL BINDING: Wire up the global cancel pass handler
    window.cancelPass = function(passId) {
        if (typeof updatePassStatus === "function") {
            updatePassStatus(passId, "cancelled");
        }
    };

    // 1. Start "GOD-MODE" Firebase Listeners (No filters applied to these!)
    if (typeof listenToPendingPasses === "function") {
        listenToPendingPasses((passes) => {
            renderPassList(passes, "list-pending-passes", "pending-count");
        });
    }

    if (typeof listenToActivePasses === "function") {
        listenToActivePasses((passes) => {
            renderPassList(passes, "list-active-passes", "active-count");
        });
    }

    if (typeof listenToScheduledPasses === "function") {
        listenToScheduledPasses((passes) => {
            const now = new Date();
            
            // Filter out expired passes
            cachedSentPasses = passes.filter(p => {
                if (!p.scheduledDate || !p.scheduledTime) return true; // Keep if no specific time
                const passDateTime = new Date(`${p.scheduledDate}T${p.scheduledTime}`);
                return passDateTime >= now; // Only keep future/current passes
            });

            updateAdminFilters(cachedSentPasses);
            renderSentPassesColumn(); 
        });
    }

    // 2. Bind Filters ONLY for the Sent/Scheduled Passes
    const filterTeacherBtn = document.getElementById("filter-sent-teacher");
    const filterStudentBtn = document.getElementById("filter-sent-student");

    if (filterTeacherBtn) {
        filterTeacherBtn.addEventListener("change", renderSentPassesColumn);
    }
    if (filterStudentBtn) {
        filterStudentBtn.addEventListener("change", renderSentPassesColumn);
    }
}

// Bind Event Delegation for Pass Action Buttons (Approve, Reject, End)
    document.addEventListener("click", async (e) => {
        // Check if what we clicked was one of our dynamic buttons
        if (e.target && e.target.classList.contains("card-btn")) {
            const passId = e.target.getAttribute("data-id");
            const newStatus = e.target.getAttribute("data-action");

            if (!passId || !newStatus) return;

            // Change the button text so the user knows it's working
            const originalText = e.target.innerText;
            e.target.innerText = "⏳...";
            e.target.disabled = true;

            try {
                // Call the pass engine function!
                await updatePassStatus(passId, newStatus);
            } catch (error) {
                console.error("Failed to update pass:", error);
                e.target.innerText = originalText;
                e.target.disabled = false;
            }
        }
    });

// ==========================================
// 🔄 DYNAMIC DROPDOWN GENERATOR
// ==========================================
function updateAdminFilters(passes) {
    const filterTeacher = document.getElementById("filter-sent-teacher");
    const filterStudent = document.getElementById("filter-sent-student");
    if (!filterTeacher || !filterStudent) return;

    // Save current selections to prevent UI jumping
    const currentTeacher = filterTeacher.value;
    const currentStudent = filterStudent.value;

    // Extract unique names of Teachers who sent passes and Students receiving them
    const uniqueTeachers = [...new Set(passes.map(p => p.senderName || p.teacherName))].filter(Boolean).sort();
    const uniqueStudents = [...new Set(passes.map(p => p.studentDisplayName || p.studentName))].filter(Boolean).sort();

    // Rebuild Teacher Dropdown
    filterTeacher.innerHTML = '<option value="All">All Teachers</option>';
    uniqueTeachers.forEach(teacher => {
        const opt = document.createElement("option");
        opt.value = teacher;
        opt.innerText = teacher;
        if (teacher === currentTeacher) opt.selected = true;
        filterTeacher.appendChild(opt);
    });

    // Rebuild Student Dropdown
    filterStudent.innerHTML = '<option value="All">All Students</option>';
    uniqueStudents.forEach(student => {
        const opt = document.createElement("option");
        opt.value = student;
        opt.innerText = student;
        if (student === currentStudent) opt.selected = true;
        filterStudent.appendChild(opt);
    });
}

// ==========================================
// 📅 SENT / SCHEDULED PASSES CUSTOM RENDERER
// ==========================================
function renderSentPassesColumn() {
    const container = document.getElementById("list-sent-passes");
    if (!container) return;
    
    container.innerHTML = "";

    // 1. Apply Sent Pass Dropdown Filters
    const teacherFilter = document.getElementById("filter-sent-teacher")?.value || "All";
    const studentFilter = document.getElementById("filter-sent-student")?.value || "All";

    const filteredPasses = cachedSentPasses.filter(pass => {
        const passTeacher = pass.senderName || pass.teacherName;
        const passStudent = pass.studentDisplayName || pass.studentName;

        if (teacherFilter !== "All" && passTeacher !== teacherFilter) return false;
        if (studentFilter !== "All" && passStudent !== studentFilter) return false;
        return true;
    });

    if (filteredPasses.length === 0) {
        container.innerHTML = `<div style="text-align: center; color: #888; padding: 20px;">No scheduled passes match these filters.</div>`;
        return;
    }

    // 2. Render the Cards
    filteredPasses.forEach(pass => {
        let timeText = pass.scheduledTime ? pass.scheduledTime : `Period ${pass.scheduledPeriod}`;
        let teacherText = pass.targetTeacher && pass.targetTeacher !== "Unknown" ? ` (${pass.targetTeacher})` : "";

        const card = document.createElement("div");
        card.style.cssText = "background: white; border: 1px solid #eaedf2; border-left: 5px solid #0277bd; padding: 15px; margin-bottom: 12px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);";
        
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; font-weight: bold; margin-bottom: 5px;">
                <span style="font-size: 1.1rem; color: #1a1a1a;">🧑‍🎓 ${pass.studentDisplayName || pass.studentName}</span>
                <span class="badge" style="text-transform: uppercase; font-size: 0.75rem; background: #eee;">${pass.type || "Request"}</span>
            </div>
            <div style="color: #555; font-size: 0.95rem; margin-bottom: 5px;">
                📍 To: <strong>${pass.destination}</strong>${teacherText}
            </div>
            <div style="color: #444; font-size: 0.85rem; margin-bottom: 5px;">
                📅 <strong>${pass.scheduledDate}</strong> @ <strong>${timeText}</strong>
            </div>
            <div style="color: #888; font-size: 0.85rem; font-style: italic;">Sent by: ${pass.senderName || pass.teacherName}</div>
            
            <div style="margin-top: 10px; display: flex; gap: 8px;">
                <button class="btn-cancel-scheduled" data-id="${pass.id}" style="background: #ef5350; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 0.8rem;">Cancel Pass</button>
            </div>
        `;

        const cancelBtn = card.querySelector(".btn-cancel-scheduled");
        if (cancelBtn) {
            cancelBtn.addEventListener("click", () => {
                if (confirm("Are you sure you want to cancel this scheduled pass?")) {
                    if (typeof window.cancelPass === "function") window.cancelPass(pass.id);
                }
            });
        }

        container.appendChild(card);
    });
}