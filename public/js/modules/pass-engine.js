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
    const q = query(passesRef, where("status", "in", ["pending", "pending_student", "pending_restricted", "waitlist"]));
    
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

// Listens for passes that need Admin Review (Column 4)
export function listenToBypassedPasses(callback) {
    const q = query(passesRef, where("status", "in", ["active_bypassed", "returned_bypassed"]));
    
    return onSnapshot(q, (snapshot) => {
        const passes = [];
        snapshot.forEach((doc) => passes.push({ id: doc.id, ...doc.data() }));
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
        
        // Fetch current pass data so we know the room destination
        const passSnap = await getDoc(passDoc);
        const passData = passSnap.exists() ? passSnap.data() : null;

        // 🌟 Merge new status and any extra metadata payload (like bypassedBy)
        const updateData = { 
            status: newStatus,
            ...extraFields 
        };
        
        // Add timestamps based on the action
        if (newStatus === "active" || newStatus === "active_bypassed") updateData.acceptedAt = serverTimestamp();
        if (newStatus === "returned" || newStatus === "returned_bypassed") updateData.returnedAt = serverTimestamp();
        if (newStatus === "archived") updateData.archivedAt = serverTimestamp();
        
        await updateDoc(passDoc, updateData);
        console.log(`Pass ${passId} updated to: ${newStatus}`);

        // 🟢 FIXED: Now triggers room release on Reject and Cancel too!
        if ((newStatus === "returned" || newStatus === "returned_bypassed" || newStatus === "rejected" || newStatus === "cancelled") && passData && passData.destination) {
            await processRoomRelease(passData.destination);
        }

    } catch (error) {
        console.error("Failed to update pass:", error);
        alert("Error updating pass. Check console.");
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
 * Creates a brand new pass in the database (With Restriction & Waitlist Gatekeepers)
 */
export async function createNewPass(passData) {

    // 📍 1. Define your Hallway Routing Dictionary (Mapped to your SVG coordinates!)
    const hallwayRoutes = {
        "Outside": ["Main Entrance", "Auditorium Lobby"], 
        "Main Entrance": ["Outside", "100 Hallway"],
        "100 Hallway": ["Main Entrance", "Main Vertical Hall"],
        "Main Vertical Hall": ["100 Hallway", "Cross Corridor Block", "300 Hallway", "Fine Arts Corridor"],
        "Cross Corridor Block": ["Main Vertical Hall", "Gym Lobby"],
        "Gym Lobby": ["Cross Corridor Block", "Gym Vertical Hall"],
        "Gym Vertical Hall": ["Gym Lobby", "Fine Arts Corridor"],
        "300 Hallway": ["Main Vertical Hall", "Exit Hall 300s"],
        "Exit Hall 300s": ["300 Hallway"],
        "Fine Arts Corridor": ["Main Vertical Hall", "Gym Vertical Hall", "Auditorium Lobby"],
        "Auditorium Lobby": ["Fine Arts Corridor", "Outside"],
        "Unknown": [] // Failsafe for unmapped rooms
    };

    // 📍 2. Helper to find a path between origin and destination
    function getPath(originCorridor, destCorridor, visited = new Set()) {
        if (originCorridor === destCorridor) return [originCorridor];
        visited.add(originCorridor);
        const neighbors = hallwayRoutes[originCorridor] || [];
        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                const path = getPath(neighbor, destCorridor, visited);
                if (path) return [originCorridor, ...path];
            }
        }
        return null; // No path found
    }

    // 📍 3. Pre-Flight Check: Hallway Lockdown
    const lockedCorridors = window.lockedCorridors || []; 

    if (lockedCorridors.length > 0) {
        const origin = passData.originCorridor || "Unknown"; 
        const dest = passData.destCorridor || "Unknown";
        
        // Calculate the physical route they must walk
        const calculatedRoute = getPath(origin, dest) || [origin, dest];
        
        // Check if any corridor in their route is currently locked down
        const blockedCorridor = calculatedRoute.find(corridor => lockedCorridors.includes(corridor));
        
        if (blockedCorridor) {
            // Conflict found! Block the pass.
            await addDoc(passesRef, {
                ...passData,
                status: "pending_restricted",
                restrictionType: "area_lockdown", 
                lockedAreaName: blockedCorridor, 
                createdAt: serverTimestamp()
            });
            
            // This triggers your blind denial screen for the student perfectly.
            return { success: true, status: "blocked_blind" }; 
        }
    }
    
    
    try {
        // =========================================================
        // 🚨 1. PAIRING RESTRICTION GATEKEEPER
        // =========================================================
        if (passData.studentId) {
            const restrictionDocRef = doc(db, "restrictions", passData.studentId);
            const restrictionSnap = await getDoc(restrictionDocRef);
            
            if (restrictionSnap.exists()) {
                const noContactList = restrictionSnap.data().noContact || [];
                
                // Check if any of these "no-contact" peers have an ACTIVE pass
                for (const peerId of noContactList) {
                    const activePeerQ = query(
                        passesRef,
                        where("studentId", "==", peerId), 
                        where("status", "in", ["active", "active_bypassed"])
                    );
                    const activeSnaps = await getDocs(activePeerQ);
                    
                    if (!activeSnaps.empty) {
                        // 🌟 NEW: Grab the peer's name directly from their active pass!
                        const conflictingPassData = activeSnaps.docs[0].data();
                        const peerName = conflictingPassData.studentDisplayName || "Unknown Student";

                        // Conflict found! Block the pass and route to Admin Review.
                        await addDoc(passesRef, {
                            ...passData,
                            status: "pending_restricted",
                            restrictedPeer: peerId, 
                            restrictedPeerName: peerName, // 🌟 Save the name for the UI!
                            restrictionReason: "Admin No-Contact Restriction",
                            createdAt: serverTimestamp()
                        });
                        
                        console.log(`Restriction Gatekeeper Blocked Pass: Peer ${peerId} is active.`);
                        // Return the custom status so the front-end knows to show the Blind UI
                        return { success: true, status: "blocked_blind" };
                    }
                }
            }
        }
        // =========================================================
        // 🚦 2. LOCATION CAPACITY GATEKEEPER (Your existing logic)
        // =========================================================
        if (passData.destination) {
            const limitRef = doc(db, "location_limits", passData.destination);
            const limitSnap = await getDoc(limitRef);
            
            if (limitSnap.exists()) {
                const maxCapacity = limitSnap.data().maxCapacity;

                // 1. Count currently Active passes for this exact room
                const activeQ = query(
                    passesRef, 
                    where("destination", "==", passData.destination), 
                    where("status", "in", ["active", "active_bypassed"]) // Catch bypassed passes too!
                );
                const activeSnaps = await getDocs(activeQ);
                const currentCount = activeSnaps.size;

                // 2. If room is at or over capacity, route to WAITLIST
                if (currentCount >= maxCapacity) {
                    
                    // Count how many people are already on the waitlist to find their position
                    const waitlistQ = query(
                        passesRef, 
                        where("destination", "==", passData.destination), 
                        where("status", "==", "waitlist")
                    );
                    const waitlistSnaps = await getDocs(waitlistQ);
                    const queuePosition = waitlistSnaps.size + 1;

                    // Save as waitlist instead of pending/active
                    await addDoc(passesRef, {
                        ...passData,
                        status: "waitlist",
                        queuePosition: queuePosition,
                        createdAt: serverTimestamp()
                    });
                    
                    console.log(`Location full. Placed on waitlist at position ${queuePosition}`);
                    return { success: true, status: "waitlist", position: queuePosition };
                }
            }
        }
        // --- END GATEKEEPERS ---

        // =========================================================
        // ✅ 3. PROCEED NORMALLY (No restrictions, capacity open)
        // =========================================================
        await addDoc(passesRef, {
            ...passData,
            createdAt: serverTimestamp()
        });
        
        console.log("New pass created successfully!");
        return { success: true, status: passData.status || "pending" };
        
    } catch (error) {
        console.error("Error creating pass:", error);
        alert("Failed to create pass. Check console.");
        return { success: false, error: error };
    }
}

/**
 * Listens for a specific student's active, pending, or restricted passes
 */
export function listenToStudentPass(studentName, callback) {
    const q = query(passesRef, where("studentDisplayName", "==", studentName));
    
    return onSnapshot(q, (snapshot) => {
        let currentPass = null;
        
        snapshot.forEach((doc) => {
            const pass = { id: doc.id, ...doc.data() };
            
            // 🟢 ADDED "waitlist" to student listeners so their app knows they are waiting
            if (
                pass.status === "active" || 
                pass.status === "pending" || 
                pass.status === "pending_student" || 
                pass.status === "pending_restricted" ||
                pass.status === "scheduled" ||
                pass.status === "waitlist" 
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