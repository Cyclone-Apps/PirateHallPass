// public/js/features/f-pass-history.js
import { fetchAdminPassHistory, updatePassStatus } from "../modules/pass-engine.js";

let allAdminHistory = []; 

/**
 * Initializes and wires up all history modal click events and filter streams.
 */
export function initAdminHistory() {
    // 🟢 Bulletproof Event Listener (Handles modal controls and clears)
    document.addEventListener("click", async (e) => {
        // 1. Open Modal
        if (e.target.id === "btn-open-admin-history") {
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

            applyAdminHistoryFilters(); 
        }

        // 2. Close Modal
        if (e.target.id === "btn-close-admin-history") {
            const historyModal = document.getElementById("modal-admin-history");
            if (historyModal) historyModal.classList.add("hidden");
        }

        // 3. Clear Filters
        if (e.target.id === "btn-clear-history-dates") {
            document.getElementById("filter-history-start-date").value = "";
            document.getElementById("filter-history-end-date").value = "";
            applyAdminHistoryFilters();
        }
        if (e.target.id === "btn-clear-history-student") {
            document.getElementById("filter-history-student").value = "";
            applyAdminHistoryFilters();
        }
        if (e.target.id === "btn-clear-history-teacher") {
            document.getElementById("filter-history-teacher").value = "";
            applyAdminHistoryFilters();
        }
        if (e.target.id === "btn-clear-history-room") {
            document.getElementById("filter-history-room").value = "";
            applyAdminHistoryFilters();
        }
    });

    // 🟢 Real-Time Input Query Filtering
    document.addEventListener("input", (e) => {
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
}

/**
 * Filters dataset instantly and updates live auto-complete lists
 */
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

    // Filter 3: Teacher (Now includes origin/dest last name parameters!)
    if (teacherVal) {
        filtered = filtered.filter(p => 
            (p.targetTeacher || "").toLowerCase().includes(teacherVal) || 
            (p.originTeacher || "").toLowerCase().includes(teacherVal) ||
            (p.originTeacherLastName || "").toLowerCase().includes(teacherVal) ||
            (p.destTeacherLastName || "").toLowerCase().includes(teacherVal) ||
            (p.senderName || "").toLowerCase().includes(teacherVal) ||
            (p.editedBy || "").toLowerCase().includes(teacherVal)
        );
    }

    // Filter 4: Room
    if (roomVal) {
        filtered = filtered.filter(p => 
            (p.destination || "").toLowerCase().includes(roomVal) ||
            (p.origin || "").toLowerCase().includes(roomVal) ||
            (p.originalDestination || "").toLowerCase().includes(roomVal)
        );
    }

    // Rebuild visible autocomplete options
    const uniqueStudents = new Set();
    const uniqueTeachers = new Set();
    const uniqueRooms = new Set();

    filtered.forEach(p => {
        if (p.studentDisplayName) uniqueStudents.add(p.studentDisplayName);
        else if (p.studentName) uniqueStudents.add(p.studentName);

        if (p.targetTeacher) uniqueTeachers.add(p.targetTeacher);
        if (p.originTeacher) uniqueTeachers.add(p.originTeacher);
        if (p.originTeacherLastName) uniqueTeachers.add(p.originTeacherLastName);
        if (p.destTeacherLastName) uniqueTeachers.add(p.destTeacherLastName);
        if (p.senderName) uniqueTeachers.add(p.senderName);
        if (p.editedBy) uniqueTeachers.add(p.editedBy);

        if (p.destination) uniqueRooms.add(p.destination);
        if (p.origin) uniqueRooms.add(p.origin);
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

    document.getElementById("admin-history-results-count").innerText = `Showing ${filtered.length} passes`;
    renderAdminHistoryPasses(filtered, "admin-history-list");
}

/**
 * Builds history pass items containing room locations and active supervisor names
 */
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
        
        const formatTime = (dateObj) => dateObj ? dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "--:--";
        
        const startTimeStr = formatTime(startObj);
        const endTimeStr = formatTime(endObj);
        const arrivedTimeStr = formatTime(arrivedObj);
        const departedTimeStr = formatTime(departedObj);

        // 🎯 Teacher Labels Next to Rooms
        const originTeacherTxt = pass.originTeacherLastName ? ` (${pass.originTeacherLastName})` : "";
        const destTeacherTxt = pass.destTeacherLastName ? ` (${pass.destTeacherLastName})` : "";

        // Strikethrough Logic for Destination
        let destinationDisplay = `<strong>${pass.destination}${destTeacherTxt}</strong>`;
        if (pass.originalDestination && pass.originalDestination !== pass.destination) {
            destinationDisplay = `<del style="color: #d32f2f;">${pass.originalDestination}</del> <strong style="color: #d32f2f; margin-left: 5px;">${pass.destination}${destTeacherTxt}</strong>`;
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
        
        let leftBorderColor = '#607d8b';
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
                <span style="margin-right: 8px;">🛫</span> <span>Origin: <strong>${pass.origin || "Unknown"}${originTeacherTxt}</strong></span>
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