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
    getDocs,
    deleteDoc,
    getDoc,
    orderBy // 🟢 ADDED: orderBy for waitlist sorting
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const passesRef = collection(db, "passes");

/**
 * Listens for Pending Passes in real-time.
 */
export function listenToPendingPasses(callback) {
    // 🟢 Pulls pending AND waitlisted passes
    const q = query(passesRef, where("status", "in", ["pending", "pending_student", "pending_restricted", "pending_warning", "waitlist"]));
    
    return onSnapshot(q, (snapshot) => {
        const passes = [];
        snapshot.forEach((doc) => {
            passes.push({ id: doc.id, ...doc.data() });
        });

        // ==============================================================
        // 🟢 DYNAMIC WAITLIST CALCULATION FOR TEACHER/ADMIN UI
        // ==============================================================
        // Grab only the waitlisted passes to compare
        const waitlistPasses = passes.filter(p => p.status === "waitlist");
        
        passes.forEach(pass => {
            if (pass.status === "waitlist") {
                // Find everyone waiting for this exact same room
                const sameRoom = waitlistPasses.filter(p => p.destination === pass.destination);
                
                // Sort them by time created (oldest first)
                sameRoom.sort((a, b) => {
                    const timeA = a.createdAt?.toDate?.() || new Date(0);
                    const timeB = b.createdAt?.toDate?.() || new Date(0);
                    return timeA - timeB;
                });
                
                // Find this specific pass's index in that line
                const truePosition = sameRoom.findIndex(p => p.id === pass.id) + 1;
                
                // 🪄 OVERWRITE the static database number with the true dynamic number in memory!
                pass.queuePosition = truePosition; 
            }
        });
        // ==============================================================

        callback(passes); 
    }, (error) => {
        console.error("Error listening to pending passes:", error);
    });
}

/**
 * Listens for Active Passes in real-time.
 */
export function listenToActivePasses(callback) {
    const q = query(passesRef, where("status", "in", ["active", "active_bypassed"]));
    
    return onSnapshot(q, (snapshot) => {
        const passes = [];
        snapshot.forEach((doc) => passes.push({ id: doc.id, ...doc.data() }));
        callback(passes); 
    });
}

/**
 * Listens for Bypassed OR Fraudulent Passes for the Admin Dashboard
 */
export function listenToBypassedPasses(callback) {
    // 🟢 ADDED: "fraudulent_review" so flagged passes route to the Admin Bypassed Review column
    const q = query(passesRef, where("status", "in", ["active_bypassed", "returned_bypassed", "fraudulent_review"]));
    
    return onSnapshot(q, (snapshot) => {
        const passes = [];
        snapshot.forEach((doc) => {
            passes.push({ id: doc.id, ...doc.data() });
        });
        callback(passes);
    });
}

/**
 * Listens for Scheduled Passes in real-time.
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

// 🟢 NEW: Listens for Waitlisted Passes for a specific room
export function listenToWaitlist(roomId, callback) {
    const q = query(
        passesRef, 
        where("destination", "==", roomId), 
        where("status", "==", "waitlist")
    );
    return onSnapshot(q, (snapshot) => {
        const list = [];
        snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
        // Sort by queuePosition so top of list is first
        callback(list.sort((a, b) => a.queuePosition - b.queuePosition));
    });
}

/**
 * Updates the status of a pass (e.g., active, returned, rejected)
 */
export async function updatePassStatus(passId, newStatus, extraFields = {}) {
    try {
        const passDoc = doc(db, "passes", passId);
        
        const passSnap = await getDoc(passDoc);
        const passData = passSnap.exists() ? passSnap.data() : null;

        if (passData) {
            if (newStatus === "active" && (passData.status === "pending_restricted" || passData.status === "pending_warning")) {
                newStatus = "active_bypassed";
                extraFields.bypassedBy = extraFields.bypassedBy || "Teacher"; 
            }
            if (newStatus === "returned" && passData.status === "active_bypassed") {
                newStatus = "returned_bypassed";
            }
        }

        const updateData = { 
            status: newStatus,
            ...extraFields 
        };
        
        // 🎯 FIREBASE 400 FIX: Safely convert our boolean flags to serverTimestamps
        if (extraFields.arrivedAt === true) {
            updateData.arrivedAt = serverTimestamp();
        }
        if (extraFields.departedAt === true) {
            updateData.departedAt = serverTimestamp();
        }
        
        const isAlreadyActive = passData && (passData.status === "active" || passData.status === "active_bypassed");
        if ((newStatus === "active" || newStatus === "active_bypassed") && !isAlreadyActive) {
            updateData.acceptedAt = serverTimestamp();
        }
        
        const isAlreadyReturned = passData && (passData.status === "returned" || passData.status === "returned_bypassed");
        if ((newStatus === "returned" || newStatus === "returned_bypassed") && !isAlreadyReturned) {
            updateData.returnedAt = serverTimestamp();
        }
        
        if (newStatus === "archived" && (!passData || passData.status !== "archived")) {
            updateData.archivedAt = serverTimestamp();
        }
        
        // Ensure no undefined values sneak into Firebase causing a 400 Error
        Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

        await updateDoc(passDoc, updateData);
        console.log(`Pass ${passId} updated to: ${newStatus}`);

        if ((newStatus === "returned" || newStatus === "returned_bypassed" || newStatus === "rejected" || newStatus === "cancelled") && passData && passData.destination) {
            await processRoomRelease(passData.destination);
        }

    } catch (error) {
        console.error("Failed to update pass:", error);
    }
}

// 🟢 NEW: Promotes the oldest waitlisted student when a spot opens up
export async function processRoomRelease(roomId) {
    try {
        const waitlistQ = query(
            passesRef, 
            where("destination", "==", roomId), 
            where("status", "==", "waitlist"),
            orderBy("createdAt", "asc")
        );
        const snap = await getDocs(waitlistQ);
        
        if (!snap.empty) {
            const nextPass = snap.docs[0];
            
            // Promote to "pending" (or pending_student) so they have 2 mins to accept
            await updateDoc(doc(db, "passes", nextPass.id), {
                status: "pending_student", // Student must click "Use" to accept
                promotedAt: serverTimestamp() // We will use this in the Cloud Function!
            });
            
            console.log(`Promoted pass ${nextPass.id} from waitlist.`);
        }
    } catch (error) {
        console.error("Error processing room release:", error);
    }
}

/**
 * Listens for a specific student's active, pending, or restricted passes
 */
export function listenToStudentPass(studentId, callback) {
    console.log(`🎧 MAIN ENGINE: Listening for passes belonging to ID: ${studentId}`);
    
    // 🔒 Strictly queries by studentId
    const q = query(passesRef, where("studentId", "==", studentId));
    
    return onSnapshot(q, (snapshot) => {
        console.log(`📦 MAIN ENGINE: Found ${snapshot.size} total passes for this ID in Firebase.`);
        let currentPass = null;
        
        snapshot.forEach((doc) => {
            const pass = { id: doc.id, ...doc.data() };
            console.log(`   🔍 Checking Pass: ${pass.id} | Status: ${pass.status} | Location: ${pass.uiLocation}`);
            
            // 🛑 Ignore passes that are currently sitting in the Message Center inbox!
            if (pass.uiLocation === "message_center") {
                console.log(`      🚫 Skipped: Pass is still in the inbox.`);
                return; 
            }
            
            // 🟢 Valid active/scheduled statuses
            if (
                pass.status === "active" || 
                pass.status === "active_bypassed" || 
                pass.status === "pending" || 
                pass.status === "pending_student" || 
                pass.status === "pending_restricted" ||
                pass.status === "pending_warning" || 
                pass.status === "scheduled" ||
                pass.status === "waitlist" 
            ) {
                console.log(`      **✅ MATCH!** Loading this pass into the UI.`);
                currentPass = pass; 
            } else {
                console.log(`      ❌ Skipped: Pass has an invalid or expired status.`);
            }
        });
        
        if (!currentPass) console.log("   ⚠️ RESULT: No valid active passes found. Loading Idle Screen.");
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
        // 🎯 MIGRATION FIX: Point to unified "users" collection and filter by role
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("role", "==", "student"), where("email", "==", email));
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
        // 🎯 MIGRATION FIX: Point to unified "users" collection and filter by role
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("role", "==", "student"));
        const snapshot = await getDocs(q);
        const students = [];
        
        snapshot.forEach(doc => {
            const data = doc.data();
            
            const sName = data.displayName || data.name || data.studentName || data.Name || data['Student Name'] || "Unknown Student";
            
            let sEmail = null;

            if (doc.id.includes('@')) {
                sEmail = doc.id;
            }

            if (!sEmail) {
                sEmail = data.email || data.Email || data.studentEmail || data['Student Email'] || data['Email Address'];
            }

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
            
            if (sName !== "Unknown Student") {
                students.push({ 
                    id: doc.id, 
                    displayName: sName, 
                    email: sEmail || "No Email Attached" 
                });
            }
        });
        
        return students.sort((a, b) => a.displayName.localeCompare(b.displayName));
    } catch (error) {
        console.error("Error fetching all students:", error);
        return [];
    }
}

/**
 * Cancels (deletes) a scheduled pass permanently
 */
export async function cancelScheduledPass(passId) {
    try {
        const passDoc = doc(db, "passes", passId);
        await deleteDoc(passDoc);
        console.log(`Pass ${passId} cancelled successfully.`);
        return true;
    } catch (error) {
        console.error("Failed to cancel pass:", error);
        alert("Error cancelling pass. Check console.");
        return false;
    }
}

// ==============================================================
// 🟢 NEW: HISTORICAL PASS ENGINE (Teacher Pass History & Edits)
// ==============================================================

/**
 * Listens for Returned, Archived, and Fraudulent passes
 */
export function listenToPassHistory(callback) {
    const q = query(passesRef, where("status", "in", ["returned", "returned_bypassed", "archived", "fraudulent_review"]));
    return onSnapshot(q, (snapshot) => {
        const passes = [];
        snapshot.forEach((doc) => passes.push({ id: doc.id, ...doc.data() }));
        callback(passes); 
    });
}

/**
 * Edits a past pass's destination and/or start/end times
 */
export async function editPassHistory(passId, updates, editorName) {
    try {
        const passDoc = doc(db, "passes", passId);
        await updateDoc(passDoc, {
            ...updates, // 🟢 Now accepts destination, acceptedAt, and returnedAt dynamically!
            editedBy: editorName,
            editedAt: serverTimestamp()
        });
        return true;
    } catch (error) {
        console.error("Failed to edit pass:", error);
        return false;
    }
}

/**
 * Flags a pass as fraudulent and moves it to Admin Review
 */
export async function flagPassFraudulent(passId, explanation) {
    try {
        const passDoc = doc(db, "passes", passId);
        await updateDoc(passDoc, {
            status: "fraudulent_review", // This status triggers it to move to the Admin column
            fraudExplanation: explanation,
            flaggedAt: serverTimestamp()
        });
        return true;
    } catch (error) {
        console.error("Failed to flag pass:", error);
        return false;
    }
}

/**
 * 📜 ADMIN HISTORY ENGINE
 * Fetches all completed/archived passes for the Admin History Viewer.
 * We use getDocs here instead of onSnapshot to prevent downloading 
 * potentially 10,000+ passes in real-time constantly.
 */
export async function fetchAdminPassHistory() {
    // We grab all returned, archived, and fraudulent passes
    const q = query(passesRef, where("status", "in", ["returned", "returned_bypassed", "archived", "fraudulent_review"]));
    try {
        const snapshot = await getDocs(q);
        const passes = [];
        snapshot.forEach((doc) => passes.push({ id: doc.id, ...doc.data() }));
        return passes;
    } catch (error) {
        console.error("Error fetching admin history:", error);
        return [];
    }
}