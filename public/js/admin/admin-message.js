// /js/admin/admin-message.js

// 👇 We added query, where, onSnapshot, deleteDoc, and doc to this list
import { collection, addDoc, serverTimestamp, query, where, onSnapshot, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../firebase-config.js";

// 🟢 Global state to hold our user list for the dropdowns
let availableUsers = [];

// 🟢 Initializes the Message Center
export function initMessageCenter(usersFromDatabase) {
    availableUsers = usersFromDatabase; // Store users passed from your main script
    
    // Use Event Delegation to catch the button click even if it was added late
    document.body.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'btn-send-message') {
            openMessageModal();
        }
    });
}

// 🟢 Builds and opens the Message Modal
export function openMessageModal() {
    // Check if modal already exists to prevent duplicates
    let modal = document.getElementById('admin-message-modal');
    
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'admin-message-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 9999;';
        
        modal.innerHTML = `
            <div style="background: white; width: 600px; max-width: 90%; max-height: 90vh; overflow-y: auto; border-radius: 8px; padding: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
                <h2 style="margin-top: 0; color: #1a1a1a; border-bottom: 2px solid var(--pirate-silver); padding-bottom: 10px;">✉️ Send a Message</h2>
                
                <label style="font-weight: bold; display: block; margin-top: 15px;">Send To:</label>
                <select id="msg-audience-type" style="width: 100%; padding: 8px; margin-top: 5px; border-radius: 4px; border: 1px solid #ccc;">
                    <option value="everyone">Everyone (All Students & Teachers)</option>
                    <option value="teachers">All Teachers</option>
                    <option value="grades">Specific Grade Level(s)</option>
                    <option value="specific-students">Specific Student(s)</option>
                    <option value="specific-teachers">Specific Teacher(s)</option>
                </select>

                <div id="msg-grades-container" style="display: none; margin-top: 10px; padding: 10px; background: #f8f9fa; border: 1px solid #ddd; border-radius: 4px;">
                    <label style="margin-right: 15px;"><input type="checkbox" value="7"> 7th Grade</label>
                    <label style="margin-right: 15px;"><input type="checkbox" value="8"> 8th Grade</label>
                    <label style="margin-right: 15px;"><input type="checkbox" value="9"> 9th Grade</label>
                    <label style="margin-right: 15px;"><input type="checkbox" value="10"> 10th Grade</label>
                    <label style="margin-right: 15px;"><input type="checkbox" value="11"> 11th Grade</label>
                    <label style="margin-right: 15px;"><input type="checkbox" value="12"> 12th Grade</label>
                </div>

                <div id="msg-specific-students-container" style="display: none; margin-top: 10px; padding: 10px; background: #f8f9fa; border: 1px solid #ddd; border-radius: 4px;">
                    <label style="font-size: 0.9rem; margin-bottom: 5px; display: block; font-weight: bold;">Search & Select Student:</label>
                    <div style="display: flex; gap: 5px;">
                        <input type="text" id="specific-student-search" list="students-datalist" placeholder="Type student name or email..." style="flex: 1; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                        <datalist id="students-datalist"></datalist>
                        <button id="btn-add-specific-student" style="padding: 8px 15px; background: var(--pirate-silver); color: black; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Add</button>
                    </div>
                    <div id="selected-students-list" style="margin-top: 10px; display: flex; flex-wrap: wrap; gap: 5px;"></div>
                </div>

                <div id="msg-specific-teachers-container" style="display: none; margin-top: 10px; padding: 10px; background: #f8f9fa; border: 1px solid #ddd; border-radius: 4px;">
                    <label style="font-size: 0.9rem; margin-bottom: 5px; display: block; font-weight: bold;">Search & Select Teacher:</label>
                    <div style="display: flex; gap: 5px;">
                        <input type="text" id="specific-teacher-search" list="teachers-datalist" placeholder="Type teacher name or email..." style="flex: 1; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                        <datalist id="teachers-datalist"></datalist>
                        <button id="btn-add-specific-teacher" style="padding: 8px 15px; background: var(--pirate-silver); color: black; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Add</button>
                    </div>
                    <div id="selected-teachers-list" style="margin-top: 10px; display: flex; flex-wrap: wrap; gap: 5px;"></div>
                </div>

                <label style="font-weight: bold; display: block; margin-top: 15px;">Message:</label>
                <textarea id="msg-body" rows="3" style="width: 100%; padding: 8px; margin-top: 5px; border-radius: 4px; border: 1px solid #ccc; resize: vertical;" placeholder="Type your announcement here..."></textarea>
                
                <input type="url" id="msg-link" placeholder="Optional: Paste a link here (e.g., https://...)" style="width: 100%; padding: 8px; margin-top: 10px; border-radius: 4px; border: 1px solid #ccc;">
                
                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
                    <button id="btn-close-msg" style="padding: 8px 15px; background: #ccc; border: none; border-radius: 4px; cursor: pointer;">Cancel</button>
                    <button id="btn-submit-msg" style="padding: 8px 15px; background: var(--pirate-red); color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Send Message</button>
                </div>

                <h3 style="margin-top: 30px; border-bottom: 1px solid #ddd; padding-bottom: 5px; font-size: 1.1rem;">Manage Active Messages</h3>
                <div id="admin-past-messages-list" style="max-height: 250px; overflow-y: auto; background: #f8f9fa; padding: 10px; border-radius: 4px; border: 1px solid #ddd; margin-bottom: 10px;">
                    <p style="color: #888; font-style: italic;">Loading active messages...</p>
                </div>

            </div>
        `;
        document.body.appendChild(modal);

        // Event Listeners for the Modal
        document.getElementById('btn-close-msg').addEventListener('click', () => modal.remove());
        
        const audienceSelect = document.getElementById('msg-audience-type');
        audienceSelect.addEventListener('change', handleAudienceChange);
        
        document.getElementById('btn-submit-msg').addEventListener('click', handleSendMessage);

        // 🚀 NEW: Fire up the manager engine to populate the past messages box
        if (typeof initAdminAnnouncementManager === "function") {
            initAdminAnnouncementManager();
        }

        // 🚀 NEW: Store all emails globally so the Send button can use them
        window.allTeacherEmails = []; 
        window.allStudentEmails = [];
        window.allStudentsData = [];

        const populateDatalist = async () => {
            const studentDatalist = document.getElementById("students-datalist");
            const teacherDatalist = document.getElementById("teachers-datalist");
            
            if (studentDatalist) studentDatalist.innerHTML = ""; 
            if (teacherDatalist) teacherDatalist.innerHTML = ""; 
            
            try {
                const firestore = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
                
                // Fetch Teachers
                const teacherSnap = await firestore.getDocs(firestore.collection(db, "users"));
                console.log(`🍎 Found ${teacherSnap.size} teachers in Firebase!`);
                
                teacherSnap.forEach(doc => {
                    const data = doc.data();
                    const emailValue = data.email || doc.id; 
                    if (emailValue) window.allTeacherEmails.push(emailValue); // 👈 Save to array
                    if (teacherDatalist) {
                        teacherDatalist.innerHTML += `<option value="${emailValue}">${data.displayName || data.name || emailValue}</option>`;
                    }
                });

                // Fetch Students
                const studentSnap = await firestore.getDocs(firestore.collection(db, "students"));
                console.log(`🎓 Found ${studentSnap.size} students in Firebase!`);
                
                studentSnap.forEach(doc => {
                    const data = doc.data();
                    if (data.email) {
                        window.allStudentEmails.push(data.email); 
                        
                        // 🚀 NEW: Save both email and grade so we can filter by checkboxes later!
                        window.allStudentsData.push({
                            email: data.email,
                            grade: String(data.grade || "") // Force to string to safely match the checkbox value
                        });
                    }
                    
                    if (studentDatalist) {
                        studentDatalist.innerHTML += `<option value="${data.email}">${data.displayName || data.name || data.email}</option>`;
                    }
                });
            } catch (error) {
                console.error("Error loading users for datalist:", error);
            }
        };
        
        populateDatalist();

        // 🚀 NEW: Logic to handle Student Tags
        window.selectedSpecificStudents = []; 
        document.getElementById("btn-add-specific-student").addEventListener("click", () => {
            const searchInput = document.getElementById("specific-student-search");
            const email = searchInput.value.trim();
            
            if (email && !window.selectedSpecificStudents.includes(email)) {
                window.selectedSpecificStudents.push(email);
                
                const listDiv = document.getElementById("selected-students-list");
                const pill = document.createElement("span");
                pill.style.cssText = "background: #0277bd; color: white; padding: 4px 8px; border-radius: 12px; font-size: 0.8rem; display: flex; align-items: center; gap: 5px;";
                pill.innerHTML = `${email} <span style="cursor: pointer; font-weight: bold; color: #ffcccc;" onclick="this.parentElement.remove(); window.selectedSpecificStudents = window.selectedSpecificStudents.filter(e => e !== '${email}');">✕</span>`;
                listDiv.appendChild(pill);
                
                searchInput.value = ""; // Clear input for the next search
            }
        });

        // 🚀 NEW: Logic to handle Teacher Tags
        window.selectedSpecificTeachers = []; 
        document.getElementById("btn-add-specific-teacher").addEventListener("click", () => {
            const searchInput = document.getElementById("specific-teacher-search");
            const email = searchInput.value.trim();
            
            if (email && !window.selectedSpecificTeachers.includes(email)) {
                window.selectedSpecificTeachers.push(email);
                
                const listDiv = document.getElementById("selected-teachers-list");
                const pill = document.createElement("span");
                // Uses a green color for teachers to visually distinguish from students
                pill.style.cssText = "background: #2e7d32; color: white; padding: 4px 8px; border-radius: 12px; font-size: 0.8rem; display: flex; align-items: center; gap: 5px;";
                pill.innerHTML = `${email} <span style="cursor: pointer; font-weight: bold; color: #ffcccc;" onclick="this.parentElement.remove(); window.selectedSpecificTeachers = window.selectedSpecificTeachers.filter(e => e !== '${email}');">✕</span>`;
                listDiv.appendChild(pill);
                
                searchInput.value = ""; // Clear input for the next search
            }
        });
    }
}

// 🟢 Handles showing/hiding the correct audience selection boxes
function handleAudienceChange() {
    const audienceType = document.getElementById('msg-audience-type').value;
    const gradesContainer = document.getElementById('msg-grades-container');
    const specificStudentsContainer = document.getElementById('msg-specific-students-container');
    const specificTeachersContainer = document.getElementById('msg-specific-teachers-container');

    // Hide all by default
    if (gradesContainer) gradesContainer.style.display = 'none';
    if (specificStudentsContainer) specificStudentsContainer.style.display = 'none';
    if (specificTeachersContainer) specificTeachersContainer.style.display = 'none';

    // Show the correct one based on selection
    if (audienceType === 'grades' && gradesContainer) {
        gradesContainer.style.display = 'block';
    } else if (audienceType === 'specific-students' && specificStudentsContainer) {
        specificStudentsContainer.style.display = 'block';
    } else if (audienceType === 'specific-teachers' && specificTeachersContainer) {
        specificTeachersContainer.style.display = 'block';
    }
}

// 🟢 Creates a new specific person dropdown and wires up the "auto-add" logic
function addPersonDropdown() {
    const wrapper = document.getElementById('specific-dropdowns-wrapper');
    
    const select = document.createElement('select');
    select.className = 'specific-person-select';
    select.style.cssText = 'width: 100%; padding: 8px; margin-bottom: 8px; border-radius: 4px; border: 1px solid #ccc;';
    
    // Default option
    select.innerHTML = `<option value="">-- Select a person --</option>`;
    
    // Populate with actual users (Assuming objects like { id: "123", name: "John Doe" })
    availableUsers.forEach(user => {
        const option = document.createElement('option');
        option.value = user.id; // Or user.email depending on your database
        option.textContent = user.name || user.displayName;
        select.appendChild(option);
    });

    // When this dropdown changes, check if we need to add another empty one
    select.addEventListener('change', (e) => {
        const allSelects = document.querySelectorAll('.specific-person-select');
        const lastSelect = allSelects[allSelects.length - 1];
        
        // If they actually picked someone in the LAST dropdown, add a new empty one below it
        if (e.target === lastSelect && e.target.value !== "") {
            addPersonDropdown();
        }
    });

    wrapper.appendChild(select);
}

// 🟢 Gathers the form data and sends it to Firebase
async function handleSendMessage() {
    const audienceType = document.getElementById('msg-audience-type').value;
    const messageBody = document.getElementById('msg-body').value.trim();
    let targetData = [];

    // 🚀 NEW: Grab the massive email lists for broadcasts!
    if (audienceType === 'everyone') {
        targetData = [...(window.allTeacherEmails || []), ...(window.allStudentEmails || [])];
    } else if (audienceType === 'teachers') {
        targetData = window.allTeacherEmails || [];
    } else if (audienceType === 'grades') {
        // 🚀 NEW: Find which boxes are checked
        const checkboxes = document.querySelectorAll('#msg-grades-container input[type="checkbox"]:checked');
        const selectedGrades = Array.from(checkboxes).map(cb => cb.value); // e.g., ["7", "8"]
        
        if (selectedGrades.length === 0) {
            alert("Please select at least one grade.");
            return;
        }

        // 🚀 NEW: Filter the global student list to only grab emails of students in those grades
        targetData = window.allStudentsData
            .filter(student => selectedGrades.includes(student.grade))
            .map(student => student.email);

        if (targetData.length === 0) {
            alert("No students found in the selected grades. Double check the database records.");
            return;
        }
    } else if (audienceType === 'specific-students') {
        targetData = window.selectedSpecificStudents || [];
        if (targetData.length === 0) {
            alert("Please select at least one student.");
            return;
        }
    } else if (audienceType === 'specific-teachers') {
        targetData = window.selectedSpecificTeachers || [];
        if (targetData.length === 0) {
            alert("Please select at least one teacher.");
            return;
        }
        // Grab the link if they typed one
    const linkInput = document.getElementById("msg-link");
    const linkValue = linkInput && linkInput.value.trim() !== "" ? linkInput.value.trim() : null;

    // 🛑 CRITICAL FIX: We must force 'grades' to be 'specific' so the student listener picks up the array of emails
    const finalAudience = (audienceType === 'specific-students' || audienceType === 'specific-teachers' || audienceType === 'grades') ? 'specific' : audienceType;
    }

    // Grab the link if they typed one
    const linkInput = document.getElementById("msg-link");
    const linkValue = linkInput && linkInput.value.trim() !== "" ? linkInput.value.trim() : null;

    // 🛑 CRITICAL: We must force the payload audience back to 'specific' so the database listener works correctly
    const finalAudience = (audienceType === 'specific-students' || audienceType === 'specific-teachers') ? 'specific' : audienceType;

    const payload = {
        audience: finalAudience,
        targets: targetData,
        message: messageBody,
        link: linkValue,          
        readBy: [],               
        createdAt: serverTimestamp(),
        active: true
    };

    console.log("🚀 Ready to save to Firebase:", payload);
    
    // Write to the 'announcements' collection
    try {
        await addDoc(collection(db, "announcements"), payload);
        
        document.getElementById('admin-message-modal').remove();
        alert("Message sent successfully!");
    } catch (error) {
        console.error("Error saving message to Firebase:", error);
        alert("Failed to send the message. Check the console for details.");
    }
}

export function initAdminAnnouncementManager() {
    const container = document.getElementById("admin-past-messages-list"); 
    if (!container) return;

    const q = query(collection(db, "announcements"), where("active", "==", true));
    
    onSnapshot(q, (snapshot) => {
        container.innerHTML = ""; 
        
        if (snapshot.empty) {
            container.innerHTML = "<p>No active messages.</p>";
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const docId = docSnap.id;
            
            // 🚀 FIXED: Calculate unread emails for ANY message that has a targets list!
            let unreadEmails = [];
            if (data.targets && Array.isArray(data.targets)) {
                const readList = data.readBy || [];
                unreadEmails = data.targets.filter(email => !readList.includes(email));
            }

            // 🚀 FIXED: Use the actual count now that 'everyone' and 'teachers' have target lists
            const unreadCount = unreadEmails.length;
            const unreadListId = `unread-list-${docId}`;

            // Build the card UI
            const card = document.createElement("div");
            card.style.cssText = "border: 1px solid #ccc; padding: 10px; margin-bottom: 10px; border-radius: 6px; background: white;";
            
            card.innerHTML = `
                <p><strong>Message:</strong> ${data.message}</p>
                <p style="font-size: 0.9rem; color: #555; margin-bottom: 8px;">Unread Users: ${unreadCount}</p>
                
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button id="btn-delete-${docId}" style="background: #c62828; color: white; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">🗑️ Permanently Clear</button>
                    
                    ${unreadEmails.length > 0 ? `
                        <button id="btn-view-${docId}" style="background: #0277bd; color: white; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">👀 View Unread</button>
                        <button id="btn-copy-${docId}" style="background: #2e7d32; color: white; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">📋 Copy to Gmail</button>
                    ` : ""}
                </div>

                <div id="${unreadListId}" style="display: none; margin-top: 10px; padding: 10px; background: #f1f1f1; border: 1px dashed #ccc; border-radius: 4px; font-size: 0.85rem; max-height: 100px; overflow-y: auto;">
                    <strong>Unread Emails:</strong><br>
                    ${unreadEmails.join("<br>")}
                </div>
            `;

            container.appendChild(card);

            // 1. Delete Button Logic
            const deleteBtn = card.querySelector(`#btn-delete-${docId}`);
            if (deleteBtn) {
                deleteBtn.addEventListener("click", async () => {
                    if (confirm("Are you sure? This will instantly remove it from all screens and the database.")) {
                        const firestore = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
                        await firestore.deleteDoc(firestore.doc(db, "announcements", docId));
                    }
                });
            }

            // 2. View Unread Toggle Logic
            const viewBtn = card.querySelector(`#btn-view-${docId}`);
            if (viewBtn) {
                viewBtn.addEventListener("click", () => {
                    const listDiv = card.querySelector(`#${unreadListId}`);
                    if (listDiv.style.display === "none") {
                        listDiv.style.display = "block";
                        viewBtn.innerText = "🙈 Hide Unread";
                    } else {
                        listDiv.style.display = "none";
                        viewBtn.innerText = "👀 View Unread";
                    }
                });
            }

            // 3. Copy to Clipboard Logic
            const copyBtn = card.querySelector(`#btn-copy-${docId}`);
            if (copyBtn) {
                copyBtn.addEventListener("click", () => {
                    navigator.clipboard.writeText(unreadEmails.join(", ")).then(() => {
                        copyBtn.innerText = "✅ Copied!";
                        setTimeout(() => copyBtn.innerText = "📋 Copy to Gmail", 2000);
                    });
                });
            }
        }); // End of snapshot.forEach
    }); // End of onSnapshot
} // End of initAdminAnnouncementManager