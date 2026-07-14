import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../firebase-config.js"; 

// 🛑 EDIT THIS ARRAY to match the files you want the tablet to verify!
const FILES_TO_CHECK = [
    // 📄 ROOT HTML & ASSETS
    'index.html',
    'admin.html',
    'student.html',
    'teacher.html',
    'map.html',
    'reports.html',
    '404.html',
    'logo.png',

    // ⚙️ ROOT JS
    'js/firebase-config.js',
    'js/main-admin.js',
    'js/main-student.js',
    'js/main-teacher.js',
    'js/map.js',

    // 🧩 JS MODULES
    'js/modules/admin-engine.js',
    'js/modules/auth-roles.js',
    'js/modules/create-pass.js',
    'js/modules/map-engine.js',
    'js/modules/pass-engine.js',
    'js/modules/student-ui.js',
    'js/modules/time-engine.js',
    'js/modules/ui-widgets.js',

    // 🚀 JS FEATURES
    'js/features/f-lockdowns-admin.js',
    'js/features/f-lockdowns-ui.js',
    'js/features/f-lockdowns.js',
    'js/features/f-ota-updater.js',
    'js/features/f-pass-history.js',
    'js/features/f-scheduled-pass-engine.js',
    'js/features/f-send-pass.js',
    'js/features/f-staff-roster.js',
    'js/features/f-staff-schedule.js',
    'js/features/f-staff-sync.js',
    'js/features/f-student-management.js',
    'js/features/f-teacher-history.js',
    'js/features/f-time-controls.js',

    // 👑 JS ADMIN
    'js/admin/admin-dashboard.js',
    'js/admin/admin-message.js',
    'js/admin/admin-passes.js',
    'js/admin/admin-restrictions.js',
    'js/admin/admin-settings.js',
    'js/admin/admin-students.js',

    // 📊 JS REPORTS
    'js/reports/r-compare.js',
    'js/reports/r-intersections.js',
    'js/reports/r-select.js',
    'js/reports/r-single.js',
    'js/reports/r-timeframe.js',
    'js/reports/r-utils.js',
    'js/reports/reports-main.js',
    'js/reports/two-students.js'
];

export function initOTAUpdater() {
    // 1. Inject the HTML Modal if it doesn't exist
    if (!document.getElementById("ota-settings-modal")) {
        const modalWrapper = document.createElement("div");
        modalWrapper.innerHTML = `
            <div id="ota-settings-modal" class="hidden" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 9999;">
                <div style="background: white; padding: 30px; border-radius: 8px; width: 90%; max-width: 500px; text-align: left; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #eee; padding-bottom: 10px; margin-bottom: 20px;">
                        <h2 style="margin: 0; color: #333;">⚙️ System Update Settings</h2>
                        <span id="close-ota-modal" style="cursor: pointer; font-size: 1.5rem;">✖</span>
                    </div>
                    
                    <p style="color: #666; font-size: 0.95rem; margin-bottom: 20px;">
                        Use this tool to bypass tablet caching and force the device to download the absolute latest files from the server.
                    </p>

                    <button id="btn-check-version" style="width: 100%; padding: 12px; background: #1976d2; color: white; border: none; border-radius: 6px; font-size: 1.1rem; font-weight: bold; cursor: pointer; margin-bottom: 15px;">
                        🔍 Check for Updates
                    </button>

                    <div id="version-results" style="display: none; background: #f9f9f9; padding: 15px; border-radius: 6px; border: 1px solid #ddd; margin-bottom: 15px; max-height: 250px; overflow-y: auto;">
                        </div>

                    <button id="btn-force-update" style="display: block; margin-top: 15px; width: 100%; padding: 15px; background: #c62828; color: white; border: none; border-radius: 6px; font-size: 1.1rem; font-weight: bold; cursor: pointer;">
                        ⚠️ Force Hard Update & Reload
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modalWrapper);
    }

    // 2. Attach Listeners
    document.getElementById("close-ota-modal").addEventListener("click", () => {
        document.getElementById("ota-settings-modal").classList.add("hidden");
    });

    const btnCheckVersion = document.getElementById('btn-check-version');
    if (btnCheckVersion) {
        btnCheckVersion.onclick = async () => {
            const resultsDiv = document.getElementById('version-results');
            const updateBtn = document.getElementById('btn-force-update');
            
            resultsDiv.style.display = 'block';
            resultsDiv.innerHTML = '<p style="text-align: center; color: #666;">⏳ Loading DB dates...</p>';
            
            let requiresUpdate = false;
            let comparisonData = [];

            try {
                // Fetch DB Truth
                const docRef = doc(db, "settings", "file_versions");
                const docSnap = await getDoc(docRef);
                const dbVersions = docSnap.exists() ? docSnap.data() : {};

                // Compare each file
                for (const file of FILES_TO_CHECK) {
                    const response = await fetch(file, { method: 'HEAD', cache: 'no-store' });
                    const localDateStr = response.headers.get('Last-Modified');
                    
                    const dbDate = dbVersions[file] ? new Date(dbVersions[file]) : new Date(0);
                    const localDate = localDateStr ? new Date(localDateStr) : new Date(0);
                    
                    const isOutdated = dbDate.getTime() > localDate.getTime();
                    if (isOutdated) requiresUpdate = true;

                    comparisonData.push({
                        file: file,
                        dbDate: dbDate.getTime() === 0 ? "Not Found" : dbDate.toLocaleString(),
                        localDate: localDate.getTime() === 0 ? "Not Found" : localDate.toLocaleString(),
                        status: isOutdated ? "❌ Stale" : "✅ OK",
                        timestamp: dbDate.getTime()
                    });
                }

                // Sort descending by DB Date
                comparisonData.sort((a, b) => b.timestamp - a.timestamp);

                // Build Table
                let tableHTML = `<table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
                    <tr style="border-bottom: 2px solid #ccc; background-color: #f1f1f1;">
                        <th style="padding: 8px;">File</th>
                        <th style="padding: 8px;">Status</th>
                    </tr>`;
                
                comparisonData.forEach(row => {
                    tableHTML += `<tr style="border-bottom: 1px solid #eee;">
                        <td style="padding: 10px 4px;">
                            <b style="font-size: 14px; color: #222;">${row.file}</b><br>
                            <span style="color:#555; font-size:11px; display:inline-block; margin-top:4px; line-height: 1.4;">
                                <strong>DB:</strong> ${row.dbDate}<br>
                                <strong>Local:</strong> ${row.localDate}
                            </span>
                        </td>
                        <td style="padding: 10px 4px; font-weight: bold; white-space: nowrap;">${row.status}</td>
                    </tr>`;
                });
                tableHTML += `</table>`;
                
                resultsDiv.innerHTML = tableHTML;

            } catch (err) {
                resultsDiv.innerHTML = `<p style="color:red; font-weight: bold;">Error: ${err.message}</p>`;
            }
        };
    }

    const btnForceUpdate = document.getElementById('btn-force-update');
    if (btnForceUpdate) {
        btnForceUpdate.onclick = async () => {
            btnForceUpdate.textContent = "⏳ Updating App...";
            btnForceUpdate.style.opacity = "0.7";
            
            try {
                if ('caches' in window) {
                    const names = await caches.keys();
                    await Promise.all(names.map(name => caches.delete(name)));
                }

                if ('serviceWorker' in navigator) {
                    const registrations = await navigator.serviceWorker.getRegistrations();
                    for (let registration of registrations) {
                        await registration.unregister();
                    }
                }

                if (typeof FILES_TO_CHECK !== 'undefined') {
                    await Promise.all(FILES_TO_CHECK.map(file => 
                        fetch(file, { cache: 'reload' }).catch(e => console.warn(`Could not force fetch ${file}`))
                    ));
                }
            } catch (error) {
                console.error("Error clearing caches:", error);
            }

            setTimeout(() => {
                window.location.reload(true); 
            }, 500);
        };
    }
}

// Helper to open the modal
export function openOTAModal() {
    const modal = document.getElementById("ota-settings-modal");
    if (modal) {
        modal.classList.remove("hidden");
    } else {
        alert("Settings not initialized yet.");
    }
}