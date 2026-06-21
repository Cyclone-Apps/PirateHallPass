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
        
        // Fetch current pass data so we know the room destination and current status
        const passSnap = await getDoc(passDoc);
        const passData = passSnap.exists() ? passSnap.data() : null;

        // 🌟 AUTO-UPGRADE APPROVALS TO ADMIN REVIEW (BYPASSED)
        if (passData) {
            // If it was a restriction or warning and the teacher approved it
            if (newStatus === "active" && (passData.status === "pending_restricted" || passData.status === "pending_warning")) {
                newStatus = "active_bypassed";
                extraFields.bypassedBy = extraFields.bypassedBy || "Teacher"; // Note who overrode it
            }
            // If it was bypassed and the student returns, keep it in the bypassed column
            if (newStatus === "returned" && passData.status === "active_bypassed") {
                newStatus = "returned_bypassed";
            }
        }

        // Merge new status and any extra metadata payload
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
 * Creates a brand new pass in the database (With Restriction, Cooldown & Waitlist Gatekeepers)
 */
export async function createNewPass(passData) {

    // 📍 1. Define your Hallway Routing Dictionary 
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
        "Unknown": [] 
    };

    // 📍 2. Bulletproof Room-to-Corridor Dictionary
    const roomToCorridor = {
        "Room 112": "100 Hallway", "Room 110": "100 Hallway", "Room 108": "100 Hallway", "Room 106": "100 Hallway", "Room 104": "100 Hallway", "Room 102": "100 Hallway", "Room 100B": "100 Hallway", "Room 100": "100 Hallway", "HS Office": "100 Hallway", "Main Entrance": "100 Hallway", "Room 107": "100 Hallway", "Room 103": "100 Hallway", "Room 101": "100 Hallway", "Custodial": "100 Hallway", "Girls Restroom 100s": "100 Hallway", "Mechanical": "100 Hallway", "Boys Restroom 100s": "100 Hallway", "Room 109": "100 Hallway", "Room 105": "100 Hallway",
        
        "Room 200": "Main Vertical Hall", "Room 202": "Main Vertical Hall", "Mechanical 2": "Main Vertical Hall", "District Office": "Main Vertical Hall", "Room 201A": "Main Vertical Hall", "Room 201": "Main Vertical Hall", "Restroom 200s": "Main Vertical Hall", "Girls Locker Room": "Main Vertical Hall", "LR Office": "Main Vertical Hall", "Boys Locker Room": "Main Vertical Hall", "Trainer's Office": "Main Vertical Hall",
        
        "Gym Lobby": "Cross Corridor Block", "Main Gym": "Cross Corridor Block",
        
        "Room 312": "300 Hallway", "Room 310": "300 Hallway", "Room 308": "300 Hallway", "Room 306": "300 Hallway", "Room 304": "300 Hallway", "Room 302": "300 Hallway", "Room 300C": "300 Hallway", "Room 300B": "300 Hallway", "Room 300A": "300 Hallway", "Mechanical 3": "300 Hallway", "Room 313": "300 Hallway", "Room 311": "300 Hallway", "Room 309": "300 Hallway", "Room 307": "300 Hallway", "Room 305": "300 Hallway", "Room 303": "300 Hallway", "Room 301": "300 Hallway", "Guidance": "300 Hallway",
        
        "Band Room": "Fine Arts Corridor", "Vocal Music": "Fine Arts Corridor", "NICC": "Fine Arts Corridor", "Room 400": "Fine Arts Corridor", "Room 401": "Fine Arts Corridor", "Auditorium": "Fine Arts Corridor", "Auditorium Lobby": "Fine Arts Corridor", "Auditorium RR": "Fine Arts Corridor",
        
        "Elementary Office/Other": "Outside", "Nurse": "Outside", "Library": "Outside"
    };

    // Forgiving lookup: Strips out "Room ", spaces, and cases so "301", "room 301", and "Room 301" all match instantly.
    function resolveCorridor(roomName) {
        if (!roomName) return "Unknown";
        
        const searchStr = String(roomName).toLowerCase().replace(/^(room|rm)\s*/i, "").trim();

        for (const [key, value] of Object.entries(roomToCorridor)) {
            const cleanKey = key.toLowerCase().replace(/^(room|rm)\s*/i, "").trim();
            if (cleanKey === searchStr) {
                return value;
            }
        }
        return "Unknown";
    }

    // 📍 3. Shortest-Path Router (Breadth-First Search)
    function getShortestPath(start, end) {
        if (start === end) return [start];
        if (!hallwayRoutes[start] || !hallwayRoutes[end]) return null;

        const queue = [[start]];
        const visited = new Set([start]);

        while (queue.length > 0) {
            const path = queue.shift();
            const current = path[path.length - 1];

            for (const neighbor of (hallwayRoutes[current] || [])) {
                if (neighbor === end) return [...path, neighbor];
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push([...path, neighbor]);
                }
            }
        }
        return null;
    }

    // 📍 4. Pre-Flight Check: Hallway Lockdown
    const lockedCorridors = window.lockedCorridors || []; 

    if (lockedCorridors.length > 0) {
        const origin = resolveCorridor(passData.origin);
        const dest = resolveCorridor(passData.destination);
        
        // Save these corrected values so the database is accurate
        passData.originCorridor = origin;
        passData.destCorridor = dest;
        
        // Calculate the physical route they must walk
        const calculatedRoute = getShortestPath(origin, dest) || [origin, dest];
        
        // Check if any corridor in their route is currently locked down
        const blockedCorridor = calculatedRoute.find(corridor => lockedCorridors.includes(corridor));
        
        if (blockedCorridor) {
            // Conflict found! Block the pass.
            await addDoc(passesRef, {
                ...passData,
                status: "pending_restricted",
                restrictionType: "area_lockdown", 
                lockedAreaName: blockedCorridor, 
                debugCalculatedRoute: calculatedRoute, // Added for debugging in Firebase
                createdAt: serverTimestamp()
            });
            
            return { success: true, status: "blocked_blind" }; 
        }
    }
    
    try {
        // =========================================================
        // 🚨 1. PAIRING RESTRICTION GATEKEEPER (Red Screen)
        // =========================================================
        if (passData.studentId) {
            const restrictionDocRef = doc(db, "restrictions", passData.studentId);
            const restrictionSnap = await getDoc(restrictionDocRef);
            
            if (restrictionSnap.exists()) {
                const noContactList = restrictionSnap.data().noContact || [];
                
                for (const peerId of noContactList) {
                    const activePeerQ = query(
                        passesRef,
                        where("studentId", "==", peerId), 
                        where("status", "in", ["active", "active_bypassed"])
                    );
                    const activeSnaps = await getDocs(activePeerQ);
                    
                    if (!activeSnaps.empty) {
                        const conflictingPassData = activeSnaps.docs[0].data();
                        const peerName = conflictingPassData.studentDisplayName || "Unknown Student";

                        await addDoc(passesRef, {
                            ...passData,
                            status: "pending_restricted",
                            restrictedPeer: peerId, 
                            restrictedPeerName: peerName,
                            restrictionReason: "Admin No-Contact Restriction",
                            createdAt: serverTimestamp()
                        });
                        
                        return { success: true, status: "blocked_blind" };
                    }
                }
            }
        }

        // =========================================================
        // ⚠️ 2. FREQUENT FLYER GATEKEEPER (Yellow Screen)
        // =========================================================
        let isYellowWarning = false;
        let warningReason = "";
        let dailyLog = [];

        if (passData.studentId && passData.studentId !== "unknown" && passData.type !== "tardy") {
            // Fetch the Global Restriction Settings
            const settingsDoc = await getDoc(doc(db, "system", "settings"));
            const settings = settingsDoc.exists() ? settingsDoc.data() : {};
            const cooldownMinutes = settings.cooldownMinutes || 15; // Default 15m
            const dailyMaxPasses = settings.dailyMaxPasses || 3;    // Default 3 passes

            // Fetch the student's passes for TODAY
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);

            const dailyQ = query(
                passesRef,
                where("studentId", "==", passData.studentId),
                where("createdAt", ">=", startOfDay)
            );
            
            const dailySnaps = await getDocs(dailyQ);
            
            // Build the daily log for the UI
            dailySnaps.forEach(d => {
                const p = d.data();
                // Only count passes that were actually accepted/used
                if (p.status.includes("active") || p.status.includes("returned") || p.status === "archived") {
                    dailyLog.push(p);
                }
            });

            // Check 1: Max Passes Exceeded?
            if (dailyLog.length >= dailyMaxPasses) {
                isYellowWarning = true;
                warningReason = `Exceeded daily limit (${dailyMaxPasses} passes). This is pass #${dailyLog.length + 1}.`;
            }

            // Check 2: Cooldown Violated? (Only if not already flagged)
            if (!isYellowWarning && dailyLog.length > 0) {
                // Find the most recently returned/active pass
                dailyLog.sort((a, b) => {
                    const timeA = a.returnedAt?.toMillis() || a.acceptedAt?.toMillis() || a.createdAt?.toMillis();
                    const timeB = b.returnedAt?.toMillis() || b.acceptedAt?.toMillis() || b.createdAt?.toMillis();
                    return timeB - timeA; // Descending
                });

                const lastPass = dailyLog[0];
                const lastTimeMillis = lastPass.returnedAt?.toMillis() || lastPass.acceptedAt?.toMillis() || lastPass.createdAt?.toMillis();
                
                if (lastTimeMillis) {
                    const minutesSinceLastPass = (Date.now() - lastTimeMillis) / (1000 * 60);
                    if (minutesSinceLastPass < cooldownMinutes) {
                        isYellowWarning = true;
                        warningReason = `Cooldown violation. Last pass was ${Math.round(minutesSinceLastPass)} minutes ago.`;
                    }
                }
            }
        }

        // =========================================================
        // 🚦 3. LOCATION CAPACITY GATEKEEPER 
        // =========================================================
        if (passData.destination) {
            const limitRef = doc(db, "location_limits", passData.destination);
            const limitSnap = await getDoc(limitRef);
            
            if (limitSnap.exists()) {
                const maxCapacity = limitSnap.data().maxCapacity;

                const activeQ = query(
                    passesRef, 
                    where("destination", "==", passData.destination), 
                    where("status", "in", ["active", "active_bypassed"]) 
                );
                const activeSnaps = await getDocs(activeQ);
                const currentCount = activeSnaps.size;

                if (currentCount >= maxCapacity) {
                    const waitlistQ = query(passesRef, where("destination", "==", passData.destination), where("status", "==", "waitlist"));
                    const waitlistSnaps = await getDocs(waitlistQ);
                    const queuePosition = waitlistSnaps.size + 1;

                    await addDoc(passesRef, {
                        ...passData,
                        status: "waitlist",
                        queuePosition: queuePosition,
                        createdAt: serverTimestamp()
                    });
                    
                    return { success: true, status: "waitlist", position: queuePosition };
                }
            }
        }
        // --- END GATEKEEPERS ---

        // =========================================================
        // ✅ 4. FINAL CREATION (Proceed Normally OR Flag as Yellow)
        // =========================================================
        // If flagged by the Frequent Flyer gatekeeper, change status and append log
        const finalStatus = isYellowWarning ? "pending_warning" : (passData.status || "pending");
        
        await addDoc(passesRef, {
            ...passData,
            status: finalStatus,
            warningReason: warningReason,
            dailyLogCount: dailyLog.length,
            createdAt: serverTimestamp()
        });
        
        return { success: true, status: finalStatus };
        
    } catch (error) {
        console.error("Error creating pass:", error);
        alert("Failed to create pass. Check console.");
        return { success: false, error: error };
    }
}

/**
 * Listens for a specific student's active, pending, or restricted passes
 */
export function listenToStudentPass(studentId, callback) {
    // 🔒 CHANGED: Now strictly queries by studentId instead of studentDisplayName
    const q = query(passesRef, where("studentId", "==", studentId));
    
    return onSnapshot(q, (snapshot) => {
        let currentPass = null;
        
        snapshot.forEach((doc) => {
            const pass = { id: doc.id, ...doc.data() };
            
            // Keep active passes on screen
            if (
                pass.status === "active" || 
                pass.status === "pending" || 
                pass.status === "pending_student" || 
                pass.status === "pending_restricted" ||
                pass.status === "pending_warning" || 
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