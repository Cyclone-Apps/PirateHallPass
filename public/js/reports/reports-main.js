import { loadSingleStudentReport } from "./r-single.js";
import { loadCompareReport } from "./r-compare.js";
import { loadTimeframeReport } from "./r-timeframe.js"; // <-- NEW IMPORT

document.addEventListener("DOMContentLoaded", () => {
    // 1. Grab all the navigation buttons
    const btnSingleStudent = document.getElementById("btnSingleStudent");
    const btnCompareStudents = document.getElementById("btnCompareStudents");
    const btnTimeframeList = document.getElementById("btnTimeframeList");
    const btnHallIntersections = document.getElementById("btnHallIntersections");

    // 2. Grab the display containers
    const settingsContainer = document.getElementById("settingsContainer");
    const reportContainer = document.getElementById("reportContainer");

    // Helper function to clear the screen before loading a new report type
    function prepareContainers() {
        settingsContainer.innerHTML = "";
        reportContainer.innerHTML = "";
        settingsContainer.classList.remove("hidden");
        reportContainer.classList.add("hidden"); // Hide report area until they click "Run"
    }

    // 3. Wire up the "Single Student" button
    btnSingleStudent.addEventListener("click", () => {
        prepareContainers();
        loadSingleStudentReport(settingsContainer, reportContainer);
    });

    // 4. Wire up the "Compare Students" button
    btnCompareStudents.addEventListener("click", () => {
        prepareContainers();
        loadCompareReport(settingsContainer, reportContainer);
    });

    // 5. Wire up the "Timeframe List" button (UPDATED)
    btnTimeframeList.addEventListener("click", () => {
        prepareContainers();
        loadTimeframeReport(settingsContainer, reportContainer);
    });

    // 6. Placeholder for Hall Intersections
    btnHallIntersections.addEventListener("click", () => {
        prepareContainers();
        settingsContainer.innerHTML = "<h2>Hall Intersections Settings (Coming Soon)</h2>";
    });

    // Optional: Auto-load the first tab on page load
    // btnSingleStudent.click(); 
});

// Global function to show pass details when a timeline block is clicked
window.showPassDetails = function(encodedData) {
    const data = JSON.parse(decodeURIComponent(encodedData));
    
    // Create backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    
    // Create modal content matching your UI screenshot
    const modal = document.createElement('div');
    modal.className = 'pass-detail-modal';
    modal.innerHTML = `
        <h3 style="margin-top:0;">🎓 ${data.name}</h3>
        <p>🛫 Origin: <strong>${data.origin}</strong></p>
        <p>📍 Destination: <strong>${data.dest}</strong></p>
        <hr style="border: 1px solid #eee; margin: 10px 0;">
        <div style="display: grid; grid-template-columns: 1fr auto; gap: 8px; font-size: 0.9em;">
            <span>🛫 Left Origin:</span> <strong>${data.t1}</strong>
            <span>📍 Arrived Dest:</span> <strong>${data.t2}</strong>
            <span>🚶 Left Dest:</span> <strong>${data.t3}</strong>
            <span>🏠 Returned:</span> <strong>${data.t4}</strong>
        </div>
        <button onclick="this.parentElement.previousSibling.remove(); this.parentElement.remove();" 
                style="margin-top: 15px; width: 100%; padding: 8px; cursor: pointer;">Close</button>
    `;
    
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
    
    // Close on backdrop click
    backdrop.onclick = () => {
        backdrop.remove();
        modal.remove();
    };
};