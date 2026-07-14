import { initMultiStudentSelect } from "./r-select.js";
import { getDateFiltersHTML, getActionButtonsHTML, getDateRange, printReportContainer } from "./r-utils.js";
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../firebase-config.js"; 
import { getAdjustedNow } from "../modules/time-engine.js";

let selectedStudentsList = [];

export function loadIntersectionsReport(settingsContainer, reportContainer) {
    
    settingsContainer.innerHTML = `
        <div class="settings-layout">
            <div class="settings-left" style="flex: 1;">
                <h2>Hall Intersections</h2>
                
                <div class="search-group" style="align-items: flex-start; flex-direction: column; gap: 5px; margin-top: 10px;">
                    <label>Filter by Student(s) (Leave blank for all):</label>
                    <div class="searchable-dropdown" style="width: 100%; max-width: 500px;">
                        <input type="text" id="multiStudentInput" class="searchable-input" placeholder="Type student name or email..." autocomplete="off">
                        <div id="multiStudentDropdown" class="dropdown-list"></div>
                    </div>
                    <div id="selectedStudentTags" class="selected-tags-container"></div>
                </div>
                
                <div style="display: flex; flex-wrap: wrap; align-items: flex-end; gap: 20px; margin-top: 15px;">
                    ${getDateFiltersHTML()}
                    
                    <div style="display: flex; flex-direction: column;">
                        <label style="font-size: 0.85em; color: var(--text-dark, #333); margin-bottom: 4px; font-weight: normal; display: block;">Min. Intersections</label>
                        <input type="number" id="minIntersections" value="3" min="1" style="padding: 8px; border: 1px solid var(--text-dark, #333); border-radius: 4px; width: 80px; height: 35px; box-sizing: border-box;">
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
        const today = getAdjustedNow();
        const lastWeek = getAdjustedNow();
        lastWeek.setDate(today.getDate() - 7);
        
        dateInputs[0].value = lastWeek.toISOString().split('T')[0];
        dateInputs[1].value = today.toISOString().split('T')[0];
    }

    // Initialize the Multi-Select Dropdown
    const inputEl = document.getElementById('multiStudentInput');
    const dropdownEl = document.getElementById('multiStudentDropdown');
    const tagsContainer = document.getElementById('selectedStudentTags');
    
    // Using 10 as a generous max selection limit, change if needed
    initMultiStudentSelect(inputEl, dropdownEl, tagsContainer, 10, (updatedStudents) => {
        selectedStudentsList = updatedStudents;
    });
    
    const runBtn = document.getElementById('runReportBtn');

    runBtn.addEventListener('click', async () => {
        const { startMillis, endMillis } = getDateRange();
        const minThreshold = parseInt(document.getElementById('minIntersections').value) || 1;
        
        if (!startMillis || !endMillis || isNaN(startMillis) || isNaN(endMillis)) {
            alert("Please select a valid Start and End Date.");
            return;
        }

        reportContainer.classList.remove('hidden');
        reportContainer.innerHTML = `<p>Calculating hallway intersections... (This might take a second)</p>`;
        
        try {
            const passesRef = collection(db, "passes");
            const startDate = new Date(startMillis);
            const endDate = new Date(endMillis);

            const q = query(
                passesRef, 
                where("acceptedAt", ">=", startDate), 
                where("acceptedAt", "<=", endDate)
            );
            const snapshot = await getDocs(q);
            
            // 1. Sanitize and Split Passes into "Trips"
            const tripsByDate = {};

            // Helper to format times for the popup pass cards
            const formatTime = (ts) => ts && typeof ts.toDate === 'function' ? ts.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';

            snapshot.forEach(doc => {
                const data = doc.data();
                if (!data.acceptedAt || typeof data.acceptedAt.toMillis !== 'function') return;

                const passDateStr = data.acceptedAt.toDate().toLocaleDateString();
                if (!tripsByDate[passDateStr]) tripsByDate[passDateStr] = [];

                const email = data.studentEmail;
                const name = data.studentDisplayName || email;
                const start = data.acceptedAt.toMillis();
                const hasDestTimes = data.arrivedAt && data.departedAt;

                // Build the visual pass object for the modal
                const origPass = {
                    name: name,
                    origin: data.originTeacher || data.origin || 'Unknown',
                    dest: data.destination || 'Unknown',
                    t1: formatTime(data.acceptedAt),
                    t2: formatTime(data.arrivedAt),
                    t3: formatTime(data.departedAt),
                    t4: formatTime(data.returnedAt)
                };

                if (hasDestTimes) {
                    // Trip 1: Going
                    tripsByDate[passDateStr].push({
                        id: doc.id + '-going',
                        name: name,
                        email: email,
                        start: start,
                        end: data.arrivedAt.toMillis(),
                        type: 'Going',
                        mocked: false,
                        origPass: origPass
                    });

                    // Trip 2: Returning
                    const returnStart = data.departedAt.toMillis();
                    const isMocked = !data.returnedAt;
                    const returnEnd = isMocked ? returnStart + (6 * 60000) : data.returnedAt.toMillis();

                    tripsByDate[passDateStr].push({
                        id: doc.id + '-return',
                        name: name,
                        email: email,
                        start: returnStart,
                        end: returnEnd,
                        type: 'Returning',
                        mocked: isMocked,
                        origPass: origPass
                    });
                } else {
                    // Single Trip Pass
                    const isMocked = !data.returnedAt;
                    const end = isMocked ? start + (6 * 60000) : data.returnedAt.toMillis();

                    tripsByDate[passDateStr].push({
                        id: doc.id,
                        name: name,
                        email: email,
                        start: start,
                        end: end,
                        type: 'Standard',
                        mocked: isMocked,
                        origPass: origPass
                    });
                }
            });

            // 2. Find Intersections
            const pairData = {}; // Key: "email1::email2", Value: { names, intersections: [] }

            for (const [dateStr, dayTrips] of Object.entries(tripsByDate)) {
                // Compare every trip against every other trip for this day
                for (let i = 0; i < dayTrips.length; i++) {
                    for (let j = i + 1; j < dayTrips.length; j++) {
                        const t1 = dayTrips[i];
                        const t2 = dayTrips[j];

                        // Skip if same student
                        if (t1.email === t2.email) continue;

                        // Check for time overlap
                        const overlapStart = Math.max(t1.start, t2.start);
                        const overlapEnd = Math.min(t1.end, t2.end);

                        if (overlapStart < overlapEnd) {
                            // We have an intersection!
                            const emails = [t1.email, t2.email].sort();
                            const pairKey = emails.join('::');
                            
                            if (!pairData[pairKey]) {
                                const names = t1.email === emails[0] ? [t1.name, t2.name] : [t2.name, t1.name];
                                pairData[pairKey] = {
                                    names: names,
                                    emails: emails,
                                    intersections: []
                                };
                            }

                            const overlapMins = Math.round((overlapEnd - overlapStart) / 60000);
                            
                            pairData[pairKey].intersections.push({
                                date: dateStr,
                                timeStr: new Date(overlapStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                duration: overlapMins,
                                t1Mocked: t1.mocked,
                                t2Mocked: t2.mocked,
                                t1Type: t1.type,
                                t2Type: t2.type,
                                pass1: t1.origPass, // Save for the side-by-side modal
                                pass2: t2.origPass  // Save for the side-by-side modal
                            });
                        }
                    }
                }
            }

            // 3. Filter by Threshold, Selection, and Sort
            const finalPairs = Object.values(pairData)
                .filter(pair => pair.intersections.length >= minThreshold)
                .filter(pair => {
                    // If no students are selected, show everyone
                    if (selectedStudentsList.length === 0) return true; 
                    
                    // Create an array of just the selected names to check against
                    const selectedNames = selectedStudentsList.map(s => s.name);
                    
                    // Keep the pair if Student 1 OR Student 2 is in our selected list
                    return selectedNames.includes(pair.names[0]) || selectedNames.includes(pair.names[1]);
                })
                .sort((a, b) => b.intersections.length - a.intersections.length);

            // 4. Render Report
            renderIntersectionsReport(reportContainer, finalPairs, minThreshold);

        } catch (error) {
            console.error("Error generating intersections report:", error);
            reportContainer.innerHTML = `<p style="color: red;">Error calculating data. (Check console logs).</p>`;
        }
    });

    // Event delegation for the buttons
    reportContainer.addEventListener('click', (e) => {
        // Handle "View Details" toggle
        if (e.target.classList.contains('toggle-details-btn')) {
            const index = e.target.getAttribute('data-index');
            const detailsRow = document.getElementById(`details-row-${index}`);
            if (detailsRow.classList.contains('hidden')) {
                detailsRow.classList.remove('hidden');
                e.target.textContent = 'Hide Details';
            } else {
                detailsRow.classList.add('hidden');
                e.target.textContent = 'View Details';
            }
        }

        // Handle "View Passes" modal
        if (e.target.classList.contains('view-passes-btn')) {
            const payload = e.target.getAttribute('data-payload');
            showIntersectionPassesModal(payload);
        }
    });
}

function renderIntersectionsReport(reportContainer, finalPairs, minThreshold) {
    let html = `<h2>Hall Intersections Report</h2>`;
    
    if (finalPairs.length === 0) {
        html += `<p>No student pairs found intersecting ${minThreshold} or more times.</p>`;
        reportContainer.innerHTML = html;
        return;
    }

    html += `
        <table class="report-table" style="width: 100%; text-align: left; border-collapse: collapse; margin-top: 20px;">
            <thead>
                <tr style="border-bottom: 2px solid #ccc;">
                    <th style="padding: 10px;">Student 1</th>
                    <th style="padding: 10px;">Student 2</th>
                    <th style="padding: 10px; text-align: center;">Total Overlaps</th>
                    <th style="padding: 10px; text-align: right;">Action</th>
                </tr>
            </thead>
            <tbody>
    `;

    finalPairs.forEach((pair, index) => {
        html += `
            <tr style="border-bottom: 1px solid #eee; background-color: #fdfdfd;">
                <td style="padding: 12px;"><strong>${pair.names[0]}</strong><br><span style="font-size: 0.8em; color: #666;">${pair.emails[0]}</span></td>
                <td style="padding: 12px;"><strong>${pair.names[1]}</strong><br><span style="font-size: 0.8em; color: #666;">${pair.emails[1]}</span></td>
                <td style="padding: 12px; text-align: center; font-size: 1.2em; font-weight: bold; color: #e63946;">${pair.intersections.length}</td>
                <td style="padding: 12px; text-align: right;">
                    <button class="toggle-details-btn" data-index="${index}" style="padding: 6px 12px; background: #333; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9em;">View Details</button>
                </td>
            </tr>
            <tr id="details-row-${index}" class="hidden">
                <td colspan="4" style="padding: 0; background-color: #fafafa; border-bottom: 2px solid #ccc;">
                    <div style="padding: 15px 40px;">
                        <h4 style="margin-top: 0; margin-bottom: 10px; color: #555;">Intersection Details</h4>
                        <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
                            <thead>
                                <tr style="border-bottom: 1px solid #ddd; color: #666;">
                                    <th style="padding: 6px; text-align: left;">Date</th>
                                    <th style="padding: 6px; text-align: left;">Overlap Time</th>
                                    <th style="padding: 6px; text-align: left;">Overlap Duration</th>
                                    <th style="padding: 6px; text-align: left;">Notes</th>
                                    <th style="padding: 6px; text-align: right;">Passes</th>
                                </tr>
                            </thead>
                            <tbody>
        `;

        pair.intersections.forEach(ix => {
            let notes = [];
            if (ix.t1Mocked || ix.t2Mocked) notes.push(`<span style="color: #e63946;">*Uses 6-min mock return</span>`);
            if (ix.t1Type !== 'Standard' || ix.t2Type !== 'Standard') notes.push(`Partial trips (${ix.t1Type} / ${ix.t2Type})`);
            
            // Encode the two pass objects to pass into the global modal function
            const passDataPayload = encodeURIComponent(JSON.stringify({ p1: ix.pass1, p2: ix.pass2 }));

            html += `
                                <tr style="border-bottom: 1px solid #eee;">
                                    <td style="padding: 6px;">${ix.date}</td>
                                    <td style="padding: 6px;">${ix.timeStr}</td>
                                    <td style="padding: 6px;">${ix.duration > 0 ? ix.duration : '< 1'} min</td>
                                    <td style="padding: 6px; font-style: italic;">${notes.join(' | ') || '--'}</td>
                                    <td style="padding: 6px; text-align: right;">
                                        <button class="view-passes-btn" data-payload="${passDataPayload}" style="padding: 4px 8px; background: #e63946; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 0.8em;">View Passes</button>
                                    </td>
                                </tr>
            `;
        });

        html += `
                            </tbody>
                        </table>
                    </div>
                </td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    reportContainer.innerHTML = html;

    const printBtn = document.getElementById('printReportBtn');
    if (printBtn) printBtn.onclick = () => printReportContainer('reportContainer'); 
}

// --- Helper Function for Side-by-Side Modal ---
function showIntersectionPassesModal(encodedData) {
    const data = JSON.parse(decodeURIComponent(encodedData));
    
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.style.position = 'fixed';
    backdrop.style.top = '0'; backdrop.style.left = '0';
    backdrop.style.width = '100vw'; backdrop.style.height = '100vh';
    backdrop.style.backgroundColor = 'rgba(0,0,0,0.5)';
    backdrop.style.zIndex = '999';
    
    const modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.top = '50%';
    modal.style.left = '50%';
    modal.style.transform = 'translate(-50%, -50%)';
    modal.style.backgroundColor = '#e63946'; 
    modal.style.padding = '20px';
    modal.style.borderRadius = '8px';
    modal.style.zIndex = '1000';
    modal.style.display = 'flex';
    modal.style.gap = '20px'; 
    modal.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)';

    const buildPassCard = (p) => `
        <div style="background: white; padding: 20px; border-radius: 8px; min-width: 250px; color: #333; position: relative;">
            <h3 style="margin-top:0;">🎓 ${p.name}</h3>
            <p style="margin: 8px 0;">🛫 Origin: <strong>${p.origin}</strong></p>
            <p style="margin: 8px 0;">📍 Destination: <strong>${p.dest}</strong></p>
            <hr style="border: 1px solid #eee; margin: 15px 0;">
            <div style="display: grid; grid-template-columns: 1fr auto; gap: 8px; font-size: 0.9em;">
                <span>🛫 Left Origin:</span> <strong>${p.t1}</strong>
                <span>📍 Arrived Dest:</span> <strong>${p.t2}</strong>
                <span>🚶 Left Dest:</span> <strong>${p.t3}</strong>
                <span>🏠 Returned:</span> <strong>${p.t4}</strong>
            </div>
        </div>
    `;

    modal.innerHTML = `
        ${buildPassCard(data.p1)}
        ${buildPassCard(data.p2)}
        <button onclick="this.parentElement.previousSibling.remove(); this.parentElement.remove();" 
                style="position: absolute; top: -10px; right: -10px; background: white; border: 2px solid #e63946; color: #e63946; border-radius: 50%; width: 30px; height: 30px; cursor: pointer; font-weight: bold; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">X</button>
    `;
    
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
    
    backdrop.onclick = () => {
        backdrop.remove();
        modal.remove();
    };
}