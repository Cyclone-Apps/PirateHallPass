// public/js/features/f-staff-schedule.js
import { activeStaffList } from "./f-staff-roster.js"; 

// Kept as an empty shell export to prevent legacy import statement crashes
export let currentLiveScheduleData = null; 

export function initStaffSchedule() {
    // 🚫 Gracefully intercept and turn off legacy UI triggers
    document.addEventListener("click", (e) => {
        if (e.target.closest("#btn-open-teacher-schedule") || e.target.id === "btn-import-teacher-schedule") {
            e.preventDefault();
            e.stopPropagation();
            alert("📅 Notice: The legacy CSV Master Schedule table has been fully deprecated.\n\nRoom assignments are now managed dynamically and securely inside each individual teacher's profile panel on the Staff Roster!");
        }
    });
}

/**
 * 🚀 UPGRADED SMART BRIDGE ENGINE
 * Replaces the old CSV matrix scanner. If any legacy system component calls this helper,
 * it will automatically perform a dynamic lookup against the live database profiles.
 * * @param {string} teacherName - The target teacher identifier (e.g., "Mr. Orr", "Orr", "Brian Orr")
 * @param {string} period - The class period query (e.g., "3", "WIN Time")
 * @returns {string|null} - The assigned room string or null if unassigned
 */
export function getRoomForTeacherAndPeriod(teacherName, period) {
    if (!teacherName || !period) return null;

    // Pull from the live memory array managed by f-staff-roster.js
    const staffList = window.activeStaffList || activeStaffList || [];
    const searchLower = teacherName.toLowerCase().trim();

    // Find the teacher profile using a fuzzy match on their real identity attributes
    const matchedStaff = staffList.find(staff => {
        const lName = (staff.lastName || "").toLowerCase().trim();
        const dName = (staff.displayName || "").toLowerCase().trim();
        
        return (lName && searchLower.includes(lName)) || (dName && searchLower === dName);
    });

    if (matchedStaff && matchedStaff.roomAssignments) {
        const periodStr = String(period).trim();

        // 1. Direct match verification (e.g., "3" or "WIN Time")
        if (matchedStaff.roomAssignments[periodStr]?.room) {
            return matchedStaff.roomAssignments[periodStr].room;
        }
        
        // 2. Secondary fallback: Extract numbers for split configurations (e.g. "Period 3B" -> "3")
        const basePeriod = periodStr.replace(/\D/g, ''); 
        if (basePeriod && matchedStaff.roomAssignments[basePeriod]?.room) {
            return matchedStaff.roomAssignments[basePeriod].room;
        }

        // 3. Absolute safety layout fallbacks
        return matchedStaff.roomAssignments.defaultRoom || matchedStaff.room || matchedStaff.roomNumber || null;
    }

    return null;
}