// two-students.js

// DOM Elements
const runReportBtn = document.getElementById('runReportBtn');
const timelineOutput = document.getElementById('timelineOutput');
const student1Input = document.getElementById('student1Email');
const student2Input = document.getElementById('student2Email');

// Event Listener
runReportBtn.addEventListener('click', async () => {
    const s1 = student1Input.value.trim();
    const s2 = student2Input.value.trim();

    if (!s1 || !s2) {
        alert("Please enter both student emails.");
        return;
    }

    timelineOutput.innerHTML = "<p style='text-align:center;'>Loading data...</p>";

    // Fetch data (will be replaced with actual Firestore queries later)
    const passData = await fetchMockPassData(s1, s2);
    
    // Render the timeline
    renderTimeline(passData, s1, s2);
});

/**
 * Renders the timeline UI grouped by day in reverse chronological order
 */
function renderTimeline(data, student1Email, student2Email) {
    timelineOutput.innerHTML = ''; // Clear previous

    if (data.length === 0) {
        timelineOutput.innerHTML = "<p style='text-align:center;'>No passes found for this date range.</p>";
        return;
    }

    // Group data by date (Assuming data is already sorted newest to oldest)
    const groupedData = data.reduce((acc, pass) => {
        if (!acc[pass.date]) {
            acc[pass.date] = [];
        }
        acc[pass.date].push(pass);
        return acc;
    }, {});

    // Build the DOM elements
    for (const [date, passes] of Object.entries(groupedData)) {
        // 1. Create Day Header
        const dayHeader = document.createElement('div');
        dayHeader.className = 'timeline-day-header';
        dayHeader.textContent = date;
        timelineOutput.appendChild(dayHeader);

        // 2. Create rows for each pass that day
        passes.forEach(pass => {
            const row = document.createElement('div');
            row.className = 'timeline-row';

            const leftCol = document.createElement('div');
            leftCol.className = 'timeline-col col-left';
            
            const rightCol = document.createElement('div');
            rightCol.className = 'timeline-col col-right';

            const card = document.createElement('div');
            card.innerHTML = `
                <div class="pass-time">${pass.time}</div>
                <div>${pass.destination}</div>
            `;

            // Assign to left (Student 1) or right (Student 2) column
            if (pass.studentEmail === student1Email) {
                card.className = 'pass-card student1';
                leftCol.appendChild(card);
            } else {
                card.className = 'pass-card student2';
                rightCol.appendChild(card);
            }

            row.appendChild(leftCol);
            row.appendChild(rightCol);
            timelineOutput.appendChild(row);
        });
    }
}

/**
 * MOCK DATA FUNCTION 
 * (We will replace this with your Firestore queries once the pass structure is defined)
 */
async function fetchMockPassData(s1, s2) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve([
                { id: '1', date: 'Oct 24, 2024', time: '2:15 PM', studentEmail: s1, destination: 'Restroom' },
                { id: '2', date: 'Oct 24, 2024', time: '2:10 PM', studentEmail: s2, destination: 'Library' },
                { id: '3', date: 'Oct 23, 2024', time: '10:05 AM', studentEmail: s2, destination: 'Main Office' },
                { id: '4', date: 'Oct 23, 2024', time: '10:02 AM', studentEmail: s1, destination: 'Nurse' },
                { id: '5', date: 'Oct 22, 2024', time: '8:45 AM', studentEmail: s1, destination: 'Restroom' }
            ]);
        }, 500);
    });
}