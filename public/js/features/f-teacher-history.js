// public/js/features/f-teacher-history.js

let allHistoryPasses = []; 
let currentHistoryTab = 'today'; 
let currentTeacherProfile = null; // Store the teacher's profile so we can check all their names

// 🟢 Attach Click Listeners to the Tabs
export function initTeacherHistoryControls() {
    const tabToday = document.getElementById("tab-history-today");
    const tabYesterday = document.getElementById("tab-history-yesterday");
    
    if (tabToday) {
        tabToday.addEventListener("click", () => { 
            currentHistoryTab = 'today'; 
            renderHistoryTab(); 
        });
    }
    if (tabYesterday) {
        tabYesterday.addEventListener("click", () => { 
            currentHistoryTab = 'yesterday'; 
            renderHistoryTab(); 
        });
    }
}

// 🟢 Receives real-time passes from Firebase and updates the UI
export function updateTeacherHistoryData(passes, userProfile) {
    currentTeacherProfile = userProfile;
    
    // Sort by most recently returned at the top
    allHistoryPasses = passes.sort((a, b) => {
        const timeA = a.returnedAt?.toDate?.() || new Date(0);
        const timeB = b.returnedAt?.toDate?.() || new Date(0);
        return timeB - timeA; 
    });
    
    renderHistoryTab();
}

function renderHistoryTab() {
    if (!currentTeacherProfile) return;

    // Grab the auth name (e.g., "Brian Orr")
    const myName = currentTeacherProfile.displayName || "";
    const myAlias = currentTeacherProfile.scheduleAlias || "";
    
    // 🎯 FIX 1: If lastName isn't attached to the Auth object, extract it mathematically!
    let myLastName = currentTeacherProfile.lastName || "";
    if (!myLastName && myName) {
        myLastName = myName.split(" ").pop(); // Extracts "Orr" from "Brian Orr"
    }

    // Build an array of every possible way a student might label this teacher
    const nameVariations = [
        myName, 
        myAlias, 
        myLastName,
        `Mr. ${myLastName}`,
        `Mrs. ${myLastName}`,
        `Ms. ${myLastName}`,
        `Miss ${myLastName}`,
        `Coach ${myLastName}`,
        `Dr. ${myLastName}`
    ].map(n => n.toLowerCase().trim()); // Make it lowercase so it matches perfectly

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    // 🎯 ROBUST FILTER: Check if ANY field matches ANY of our name variations!
    const myHistory = allHistoryPasses.filter(pass => {
        const fieldsToCheck = [
            (pass.targetTeacher || "").toLowerCase(), 
            (pass.destinationTeacher || "").toLowerCase(), 
            (pass.destTeacherLastName || "").toLowerCase(),
            (pass.originTeacher || "").toLowerCase(),
            (pass.originTeacherLastName || "").toLowerCase(),
            (pass.senderName || "").toLowerCase()
        ];
        
        return fieldsToCheck.some(field => nameVariations.includes(field));
    });

    let filteredPasses = [];

    if (currentHistoryTab === 'today') {
        filteredPasses = myHistory.filter(p => {
            const passDate = p.returnedAt?.toDate?.() || p.createdAt?.toDate?.() || new Date(0);
            return passDate >= todayStart;
        });
        renderHistoryPasses(filteredPasses, "list-history-today");
        
        document.getElementById("list-history-today")?.classList.remove("hidden");
        document.getElementById("list-history-yesterday")?.classList.add("hidden");
        if (document.getElementById("tab-history-today")) {
            document.getElementById("tab-history-today").style.background = "#0277bd";
            document.getElementById("tab-history-today").style.color = "white";
        }
        if (document.getElementById("tab-history-yesterday")) {
            document.getElementById("tab-history-yesterday").style.background = "#e0e0e0";
            document.getElementById("tab-history-yesterday").style.color = "#333";
        }
        
    } else {
        filteredPasses = myHistory.filter(p => {
            const passDate = p.returnedAt?.toDate?.() || p.createdAt?.toDate?.() || new Date(0);
            return passDate >= yesterdayStart && passDate < todayStart;
        });
        renderHistoryPasses(filteredPasses, "list-history-yesterday");
        
        document.getElementById("list-history-today")?.classList.add("hidden");
        document.getElementById("list-history-yesterday")?.classList.remove("hidden");
        if (document.getElementById("tab-history-today")) {
            document.getElementById("tab-history-today").style.background = "#e0e0e0";
            document.getElementById("tab-history-today").style.color = "#333";
        }
        if (document.getElementById("tab-history-yesterday")) {
            document.getElementById("tab-history-yesterday").style.background = "#0277bd";
            document.getElementById("tab-history-yesterday").style.color = "white";
        }
    }
}

// 🟢 CUSTOM RENDERER FOR HISTORY PASSES
function renderHistoryPasses(passes, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";

    if (passes.length === 0) {
        container.innerHTML = `<div style="padding: 15px; color: #777; text-align: center; border: 1px dashed #ccc; border-radius: 8px;">No history available.</div>`;
        return;
    }

    passes.forEach(pass => {
        const startObj = pass.acceptedAt?.toDate?.() || pass.createdAt?.toDate?.();
        const endObj = pass.returnedAt?.toDate?.();
        const origStartObj = pass.originalAcceptedAt?.toDate?.();
        const origEndObj = pass.originalReturnedAt?.toDate?.();
        
        const formatTime = (dateObj) => dateObj ? dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Unknown";
        const inputFormat = (dateObj) => dateObj ? dateObj.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : "";
        
        const startTimeStr = formatTime(startObj);
        const endTimeStr = formatTime(endObj);

        let durationStr = "";
        if (startObj && endObj) {
            const diffMins = Math.round((endObj - startObj) / 60000);
            durationStr = `(${diffMins}m)`;
        }

        // Add Teacher Names to the Rooms
        const destTeacherTxt = pass.destTeacherLastName && pass.destTeacherLastName !== "Unknown" ? ` (${pass.destTeacherLastName})` : "";
        const originTeacherTxt = pass.originTeacherLastName && pass.originTeacherLastName !== "Unknown" ? ` (${pass.originTeacherLastName})` : "";

        let destinationDisplay = `<strong>${pass.destination}${destTeacherTxt}</strong>`;
        let editNoteHTML = '';
        let fraudNoteHTML = '';
        let leftBorderColor = '#607d8b'; 

        if (pass.originalDestination && pass.originalDestination !== pass.destination) {
            destinationDisplay = `<del style="color: #d32f2f;">${pass.originalDestination}</del> <strong style="color: #d32f2f; margin-left: 5px;">${pass.destination}${destTeacherTxt}</strong>`;
        }
        
        let startTimeDisplay = startTimeStr;
        if (origStartObj) {
            startTimeDisplay = `<del style="color: #d32f2f;">${formatTime(origStartObj)}</del> <span style="color: #d32f2f;">${startTimeStr}</span>`;
        }
        
        let endTimeDisplay = endTimeStr;
        if (origEndObj) {
            endTimeDisplay = `<del style="color: #d32f2f;">${formatTime(origEndObj)}</del> <span style="color: #d32f2f;">${endTimeStr}</span>`;
        }
        
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

        const card = document.createElement("div");
        card.style.cssText = `background: white; border: 1px solid #eaedf2; border-left: 5px solid ${leftBorderColor}; padding: 15px; margin-bottom: 12px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);`;
        
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; font-weight: bold; margin-bottom: 5px;">
                <span style="font-size: 1.1rem; color: #1a1a1a;">🧑‍🎓 ${pass.studentDisplayName || pass.studentName || "Unknown"}</span>
                <span class="badge" style="text-transform: uppercase; font-size: 0.75rem; background: #eee; padding: 2px 6px; border-radius: 4px;">${pass.type || "Pass"}</span>
            </div>
            ${fraudNoteHTML}
            <div style="color: #555; font-size: 0.95rem; margin-bottom: 4px;">
                🛫 Origin: <strong>${pass.origin || "Unknown"}${originTeacherTxt}</strong>
            </div>
            <div style="color: #555; font-size: 0.95rem; margin-bottom: 4px;">
                📍 To: ${destinationDisplay}
            </div>
            ${editNoteHTML}
            <div style="background: #f8f9fa; border: 1px solid #e0e0e0; padding: 6px 10px; border-radius: 4px; display: inline-block; font-size: 0.85rem; color: #333; margin-bottom: 10px; margin-top: 5px;">
                ⏱️ <strong>${startTimeDisplay} - ${endTimeDisplay}</strong> <span style="color: #d32f2f; font-weight: bold; margin-left: 5px;">${durationStr}</span>
            </div>
            <div style="display: flex; gap: 8px;">
                <button class="btn-edit-history" 
                    data-id="${pass.id}" 
                    data-dest="${pass.destination}" 
                    data-start-val="${inputFormat(startObj)}" 
                    data-end-val="${inputFormat(endObj)}"
                    data-start-ms="${startObj ? startObj.getTime() : ''}"
                    data-end-ms="${endObj ? endObj.getTime() : ''}"
                    data-orig-start-ms="${origStartObj ? origStartObj.getTime() : ''}"
                    data-orig-end-ms="${origEndObj ? origEndObj.getTime() : ''}"
                    style="background: #fb8c00; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 0.8rem; width: 100%;">
                    ✏️ Edit / Flag Pass
                </button>
            </div>
        `;
        container.appendChild(card);
    });
}