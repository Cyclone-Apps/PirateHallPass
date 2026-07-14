// public/js/features/f-staff-roster.js
import { db } from "../firebase-config.js";
import { collection, doc, setDoc, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Keep a local copy of the staff list available for other modules
export let activeStaffList = [];

export function initStaffRoster() {
    listenToTeacherRoster();
    bindRosterEvents();
}

function bindRosterEvents() {
    // 1. Modal Toggles
    document.addEventListener("click", async (e) => {
        if (e.target.closest("#btn-open-teacher-management")) {
            document.getElementById("teacher-management-modal")?.classList.remove("hidden");
        }
        if (e.target.id === "close-teacher-management-modal") {
            document.getElementById("teacher-management-modal")?.classList.add("hidden");
        }
        if (e.target.id === "btn-open-add-teacher") {
            document.getElementById("add-teacher-modal")?.classList.remove("hidden");
        }
        if (e.target.id === "btn-cancel-new-teacher" || e.target.id === "close-add-teacher-modal") {
            document.getElementById("add-teacher-modal")?.classList.add("hidden");
        }

        // 2. Add New Teacher Manually
        if (e.target.id === "btn-save-new-teacher") {
            const name = document.getElementById("new-teacher-name").value.trim();
            const email = document.getElementById("new-teacher-email").value.trim().toLowerCase();
            if (!name || !email) return alert("Please fill out both Name and Email.");
            
            e.target.innerText = "Saving...";
            try {
                await setDoc(doc(db, "users", email), { displayName: name, email: email, role: "teacher" }, { merge: true });
                document.getElementById("new-teacher-name").value = "";
                document.getElementById("new-teacher-email").value = "";
                document.getElementById("add-teacher-modal")?.classList.add("hidden");
                alert("Teacher successfully added to the database!");
            } catch (err) { alert("Error adding teacher."); }
            e.target.innerText = "Save Teacher";
        }

        // 3. Lunch Pill Toggles
        if (e.target.classList.contains("lunch-option")) {
            const pill = e.target.closest(".teacher-lunch-pill");
            const teacherId = pill.dataset.id;
            let selectedLunch = e.target.dataset.value; 
            
            if (pill.dataset.lunch === selectedLunch) selectedLunch = "none";
            setDoc(doc(db, "users", teacherId), { lunch: selectedLunch }, { merge: true });
        }        
    });

    // 4. Live Search & Inputs
    const searchInput = document.getElementById("input-search-teachers");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            const term = e.target.value.toLowerCase();
            document.querySelectorAll(".staff-roster-row").forEach(row => {
                const rowText = Array.from(row.querySelectorAll("input, select, td")).map(el => el.value || el.innerText).join(" ").toLowerCase();
                row.style.display = rowText.includes(term) ? "" : "none";
            });
        });
    }

    const tbodyElement = document.getElementById("teacher-roster-table-body");
    if (tbodyElement) {
        tbodyElement.addEventListener("change", async (e) => {
            
            // --- Admin Toggle Logic ---
            if (e.target.classList.contains("teacher-admin-toggle")) {
                const docId = e.target.closest("tr").dataset.uid; 
                const grantAdmin = e.target.checked;
                
                if (!docId) {
                    alert("Error: Cannot update role. Document ID missing.");
                    e.target.checked = !grantAdmin; 
                    return;
                }

                try {
                    await setDoc(doc(db, "users", docId), { role: grantAdmin ? "admin" : "teacher" }, { merge: true });
                } catch (err) {
                    e.target.checked = !grantAdmin; 
                }
            }

            // --- Title Edit Logic ---
            if (e.target.classList.contains("teacher-title-select")) {
                const uid = e.target.getAttribute("data-uid");
                const newTitle = e.target.value;
                
                e.target.style.borderColor = "#0277bd";
                try {
                    await setDoc(doc(db, "users", uid), { title: newTitle }, { merge: true });
                    e.target.style.borderColor = "green";
                } catch (err) { e.target.style.borderColor = "red"; }
            }

            // --- First Name Edit Logic ---
            if (e.target.classList.contains("teacher-fname-input")) {
                const uid = e.target.getAttribute("data-uid");
                const newFName = e.target.value.trim();
                const row = e.target.closest("tr");
                const currentLName = row.querySelector(".teacher-lname-input").value.trim();
                
                e.target.style.borderColor = "#0277bd";
                try {
                    await setDoc(doc(db, "users", uid), { 
                        firstName: newFName,
                        displayName: `${newFName} ${currentLName}`.trim(),
                        manualNameOverride: true
                    }, { merge: true });
                    e.target.style.borderColor = "green";
                } catch (err) { e.target.style.borderColor = "red"; }
            }

            // --- Last Name Edit Logic ---
            if (e.target.classList.contains("teacher-lname-input")) {
                const uid = e.target.getAttribute("data-uid");
                const newLName = e.target.value.trim();
                const row = e.target.closest("tr");
                const currentFName = row.querySelector(".teacher-fname-input").value.trim();
                
                e.target.style.borderColor = "#0277bd";
                try {
                    await setDoc(doc(db, "users", uid), { 
                        lastName: newLName,
                        displayName: `${currentFName} ${newLName}`.trim(),
                        manualNameOverride: true
                    }, { merge: true });
                    e.target.style.borderColor = "green";
                } catch (err) { e.target.style.borderColor = "red"; }
            }

            // --- Map Name Edit Logic ---
            if (e.target.classList.contains("teacher-map-name-input")) {
                const uid = e.target.getAttribute("data-uid");
                const newMapName = e.target.value.trim();
                
                e.target.style.borderColor = "#0277bd";
                try {
                    await setDoc(doc(db, "users", uid), { mapName: newMapName }, { merge: true });
                    e.target.style.borderColor = "green"; 
                } catch (err) { e.target.style.borderColor = "red"; }
            }
        });
    }
}

// ==========================================
// 📋 1. LIVE TEACHER ROSTER UI
// ==========================================
function listenToTeacherRoster() {
    const tbody = document.getElementById("teacher-roster-table-body");
    if (!tbody) return;

    const tableElement = tbody.closest("table");
    if (tableElement && !document.getElementById("btn-open-add-teacher")) {
        tableElement.insertAdjacentHTML('beforebegin', `
            <div style="display: flex; justify-content: flex-end; margin-bottom: 15px;">
                <button id="btn-open-add-teacher" style="background: #0277bd; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-weight: bold; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">
                    ➕ Manually Add Teacher
                </button>
            </div>
        `);
    }

    const q = query(collection(db, "users"), where("role", "in", ["teacher", "admin"]));
    
    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="7" style="padding: 20px; text-align: center; color: #888;">No staff records found.</td></tr>';
            return;
        }

        activeStaffList = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            data.id = docSnap.id; 
            activeStaffList.push(data);
        });

        let html = "";
        let datalistHTML = ""; 

        activeStaffList.forEach(data => {
            const firstName = data.firstName || "";
            const lastName = data.lastName || "";
            const email = data.email || data.id;
            const isAdmin = data.role === "admin";
            const lunchShift = data.lunch || "none";
            const isA = lunchShift === "A";
            const isB = lunchShift === "B";
            
            const mapName = data.mapName || lastName || "";
            let currentTitle = data.title || "";

            datalistHTML += `<option value="${data.displayName || firstName}">`;

            const fnameInput = `<input type="text" class="teacher-fname-input" data-uid="${data.id}" value="${firstName}" style="padding: 6px; border-radius: 4px; border: 1px solid #ccc; width: 100%; max-width: 120px; outline: none;" />`;
            const lnameInput = `<input type="text" class="teacher-lname-input" data-uid="${data.id}" value="${lastName}" style="padding: 6px; border-radius: 4px; border: 1px solid #ccc; width: 100%; max-width: 120px; outline: none;" />`;

            // Title Dropdown
            const titleOptions = ["", "Mr.", "Mrs.", "Ms.", "Miss.", "Dr.", "Coach"];
            let titleDropdown = `<select class="teacher-title-select" data-uid="${data.id}" style="padding: 6px; border-radius: 4px; border: 1px solid #ccc; width: 100%; max-width: 80px; outline: none; text-align: center;">`;
            titleOptions.forEach(opt => {
                titleDropdown += `<option value="${opt}" ${currentTitle === opt ? "selected" : ""}>${opt === "" ? "--" : opt}</option>`;
            });
            titleDropdown += `</select>`;

            const mapNameInput = `<input type="text" class="teacher-map-name-input" data-uid="${data.id}" value="${mapName}" placeholder="e.g. Smith" style="padding: 6px; border-radius: 4px; border: 1px solid #ccc; width: 100%; max-width: 100px; text-align: center; outline: none;" />`;

            const checkboxHTML = `<div style="text-align: center;"><input type="checkbox" class="teacher-admin-toggle" data-email="${email}" ${isAdmin ? "checked" : ""} style="width: 18px; height: 18px; cursor: pointer;" /></div>`;

            const lunchHTML = `
                <div style="text-align: center;">
                    <div class="teacher-lunch-pill" data-id="${data.id}" data-lunch="${lunchShift}" style="display: inline-flex; border-radius: 20px; overflow: hidden; border: 1px solid #ccc; cursor: pointer; user-select: none; font-size: 0.9rem;">
                        <div class="lunch-option" data-value="A" style="padding: 6px 16px; background: ${isA ? '#c62828' : '#f8f9fa'}; color: ${isA ? 'white' : '#444'}; font-weight: bold; transition: 0.2s;">A</div>
                        <div class="lunch-option" data-value="B" style="padding: 6px 16px; background: ${isB ? '#c62828' : '#f8f9fa'}; color: ${isB ? 'white' : '#444'}; font-weight: bold; border-left: 1px solid #ccc; transition: 0.2s;">B</div>
                    </div>
                </div>
            `;

           html += `
                <tr class="staff-roster-row" data-uid="${data.id}" style="border-bottom: 1px solid #eee; transition: background 0.2s;" onmouseover="this.style.background='#f9f9f9'" onmouseout="this.style.background='white'">
                    <td style="padding: 12px;">${fnameInput}</td>
                    <td style="padding: 12px;">${lnameInput}</td>
                    <td style="padding: 12px; color: #666; font-size: 0.9rem;">${email}</td>
                    <td style="padding: 12px; text-align: center;">${titleDropdown}</td>
                    <td style="padding: 12px; text-align: center;">${mapNameInput}</td>
                    <td style="padding: 12px;">${checkboxHTML}</td>
                    <td style="padding: 12px;">${lunchHTML}</td>
                </tr>
            `;
        });
        
        tbody.innerHTML = html;
        const datalist = document.getElementById("staff-list-options");
        if (datalist) datalist.innerHTML = datalistHTML;
    });
}