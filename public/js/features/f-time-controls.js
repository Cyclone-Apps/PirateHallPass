// js/features/f-time-controls.js
import { doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { auth, db } from "../firebase-config.js";
import { setDevSpoofTime } from "../modules/time-engine.js";

// ==========================================
// 1. GLOBAL ADMIN TIME OFFSET
// ==========================================
export function initTimeOffsetControls() {
    const offsetInput = document.getElementById("input-time-offset");
    const saveBtn = document.getElementById("btn-save-time-offset");
    
    if (!offsetInput || !saveBtn) return;

    // Listen to Firebase and update the input box
    const docRef = doc(db, "settings", "timeConfig");
    onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            offsetInput.value = docSnap.data().offsetSeconds || 0;
        }
    });

    // Save to Firebase (Removed from admin-settings to live here cleanly)
    saveBtn.addEventListener("click", async () => {
        const newOffset = parseInt(offsetInput.value, 10) || 0;
        saveBtn.innerText = "⏳...";
        try {
            await setDoc(docRef, { offsetSeconds: newOffset }, { merge: true });
            saveBtn.innerText = "✅ Saved";
            setTimeout(() => saveBtn.innerText = "Save", 2000);
        } catch (e) {
            console.error("Error saving time offset:", e);
            saveBtn.innerText = "❌ Error";
        }
    });
}

// ==========================================
// 2. DEVELOPER "TIME MACHINE" SPOOFING
// ==========================================
export function initDevTimeMachine() {
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.email.toLowerCase() !== "website@postville.k12.ia.us") return;

    const bellModalHeaderContainer = document.querySelector("#bell-schedule-modal h2")?.parentElement;
    if (!bellModalHeaderContainer) return;

    // 1. Inject the UI (Now with a Global Checkbox)
    const devBox = document.createElement("div");
    devBox.style.cssText = "background: #ffebee; padding: 8px 12px; border-radius: 6px; border: 1px solid #c62828; display: flex; align-items: center; gap: 10px; margin-top: 10px;";
    
    devBox.innerHTML = `
        <label style="font-weight: bold; font-size: 0.85rem; color: #c62828;">🕵️‍♂️ Time Machine:</label>
        <input type="datetime-local" id="input-dev-spoof-time" style="padding: 5px; border: 1px solid #c62828; border-radius: 4px; font-size: 0.85rem; outline: none;">
        
        <div style="display: flex; align-items: center; gap: 4px; background: rgba(255,255,255,0.7); padding: 4px 8px; border-radius: 4px;">
            <input type="checkbox" id="chk-global-warp" style="cursor: pointer;">
            <label for="chk-global-warp" style="font-size: 0.75rem; color: #c62828; cursor: pointer; font-weight: bold;">Global (All Users)</label>
        </div>

        <button id="btn-dev-spoof-apply" style="padding: 5px 10px; font-size: 0.85rem; background: #c62828; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Warp</button>
        <button id="btn-dev-spoof-reset" style="padding: 5px 10px; font-size: 0.85rem; background: transparent; color: #c62828; border: 1px solid #c62828; border-radius: 4px; cursor: pointer;">Reset</button>
    `;
    
    bellModalHeaderContainer.appendChild(devBox);

    const applyBtn = document.getElementById("btn-dev-spoof-apply");
    const resetBtn = document.getElementById("btn-dev-spoof-reset");
    const spoofInput = document.getElementById("input-dev-spoof-time");
    const globalCheck = document.getElementById("chk-global-warp");

    // 2. Warp Logic
    applyBtn.addEventListener("click", async () => {
        if (!spoofInput.value) return alert("Select a date and time first!");
        
        const targetDate = new Date(spoofInput.value);
        const offsetMs = targetDate.getTime() - new Date().getTime();
        const docRef = doc(db, "settings", "timeConfig"); // Reference established for both paths

        if (globalCheck.checked) {
            // 🌍 GLOBAL WARP: Save to Firebase
            if (confirm("⚠️ WARNING: You are about to time-warp the entire school! Are you sure?")) {
                await setDoc(docRef, { globalSpoofOffsetMs: offsetMs }, { merge: true });
                setDevSpoofTime(null); 
                alert("🌍 GLOBAL Time Machine Active! All screens in the building will now warp.");
            }
        } else {
            // 🕵️‍♂️ LOCAL WARP: Save to Local Storage & CLEAR Global Firebase State
            await setDoc(docRef, { globalSpoofOffsetMs: null }, { merge: true }); 
            setDevSpoofTime(targetDate);
            alert("🕵️‍♂️ Local Sandbox Time Machine Active! Only your browser will reload to the fake time.");
            window.location.reload();
        }
    });

    // 3. Reset Logic (Clears both Local and Global)
    resetBtn.addEventListener("click", async () => {
        // Clear Local
        setDevSpoofTime(null);
        spoofInput.value = "";
        
        // Clear Global
        const docRef = doc(db, "settings", "timeConfig");
        await setDoc(docRef, { globalSpoofOffsetMs: null }, { merge: true });

        alert("⏱️ Real time restored globally and locally. Reloading...");
        window.location.reload();
    });
}