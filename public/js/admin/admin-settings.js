// js/admin/admin-settings.js

import { 
    saveBellSchedule, fetchBellSchedules, 
    saveAcademicCalendar, fetchAcademicCalendar,
    fetchGCalConfig, saveGCalConfig,
    saveTimeOffset, listenToTimeOffset,
    setActiveDailySchedule, listenToDailyConfig
} from "../modules/admin-engine.js";
import { initLockdownListener, setEmergencyState } from "../features/f-lockdowns.js";
import { initLockdownAdminListeners } from "../features/f-lockdowns-admin.js";
import { initTimeOffsetControls, initDevTimeMachine } from "../features/f-time-controls.js";
import { getAdjustedNow } from "../modules/time-engine.js";

// ==========================================
// 🧠 STATE MANAGEMENT
// ==========================================
let currentEmergencyState = false;

const defaultTimes = {
    "Regular": [
        { period: "1", start: "08:00", end: "08:50" },
        { period: "2", start: "08:55", end: "09:45" },
        { period: "3", start: "09:50", end: "10:40" },
        { period: "4", start: "10:45", end: "11:35" },
        { period: "5", start: "11:40", end: "12:30" },
        { period: "6", start: "12:35", end: "13:25" },
        { period: "7", start: "13:30", end: "14:20" },
        { period: "8", start: "14:25", end: "15:15" }
    ]
};

// Academic Calendar State
let currentAcademicStartYear = calculateCurrentAcademicYear(); 
let masterCalendarData = {}; 

function calculateCurrentAcademicYear() {
    const today = getAdjustedNow();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth(); // 0 = Jan, 7 = Aug
    if (currentMonth >= 7) return currentYear;
    return currentYear - 1;
}

// ==========================================
// 🚀 INITIALIZATION & EVENT BINDING
// ==========================================
export function initSettingsManagement() {
    // Listen for global lockdowns and keep the admin UI in sync
    initLockdownListener((state) => {
        currentEmergencyState = state;
    });

    // Bind the lockdown menu buttons!
    initLockdownAdminListeners();

    loadBellSchedules();
    // ==========================================
    // 🪟 GLOBAL EVENT DELEGATION
    // ==========================================
    document.addEventListener("click", async (e) => {
        // --- MODAL OPENERS ---
        if (e.target.closest("#btn-open-gcal-modal")) {
            document.getElementById("gcal-config-modal")?.classList.remove("hidden");
            loadGoogleCalendarSetup();
        }
        if (e.target.closest("#btn-open-bell-schedule")) {
            document.getElementById("bell-schedule-modal")?.classList.remove("hidden");
        }
        if (e.target.closest("#btn-emergency")) {
            document.getElementById("emergency-modal")?.classList.remove("hidden");
        }
        
        // --- ACADEMIC CALENDAR CONTROLS ---
        if (e.target.closest("#btn-open-academic-cal-modal")) {
            openAcademicCalendarModal();
        }
        if (e.target.closest("#btn-cal-year-prev")) {
            currentAcademicStartYear--;
            renderVerticalAcademicCalendar();
        }
        if (e.target.closest("#btn-cal-year-next")) {
            currentAcademicStartYear++;
            renderVerticalAcademicCalendar();
        }
        if (e.target.closest("#btn-save-academic-cal")) {
            handleSaveAcademicCalendar(e.target.closest("#btn-save-academic-cal"));
        }
    });

    // ==========================================
    // ❌ MODAL CLOSE LISTENERS
    // ==========================================
    document.getElementById("close-gcal-config-modal")?.addEventListener("click", () => {
        document.getElementById("gcal-config-modal")?.classList.add("hidden");
    });
    document.getElementById("close-academic-cal-modal")?.addEventListener("click", () => {
        document.getElementById("academic-cal-modal")?.classList.add("hidden");
    });
    document.getElementById("close-bell-schedule-modal")?.addEventListener("click", () => {
        document.getElementById("bell-schedule-modal")?.classList.add("hidden");
    });

    // ==========================================
    // 💾 OTHER SAVE & ACTION LISTENERS
    // ==========================================
    document.getElementById("btn-save-gcal-config")?.addEventListener("click", saveGoogleCalendarSetup);
    
    document.getElementById("btn-save-schedule")?.addEventListener("click", handleSaveBellSchedule);
    document.getElementById("schedule-type-select")?.addEventListener("change", (e) => renderScheduleEditor(e.target.value));
}

// ==========================================
// 📅 GOOGLE CALENDAR
// ==========================================
async function loadGoogleCalendarSetup() {
    try {
        if (typeof fetchGCalConfig === "function") {
            const data = await fetchGCalConfig();
            if (data) {
                // Corrected variable names mapped exactly to your inputs!
                document.getElementById("input-gcal-apikey").value = data.calendarApiKey || "";
                document.getElementById("input-gcal-rotation-id").value = data.rotationCalId || "";
                document.getElementById("input-gcal-menu-id").value = data.lunchCalId || "";
            }
        }
    } catch (err) {
        console.error("Failed to load GCal data:", err);
    }
}

async function saveGoogleCalendarSetup() {
    const btn = document.getElementById("btn-save-gcal-config");
    
    btn.disabled = true;
    btn.innerText = "⏳ Saving Integrations...";

    // Use your exact variable names!
    const configObj = {
        calendarApiKey: document.getElementById("input-gcal-apikey").value.trim(),
        rotationCalId: document.getElementById("input-gcal-rotation-id").value.trim(),
        lunchCalId: document.getElementById("input-gcal-menu-id").value.trim()
    };
    
    if (typeof saveGCalConfig === "function") {
        const success = await saveGCalConfig(configObj);
        if (success) {
            // Restore your awesome visual button feedback!
            btn.innerText = "✅ Saved Successfully!";
            btn.style.backgroundColor = "#2e7d32";
            setTimeout(() => {
                btn.disabled = false;
                btn.innerText = "💾 Save Configurations";
                btn.style.backgroundColor = "#0277bd";
                document.getElementById("gcal-config-modal")?.classList.add("hidden");
            }, 1500);
        } else {
            alert("Error saving API configuration to Firestore.");
            btn.disabled = false;
            btn.innerText = "💾 Save Configurations";
        }
    }
}

// ==========================================
// 🔔 BELL SCHEDULES
// ==========================================
let currentlyEditingSchedule = []; 

async function loadBellSchedules() {
    initTimeOffsetControls();
    initDevTimeMachine();
    
    listenToDailyConfig((config) => {
        const activeSelect = document.getElementById("active-schedule-select");
        if (activeSelect) activeSelect.value = config.activeSchedule || "HS - Regular";
    });

    document.getElementById("btn-set-active-schedule")?.addEventListener("click", handleSetActiveSchedule);
    document.getElementById("btn-add-period")?.addEventListener("click", addPeriodRow);
    document.getElementById("btn-remove-period")?.addEventListener("click", removePeriodRow);

    if (typeof fetchBellSchedules === "function") {
        const schedules = await fetchBellSchedules();
        window.bellScheduleDataStore = schedules || defaultTimes; 
        renderScheduleEditor("HS - Regular", window.bellScheduleDataStore);
    }
}

function renderScheduleEditor(type, dataStore = window.bellScheduleDataStore || defaultTimes) {
    const tbody = document.getElementById("schedule-tbody");
    if (!tbody) return;
    
    // 1. Instantly clear the screen to prevent ghost HTML
    tbody.innerHTML = "";

    // 2. Fetch the raw data safely
    let rawTimes = dataStore[type];
    
    if (!rawTimes) {
        rawTimes = dataStore["Regular"] || (typeof defaultTimes !== 'undefined' ? defaultTimes["Regular"] : []);
    }

    let normalizedTimes = [];

    try {
        if (Array.isArray(rawTimes)) {
            // It's an Array (e.g., your current "HS - Regular" in Firebase)
            normalizedTimes = JSON.parse(JSON.stringify(rawTimes));
        } else if (rawTimes && typeof rawTimes === "object") {
            // It's a Map/Object (e.g., your Early Out / Late Start schedules)
            normalizedTimes = Object.keys(rawTimes).map(key => ({
                period: key,
                start: rawTimes[key].start || "00:00",
                end: rawTimes[key].end || "00:00"
            }));
        }

        // 3. Bulletproof sorting (prevents crashes if a period name is missing)
        normalizedTimes.sort((a, b) => {
            const p1 = String(a.period || "");
            const p2 = String(b.period || "");
            return p1.localeCompare(p2, undefined, { numeric: true });
        });

    } catch (error) {
        console.error("Error parsing schedule data:", error);
        normalizedTimes = []; 
    }

    // 4. Draw the clean, verified schedule
    currentlyEditingSchedule = normalizedTimes;
    drawScheduleTable();
}

function drawScheduleTable() {
    const tbody = document.getElementById("schedule-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    currentlyEditingSchedule.forEach((t, i) => {
        const tr = document.createElement("tr");
        tr.className = "schedule-row";
        tr.innerHTML = `
            <td style="padding: 10px; border-bottom: 1px solid #eee; width: 25%; vertical-align: middle;">
                <strong class="period-label" data-period="${t.period || ''}" style="font-size: 1.1rem; color: #333;">
                    ${t.period || ''}
                </strong>
            </td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; width: 37.5%;">
                <input type="time" class="time-start" value="${t.start || '00:00'}" style="width: 100%; box-sizing: border-box; padding: 6px 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 1rem;">
            </td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; width: 37.5%;">
                <input type="time" class="time-end" value="${t.end || '00:00'}" style="width: 100%; box-sizing: border-box; padding: 6px 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 1rem;">
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function addPeriodRow() {
    const nextNum = currentlyEditingSchedule.length + 1;
    currentlyEditingSchedule.push({ period: String(nextNum), start: "08:00", end: "09:00" });
    drawScheduleTable();
}

function removePeriodRow() {
    if (currentlyEditingSchedule.length > 0) {
        currentlyEditingSchedule.pop();
        drawScheduleTable();
    }
}

async function handleSaveBellSchedule() {
    const type = document.getElementById("schedule-type-select").value;
    const rows = document.querySelectorAll(".schedule-row");
    
    // Switch from an Array to a Map (Object)
    const updatedSchedule = {};

    rows.forEach(row => {
        const periodName = row.querySelector(".period-label").dataset.period;
        const start = row.querySelector(".time-start").value;
        const end = row.querySelector(".time-end").value;
        
        // Assign the period name as the Object Key instead of pushing to an Array
        if (periodName) {
            updatedSchedule[periodName] = { start, end };
        }
    });

    if (typeof saveBellSchedule === "function") {
        const success = await saveBellSchedule(type, updatedSchedule);
        if (success) {
            if (window.bellScheduleDataStore) {
                window.bellScheduleDataStore[type] = updatedSchedule;
            }
            alert(`${type} schedule saved successfully!`);
        }
    }
}

// ==========================================
// 📅 ACADEMIC CALENDAR BUILDER ENGINE (V3)
// ==========================================
async function openAcademicCalendarModal() {
    masterCalendarData = await fetchAcademicCalendar();
    currentAcademicStartYear = calculateCurrentAcademicYear(); 
    renderVerticalAcademicCalendar();
    document.getElementById("academic-cal-modal").classList.remove("hidden");
}

function renderVerticalAcademicCalendar() {
    const endYear = currentAcademicStartYear + 1;

    const yearDisplay = document.getElementById("cal-year-display");
    if (yearDisplay) yearDisplay.innerText = `${currentAcademicStartYear}-${String(endYear).slice(-2)}`;

    const scrollArea = document.getElementById("academic-cal-scroll-area");
    if (!scrollArea) return;

    const academicMonths = [
        { index: 7, year: currentAcademicStartYear, name: "August" },
        { index: 8, year: currentAcademicStartYear, name: "September" },
        { index: 9, year: currentAcademicStartYear, name: "October" },
        { index: 10, year: currentAcademicStartYear, name: "November" },
        { index: 11, year: currentAcademicStartYear, name: "December" },
        { index: 0, year: endYear, name: "January" },
        { index: 1, year: endYear, name: "February" },
        { index: 2, year: endYear, name: "March" },
        { index: 3, year: endYear, name: "April" },
        { index: 4, year: endYear, name: "May" },
        { index: 5, year: endYear, name: "June" },
        { index: 6, year: endYear, name: "July" }
    ];

    let html = '';

    academicMonths.forEach(m => {
        const daysInMonth = new Date(m.year, m.index + 1, 0).getDate();
        const firstDayOfWeek = new Date(m.year, m.index, 1).getDay();
        
        let blanks = 0;
        if (firstDayOfWeek > 0 && firstDayOfWeek < 6) {
            blanks = firstDayOfWeek - 1; 
        }

        let monthGridHTML = `
            <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; flex-grow: 1;">
                <div style="font-size:0.7rem; color:#888; text-align:center; margin-bottom:2px; font-weight:bold;">M</div>
                <div style="font-size:0.7rem; color:#888; text-align:center; margin-bottom:2px; font-weight:bold;">T</div>
                <div style="font-size:0.7rem; color:#888; text-align:center; margin-bottom:2px; font-weight:bold;">W</div>
                <div style="font-size:0.7rem; color:#888; text-align:center; margin-bottom:2px; font-weight:bold;">Th</div>
                <div style="font-size:0.7rem; color:#888; text-align:center; margin-bottom:2px; font-weight:bold;">F</div>
        `;

        for (let i = 0; i < blanks; i++) {
            monthGridHTML += `<div></div>`;
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dow = new Date(m.year, m.index, day).getDay();
            if (dow === 0 || dow === 6) continue;
            
            const dateStr = `${m.year}-${String(m.index + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            let code = masterCalendarData[dateStr] || 'F';

            let bgColor = "#e8f5e9"; let color = "#2e7d32"; 
            if (code === 'E') { bgColor = "#fff3e0"; color = "#ef6c00"; } 
            if (code === 'L') { bgColor = "#e3f2fd"; color = "#1565c0"; } 
            if (code === 'N') { bgColor = "#ffebee"; color = "#c62828"; } 

            monthGridHTML += `
                <div class="cal-day-cell" data-date="${dateStr}" data-code="${code}" style="background: ${bgColor}; color: ${color}; border: 1px solid ${color}55; border-radius: 4px; padding: 6px 0; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor: pointer; user-select: none; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                    <div style="font-size:0.65rem; color:#555; line-height: 1;">${day}</div>
                    <div style="font-size: 1.1rem; font-weight:bold; line-height: 1; margin-top:3px;">${code}</div>
                </div>
            `;
        }
        monthGridHTML += `</div>`;

        html += `
            <div style="display: flex; gap: 15px; background: white; padding: 10px; border-radius: 8px; border: 1px solid #ddd;">
                <div style="writing-mode: vertical-rl; transform: rotate(180deg); text-align: center; font-weight: 900; font-size: 0.95rem; color: #aaa; display: flex; align-items: center; justify-content: center; min-width: 25px; letter-spacing: 2px; border-right: 1px solid #eee; padding-left: 5px;">
                    ${m.name.toUpperCase()} ${m.year}
                </div>
                ${monthGridHTML}
            </div>
        `;
    });

    scrollArea.innerHTML = html;

    document.querySelectorAll(".cal-day-cell").forEach(cell => {
        cell.addEventListener("click", () => {
            const date = cell.getAttribute("data-date");
            let currentCode = cell.getAttribute("data-code");
            
            const nextCodeMap = { 'F': 'E', 'E': 'L', 'L': 'N', 'N': 'F' };
            masterCalendarData[date] = nextCodeMap[currentCode];
            
            renderVerticalAcademicCalendar(); 
        });
    });
}

async function handleSaveAcademicCalendar(btn) {
    const originalText = btn.innerHTML;
    
    btn.disabled = true;
    btn.innerText = "⏳ Saving Calendar Data...";
    
    const success = await saveAcademicCalendar(masterCalendarData);
    
    btn.disabled = false;
    if (success) {
        btn.innerText = "✅ Saved Successfully!";
        btn.style.backgroundColor = "#2e7d32";
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.backgroundColor = "var(--pirate-red)";
        }, 2000);
    } else {
        alert("Error syncing academic calendar to Firestore.");
        btn.innerHTML = originalText;
    }
}

// ==========================================
// 🌍 GLOBAL TRACKERS & MODALS (From original main-admin.js)
// ==========================================

// Global configuration trackers used to compute current/next class periods
window.globalTimeOffsetSeconds = 0;
window.activeDailyScheduleName = "HS - Regular";
window.globalBellSchedulesCache = {};

// Track system time offset modifications
listenToTimeOffset((offset) => window.globalTimeOffsetSeconds = parseInt(offset) || 0);

// Track active campus schedule variations
listenToDailyConfig((config) => window.activeDailyScheduleName = config?.activeSchedule || "HS - Regular");

// Cache schedule maps on initialization for popup lookups
if (typeof fetchBellSchedules === "function") {
    fetchBellSchedules().then(scheds => window.globalBellSchedulesCache = scheds || {});
}

// Start the global lockdown engine (Automatically handles Admin UI alerts)
initLockdownListener();

async function handleSetActiveSchedule() {
    const activeSelect = document.getElementById("active-schedule-select")?.value;
    if (typeof setActiveDailySchedule === "function") {
        const success = await setActiveDailySchedule(activeSelect);
        if (success) alert(`Active schedule set to: ${activeSelect}`);
    }
}