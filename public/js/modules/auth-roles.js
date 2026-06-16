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
            if(btn) btn.innerText = "🔍 User found! Reading Firestore...";
            
            try {
                // Check Firestore for user role using their Email Address!
                const userEmail = user.email.toLowerCase();
                const userRef = doc(db, "users", userEmail);
                const userSnap = await getDoc(userRef);

                let role = "teacher"; 
                
                if (userSnap.exists()) {
                    role = userSnap.data().role;
                    if(btn) btn.innerText = `✅ Role found: ${role}`;
                } else {
                    if(btn) btn.innerText = "📝 Creating new user profile...";
                    await setDoc(userRef, {
                        name: user.displayName,
                        email: user.email,
                        role: "teacher" 
                    });
                }

                // Verify they are on the right page
                if (requiredRole === "admin" && role !== "admin") {
                    if(btn) btn.innerText = "🛑 Access Denied";
                    alert(`ACCESS DENIED!\n\nYour account was created, but your role is: "${role}".\n\nTo view this Admin page, go to your Firebase Console -> Firestore Database, find your user in the 'users' collection, and change your role to "admin". Then refresh this page.`);
                    return; 
                }

                // Authentication passed! Update UI.
                loginScreen.style.display = "none";
                dashboardScreen.style.display = "";
                
                onAuthenticated(user, role);

            } catch (error) {
                if(btn) btn.innerText = "❌ Database Error";
                alert("Firestore Error: " + error.message + "\n\nMake sure your Firestore Database is set up and rules allow reading/writing!");
            }
        } else {
            // Not logged in
            loginScreen.style.display = "flex";
            dashboardScreen.style.display = "none";
            if(btn) btn.innerText = "Sign in with Google";
        }
    });
}