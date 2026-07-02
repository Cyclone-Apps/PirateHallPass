// js/admin/admin-dashboard.js

import { 
    listenToPendingPasses, 
    listenToActivePasses, 
    listenToScheduledPasses,
    listenToBypassedPasses,
    updatePassStatus,
    fetchAdminPassHistory
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

    // 🌟 NEW: Start Bypassed Passes Listener for the 4th Column!
    if (typeof listenToBypassedPasses === "function") {
        listenToBypassedPasses((passes) => {
            renderPassList(passes, "list-bypassed-passes", "bypassed-count");
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

    // =======================================================
    // 📜 ADMIN PASS HISTORY VIEWER LOGIC
    // =======================================================
    let allAdminHistory = []; 

    // 🟢 Bulletproof Event Listener (Works even if buttons load late!)
    document.addEventListener("click", async (e) => {
        // 1. Open Modal
        if (e.target.id === "btn-open-admin-history") {
            // Set BOTH dates to Today
            const now = new Date();
            const todayStr = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
            
            document.getElementById("filter-history-start-date").value = todayStr;
            document.getElementById("filter-history-end-date").value = todayStr;
            
            const historyModal = document.getElementById("modal-admin-history");
            if (historyModal) historyModal.classList.remove("hidden");
            
            document.getElementById("admin-history-results-count").innerText = "⏳ Loading entire school history... please wait.";
            document.getElementById("admin-history-list").innerHTML = "";

            allAdminHistory = await fetchAdminPassHistory();
            
            allAdminHistory.sort((a, b) => {
                const timeA = a.returnedAt?.toDate?.() || a.createdAt?.toDate?.() || new Date(0);
                const timeB = b.returnedAt?.toDate?.() || b.createdAt?.toDate?.() || new Date(0);
                return timeB - timeA;
            });

            applyAdminHistoryFilters(); // The datalists are now populated inside this function!
        }

        // 2. Close Modal
        if (e.target.id === "btn-close-admin-history") {
            const historyModal = document.getElementById("modal-admin-history");
            if (historyModal) historyModal.classList.add("hidden");
        }

        // 3. Clear Dates
        if (e.target.id === "btn-clear-history-dates") {
            document.getElementById("filter-history-start-date").value = "";
            document.getElementById("filter-history-end-date").value = "";
            applyAdminHistoryFilters();
        }

        // 3a. Clear Student
        if (e.target.id === "btn-clear-history-student") {
            document.getElementById("filter-history-student").value = "";
            applyAdminHistoryFilters();
        }

        // 3b. Clear Teacher
        if (e.target.id === "btn-clear-history-teacher") {
            document.getElementById("filter-history-teacher").value = "";
            applyAdminHistoryFilters();
        }

        // 3c. Clear Room
        if (e.target.id === "btn-clear-history-room") {
            document.getElementById("filter-history-room").value = "";
            applyAdminHistoryFilters();
        }
    });

    // =======================================================
    // 🟢 REAL-TIME FILTER LISTENER (Instant Updates)
    // =======================================================
    document.addEventListener("input", (e) => {
        // If the user types or selects anything in these 5 boxes, instantly apply!
        const filterIds = [
            "filter-history-start-date",
            "filter-history-end-date",
            "filter-history-student",
            "filter-history-teacher",
            "filter-history-room"
        ];
        
        if (filterIds.includes(e.target.id)) {
            applyAdminHistoryFilters();
        }
    });


    // 🟢 Apply All Filters & Dynamically Update Dropdowns 
    function applyAdminHistoryFilters() {
        const startDateVal = document.getElementById("filter-history-start-date").value;
        const endDateVal = document.getElementById("filter-history-end-date").value;
        const studentVal = document.getElementById("filter-history-student").value.toLowerCase().trim();
        const teacherVal = document.getElementById("filter-history-teacher").value.toLowerCase().trim();
        const roomVal = document.getElementById("filter-history-room").value.toLowerCase().trim();

        let filtered = allAdminHistory;

        // Filter 1: Date Range
        if (startDateVal || endDateVal) {
            filtered = filtered.filter(p => {
                const passDate = p.returnedAt?.toDate?.() || p.createdAt?.toDate?.();
                if (!passDate) return false;
                
                // Keep local timezone accurate
                const localDateStr = new Date(passDate.getTime() - (passDate.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
                
                if (startDateVal && localDateStr < startDateVal) return false;
                if (endDateVal && localDateStr > endDateVal) return false;
                
                return true;
            });
        }

        // Filter 2: Student
        if (studentVal) {
            filtered = filtered.filter(p => (p.studentDisplayName || p.studentName || "").toLowerCase().includes(studentVal));
        }

        // Filter 3: Teacher
        if (teacherVal) {
            filtered = filtered.filter(p => 
                (p.targetTeacher || "").toLowerCase().includes(teacherVal) || 
                (p.originTeacher || "").toLowerCase().includes(teacherVal) ||
                (p.senderName || "").toLowerCase().includes(teacherVal) ||
                (p.editedBy || "").toLowerCase().includes(teacherVal)
            );
        }

        // Filter 4: Room
        if (roomVal) {
            filtered = filtered.filter(p => 
                (p.destination || "").toLowerCase().includes(roomVal) ||
                (p.originalDestination || "").toLowerCase().includes(roomVal)
            );
        }

        // ==========================================================
        // 🟢 UPDATE DATALISTS BASED ON VISIBLE PASSES ONLY
        // ==========================================================
        const uniqueStudents = new Set();
        const uniqueTeachers = new Set();
        const uniqueRooms = new Set();

        filtered.forEach(p => {
            if (p.studentDisplayName) uniqueStudents.add(p.studentDisplayName);
            else if (p.studentName) uniqueStudents.add(p.studentName);

            if (p.targetTeacher) uniqueTeachers.add(p.targetTeacher);
            if (p.originTeacher) uniqueTeachers.add(p.originTeacher);
            if (p.senderName) uniqueTeachers.add(p.senderName);
            if (p.editedBy) uniqueTeachers.add(p.editedBy);

            if (p.destination) uniqueRooms.add(p.destination);
            if (p.originalDestination) uniqueRooms.add(p.originalDestination);
        });

        const populateDatalist = (id, set) => {
            const datalist = document.getElementById(id);
            if (!datalist) return;
            datalist.innerHTML = "";
            Array.from(set).sort().forEach(val => {
                if (val && val.trim() !== "") {
                    const option = document.createElement("option");
                    option.value = val;
                    datalist.appendChild(option);
                }
            });
        };

        populateDatalist("list-history-students", uniqueStudents);
        populateDatalist("list-history-teachers", uniqueTeachers);
        populateDatalist("list-history-rooms", uniqueRooms);

        // ==========================================================

        document.getElementById("admin-history-results-count").innerText = `Showing ${filtered.length} passes`;
        renderAdminHistoryPasses(filtered, "admin-history-list");
    }

    // 🟢 Renders the Custom Admin History Cards (Including Edits, Fraud Flags, & Check-Ins)
    function renderAdminHistoryPasses(passes, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = "";

        if (passes.length === 0) {
            container.innerHTML = `<div style="padding: 15px; color: #777; font-style: italic;">No passes match these filters.</div>`;
            return;
        }

        passes.forEach(pass => {
            const startObj = pass.acceptedAt?.toDate?.() || pass.createdAt?.toDate?.();
            const endObj = pass.returnedAt?.toDate?.();
            const origStartObj = pass.originalAcceptedAt?.toDate?.();
            const origEndObj = pass.originalReturnedAt?.toDate?.();
            
            const arrivedObj = pass.arrivedAt?.toDate?.();
            const departedObj = pass.departedAt?.toDate?.();
            
            // 🌟 Updated to return --:-- if missing
            const formatTime = (dateObj) => dateObj ? dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "--:--";
            
            const startTimeStr = formatTime(startObj);
            const endTimeStr = formatTime(endObj);
            const arrivedTimeStr = formatTime(arrivedObj);
            const departedTimeStr = formatTime(departedObj);

            // Strikethrough Logic for Destination
            let destinationDisplay = `<strong>${pass.destination}</strong>`;
            if (pass.originalDestination && pass.originalDestination !== pass.destination) {
                destinationDisplay = `<del style="color: #d32f2f;">${pass.originalDestination}</del> <strong style="color: #d32f2f; margin-left: 5px;">${pass.destination}</strong>`;
            }
            
            // Strikethrough Logic for Times
            let startTimeDisplay = `<strong>${startTimeStr}</strong>`;
            if (origStartObj) {
                startTimeDisplay = `<del style="color: #d32f2f;">${formatTime(origStartObj)}</del> <strong style="color: #d32f2f; margin-left: 5px;">${startTimeStr}</strong>`;
            }
            
            let endTimeDisplay = `<strong>${endTimeStr}</strong>`;
            if (origEndObj) {
                endTimeDisplay = `<del style="color: #d32f2f;">${formatTime(origEndObj)}</del> <strong style="color: #d32f2f; margin-left: 5px;">${endTimeStr}</strong>`;
            }
            
            let leftBorderColor = '#607d8b'; // Default gray/blue
            let fraudNoteHTML = '';
            let editNoteHTML = '';

            if (pass.editedBy) {
                editNoteHTML = `<div style="font-size: 0.8rem; color: #e65100; font-style: italic; margin-top: 4px; margin-bottom: 8px;">✏️ Edited by ${pass.editedBy}</div>`;
            }

            if (pass.status === 'fraudulent_review' || pass.fraudExplanation) {
                leftBorderColor = '#c62828';
                fraudNoteHTML = `
                    <div style="background: #ffebee; border: 1px solid #ffcdd2; color: #c62828; padding: 6px; border-radius: 4px; font-size: 0.85rem; margin-bottom: 10px;">
                        <strong>🚩 Fraudulent Flag:</strong> ${pass.fraudExplanation || "Sent to Admin for review."}
                    </div>
                `;
            }

            // Who initiated the pass?
            let initiatorName = pass.proxyBy || pass.senderName || pass.studentDisplayName || "Unknown";

            const card = document.createElement("div");
            card.style.cssText = `background: white; border: 1px solid #eaedf2; border-left: 5px solid ${leftBorderColor}; padding: 15px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); margin-bottom: 10px;`;
            
            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; font-weight: bold; margin-bottom: 12px;">
                    <span style="font-size: 1.1rem; color: #1a1a1a;">🧑‍🎓 ${pass.studentDisplayName || pass.studentName || "Unknown"}</span>
                    <span class="badge" style="text-transform: uppercase; font-size: 0.75rem; background: #eee; padding: 2px 6px; border-radius: 4px;">${pass.type || "Pass"}</span>
                </div>
                
                ${fraudNoteHTML}
                
                <div style="color: #444; font-size: 0.95rem; margin-bottom: 6px; display: flex; align-items: center;">
                    <span style="margin-right: 8px;">🛫</span> <span>Origin: <strong>${pass.origin || "Unknown"}</strong></span>
                </div>
                <div style="color: #444; font-size: 0.95rem; margin-bottom: 12px; display: flex; align-items: center;">
                    <span style="margin-right: 8px;">📍</span> <span>Destination: ${destinationDisplay}</span>
                </div>
                
                ${editNoteHTML}
                
                <div style="background: #ffffff; border: 1px solid #e0e0e0; padding: 10px 12px; border-radius: 6px; font-size: 0.9rem; color: #555;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                        <span><span style="margin-right: 6px;">🛫</span> Left Origin:</span>
                        ${startTimeDisplay}
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                        <span><span style="margin-right: 6px;">📍</span> Arrived Dest:</span>
                        <strong>${arrivedTimeStr}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                        <span><span style="margin-right: 6px;">🚶</span> Left Dest:</span>
                        <strong>${departedTimeStr}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span><span style="margin-right: 6px;">🏠</span> Returned:</span>
                        ${endTimeDisplay}
                    </div>
                </div>
                
                <div style="margin-top: 12px; font-size: 0.85rem; color: #888; font-style: italic;">
                    Initiated by: ${initiatorName}
                </div>
            `;
            container.appendChild(card);
        });
    }

// Bind Event Delegation for Pass Action Buttons (Approve, Reject, End)
document.addEventListener("click", async (e) => {
    if (e.target && e.target.classList.contains("card-btn")) {
        const passId = e.target.getAttribute("data-id");
        let newStatus = e.target.getAttribute("data-action");
        const currentStatus = e.target.getAttribute("data-current-status"); 

        if (!passId || !newStatus) return;

        let extraData = {}; // 🌟 Create a container for extra fields

        // 🌟 1. WARNING INTERCEPT
        if (currentStatus === "pending_restricted" && newStatus === "active") {
            const proceed = confirm("⚠️ ADMIN WARNING: You are about to override a restricted pass. Admin will be notified and may inquire why. Do you wish to proceed?");
            if (!proceed) return; 
            newStatus = "active_bypassed";
            
            // 🚨 Record who is bypassing this restriction
            extraData.bypassedBy = window.currentUser?.displayName || "Admin";
        }

        // 🌟 2. CHECK-IN TIMELINE INTERCEPTS
        if (newStatus === "arrived") {
            newStatus = currentStatus; // Stay active
            extraData.arrivedAt = new Date(); // Timestamp Arrival
        } else if (newStatus === "departed") {
            newStatus = currentStatus; // Stay active
            extraData.departedAt = new Date(); // Timestamp Departure
        }

        // 🌟 3. RETURN INTERCEPT
        if (currentStatus === "active_bypassed" && newStatus === "returned") {
            newStatus = "returned_bypassed";
        }

        const originalText = e.target.innerText;
        e.target.innerText = "⏳...";
        e.target.disabled = true;

        try {
            // Pass extraData as the 3rd argument
            await updatePassStatus(passId, newStatus, extraData);
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