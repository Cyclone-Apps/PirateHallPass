import { getDateFiltersHTML, getActionButtonsHTML, getDateRange, printReportContainer } from "./r-utils.js";
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../firebase-config.js"; 

// --- State Management ---
let allFetchedPasses = [];
let sortMode = 'times'; 
let orderMode = 'desc'; // Default to reverse chronological order
let colVisibility = {};
let filterOptions = {};
let activeFilters = {};

export function loadTimeframeReport(settingsContainer, reportContainer) {
    // Reset state every time the view is loaded
    allFetchedPasses = [];
    sortMode = 'times'; 
    orderMode = 'desc'; 
    colVisibility = {
        grade: true,
        origin: false,
        destination: true,
        period: false,
        startTime: false,
        destTimes: false,
        returnTime: false,
        duration: true, 
        status: true
    };
    filterOptions = { grade: [], origin: [], destination: [], period: [], status: [] };
    activeFilters = { grade: [], origin: [], destination: [], period: [], status: [] };

    settingsContainer.innerHTML = `
        <div class="settings-layout">
            <div class="settings-left" style="flex: 1;">
                <h2>Timeframe Report</h2>
                
                <div style="display: flex; flex-wrap: wrap; align-items: flex-end; gap: 20px; margin-top: 10px;">
                    ${getDateFiltersHTML()}
                    
                    <div style="display: flex; flex-direction: column;">
                        <label style="font-size: 0.85em; color: var(--text-dark, #333); margin-bottom: 4px; font-weight: normal; display: block;">Sort by</label>
                        <div style="display: flex; border: 1px solid var(--text-dark, #333); border-radius: 4px; overflow: hidden; height: 35px;">
                            <label id="btnSortTimes" style="padding: 0 15px; cursor: pointer; background: #e63946; color: white; display: flex; align-items: center; justify-content: center; margin: 0; border-right: 1px solid #ccc; font-weight: normal;">
                                <input type="radio" name="tfSortMode" value="times" checked style="display:none;">
                                Times
                            </label>
                            <label id="btnSortNames" style="padding: 0 15px; cursor: pointer; background: #f9f9f9; color: #333; display: flex; align-items: center; justify-content: center; margin: 0; font-weight: normal;">
                                <input type="radio" name="tfSortMode" value="names" style="display:none;">
                                Names
                            </label>
                        </div>
                    </div>

                    <div style="display: flex; flex-direction: column;">
                        <label style="font-size: 0.85em; color: var(--text-dark, #333); margin-bottom: 4px; font-weight: normal; display: block;">Order</label>
                        <div style="display: flex; border: 1px solid var(--text-dark, #333); border-radius: 4px; overflow: hidden; height: 35px;">
                            <label id="btnOrderAsc" style="padding: 0 15px; cursor: pointer; background: #f9f9f9; color: #333; display: flex; align-items: center; justify-content: center; margin: 0; border-right: 1px solid #ccc; font-weight: normal;">
                                <input type="radio" name="tfOrderMode" value="asc" style="display:none;">
                                Asc
                            </label>
                            <label id="btnOrderDesc" style="padding: 0 15px; cursor: pointer; background: #e63946; color: white; display: flex; align-items: center; justify-content: center; margin: 0; font-weight: normal;">
                                <input type="radio" name="tfOrderMode" value="desc" checked style="display:none;">
                                Desc
                            </label>
                        </div>
                    </div>
                </div>

                <div style="margin-top: 20px;">
                    <label style="font-size: 0.9em; font-weight: bold; margin-bottom: 8px; display: block;">Columns to Show:</label>
                    <div style="display: flex; flex-wrap: wrap; gap: 15px; font-size: 0.9em;">
                        <label><input type="checkbox" class="col-toggle" value="grade" checked> Grade</label>
                        <label><input type="checkbox" class="col-toggle" value="origin"> Origin</label>
                        <label><input type="checkbox" class="col-toggle" value="destination" checked> Destination</label>
                        <label><input type="checkbox" class="col-toggle" value="period"> Period</label>
                        <label><input type="checkbox" class="col-toggle" value="startTime"> Start Time</label>
                        <label><input type="checkbox" class="col-toggle" value="destTimes"> Destination Times</label>
                        <label><input type="checkbox" class="col-toggle" value="returnTime"> Return Time</label>
                        <label><input type="checkbox" class="col-toggle" value="duration" checked> Duration</label>
                        <label><input type="checkbox" class="col-toggle" value="status" checked> Status</label>
                    </div>
                </div>
            </div>
            
            <div class="settings-right">
                ${getActionButtonsHTML("Run Report")}
            </div>
        </div>
    `;

    // Set Default Dates (1 Week Ago to Today)
    const dateInputs = settingsContainer.querySelectorAll('input[type="date"]');
    if (dateInputs.length >= 2) {
        const today = new Date();
        const lastWeek = new Date();
        lastWeek.setDate(today.getDate() - 7);
        
        dateInputs[0].value = lastWeek.toISOString().split('T')[0];
        dateInputs[1].value = today.toISOString().split('T')[0];
    }

    const runBtn = document.getElementById('runReportBtn');
    const sortRadios = document.querySelectorAll('input[name="tfSortMode"]');
    const orderRadios = document.querySelectorAll('input[name="tfOrderMode"]');
    const colToggles = document.querySelectorAll('.col-toggle');
    
    const btnSortTimes = document.getElementById('btnSortTimes');
    const btnSortNames = document.getElementById('btnSortNames');
    const btnOrderAsc = document.getElementById('btnOrderAsc');
    const btnOrderDesc = document.getElementById('btnOrderDesc');

    // Handle sort toggle styling and instant update
    sortRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            sortMode = e.target.value;
            if (sortMode === 'times') {
                btnSortTimes.style.background = '#e63946'; btnSortTimes.style.color = 'white';
                btnSortNames.style.background = '#f9f9f9'; btnSortNames.style.color = '#333';
            } else {
                btnSortNames.style.background = '#e63946'; btnSortNames.style.color = 'white';
                btnSortTimes.style.background = '#f9f9f9'; btnSortTimes.style.color = '#333';
            }
            if (allFetchedPasses.length > 0) renderTimeframeReport(reportContainer);
        });
    });

    // Handle order toggle styling and instant update
    orderRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            orderMode = e.target.value;
            if (orderMode === 'asc') {
                btnOrderAsc.style.background = '#e63946'; btnOrderAsc.style.color = 'white';
                btnOrderDesc.style.background = '#f9f9f9'; btnOrderDesc.style.color = '#333';
            } else {
                btnOrderDesc.style.background = '#e63946'; btnOrderDesc.style.color = 'white';
                btnOrderAsc.style.background = '#f9f9f9'; btnOrderAsc.style.color = '#333';
            }
            if (allFetchedPasses.length > 0) renderTimeframeReport(reportContainer);
        });
    });

    // Handle column visibility toggles and instant update
    colToggles.forEach(chk => {
        chk.addEventListener('change', (e) => {
            colVisibility[e.target.value] = e.target.checked;
            if (allFetchedPasses.length > 0) renderTimeframeReport(reportContainer);
        });
    });

    runBtn.addEventListener('click', async () => {
        const { startMillis, endMillis } = getDateRange();
        
        if (!startMillis || !endMillis || isNaN(startMillis) || isNaN(endMillis)) {
            alert("Please select a valid Start and End Date.");
            return;
        }

        reportContainer.classList.remove('hidden');
        reportContainer.innerHTML = `<p>Loading passes and student data...</p>`;
        
        allFetchedPasses = [];
        activeFilters = { grade: [], origin: [], destination: [], period: [], status: [] };
        
        try {
            // 🎯 MIGRATION FIX: Fetch from "users" and filter by role "student"
            const usersRef = collection(db, "users");
            const studentQuery = query(usersRef, where("role", "==", "student"));
            const studentsSnap = await getDocs(studentQuery);
            const studentGrades = {};
            
            studentsSnap.forEach(doc => {
                const stu = doc.data();
                if (stu.email) {
                    studentGrades[stu.email] = stu.grade || 'N/A';
                }
            });

            // Fetch Passes within date range
            const passesRef = collection(db, "passes");
            const startDate = new Date(startMillis);
            const endDate = new Date(endMillis);

            const q = query(
                passesRef, 
                where("acceptedAt", ">=", startDate), 
                where("acceptedAt", "<=", endDate)
            );
            const snapshot = await getDocs(q);
            
            snapshot.forEach(doc => {
                const data = doc.data();
                
                if (!data.acceptedAt || typeof data.acceptedAt.toMillis !== 'function') {
                    console.warn(`Skipping pass ${doc.id} - missing or invalid acceptedAt timestamp.`);
                    return; 
                }

                let p = { id: doc.id, ...data };
                
                p.derivedGrade = studentGrades[p.studentEmail] || p.grade || 'N/A';
                p.derivedOrigin = p.originTeacher || p.origin || 'Unknown';
                p.derivedDest = p.destination || 'Unknown';
                p.derivedPeriod = p.period || 'N/A';
                
                if (p.returnedAt) p.derivedStatus = 'Returned';
                else if (p.departedAt) p.derivedStatus = 'Returning';
                else if (p.arrivedAt) p.derivedStatus = 'At Destination';
                else p.derivedStatus = 'Active';

                allFetchedPasses.push(p);
            });

            if (allFetchedPasses.length === 0) {
                reportContainer.innerHTML = `<h3>Timeframe Report</h3><p>No valid passes found for this date range.</p>`;
                return;
            }

            filterOptions = {
                grade: [...new Set(allFetchedPasses.map(p => p.derivedGrade))].sort(),
                origin: [...new Set(allFetchedPasses.map(p => p.derivedOrigin))].sort(),
                destination: [...new Set(allFetchedPasses.map(p => p.derivedDest))].sort(),
                period: [...new Set(allFetchedPasses.map(p => p.derivedPeriod))].sort(),
                status: ['Active', 'At Destination', 'Returning', 'Returned']
            };

            renderTimeframeReport(reportContainer);

        } catch (error) {
            console.error("Error generating timeframe report:", error);
            reportContainer.innerHTML = `<p style="color: red;">Error loading data. (Check console logs).</p>`;
        }
    });

    setupFilterDelegation(reportContainer);
}

function renderTimeframeReport(reportContainer) {
    let html = `<h2>Timeframe Report</h2>`;

    // 1. Apply Active Column Dropdown Filters
    let filteredPasses = allFetchedPasses.filter(p => {
        if (activeFilters.grade.length > 0 && !activeFilters.grade.includes(p.derivedGrade)) return false;
        if (activeFilters.origin.length > 0 && !activeFilters.origin.includes(p.derivedOrigin)) return false;
        if (activeFilters.destination.length > 0 && !activeFilters.destination.includes(p.derivedDest)) return false;
        if (activeFilters.period.length > 0 && !activeFilters.period.includes(String(p.derivedPeriod))) return false;
        if (activeFilters.status.length > 0 && !activeFilters.status.includes(p.derivedStatus)) return false;
        return true;
    });

    if (filteredPasses.length === 0) {
        reportContainer.innerHTML = html + `<p>No passes match your current filters.</p>`;
        return;
    }

    // 2. Group by Date
    const groupedByDate = {};
    filteredPasses.forEach(pass => {
        const dateStr = pass.acceptedAt.toDate().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        if (!groupedByDate[dateStr]) groupedByDate[dateStr] = [];
        groupedByDate[dateStr].push(pass);
    });

    // Sort the Day Groups by Chronological Order direction
    const sortedDates = Object.keys(groupedByDate).sort((a, b) => {
        const timeA = groupedByDate[a][0].acceptedAt.toMillis();
        const timeB = groupedByDate[b][0].acceptedAt.toMillis();
        return orderMode === 'asc' ? timeA - timeB : timeB - timeA;
    });

    // 3. Render Each Day
    for (const dateStr of sortedDates) {
        const dayPasses = groupedByDate[dateStr];
        
        html += `<div class="timeline-day-group" style="margin-bottom: 30px;">
                    <div class="timeline-date-header">📅 ${dateStr}</div>`;
        
        // Sort individual rows inside the day group
        if (sortMode === 'times') {
            // ALWAYS ascending by start time within the day
            dayPasses.sort((a, b) => a.acceptedAt.toMillis() - b.acceptedAt.toMillis());
        } else {
            // Sort by Names first, then ALWAYS ascending by start time
            dayPasses.sort((a, b) => {
                const nameA = a.studentDisplayName || '';
                const nameB = b.studentDisplayName || '';
                const comp = nameA.localeCompare(nameB);
                if (comp !== 0) return orderMode === 'asc' ? comp : -comp;
                return a.acceptedAt.toMillis() - b.acceptedAt.toMillis();
            });
        }

        html += `
            <table class="report-table" style="width: 100%; text-align: left; border-collapse: collapse; margin-top: 10px;">
                <thead>
                    <tr style="border-bottom: 2px solid #ccc;">
                        <th style="padding: 8px;">Student</th>
                        ${colVisibility.grade ? renderHeaderWithFilter('Grade', 'grade') : ''}
                        ${colVisibility.origin ? renderHeaderWithFilter('Origin', 'origin') : ''}
                        ${colVisibility.destination ? renderHeaderWithFilter('Destination', 'destination') : ''}
                        ${colVisibility.period ? renderHeaderWithFilter('Period', 'period') : ''}
                        ${colVisibility.startTime ? `<th style="padding: 8px;">Start Time</th>` : ''}
                        ${colVisibility.destTimes ? `<th style="padding: 8px;">Arrived / Departed</th>` : ''}
                        ${colVisibility.returnTime ? `<th style="padding: 8px;">Return Time</th>` : ''}
                        ${colVisibility.duration ? `<th style="padding: 8px;">Duration</th>` : ''}
                        ${colVisibility.status ? renderHeaderWithFilter('Status', 'status') : ''}
                    </tr>
                </thead>
                <tbody>
        `;

        dayPasses.forEach(pass => {
            const formatTime = (ts) => ts ? ts.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
            
            const startStr = formatTime(pass.acceptedAt);
            const arriveStr = formatTime(pass.arrivedAt);
            const departStr = formatTime(pass.departedAt);
            const returnStr = formatTime(pass.returnedAt);
            
            let durationStr = '--';
            if (pass.acceptedAt && pass.returnedAt) {
                const mins = Math.round((pass.returnedAt.toMillis() - pass.acceptedAt.toMillis()) / 60000);
                durationStr = `${mins} min`;
            }

            html += `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 8px;">
                        <strong>${pass.studentDisplayName}</strong><br>
                        <span style="font-size: 0.8em; color: #666;">${pass.studentEmail}</span>
                    </td>
                    ${colVisibility.grade ? `<td style="padding: 8px;">${pass.derivedGrade}</td>` : ''}
                    ${colVisibility.origin ? `<td style="padding: 8px;">${pass.derivedOrigin}</td>` : ''}
                    ${colVisibility.destination ? `<td style="padding: 8px;">${pass.derivedDest}</td>` : ''}
                    ${colVisibility.period ? `<td style="padding: 8px;">${pass.derivedPeriod}</td>` : ''}
                    ${colVisibility.startTime ? `<td style="padding: 8px;">${startStr}</td>` : ''}
                    ${colVisibility.destTimes ? `<td style="padding: 8px; font-size: 0.9em;">Arr: ${arriveStr}<br>Dep: ${departStr}</td>` : ''}
                    ${colVisibility.returnTime ? `<td style="padding: 8px;">${returnStr}</td>` : ''}
                    ${colVisibility.duration ? `<td style="padding: 8px;">${durationStr}</td>` : ''}
                    ${colVisibility.status ? `<td style="padding: 8px;">${pass.derivedStatus}</td>` : ''}
                </tr>
            `;
        });

        html += `</tbody></table></div>`;
    }

    reportContainer.innerHTML = html;

    const printBtn = document.getElementById('printReportBtn');
    if (printBtn) printBtn.onclick = () => printReportContainer('reportContainer'); 
}

// --- Helper Functions for Inline Column Filters ---

function renderHeaderWithFilter(title, filterKey) {
    const isFiltered = activeFilters[filterKey].length > 0;
    const iconColor = isFiltered ? '#e63946' : '#888';
    
    return `
        <th style="padding: 8px; position: relative;">
            <div style="display: flex; align-items: center; gap: 5px;">
                ${title} 
                <div class="filter-wrapper" style="display: inline-block;">
                    <span class="tf-filter-icon" data-col="${filterKey}" style="cursor: pointer; color: ${iconColor}; font-size: 1.1em; vertical-align: middle; margin-left: 4px;" title="Filter this column">
                        ᯤ
                    </span>
                </div>
            </div>
            <div class="tf-filter-dropdown hidden" id="dropdown-${filterKey}" style="position: absolute; top: 100%; left: 0; background: white; border: 1px solid #ccc; box-shadow: 0 4px 6px rgba(0,0,0,0.1); z-index: 10; padding: 10px; border-radius: 4px; min-width: 150px; font-weight: normal;">
                <div style="font-size: 0.85em; margin-bottom: 5px; color: #555;">Filter ${title}</div>
                <div style="max-height: 150px; overflow-y: auto; display: flex; flex-direction: column; gap: 5px;">
                    ${filterOptions[filterKey].map(opt => {
                        const checked = activeFilters[filterKey].includes(String(opt)) ? 'checked' : '';
                        return `<label style="display:flex; gap:5px; font-size:0.9em; cursor:pointer;"><input type="checkbox" class="tf-filter-check" data-col="${filterKey}" value="${opt}" ${checked}> ${opt}</label>`;
                    }).join('')}
                </div>
                <div style="margin-top: 8px; display: flex; gap: 5px;">
                    <button class="tf-filter-apply" data-col="${filterKey}" style="flex: 1; padding: 4px; background: #e63946; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 0.8em;">Apply</button>
                    <button class="tf-filter-clear" data-col="${filterKey}" style="flex: 1; padding: 4px; background: #eee; color: #333; border: none; border-radius: 3px; cursor: pointer; font-size: 0.8em;">Clear</button>
                </div>
            </div>
        </th>
    `;
}

function setupFilterDelegation(reportContainer) {
    reportContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('tf-filter-icon')) {
            const col = e.target.getAttribute('data-col');
            const dropdown = document.getElementById(`dropdown-${col}`);
            document.querySelectorAll('.tf-filter-dropdown').forEach(d => {
                if (d.id !== `dropdown-${col}`) d.classList.add('hidden');
            });
            dropdown.classList.toggle('hidden');
        }

        if (e.target.classList.contains('tf-filter-apply')) {
            const col = e.target.getAttribute('data-col');
            const dropdown = document.getElementById(`dropdown-${col}`);
            const checkboxes = dropdown.querySelectorAll('.tf-filter-check');
            
            let selected = [];
            checkboxes.forEach(chk => { if (chk.checked) selected.push(chk.value); });
            activeFilters[col] = selected;
            
            renderTimeframeReport(reportContainer);
        }

        if (e.target.classList.contains('tf-filter-clear')) {
            const col = e.target.getAttribute('data-col');
            activeFilters[col] = [];
            renderTimeframeReport(reportContainer);
        }
    });

    reportContainer.addEventListener('mousedown', (e) => {
        if (!e.target.closest('th')) {
            document.querySelectorAll('.tf-filter-dropdown').forEach(d => d.classList.add('hidden'));
        }
    });
}