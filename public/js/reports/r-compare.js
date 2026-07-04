import { initMultiStudentSelect } from "./r-select.js";
import { getDateFiltersHTML, getActionButtonsHTML, getDateRange, printReportContainer } from "./r-utils.js";
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../firebase-config.js"; 

let selectedStudentsList = []; 
const trackColors = ['#e63946', '#6c757d', '#0077b6', '#2a9d8f'];

// Variable to hold the fetched data so we can re-render instantly without fetching again
let allProcessedDays = []; 

export function loadCompareReport(settingsContainer, reportContainer) {
    settingsContainer.innerHTML = `
        <div class="settings-layout">
            <div class="settings-left">
                <h2>Compare Students</h2>
                <div class="search-group" style="align-items: flex-start; flex-direction: column; gap: 5px;">
                    <label>Search & Select Student (Max 4):</label>
                    <div class="searchable-dropdown" style="width: 100%; max-width: 500px;">
                        <input type="text" id="multiStudentInput" class="searchable-input" placeholder="Type student name or email..." autocomplete="off">
                        <div id="multiStudentDropdown" class="dropdown-list"></div>
                    </div>
                    <div id="selectedStudentTags" class="selected-tags-container"></div>
                </div>
                
                <div style="display: flex; flex-wrap: wrap; align-items: flex-end; gap: 15px; margin-top: 10px;">
                    ${getDateFiltersHTML()}
                    
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <label style="font-size: 0.85em; color: #555; font-weight: normal; margin: 0;">View</label>
                        <div style="display: flex; border: 1px solid #ccc; border-radius: 4px; overflow: hidden; height: 32px;">
                            <label id="btnPictureView" style="padding: 0 15px; cursor: pointer; background: #e63946; color: white; display: flex; align-items: center; justify-content: center; margin: 0; border-right: 1px solid #ccc;">
                                <input type="radio" name="compareViewMode" value="picture" checked style="display:none;">
                                Picture
                            </label>
                            <label id="btnListView" style="padding: 0 15px; cursor: pointer; background: #f9f9f9; color: #333; display: flex; align-items: center; justify-content: center; margin: 0;">
                                <input type="radio" name="compareViewMode" value="list" style="display:none;">
                                List
                            </label>
                        </div>
                    </div>

                    <div id="overlapCheckContainer" style="display: flex; align-items: center; height: 32px;">
                        <label style="cursor: pointer; display: flex; align-items: center; gap: 8px; margin: 0;">
                            <input type="checkbox" id="onlyOverlapsCheck">
                            Only show overlapping times
                        </label>
                    </div>
                </div>
            </div>
            
            <div class="settings-right">
                ${getActionButtonsHTML("Run Comparison")}
            </div>
        </div>
    `;

    const inputEl = document.getElementById('multiStudentInput');
    const dropdownEl = document.getElementById('multiStudentDropdown');
    const tagsContainer = document.getElementById('selectedStudentTags');
    const runBtn = document.getElementById('runReportBtn');
    
    // UI Elements for Toggle
    const viewRadios = document.querySelectorAll('input[name="compareViewMode"]');
    const btnPicture = document.getElementById('btnPictureView');
    const btnList = document.getElementById('btnListView');
    const overlapContainer = document.getElementById('overlapCheckContainer');
    const onlyOverlapsCheck = document.getElementById('onlyOverlapsCheck');

    initMultiStudentSelect(inputEl, dropdownEl, tagsContainer, 4, (updatedStudents) => {
        selectedStudentsList = updatedStudents;
    });

    // Handle styling changes and instant re-rendering when toggles are clicked
    function handleToggleChange() {
        const mode = document.querySelector('input[name="compareViewMode"]:checked').value;
        if (mode === 'picture') {
            btnPicture.style.background = '#e63946';
            btnPicture.style.color = 'white';
            btnList.style.background = '#f9f9f9';
            btnList.style.color = '#333';
            overlapContainer.style.display = 'flex'; // Show checkbox
        } else {
            btnList.style.background = '#e63946';
            btnList.style.color = 'white';
            btnPicture.style.background = '#f9f9f9';
            btnPicture.style.color = '#333';
            overlapContainer.style.display = 'none'; // Hide checkbox
        }
        
        // Immediately redraw the report if we already have data
        if (allProcessedDays.length > 0) {
            renderReport();
        }
    }

    // Attach instant-update listeners
    viewRadios.forEach(radio => radio.addEventListener('change', handleToggleChange));
    onlyOverlapsCheck.addEventListener('change', () => {
        if (allProcessedDays.length > 0) renderReport();
    });

    // Main fetch routine triggered by the "Run" button
    runBtn.addEventListener('click', async () => {
        if (selectedStudentsList.length < 2) {
            alert("Please select at least 2 students to compare.");
            return;
        }

        const { startMillis, endMillis } = getDateRange();
        reportContainer.classList.remove('hidden');
        reportContainer.innerHTML = `<p>Calculating timeline overlaps...</p>`;
        
        // Reset our stored data for a fresh run
        allProcessedDays = [];

        try {
            let allPasses = [];
            const passesRef = collection(db, "passes");

            const fetchPromises = selectedStudentsList.map(async (student, index) => {
                const q = query(passesRef, where("studentDisplayName", "==", student.name));
                const snapshot = await getDocs(q);
                
                snapshot.forEach(doc => {
                    const pass = { id: doc.id, ...doc.data(), studentIndex: index };
                    if (pass.acceptedAt && pass.returnedAt) {
                        const startMs = pass.acceptedAt.toMillis();
                        if (startMs >= startMillis && startMs <= endMillis) {
                            allPasses.push(pass);
                        }
                    }
                });
            });

            await Promise.all(fetchPromises);

            if (allPasses.length === 0) {
                reportContainer.innerHTML = `<h3>Comparison Report</h3><p>No data found.</p>`;
                return;
            }

            allPasses.sort((a, b) => a.acceptedAt.toMillis() - b.acceptedAt.toMillis());
            
            const groupedByDate = {};
            allPasses.forEach(pass => {
                const dateStr = pass.acceptedAt.toDate().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
                if (!groupedByDate[dateStr]) groupedByDate[dateStr] = [];
                groupedByDate[dateStr].push(pass);
            });

            // Cluster passes and save them to our global array
            for (const [dateStr, dayPasses] of Object.entries(groupedByDate)) {
                let clusters = [];
                let currentCluster = [dayPasses[0]];
                let currentMaxEnd = dayPasses[0].returnedAt.toMillis();

                for (let i = 1; i < dayPasses.length; i++) {
                    const pass = dayPasses[i];
                    const startMs = pass.acceptedAt.toMillis();
                    const endMs = pass.returnedAt.toMillis();

                    if (startMs - currentMaxEnd <= 45 * 60000) { 
                        currentCluster.push(pass);
                        currentMaxEnd = Math.max(currentMaxEnd, endMs);
                    } else {
                        clusters.push(currentCluster);
                        currentCluster = [pass];
                        currentMaxEnd = endMs;
                    }
                }
                if (currentCluster.length > 0) clusters.push(currentCluster);
                
                allProcessedDays.push({ dateStr, clusters });
            }

            // Now that data is ready, paint the screen!
            renderReport();

        } catch (error) {
            console.error("Error generating comparison:", error);
            reportContainer.innerHTML = `<p style="color: red;">Error loading comparison data.</p>`;
        }
    });

    // Extracted rendering logic to allow instant UI updates
    function renderReport() {
        const viewMode = document.querySelector('input[name="compareViewMode"]:checked').value;
        const onlyOverlaps = onlyOverlapsCheck.checked;

        let hasAnyDataToRender = false;
        let html = `<h2>Comparison Report</h2>`;

        if (viewMode === 'list') {
            // --- LIST VIEW ---
            html += `<table class="report-table" style="width: 100%; text-align: left;">
                        <thead>
                            <tr>
                                <th>Date & Time Window</th>
                                <th>Overlapping Students</th>
                                <th>Pass Details</th>
                            </tr>
                        </thead>
                        <tbody>`;
                        
            allProcessedDays.forEach(day => {
                const visibleClusters = day.clusters.filter(cluster => {
                    const uniqueStudents = new Set(cluster.map(p => p.studentIndex));
                    return uniqueStudents.size > 1; // List view EXCLUSIVELY shows overlaps
                });

                if (visibleClusters.length > 0) hasAnyDataToRender = true;

                visibleClusters.forEach(cluster => {
                    const clusterStartMs = Math.min(...cluster.map(p => p.acceptedAt.toMillis()));
                    const clusterEndMs = Math.max(...cluster.flatMap(p => [p.returnedAt?.toMillis() || p.acceptedAt.toMillis()]));
                    
                    const startTime = new Date(clusterStartMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const endTime = new Date(clusterEndMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                    const studentsInvolved = [...new Set(cluster.map(p => p.studentDisplayName))].join(", ");

                    let passDetailsStr = cluster.map(p => {
                        const color = trackColors[p.studentIndex];
                        const pStart = p.acceptedAt ? p.acceptedAt.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--:--';
                        const pEnd = p.returnedAt ? p.returnedAt.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--:--';
                        
                        return `<div style="margin-bottom: 6px; padding-left: 8px; border-left: 4px solid ${color};">
                                    <strong>${p.studentDisplayName}</strong>: ${p.originTeacher || p.origin} &rarr; ${p.destination} 
                                    <br><span style="font-size: 0.85em; color: #666;">(${pStart} - ${pEnd})</span>
                                </div>`;
                    }).join("");

                    html += `<tr>
                                <td style="white-space: nowrap; vertical-align: top;"><strong>${day.dateStr}</strong><br>${startTime} - ${endTime}</td>
                                <td style="vertical-align: top;"><strong>${studentsInvolved}</strong></td>
                                <td style="vertical-align: top;">${passDetailsStr}</td>
                             </tr>`;
                });
            });

            html += `</tbody></table>`;

            if (!hasAnyDataToRender) {
                 html = `<h2>Comparison Report</h2><p>No overlapping passes found for the selected criteria.</p>`;
            }

        } else {
            // --- PICTURE VIEW ---
            html += `<div class="compare-legend" style="display: flex; gap: 15px; margin-bottom: 20px; flex-wrap: wrap;">`;
            selectedStudentsList.forEach((student, index) => {
                html += `<div class="legend-item" style="display: flex; align-items: center; gap: 5px;">
                            <div class="legend-color" style="width: 15px; height: 15px; background-color: ${trackColors[index]}; border-radius: 3px;"></div>
                            ${student.name}
                         </div>`;
            });
            html += `</div>`;

            allProcessedDays.forEach(day => {
                let visibleClusters = day.clusters;
                
                if (onlyOverlaps) {
                    visibleClusters = day.clusters.filter(cluster => {
                        const uniqueStudents = new Set(cluster.map(p => p.studentIndex));
                        return uniqueStudents.size > 1;
                    });
                }

                if (visibleClusters.length === 0) return; 
                hasAnyDataToRender = true;

                html += `<div class="timeline-day-group"><div class="timeline-date-header">📅 ${day.dateStr}</div>`;

                visibleClusters.forEach(cluster => {
                    const clusterStartMs = Math.min(...cluster.map(p => p.acceptedAt.toMillis()));
                    const clusterEndMs = Math.max(...cluster.flatMap(p => [p.returnedAt?.toMillis() || p.acceptedAt.toMillis()]));
                    
                    const durationMins = (clusterEndMs - clusterStartMs) / 60000;
                    const pxPerMin = 4;
                    const containerHeight = Math.max(durationMins * pxPerMin, 60);

                    // Adjusted to 50px as discussed!
                    html += `<div class="timeline-cluster">
                                <div class="cluster-time-axis" style="height: ${containerHeight}px; width: ${selectedStudentsList.length * 50}px;">`;

                    for (let col = 0; col < selectedStudentsList.length; col++) {
                        html += `<div class="student-col">`;
                        
                        const studentPasses = cluster.filter(p => p.studentIndex === col);
                        studentPasses.forEach(pass => {
                            let segments = [];
                            let t1 = pass.acceptedAt?.toMillis(); 
                            let t2 = pass.arrivedAt?.toMillis();  
                            let t3 = pass.departedAt?.toMillis(); 
                            let t4 = pass.returnedAt?.toMillis(); 

                            if (t1 && t4 && !t2 && !t3) {
                                segments.push({ start: t1, end: t4 });
                            } else {
                                if (t1 && t2) segments.push({ start: t1, end: t2 });
                                if (t3 && t4) segments.push({ start: t3, end: t4 });
                            }

                            const passDataStr = encodeURIComponent(JSON.stringify({
                                name: selectedStudentsList[col].name,
                                origin: pass.originTeacher || pass.origin,
                                dest: pass.destination,
                                t1: pass.acceptedAt ? pass.acceptedAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--',
                                t2: pass.arrivedAt ? pass.arrivedAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--',
                                t3: pass.departedAt ? pass.departedAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--',
                                t4: pass.returnedAt ? pass.returnedAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'
                            }));

                            segments.forEach(seg => {
                                const topPx = ((seg.start - clusterStartMs) / 60000) * pxPerMin;
                                const heightPx = Math.max(((seg.end - seg.start) / 60000) * pxPerMin, 8); 

                                html += `
                                    <div class="overlap-block" 
                                         style="top: ${topPx}px; height: ${heightPx}px; background-color: ${trackColors[col]};" 
                                         onclick="window.showPassDetails('${passDataStr}')">
                                    </div>
                                `;
                            });
                        });
                        
                        html += `</div>`;
                    }

                    html += `   </div>
                             </div>`; 
                });

                html += `</div>`; 
            });

            if (!hasAnyDataToRender) {
                 html = `<h2>Comparison Report</h2><p>No passes match the selected criteria.</p>`;
            }
        }

        reportContainer.innerHTML = html;

        // Ensure Print/Copy buttons stay wired up after HTML rewrites
        const printBtn = document.getElementById('printReportBtn');
        const copyBtn = document.getElementById('copyReportBtn');

        if (printBtn) {
            printBtn.onclick = () => printReportContainer('reportContainer'); 
        }

        if (copyBtn) {
            copyBtn.onclick = async () => {
                const originalText = copyBtn.innerText;
                copyBtn.innerText = "Copying...";
                copyBtn.disabled = true;

                try {
                    const canvas = await html2canvas(reportContainer, {
                        scale: 2, 
                        backgroundColor: "#ffffff",
                        useCORS: true 
                    });

                    canvas.toBlob(async (blob) => {
                        try {
                            const item = new ClipboardItem({ "image/png": blob });
                            await navigator.clipboard.write([item]);
                            copyBtn.innerText = "Copied!";
                        } catch (err) {
                            console.error("Clipboard API failed:", err);
                            alert("Your browser blocks direct image copying. The report will download instead.");
                            const link = document.createElement('a');
                            link.download = 'compare-report.png';
                            link.href = canvas.toDataURL("image/png");
                            link.click();
                            copyBtn.innerText = "Downloaded";
                        }
                    }, 'image/png');
                } catch (err) {
                    console.error("Error generating image:", err);
                    copyBtn.innerText = "Error";
                }

                setTimeout(() => {
                    copyBtn.innerText = originalText;
                    copyBtn.disabled = false;
                }, 3000);
            };
        }
    }
}