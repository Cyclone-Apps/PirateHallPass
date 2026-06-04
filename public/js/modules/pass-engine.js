// js/modules/pass-engine.js
import { db } from "../firebase-config.js";
import { 
    collection, 
    query, 
    where, 
    onSnapshot, 
    updateDoc, 
    doc, 
    serverTimestamp,
    addDoc,
    getDocs 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const passesRef = collection(db, "passes");

/**
 * Listens for Pending Passes in real-time.
 */
export function listenToPendingPasses(callback) {
    // UPDATED: Now listens for BOTH student-initiated and teacher-initiated pending passes
    const q = query(passesRef, where("status", "in", ["pending", "pending_student"]));
    
    return onSnapshot(q, (snapshot) => {
        const passes = [];
        snapshot.forEach((doc) => {
            passes.push({ id: doc.id, ...doc.data() });
        });
        callback(passes); 
    }, (error) => {
        console.error("Error listening to pending passes:", error);
    });
}

/**
 * Listens for Active Passes in real-time.
 * @param {function} callback - Function to run when data updates
 */
export function listenToActivePasses(callback) {
    const q = query(passesRef, where("status", "==", "active"));
    
    return onSnapshot(q, (snapshot) => {
        const passes = [];
        snapshot.forEach((doc) => {
            passes.push({ id: doc.id, ...doc.data() });
        });
        callback(passes);
    }, (error) => {
        console.error("Error listening to active passes:", error);
    });
}

/**
 * Listens for Scheduled Passes in real-time.
 * @param {function} callback - Function to run when data updates
 */
export function listenToScheduledPasses(callback) {
    const q = query(passesRef, where("status", "==", "scheduled"));
    
    return onSnapshot(q, (snapshot) => {
        const passes = [];
        snapshot.forEach((doc) => {
            passes.push({ id: doc.id, ...doc.data() });
        });
        callback(passes);
    }, (error) => {
        console.error("Error listening to scheduled passes:", error);
    });
}

/**
 * Updates the status of a pass (e.g., active, returned, rejected)
 */
export async function updatePassStatus(passId, newStatus) {
    try {
        const passDoc = doc(db, "passes", passId);
        const updateData = { status: newStatus };
        
        // Add timestamps based on the action
        if (newStatus === "active") updateData.acceptedAt = serverTimestamp();
        if (newStatus === "returned") updateData.returnedAt = serverTimestamp();
        
        await updateDoc(passDoc, updateData);
        console.log(`Pass ${passId} updated to: ${newStatus}`);
    } catch (error) {
        console.error("Failed to update pass:", error);
        alert("Error updating pass. Check console.");
    }
}

/**
 * Creates a brand new pass in the database
 */
export async function createNewPass(passData) {
    try {
        await addDoc(passesRef, {
            ...passData,
            createdAt: serverTimestamp()
        });
        console.log("New pass created successfully!");
        return true;
    } catch (error) {
        console.error("Error creating pass:", error);
        alert("Failed to create pass. Check console.");
        return false;
    }
}

/**
 * Listens for a specific student's active, pending, or restricted passes
 */
export function listenToStudentPass(studentName, callback) {
    // We look for any passes belonging to this specific student
    const q = query(passesRef, where("studentDisplayName", "==", studentName));
    
    return onSnapshot(q, (snapshot) => {
        let currentPass = null;
        
        snapshot.forEach((doc) => {
            const pass = { id: doc.id, ...doc.data() };
            
            // FIX: Added "pending_restricted" so the listener catches Red passes!
            if (
                pass.status === "active" || 
                pass.status === "pending" || 
                pass.status === "pending_student" || 
                pass.status === "pending_restricted" 
            ) {
                currentPass = pass; 
            }
        });
        
        callback(currentPass); 
    }, (error) => {
        console.error("Error listening to student pass:", error);
    });
}

/**
 * Fetches a student's full profile (including schedule) based on their email
 */
export async function fetchStudentProfileByEmail(email) {
    try {
        const studentsRef = collection(db, "students");
        const q = query(studentsRef, where("email", "==", email));
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
            return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
        }
        return null;
    } catch (error) {
        console.error("Error fetching student profile:", error);
        return null;
    }
}

/**
 * Fetches the entire student roster for the Autocomplete UI
 */
export async function fetchAllStudents() {
    try {
        const studentsRef = collection(db, "students");
        const snapshot = await getDocs(studentsRef);
        const students = [];
        
        snapshot.forEach(doc => {
            const data = doc.data();
            
            // 1. Find Name
            const sName = data.displayName || data.name || data.studentName || data.Name || data['Student Name'] || "Unknown Student";
            
            let sEmail = null;

            // 2. Is the Email acting as the Document ID? (Very common with CSV updates!)
            if (doc.id.includes('@')) {
                sEmail = doc.id;
            }

            // 3. Check Standard CSV properties
            if (!sEmail) {
                sEmail = data.email || data.Email || data.studentEmail || data['Student Email'] || data['Email Address'];
            }

            // 4. DEEP DIVE: Search every nested folder and array in their profile for an email
            if (!sEmail) {
                const searchForEmail = (obj) => {
                    for (let key in obj) {
                        if (typeof obj[key] === 'string' && obj[key].includes('@')) return obj[key];
                        if (typeof obj[key] === 'object' && obj[key] !== null) {
                            const found = searchForEmail(obj[key]);
                            if (found) return found;
                        }
                    }
                    return null;
                };
                sEmail = searchForEmail(data);
            }
            
            // If they have a name, add them to the dropdown list!
            if (sName !== "Unknown Student") {
                students.push({ 
                    id: doc.id, 
                    displayName: sName, 
                    email: sEmail || "No Email Attached" 
                });
            }
        });
        
        // Sort alphabetically by name
        return students.sort((a, b) => a.displayName.localeCompare(b.displayName));
    } catch (error) {
        console.error("Error fetching all students:", error);
        return [];
    }
}