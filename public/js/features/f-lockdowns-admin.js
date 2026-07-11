import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../firebase-config.js"; 
import { triggerEmergencyToggle } from "./f-lockdowns.js";

// ==========================================
// 1. INJECT EMERGENCY MODAL HTML
// ==========================================
export function injectEmergencyControlsModal() {
    if (document.getElementById("emergency-modal")) return;

    const modalWrapper = document.createElement("div");
    
    modalWrapper.innerHTML = `
        <!-- 🚨 MAIN EMERGENCY CONTROLS MODAL -->
        <div id="emergency-modal" class="hidden" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 1100;">
            <div style="background: white; padding: 30px; border-radius: 8px; width: 95%; max-width: 500px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
                
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #eee; padding-bottom: 10px; margin-bottom: 20px;">
                    <h2 style="margin: 0; color: var(--pirate-red);">🚨 Emergency Controls</h2>
                    <span id="close-emergency-modal" style="cursor: pointer; font-size: 1.5rem;">✖</span>
                </div>

                <div id="emergency-status-box" style="margin-bottom: 25px; padding: 20px; border-radius: 8px; background: #e8f5e9; border: 2px solid #4caf50;">
                    <h3 id="emergency-status-title" style="margin: 0; color: #2e7d32;">✅ No Current System Restrictions</h3>
                    <p id="emergency-status-msg" style="font-size: 0.95rem; color: #444; margin-top: 8px;">The building is operating normally.</p>
                </div>

                <div style="display: flex; flex-direction: column; gap: 15px;">
                    <div style="text-align: left; background: #f9f9f9; padding: 12px; border-radius: 6px; border: 1px solid #ddd;">
                        <span style="font-size: 0.85rem; color: #666; display: block; margin-bottom: 12px; line-height: 1.4;">
                            ℹ️ <strong>Quiet Lockdown:</strong> Only hides menus/schedules on teacher interfaces.<br>
                            ⚠️ <strong>Loud Lockdown:</strong> Forces full-screen alert overrides on both student kiosks and teacher boards.
                        </span>
                        
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            <!-- Quiet Lockdown Row -->
                            <div style="display: flex; gap: 8px; width: 100%;">
                                <button id="btn-toggle-quiet-lockdown" class="danger-btn" style="flex-grow: 1; padding: 15px; font-size: 1.1rem; border-radius: 6px; cursor: pointer; background: #616161; border: none; color: white;">
                                    🤫 Quiet Lock Down All Rooms
                                </button>
                                <button id="btn-settings-quiet" style="padding: 0 15px; font-size: 1.2rem; border-radius: 6px; cursor: pointer; background: #e0e0e0; border: 1px solid #ccc; color: #333;" title="Quiet Lockdown Settings">⚙️</button>
                            </div>
                            
                            <!-- Loud Lockdown Row -->
                            <div style="display: flex; gap: 8px; width: 100%;">
                                <button id="btn-toggle-loud-lockdown" class="danger-btn" style="flex-grow: 1; padding: 15px; font-size: 1.1rem; font-weight: bold; border-radius: 6px; cursor: pointer; background: var(--pirate-red); border: none; color: white;">
                                    🚨 Loud Lock Down All Rooms
                                </button>
                                <button id="btn-settings-loud" style="padding: 0 15px; font-size: 1.2rem; border-radius: 6px; cursor: pointer; background: #e0e0e0; border: 1px solid #ccc; color: #333;" title="Loud Lockdown Settings">⚙️</button>
                            </div>
                        </div>
                    </div>

                    <button id="btn-modify-area-lockdown" class="secondary-btn" style="padding: 15px; font-size: 1.2rem; font-weight: bold; width: 100%; border: 2px solid #f57f17; color: #f57f17; border-radius: 6px; background: #fffde7; cursor: pointer;">
                        🗺️ Lock Down by Area
                    </button>
                </div>
            </div>
        </div>

        <!-- ⚙️ LOCKDOWN SETTINGS MODAL -->
        <div id="lockdown-settings-modal" class="hidden" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 1200;">
            <div style="background: white; padding: 30px; border-radius: 8px; width: 95%; max-width: 550px; text-align: left; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #eee; padding-bottom: 10px; margin-bottom: 20px;">
                    <h2 id="lockdown-settings-title" style="margin: 0; color: #333;">⚙️ Lockdown Settings</h2>
                    <span id="close-lockdown-settings" style="cursor: pointer; font-size: 1.5rem;">✖</span>
                </div>

                <input type="hidden" id="input-lockdown-type" value="">

                <div style="margin-bottom: 20px;">
                    <label style="display: block; font-weight: bold; margin-bottom: 5px; color: #555;">👨‍🏫 Teacher Message Center</label>
                    <div style="display: flex; gap: 10px;">
                        <div style="flex: 1;">
                            <label style="font-size: 0.8rem; color: #777; display: block; margin-bottom: 3px;">Blinking Intro</label>
                            <input type="text" id="input-teacher-intro" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #ccc; font-family: inherit;" placeholder="🚨 LOCKDOWN 🚨">
                        </div>
                        <div style="flex: 2;">
                            <label style="font-size: 0.8rem; color: #777; display: block; margin-bottom: 3px;">Standard Message</label>
                            <textarea id="input-teacher-msg" rows="2" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #ccc; font-family: inherit; resize: vertical;" placeholder="- Do NOT let students leave..."></textarea>
                        </div>
                    </div>
                </div>

                <div style="margin-bottom: 25px;">
                    <label style="display: flex; align-items: center; gap: 8px; font-weight: bold; margin-bottom: 5px; color: #555;">
                        🎓 Student Message Center
                    </label>
                    
                    <div id="quiet-student-toggle-box" class="hidden" style="margin-bottom: 10px; display: flex; align-items: center; gap: 8px; background: #f1f1f1; padding: 8px 12px; border-radius: 6px;">
                        <input type="checkbox" id="toggle-student-msg-visibility" style="width: 18px; height: 18px; cursor: pointer;">
                        <label for="toggle-student-msg-visibility" style="font-size: 0.95rem; color: #444; cursor: pointer; margin: 0;">Show message on Student Kiosks</label>
                    </div>

                    <div style="display: flex; gap: 10px;">
                        <div style="flex: 1;">
                            <label style="font-size: 0.8rem; color: #777; display: block; margin-bottom: 3px;">Blinking Intro</label>
                            <input type="text" id="input-student-intro" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #ccc; font-family: inherit;" placeholder="🚨 EMERGENCY 🚨">
                        </div>
                        <div style="flex: 2;">
                            <label style="font-size: 0.8rem; color: #777; display: block; margin-bottom: 3px;">Standard Message</label>
                            <textarea id="input-student-msg" rows="2" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #ccc; font-family: inherit; resize: vertical;" placeholder="Stay in your classroom..."></textarea>
                        </div>
                    </div>
                </div>

                <button id="btn-save-lockdown-settings" style="padding: 15px; font-size: 1.1rem; font-weight: bold; width: 100%; border-radius: 6px; cursor: pointer; background: #2e7d32; border: none; color: white;">
                    💾 Save Configurations
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modalWrapper);

    // Call existing listeners if they exist
    if (typeof initLockdownAdminListeners === "function") {
        initLockdownAdminListeners();
    }
    
    // Call our NEW settings listeners
    initLockdownSettingsListeners();
}

// ==========================================
// 2. MAIN ADMIN TOGGLES (Loud/Quiet/Close)
// ==========================================
export function initLockdownAdminListeners() {
    // Modal Close
    document.getElementById("close-emergency-modal")?.addEventListener("click", () => {
        document.getElementById("emergency-modal")?.classList.add("hidden");
    });

    // Toggle Buttons
    document.getElementById("btn-toggle-quiet-lockdown")?.addEventListener("click", () => toggleLockdown("quiet"));
    document.getElementById("btn-toggle-loud-lockdown")?.addEventListener("click", () => toggleLockdown("loud"));
}

// ==========================================
// 3. LOCKDOWN SETTINGS LOGIC (Save & Load)
// ==========================================
export function initLockdownSettingsListeners() {
    
    // 🔍 HELPER: Fetch data from Firebase and fill the inputs
    async function loadSettingsIntoModal(type) {
        const tIntro = document.getElementById("input-teacher-intro");
        const tMsg = document.getElementById("input-teacher-msg");
        const sIntro = document.getElementById("input-student-intro");
        const sMsg = document.getElementById("input-student-msg");
        const sToggle = document.getElementById("toggle-student-msg-visibility");

        tIntro.value = "Loading..."; tMsg.value = "Loading...";
        sIntro.value = "Loading..."; sMsg.value = "Loading...";

        try {
            const emergencyRef = doc(db, "settings", "emergencyState");
            const snap = await getDoc(emergencyRef);
            const data = snap.exists() ? snap.data() : {};

            if (type === "loud") {
                tIntro.value = data.loudTeacherIntro || "";
                tMsg.value = data.loudTeacherMsg || "";
                sIntro.value = data.loudStudentIntro || "";
                sMsg.value = data.loudStudentMsg || "";
            } else if (type === "quiet") {
                tIntro.value = data.quietTeacherIntro || "";
                tMsg.value = data.quietTeacherMsg || "";
                sIntro.value = data.quietStudentIntro || "";
                sMsg.value = data.quietStudentMsg || "";
                sToggle.checked = data.quietShowToStudents === true;
            }
        } catch (error) {
            console.error("Error loading lockdown settings:", error);
            tIntro.value = ""; tMsg.value = "";
            sIntro.value = ""; sMsg.value = "";
        }
    }

    // OPEN: Quiet Settings
    document.getElementById("btn-settings-quiet")?.addEventListener("click", () => {
        document.getElementById("lockdown-settings-title").innerText = "🤫 Quiet Lockdown Settings";
        document.getElementById("input-lockdown-type").value = "quiet";
        
        document.getElementById("quiet-student-toggle-box").classList.remove("hidden");
        document.getElementById("lockdown-settings-modal").classList.remove("hidden");
        
        // Fetch and load the quiet settings
        loadSettingsIntoModal("quiet");
    });

    // OPEN: Loud Settings
    document.getElementById("btn-settings-loud")?.addEventListener("click", () => {
        document.getElementById("lockdown-settings-title").innerText = "🚨 Loud Lockdown Settings";
        document.getElementById("input-lockdown-type").value = "loud";
        
        document.getElementById("quiet-student-toggle-box").classList.add("hidden");
        document.getElementById("lockdown-settings-modal").classList.remove("hidden");
        
        // Fetch and load the loud settings
        loadSettingsIntoModal("loud");
    });

    // CLOSE: Settings Modal
    document.getElementById("close-lockdown-settings")?.addEventListener("click", () => {
        document.getElementById("lockdown-settings-modal").classList.add("hidden");
    });

    // SAVE: Capture Configurations
    document.getElementById("btn-save-lockdown-settings")?.addEventListener("click", async () => {
        const type = document.getElementById("input-lockdown-type").value;
        const tIntro = document.getElementById("input-teacher-intro").value;
        const tMsg = document.getElementById("input-teacher-msg").value;
        const sIntro = document.getElementById("input-student-intro").value;
        const sMsg = document.getElementById("input-student-msg").value;
        const showToStudents = document.getElementById("toggle-student-msg-visibility").checked;

        const saveBtn = document.getElementById("btn-save-lockdown-settings");
        const originalText = saveBtn.innerText;
        saveBtn.innerText = "⏳ Saving..."; saveBtn.disabled = true;

        try {
            const emergencyRef = doc(db, "settings", "emergencyState");
            
            let updatePayload = {};
            if (type === "loud") {
                updatePayload = {
                    loudTeacherIntro: tIntro,
                    loudTeacherMsg: tMsg,
                    loudStudentIntro: sIntro,
                    loudStudentMsg: sMsg
                };
            } else if (type === "quiet") {
                updatePayload = {
                    quietTeacherIntro: tIntro,
                    quietTeacherMsg: tMsg,
                    quietStudentIntro: sIntro,
                    quietStudentMsg: sMsg,
                    quietShowToStudents: showToStudents
                };
            }

            await updateDoc(emergencyRef, updatePayload);
            console.log(`✅ Successfully saved ${type} settings to Firebase!`);
            document.getElementById("lockdown-settings-modal").classList.add("hidden");
            
        } catch (error) {
            console.error("Error saving settings: ", error);
            alert("Failed to save. Check console for details.");
        } finally {
            saveBtn.innerText = originalText; saveBtn.disabled = false;
        }
    });
}