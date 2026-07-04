// js/reports/r-utils.js

// --- HTML Generators ---

export function getDateFiltersHTML() {
    return `
        <div class="date-group">
            <div class="date-input-wrapper">
                <label>Start Date (Optional)</label>
                <input type="date" id="startDateInput">
            </div>
            <div class="date-input-wrapper">
                <label>End Date (Optional)</label>
                <input type="date" id="endDateInput">
            </div>
        </div>
    `;
}

export function getActionButtonsHTML(runBtnText = "Run Report") {
    return `
        <button id="runReportBtn" class="btn btn-dark">${runBtnText}</button>
        <button id="printReportBtn" class="btn btn-dark">Print Report</button>
        <button id="copyReportBtn" class="btn btn-dark">Copy Data</button>
    `;
}

export function getStatusFilterHeaderHTML() {
    return `
        Status 
        <div class="filter-wrapper" id="statusFilterWrapper" style="display: inline-block;">
            <span class="filter-icon" style="font-size: 1.1em; vertical-align: middle; margin-left: 4px;">ᯤ</span>
            <div id="statusDropdown" class="status-dropdown">
                <div id="statusCheckboxes"></div>
                <button class="clear-btn" id="clearStatusesBtn">Clear checks</button>
            </div>
        </div>
    `;
}


// --- Logic Helpers ---

export function getDateRange() {
    const startVal = document.getElementById('startDateInput')?.value;
    const endVal = document.getElementById('endDateInput')?.value;
    
    // Append times to ensure correct local timezone parsing
    const startMillis = startVal ? new Date(startVal + 'T00:00:00').getTime() : 0;
    const endMillis = endVal ? new Date(endVal + 'T23:59:59').getTime() : Infinity;
    
    return { startMillis, endMillis };
}

export function initStatusFilter(uniqueStatuses, onFilterChange) {
    const filterWrapper = document.getElementById('statusFilterWrapper');
    const dropdown = document.getElementById('statusDropdown');
    const clearBtn = document.getElementById('clearStatusesBtn');
    const checkboxesContainer = document.getElementById('statusCheckboxes');
    
    let activeStatuses = new Set(uniqueStatuses); // All checked by default

    // 1. Populate Checkboxes
    checkboxesContainer.innerHTML = '';
    uniqueStatuses.forEach(status => {
        checkboxesContainer.innerHTML += `
            <label class="status-item">
                <input type="checkbox" value="${status}" checked>
                ${status}
            </label>
        `;
    });

    const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]');

    // 2. Toggle Dropdown Menu
    filterWrapper.addEventListener('click', (e) => {
        if (e.target.closest('.status-dropdown')) return; 
        dropdown.classList.toggle('show');
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
        if (filterWrapper && !filterWrapper.contains(e.target)) {
            dropdown.classList.remove('show');
        }
    });

    // 3. Handle Checkbox Changes
    checkboxes.forEach(box => {
        box.addEventListener('change', (e) => {
            const status = e.target.value;
            if (e.target.checked) activeStatuses.add(status);
            else activeStatuses.delete(status);
            onFilterChange(activeStatuses);
        });
    });

    // 4. Handle Clear Button
    clearBtn.addEventListener('click', () => {
        checkboxes.forEach(box => box.checked = false);
        activeStatuses.clear();
        onFilterChange(activeStatuses);
    });

    return activeStatuses;
}

// --- Print Utility ---
export function printReportContainer(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error("Print container not found.");
        return;
    }

    // Open a temporary window for printing
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    
    // Grab all current stylesheets from the main page so the print styling matches
    let stylesHtml = '';
    document.querySelectorAll('link[rel="stylesheet"], style').forEach(el => {
        stylesHtml += el.outerHTML;
    });

    // Write the HTML for the print window
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Print Report</title>
            ${stylesHtml}
            <style>
                /* Force browsers to print the timeline background colors */
                * {
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }
                /* Ensure a clean white background for the printed page */
                body { 
                    padding: 20px; 
                    background: white !important; 
                }
            </style>
        </head>
        <body>
            ${container.innerHTML}
            
            <script>
                // Wait a tiny bit for the CSS to load, then trigger print, then close
                window.onload = () => {
                    setTimeout(() => {
                        window.print();
                        window.close();
                    }, 250);
                };
            </script>
        </body>
        </html>
    `);
    
    // Close the document to finish loading
    printWindow.document.close();
}