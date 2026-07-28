import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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
    'icon-192.png',
    'icon-512.png',

    // 🎨 CSS STYLES
    'css/components.css',
    'css/states.css',
    'css/student.css',
    'css/style.css',

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
    'js/features/f-edit-pass.js',
    'js/features/f-finalize-pass.js',
    'js/features/f-lockdowns-admin.js',
    'js/features/f-lockdowns-ui.js',
    'js/features/f-lockdowns.js',
    'js/features/f-map-room-settings.js',
    'js/features/f-ota-updater.js',
    'js/features/f-pass-history.js',
    'js/features/f-retro-pass.js',
    'js/features/f-room-names.js',
    'js/features/f-schedule-popup.js',
    'js/features/f-schedule-utils.js',
    'js/features/f-scheduled-pass-engine.js',
    'js/features/f-send-pass.js',
    'js/features/f-staff-rooms.js',
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
    // Get the current user to check for dev access
    const auth = getAuth();
    const userEmail = auth.currentUser ? auth.currentUser.email : "";

    // 1. Inject the HTML Modal if it doesn't exist
    if (!document.getElementById("ota-settings-modal")) {
        
        // Build the dev note & log catcher conditionally for your specific email
        let devNoteHTML = "";
        if (userEmail === "website@postville.k12.ia.us") {
            devNoteHTML = `
                <div style="margin-bottom: 20px; padding: 15px; background: #e3f2fd; border: 1px dashed #1976d2; color: #0d47a1; border-radius: 6px;">
                    <!-- Copy Command Section -->
                    <div id="dev-copy-box" style="cursor: pointer; text-align: center; margin-bottom: 15px; padding: 5px; border-radius: 4px; transition: background 0.2s;">
                        <span style="font-size: 0.9rem;">👋 Dev Reminder: Click to copy publish command</span><br>
                        <strong style="font-size: 1.2rem; font-family: monospace;">node publish.js</strong>
                    </div>
                    
                    <hr style="border: 0; border-top: 1px dashed #90caf9; margin: 10px 0;">
                    
                    <!-- iPad Log Catcher & Retriever Section -->
                    <div style="text-align: left;">
                        <span style="font-size: 0.85rem; font-weight: bold;">🐞 Log Sync Tool</span>
                        <textarea id="dev-log-input" rows="3" style="width: 100%; margin-top: 5px; padding: 8px; border: 1px solid #90caf9; border-radius: 4px; font-family: monospace; font-size: 0.85rem; box-sizing: border-box;" placeholder="Paste Eruda logs here..."></textarea>
                        
                        <div style="display: flex; gap: 8px; margin-top: 8px;">
                            <button id="btn-send-logs" style="flex: 1; padding: 8px; background: #1976d2; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 0.85rem;">
                                📤 Push to DB
                            </button>
                            <button id="btn-fetch-logs" style="flex: 1; padding: 8px; background: #388e3c; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 0.85rem;">
                                📥 Fetch & Copy Logs
                            </button>
                        </div>
                        
                        <div id="log-status" style="font-size: 0.8rem; margin-top: 5px; text-align: center; font-weight: bold; height: 15px;"></div>
                    </div>
                </div>
            `;
        }

        const modalWrapper = document.createElement("div");
        modalWrapper.innerHTML = `
            <div id="ota-settings-modal" class="hidden" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 20px; box-sizing: border-box;">
                <!-- 🚀 FIX: Added max-height: 90vh and overflow-y: auto so the popup scrolls if it gets too tall -->
                <div style="background: white; padding: 30px; border-radius: 8px; width: 100%; max-width: 500px; max-height: 90vh; overflow-y: auto; text-align: left; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #eee; padding-bottom: 10px; margin-bottom: 20px;">
                        <h2 style="margin: 0; color: #333;">⚙️ System Update Settings</h2>
                        <span id="close-ota-modal" style="cursor: pointer; font-size: 1.5rem;">✖</span>
                    </div>
                    
                    <p style="color: #666; font-size: 0.95rem; margin-bottom: 20px;">
                        Use this tool to bypass tablet caching and force the device to download the absolute latest files from the server.
                    </p>

                    ${devNoteHTML}

                    <button id="btn-check-version" style="width: 100%; padding: 12px; background: #1976d2; color: white; border: none; border-radius: 6px; font-size: 1.1rem; font-weight: bold; cursor: pointer; margin-bottom: 15px;">
                        🔍 Check for Updates
                    </button>

                    <div id="version-results" style="display: none; background: #f9f9f9; padding: 15px; border-radius: 6px; border: 1px solid #ddd; margin-bottom: 15px; max-height: 250px; overflow-y: auto;">
                    </div>

                    <!-- 🚀 UTILITY BUTTONS FOR CLEARING CACHE/STORAGE -->
                    <div style="display: flex; gap: 8px; margin-bottom: 15px;">
                        <button id="btn-clear-cache" style="flex: 1; padding: 10px; background: #f57c00; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 0.85rem;">
                            🧹 Clear Cache
                        </button>
                        <button id="btn-clear-local" style="flex: 1; padding: 10px; background: #8e24aa; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 0.85rem;">
                            📦 Clear Local
                        </button>
                        <button id="btn-clear-session" style="flex: 1; padding: 10px; background: #00897b; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 0.85rem;">
                            ⏱️ Clear Session
                        </button>
                    </div>

                    <button id="btn-force-update" style="display: block; width: 100%; padding: 15px; background: #c62828; color: white; border: none; border-radius: 6px; font-size: 1.1rem; font-weight: bold; cursor: pointer;">
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

    // Dev Note Clipboard Listener
    const devCopyBox = document.getElementById("dev-copy-box");
    if (devCopyBox) {
        devCopyBox.addEventListener("click", () => {
            navigator.clipboard.writeText("node publish.js").then(() => {
                const originalHTML = devCopyBox.innerHTML;
                devCopyBox.style.background = "#c8e6c9";
                devCopyBox.style.color = "#2e7d32";
                devCopyBox.innerHTML = `<strong style="font-size: 1.1rem;">✅ Copied to clipboard!</strong>`;
                
                setTimeout(() => {
                    devCopyBox.style.background = "transparent";
                    devCopyBox.style.color = "#0d47a1";
                    devCopyBox.innerHTML = originalHTML;
                }, 2000);
            });
        });
    }

    // Send Logs Listener (For the iPad)
    const btnSendLogs = document.getElementById("btn-send-logs");
    if (btnSendLogs) {
        btnSendLogs.addEventListener("click", async () => {
            const logInput = document.getElementById("dev-log-input");
            const statusText = document.getElementById("log-status");
            
            if (!logInput.value.trim()) {
                statusText.textContent = "⚠️ Please paste something first.";
                statusText.style.color = "#c62828";
                return;
            }
            
            btnSendLogs.textContent = "⏳...";
            try {
                await setDoc(doc(db, "settings", "ipad_logs"), {
                    logs: logInput.value,
                    timestamp: new Date().toLocaleString()
                });
                statusText.textContent = "✅ Saved to Firestore!";
                statusText.style.color = "#2e7d32";
                logInput.value = ""; 
            } catch (error) {
                statusText.textContent = "❌ Error: " + error.message;
                statusText.style.color = "#c62828";
            }
            btnSendLogs.textContent = "📤 Push to DB";
            setTimeout(() => { statusText.textContent = ""; }, 4000);
        });
    }

    // Fetch & Copy Logs Listener (For your Desktop)
    const btnFetchLogs = document.getElementById("btn-fetch-logs");
    if (btnFetchLogs) {
        btnFetchLogs.addEventListener("click", async () => {
            const statusText = document.getElementById("log-status");
            
            btnFetchLogs.textContent = "⏳...";
            try {
                const docSnap = await getDoc(doc(db, "settings", "ipad_logs"));
                if (docSnap.exists() && docSnap.data().logs) {
                    await navigator.clipboard.writeText(docSnap.data().logs);
                    statusText.textContent = `✅ Fetched & Copied! (${docSnap.data().timestamp})`;
                    statusText.style.color = "#2e7d32";
                } else {
                    statusText.textContent = "⚠️ No logs found in DB.";
                    statusText.style.color = "#f57c00";
                }
            } catch (error) {
                statusText.textContent = "❌ Error: " + error.message;
                statusText.style.color = "#c62828";
            }
            btnFetchLogs.textContent = "📥 Fetch & Copy Logs";
            setTimeout(() => { statusText.textContent = ""; }, 4000);
        });
    }

    // Version Check Listener
    const btnCheckVersion = document.getElementById('btn-check-version');
    if (btnCheckVersion) {
        btnCheckVersion.onclick = async () => {
            const resultsDiv = document.getElementById('version-results');
            
            resultsDiv.style.display = 'block';
            resultsDiv.innerHTML = '<p style="text-align: center; color: #666;">⏳ Loading DB dates...</p>';
            
            let comparisonData = [];

            try {
                const docRef = doc(db, "settings", "file_versions");
                const docSnap = await getDoc(docRef);
                const dbVersions = docSnap.exists() ? docSnap.data() : {};

                for (const file of FILES_TO_CHECK) {
                    const response = await fetch(file, { method: 'HEAD', cache: 'no-store' });
                    const localDateStr = response.headers.get('Last-Modified');
                    
                    const dbDate = dbVersions[file] ? new Date(dbVersions[file]) : new Date(0);
                    const localDate = localDateStr ? new Date(localDateStr) : new Date(0);
                    
                    // 🚀 FIX: Round down to the nearest second to prevent millisecond mismatches!
                    const dbTimeSeconds = Math.floor(dbDate.getTime() / 1000);
                    const localTimeSeconds = Math.floor(localDate.getTime() / 1000);
                    const isOutdated = dbTimeSeconds > localTimeSeconds;

                    comparisonData.push({
                        file: file,
                        dbDate: dbDate.getTime() === 0 ? "Not Found" : dbDate.toLocaleString(),
                        localDate: localDate.getTime() === 0 ? "Not Found" : localDate.toLocaleString(),
                        status: isOutdated ? "❌ Stale" : "✅ OK",
                        timestamp: dbDate.getTime(),
                        isOutdated: isOutdated 
                    });
                }

                // Sort by stale status first, THEN by timestamp
                comparisonData.sort((a, b) => {
                    if (a.isOutdated && !b.isOutdated) return -1;
                    if (!a.isOutdated && b.isOutdated) return 1;
                    return b.timestamp - a.timestamp;
                });

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

    // Clear Cache Listener
    const btnClearCache = document.getElementById('btn-clear-cache');
    if (btnClearCache) {
        btnClearCache.onclick = async () => {
            try {
                if ('caches' in window) {
                    const names = await caches.keys();
                    await Promise.all(names.map(name => caches.delete(name)));
                    alert("✅ Cache cleared successfully!");
                } else {
                    alert("⚠️ Cache API not supported in this browser.");
                }
            } catch (error) {
                console.error("Error clearing cache:", error);
                alert("❌ Failed to clear cache.");
            }
        };
    }

    // Clear Local Storage Listener
    const btnClearLocal = document.getElementById('btn-clear-local');
    if (btnClearLocal) {
        btnClearLocal.onclick = () => {
            try {
                localStorage.clear();
                alert("✅ Local Storage cleared successfully!");
            } catch (error) {
                console.error("Error clearing Local Storage:", error);
                alert("❌ Failed to clear Local Storage.");
            }
        };
    }

    // Clear Session Storage Listener
    const btnClearSession = document.getElementById('btn-clear-session');
    if (btnClearSession) {
        btnClearSession.onclick = () => {
            try {
                sessionStorage.clear();
                alert("✅ Session Storage cleared successfully!");
            } catch (error) {
                console.error("Error clearing Session Storage:", error);
                alert("❌ Failed to clear Session Storage.");
            }
        };
    }

    // Force Update Listener
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