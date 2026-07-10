import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../firebase-config.js"; 

export async function initStudentSelect(inputElement, dropdownElement, onSelectCallback) {
    let students = [];

    // 1. Fetch data
    try {
        // 🎯 MIGRATION FIX: Point to "users" and filter by role "student"
        const q = query(collection(db, "users"), where("role", "==", "student"));
        const querySnapshot = await getDocs(q);
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const name = data.fullName || data.displayName || "Unknown Student";
            const email = data.email || "No Email Provided";
            
            students.push({
                id: doc.id,
                email: email,
                name: name,
                displayLabel: `${name} (${email})`
            });
        });
    } catch (error) {
        console.error("Error fetching students:", error);
        inputElement.placeholder = "Error loading students...";
        return;
    }

    // Helper to render the dropdown list
    function renderList(list) {
        dropdownElement.innerHTML = "";
        if (list.length === 0) {
            dropdownElement.style.display = "none";
            return;
        }

        dropdownElement.style.display = "block";
        list.forEach(student => {
            const item = document.createElement("div");
            item.className = "dropdown-item";
            // Formatting to match mockup: Bold name, gray email
            item.innerHTML = `
                <span class="dropdown-name">${student.name}</span>
                <span class="dropdown-email">(${student.email})</span>
            `;
            
            item.addEventListener("click", () => {
                inputElement.value = student.name; // Just put the name in the box after clicking
                dropdownElement.style.display = "none";
                if (onSelectCallback) onSelectCallback(student);
            });
            
            dropdownElement.appendChild(item);
        });
    }

    // 2. Handle Focus (Clicking into the box shows all)
    inputElement.addEventListener("focus", () => {
        if (inputElement.value.trim() === "") {
            renderList(students);
        } else {
            // Re-trigger search if they click back into a box with text
            const event = new Event('input');
            inputElement.dispatchEvent(event);
        }
    });

    // 3. Handle Typing
    inputElement.addEventListener("input", (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        if (!searchTerm) {
            renderList(students); // Show all if they backspace to empty
            return;
        }

        const filteredStudents = students.filter(s => 
            s.displayLabel.toLowerCase().includes(searchTerm)
        );
        renderList(filteredStudents);
    });

    // 4. Close if clicking outside
    document.addEventListener("click", (e) => {
        if (e.target !== inputElement && !dropdownElement.contains(e.target)) {
            dropdownElement.style.display = "none";
        }
    });
}

// --- Multi-Select Student Dropdown ---
export function initMultiStudentSelect(inputElement, dropdownElement, tagsContainer, maxSelections = 4, onChangeCallback) {
    let selectedStudents = [];
    let allStudents = []; 

    // 🎯 MIGRATION FIX: Add query and where to the dynamic import
    import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js").then(async ({ collection, getDocs, query, where }) => {
        const { db } = await import("../firebase-config.js");
        
        // 🎯 MIGRATION FIX: Point to "users" and filter by role "student"
        const q = query(collection(db, "users"), where("role", "==", "student"));
        const querySnapshot = await getDocs(q);
        
        allStudents = querySnapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().displayName,
            email: doc.data().email
        }));
    });

    function renderDropdown(filterText = "") {
        dropdownElement.innerHTML = "";
        
        // Filter out already selected students and by search text
        const availableStudents = allStudents.filter(s => 
            !selectedStudents.some(sel => sel.id === s.id) &&
            (s.name.toLowerCase().includes(filterText.toLowerCase()) || 
             s.email.toLowerCase().includes(filterText.toLowerCase()))
        );

        if (availableStudents.length === 0) {
            dropdownElement.innerHTML = `<div class="dropdown-item">No students found</div>`;
            return;
        }

        availableStudents.forEach(student => {
            const div = document.createElement('div');
            div.className = 'dropdown-item';
            div.innerHTML = `<span class="dropdown-name">${student.name}</span> <span class="dropdown-email">(${student.email})</span>`;
            
            div.addEventListener('click', () => {
                if (selectedStudents.length < maxSelections) {
                    selectedStudents.push(student);
                    inputElement.value = "";
                    dropdownElement.style.display = "none";
                    updateUI();
                }
            });
            dropdownElement.appendChild(div);
        });
    }

    function renderTags() {
        tagsContainer.innerHTML = "";
        selectedStudents.forEach((student, index) => {
            const tag = document.createElement('div');
            tag.className = 'student-tag';
            // Using email as shown in your mockup
            tag.innerHTML = `
                ${student.email} 
                <span class="tag-remove" data-index="${index}">×</span>
            `;
            tagsContainer.appendChild(tag);
        });

        // Add event listeners to remove buttons
        tagsContainer.querySelectorAll('.tag-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.getAttribute('data-index'));
                selectedStudents.splice(idx, 1);
                updateUI();
            });
        });
    }

    function updateUI() {
        renderTags();
        onChangeCallback(selectedStudents);

        // Lock input if max reached
        if (selectedStudents.length >= maxSelections) {
            inputElement.placeholder = `Maximum ${maxSelections} students selected.`;
            inputElement.disabled = true;
        } else {
            inputElement.placeholder = "Type student name or email...";
            inputElement.disabled = false;
        }
    }

    // Event Listeners
    inputElement.addEventListener('input', (e) => {
        dropdownElement.style.display = "block";
        renderDropdown(e.target.value);
    });

    inputElement.addEventListener('focus', () => {
        if (selectedStudents.length < maxSelections) {
            dropdownElement.style.display = "block";
            renderDropdown(inputElement.value);
        }
    });

    document.addEventListener('click', (e) => {
        if (!inputElement.contains(e.target) && !dropdownElement.contains(e.target)) {
            dropdownElement.style.display = "none";
        }
    });
}