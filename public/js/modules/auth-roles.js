// js/modules/auth-roles.js
import { auth, db } from "../firebase-config.js";
import { 
    GoogleAuthProvider, 
    signInWithPopup, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
            // 🎓 STUDENT LOGIN BYPASS
            // ==========================================
            if (requiredRole === "student") {
                if(btn) btn.innerText = "✅ Student Authenticated!";
                loginScreen.style.display = "none";
                dashboardScreen.style.display = "";
                onAuthenticated(user, "student");
                return; // Stop here, do not check the staff database!
            }

            // ==========================================
            // 👨‍🏫 STAFF LOGIN CHECK
            // ==========================================
            if(btn) btn.innerText = "🔍 Checking Staff Directory...";
            
            try {
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