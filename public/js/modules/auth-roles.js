// js/modules/auth-roles.js
import { auth, db } from "../firebase-config.js";
import { 
    GoogleAuthProvider, 
    signInWithPopup, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const provider = new GoogleAuthProvider();

// Logs the user in with Google (Using Popup)
export async function handleGoogleLogin() {
    const btn = document.getElementById("btn-google-login");
    btn.innerText = "⏳ Opening Google...";
    
    try {
        await signInWithPopup(auth, provider);
        btn.innerText = "✅ Logged in! Checking database...";
    } catch (error) {
        btn.innerText = "❌ Sign in with Google";
        alert("Login Error: " + error.message);
    }
}

// Logs the user out
export async function handleLogout() {
    try {
        await signOut(auth);
        window.location.reload();
    } catch (error) {
        console.error("Logout Error:", error);
    }
}

// Listens for auth state and checks user role
export function initAuthListener(requiredRole, onAuthenticated) {
    onAuthStateChanged(auth, async (user) => {
        const loginScreen = document.getElementById("screen-login");
        const dashboardScreen = document.getElementById("screen-dashboard");
        const btn = document.getElementById("btn-google-login");

        if (user) {
            // ==========================================
            // 🎓 STUDENT LOGIN BYPASS & SPOOF MODE
            // ==========================================
            if (requiredRole === "student") {
                // 🕵️‍♂️ THE IMPERSONATOR CHECK
                if (user.email.toLowerCase() === "website@postville.k12.ia.us") {
                    if (btn) btn.innerText = "🕵️‍♂️ Dev Mode: Select Student...";
                    // Stop the normal login and launch the spoof modal
                    launchSpoofModal(onAuthenticated, loginScreen, dashboardScreen);
                    return; 
                }

                // Normal Student Login
                if(btn) btn.innerText = "✅ Student Authenticated!";
                loginScreen.style.display = "none";
                dashboardScreen.style.display = "";
                onAuthenticated(user, "student");
                return; // Stop here, do not check the staff database!
            }

            // ==========================================
            // 👨‍🏫 STAFF LOGIN CHECK
            // ==========================================
            
            // 🕵️‍♂️ THE IMPERSONATOR CHECK (TEACHER MODE)
            if (requiredRole === "teacher" && user.email.toLowerCase() === "website@postville.k12.ia.us") {
                if (btn) btn.innerText = "🕵️‍♂️ Dev Mode: Select Teacher...";
                // Stop normal login and launch the Teacher spoof modal
                launchTeacherSpoofModal(onAuthenticated, loginScreen, dashboardScreen);
                return; 
            }

            if(btn) btn.innerText = "🔍 Checking Staff Directory...";
            
            try {
                // Check Firestore for user role using their Email Address
                // Check Firestore for user role using their Email Address
                const userEmail = user.email.toLowerCase();
                const userRef = doc(db, "users", userEmail);
                const userSnap = await getDoc(userRef);

                let role = ""; 
                
                if (userSnap.exists()) {
                    role = userSnap.data().role;
                    if(btn) btn.innerText = `✅ Role found: ${role}`;
                } else {
                    // KICK OUT UNAUTHORIZED USERS
                    if(btn) btn.innerText = "🛑 Access Denied";
                    alert(`ACCESS DENIED!\n\nYour account (${userEmail}) is not registered as a staff member in the system.\n\nPlease see Mr. Orr to be added.`);
                    await signOut(auth);
                    
                    loginScreen.style.display = "flex";
                    dashboardScreen.style.display = "none";
                    btn.innerText = "Sign in with Google";
                    return; 
                }

                // Verify they are on the right page
                if (requiredRole === "admin" && role !== "admin") {
                    if(btn) btn.innerText = "🛑 Access Denied";
                    alert(`ACCESS DENIED!\n\nYou are logged in as a "${role}", but this page requires Admin access.\n\nPlease see Mr. Orr if you need your permissions upgraded.`);
                    await signOut(auth);
                    return; 
                }

                // Authentication passed! Update UI.
                loginScreen.style.display = "none";
                dashboardScreen.style.display = "";
                
                onAuthenticated(user, role);

            } catch (error) {
                if(btn) btn.innerText = "❌ Database Error";
                alert("Firestore Error: " + error.message);
            }
        } else {
            // Not logged in
            loginScreen.style.display = "flex";
            dashboardScreen.style.display = "none";
            if(btn) btn.innerText = "Sign in with Google";
        }
    });
}

// ==========================================
// 🕵️‍♂️ DEV MODE: STUDENT IMPERSONATOR UI
// ==========================================
async function launchSpoofModal(onAuthenticated, loginScreen, dashboardScreen) {
    // 1. Create the Modal UI
    const modal = document.createElement("div");
    modal.id = "spoof-modal";
    modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.9); display: flex; align-items: center; justify-content: center; z-index: 9999;";
    
    modal.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 8px; width: 90%; max-width: 450px; text-align: left; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
            <h2 style="margin: 0 0 10px 0; color: var(--pirate-red, #c62828);">🕵️‍♂️ Student Impersonator</h2>
            <p style="color: #555; margin-bottom: 20px; font-size: 0.9rem;">You logged in with the developer account. Search for a student below to experience the app as them.</p>
            
            <label style="font-weight: bold; font-size: 0.85rem; color: #333;">Search Student:</label>
            <input list="spoof-student-list" id="spoof-student-input" placeholder="Type a name or email..." style="width: 100%; padding: 12px; margin-top: 5px; border-radius: 4px; border: 1px solid #ccc; font-size: 1rem;">
            
            <datalist id="spoof-student-list">
                <!-- Students will be loaded here -->
            </datalist>

            <button id="btn-spoof-login" style="margin-top: 25px; padding: 15px; width: 100%; background: #2e7d32; color: white; border: none; border-radius: 6px; font-size: 1.1rem; font-weight: bold; cursor: pointer;">
                🚀 Login as Student
            </button>
            <button id="btn-spoof-cancel" style="margin-top: 10px; padding: 10px; width: 100%; background: transparent; color: #666; border: none; cursor: pointer; text-decoration: underline;">
                Cancel & Sign Out
            </button>
        </div>
    `;
    
    document.body.appendChild(modal);

    // 2. Fetch the students from the 'users' database to populate the dropdown
    const datalist = document.getElementById("spoof-student-list");
    try {
        // 🌟 NEW: Query the users collection where role == "student"
        const q = query(collection(db, "users"), where("role", "==", "student"));
        const querySnapshot = await getDocs(q); 
        
        querySnapshot.forEach((docSnap) => {
            const student = docSnap.data();
            const option = document.createElement("option");
            
            // Format the display name safely depending on what fields exist in your DB
            const displayName = student.displayName || (student.firstName + ' ' + student.lastName) || "Unknown Student";
            
            // The value they see: "John Doe (jdoe@postville...)"
            option.value = `${displayName} (${docSnap.id})`; // Using docSnap.id assuming their email is the document ID
            datalist.appendChild(option);
        });
    } catch (error) {
        console.warn("Could not load student list for spoofing:", error);
    }

    // 3. Handle the "Login as Student" button click
    document.getElementById("btn-spoof-login").addEventListener("click", () => {
        const inputVal = document.getElementById("spoof-student-input").value;
        if (!inputVal) return alert("Please select or type a student first!");

        // Extract the name and email from the input string: "John Doe (jdoe@postville...)"
        let spoofName = inputVal.split("(")[0].trim();
        let spoofEmail = inputVal.includes("(") ? inputVal.split("(")[1].replace(")", "").trim() : "spoof@postville.k12.ia.us";

        // Create a fake Google User object
        const mockUser = {
            uid: "spoof_" + Date.now(),
            email: spoofEmail,
            displayName: spoofName,
            photoURL: ""
        };

        // Pass the fake user to the app and clean up the UI
        document.body.removeChild(modal);
        loginScreen.style.display = "none";
        dashboardScreen.style.display = "";
        
        console.log("🕵️‍♂️ Spoofing active for:", mockUser.displayName);
        onAuthenticated(mockUser, "student");
    });

    // 4. Handle Cancel
    document.getElementById("btn-spoof-cancel").addEventListener("click", () => {
        document.body.removeChild(modal);
        handleLogout(); // Log the dev account back out
    });
}

// ==========================================
// 🕵️‍♂️ DEV MODE: TEACHER IMPERSONATOR UI
// ==========================================
async function launchTeacherSpoofModal(onAuthenticated, loginScreen, dashboardScreen) {
    // 1. Create the Modal UI
    const modal = document.createElement("div");
    modal.id = "spoof-teacher-modal";
    modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.9); display: flex; align-items: center; justify-content: center; z-index: 9999;";
    
    modal.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 8px; width: 90%; max-width: 450px; text-align: left; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
            <h2 style="margin: 0 0 10px 0; color: var(--pirate-red, #c62828);">🕵️‍♂️ Teacher Impersonator</h2>
            <p style="color: #555; margin-bottom: 20px; font-size: 0.9rem;">You logged in with the developer account. Search for a teacher below to experience the app as them.</p>
            
            <label style="font-weight: bold; font-size: 0.85rem; color: #333;">Search Teacher:</label>
            <input list="spoof-teacher-list" id="spoof-teacher-input" placeholder="Type a name or email..." style="width: 100%; padding: 12px; margin-top: 5px; border-radius: 4px; border: 1px solid #ccc; font-size: 1rem;">
            
            <datalist id="spoof-teacher-list">
                </datalist>

            <button id="btn-spoof-teacher-login" style="margin-top: 25px; padding: 15px; width: 100%; background: #c62828; color: white; border: none; border-radius: 6px; font-size: 1.1rem; font-weight: bold; cursor: pointer;">
                🚀 Login as Teacher
            </button>
            <button id="btn-spoof-teacher-cancel" style="margin-top: 10px; padding: 10px; width: 100%; background: transparent; color: #666; border: none; cursor: pointer; text-decoration: underline;">
                Cancel & Sign Out
            </button>
        </div>
    `;
    
    document.body.appendChild(modal);

    // 2. Fetch the teachers from the 'users' database to populate the dropdown
    const datalist = document.getElementById("spoof-teacher-list");
    try {
        // 🌟 Query the users collection where role == "teacher"
        const q = query(collection(db, "users"), where("role", "==", "teacher"));
        const querySnapshot = await getDocs(q); 
        
        querySnapshot.forEach((docSnap) => {
            const teacher = docSnap.data();
            const option = document.createElement("option");
            
            const displayName = teacher.displayName || (teacher.firstName + ' ' + teacher.lastName) || "Unknown Teacher";
            
            option.value = `${displayName} (${docSnap.id})`; 
            datalist.appendChild(option);
        });
    } catch (error) {
        console.warn("Could not load teacher list for spoofing:", error);
    }

    // 3. Handle the "Login as Teacher" button click
    document.getElementById("btn-spoof-teacher-login").addEventListener("click", () => {
        const inputVal = document.getElementById("spoof-teacher-input").value;
        if (!inputVal) return alert("Please select or type a teacher first!");

        let spoofName = inputVal.split("(")[0].trim();
        let spoofEmail = inputVal.includes("(") ? inputVal.split("(")[1].replace(")", "").trim() : "spoof-teacher@postville.k12.ia.us";

        const mockUser = {
            uid: "spoof_" + Date.now(),
            email: spoofEmail,
            displayName: spoofName,
            photoURL: ""
        };

        document.body.removeChild(modal);
        loginScreen.style.display = "none";
        dashboardScreen.style.display = "";
        
        console.log("🕵️‍♂️ Spoofing active for:", mockUser.displayName);
        // 🌟 IMPORTANT: Pass "teacher" as the role here!
        onAuthenticated(mockUser, "teacher");
    });

    // 4. Handle Cancel
    document.getElementById("btn-spoof-teacher-cancel").addEventListener("click", () => {
        document.body.removeChild(modal);
        handleLogout(); 
    });
}