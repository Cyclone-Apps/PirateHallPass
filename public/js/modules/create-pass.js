import { doc, getDoc, getDocs, query, where, addDoc, collection } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { evaluateLockdownState } from "../features/f-lockdowns.js";
import { getSpoofSafeTimestamp, getAdjustedNow } from "./time-engine.js";

// ⚠️ IMPORTANT: You need to import your 'db' from wherever your Firebase configuration lives. 
import { db } from "../firebase-config.js"; 

// Recreate the reference to the passes collection
const passesRef = collection(db, "passes");

/**
 * Creates a brand new pass in the database (With Restriction, Cooldown & Waitlist Gatekeepers)
 */
export async function createNewPass(passData) {

    // =========================================================
    // 🛑 0. GATEKEEPER 0: LOCKDOWN CHECK
    // =========================================================
    const lockdownStatus = evaluateLockdownState();
    if (!lockdownStatus.allowed) {
        console.warn("Pass creation blocked:", lockdownStatus.message);
        
        // Return a clean failure object instead of throwing a hard error
        return { 
            success: false, 
            message: lockdownStatus.message,
            error: lockdownStatus.message // Including both keys just to be safe!
        };
    }

    // =========================================================
    // 🌟 NEW: SKIP CHECK-IN FLAG ASSIGNMENT
    // =========================================================
    try {
        // Default all passes to require a check-in
        passData.requiresCheckIn = true; 
        
        let skipList = {};
        
        // Try to pull from a live cache first to save database reads, 
        // otherwise fetch the master schedule directly.
        if (window.liveMasterSchedule && window.liveMasterSchedule.skipCheckInRooms) {
            skipList = window.liveMasterSchedule.skipCheckInRooms;
        } else {
            const scheduleSnap = await getDoc(doc(db, "settings", "master_schedule"));
            if (scheduleSnap.exists()) {
                skipList = scheduleSnap.data().skipCheckInRooms || {};
            }
        }

        // Check for exact match first, then fallback to lowercase just in case
        const exactMatch = passData.destination;
        const lowerMatch = (passData.destination || "").toLowerCase().trim();

        if (skipList[exactMatch] || skipList[lowerMatch]) {
            passData.requiresCheckIn = false;
        }
    } catch (err) {
        console.error("Error evaluating skipCheckIn status:", err);
        // Failsafe: if something breaks, it defaults to true (normal behavior)
    }

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

    // Forgiving lookup: Checks exact matches first, then uses Smart Keyword & Number Routing!
    function resolveCorridor(roomName) {
        if (!roomName) return "Unknown";
        
        const rawStr = String(roomName).toLowerCase().trim();
        const searchStr = rawStr.replace(/^(room|rm)\s*/i, "").trim();

        // 1. Check exact dictionary match first
        for (const [key, value] of Object.entries(roomToCorridor)) {
            const cleanKey = key.toLowerCase().replace(/^(room|rm)\s*/i, "").trim();
            if (cleanKey === searchStr) {
                return value;
            }
        }

        // 2. SMART KEYWORD ROUTING (Overrides numbers if they exist, like "138 Band")
        if (rawStr.includes("band") || rawStr.includes("vocal") || rawStr.includes("choir")) {
            return "Fine Arts Corridor";
        }
        if (rawStr.includes("gym")) {
            return "Cross Corridor Block";
        }

        // 3. SMART NUMBER ROUTING (Extracts the first number it finds, e.g. "138" -> 100 Hallway)
        const match = searchStr.match(/\d+/);
        if (match) {
            const roomNum = parseInt(match[0], 10);
            if (roomNum >= 100 && roomNum < 200) return "100 Hallway";
            if (roomNum >= 200 && roomNum < 300) return "Main Vertical Hall";
            if (roomNum >= 300 && roomNum < 400) return "300 Hallway";
            if (roomNum >= 400 && roomNum < 500) return "Fine Arts Corridor";
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
                createdAt: getSpoofSafeTimestamp()
            });
            
            return { success: true, status: "blocked_blind" }; 
        }
    }
    
    try {
        // =========================================================
        // 🚨 1. PAIRING RESTRICTION GATEKEEPER (Red Screen)
        // =========================================================
        if (passData.studentId) {
            console.log(`🛑 [RESTRICTION ENGINE] Starting check for Requester: ${passData.studentDisplayName}`);
            
            // 🎯 DIRECT RESOLVER: Targets the exact database structure from your screenshot
            const getRestrictionsByEmail = async (emailStr) => {
                let list = [];
                if (!emailStr) return list;
                
                try {
                    // Look up the user's document directly using their email as the Document ID
                    const userDocRef = doc(db, "users", emailStr);
                    const userDocSnap = await getDoc(userDocRef);
                    
                    if (userDocSnap.exists()) {
                        const data = userDocSnap.data();
                        
                        // Drill down exactly into data.restrictions.noContactPeers
                        if (data.restrictions && data.restrictions.noContactPeers) {
                            console.log(`   📂 [DB QUERY] Found noContactPeers for ${emailStr}:`, data.restrictions.noContactPeers);
                            list.push(...data.restrictions.noContactPeers);
                        } else {
                            console.log(`   📂 [DB QUERY] No restriction array found for ${emailStr}.`);
                        }
                    }
                } catch (e) {
                    console.warn(`⚠️ [DB QUERY] Error searching for ${emailStr}:`, e);
                }
                return [...new Set(list)]; // Return unique values
            };

            const requesterEmail = passData.studentEmail || passData.studentId;
            let noContactList = await getRestrictionsByEmail(requesterEmail);
            console.log(`🛑 [RESTRICTION ENGINE] No-Contact List after DB check:`, noContactList);

            const activeQ = query(passesRef, where("status", "in", ["active", "active_bypassed"]));
            const activeSnaps = await getDocs(activeQ);
            
            console.log(`🛑 [RESTRICTION ENGINE] Found ${activeSnaps.size} active passes in the hallway.`);

            for (const activeDoc of activeSnaps.docs) {
                const activePass = activeDoc.data();
                console.log(`   🧑‍🎓 [HALLWAY CHECK] Looking at active pass for: ${activePass.studentDisplayName}`);
                
                const activeIdentifiers = [activePass.studentId, activePass.studentEmail, activePass.studentDisplayName].filter(Boolean).map(id => String(id).toLowerCase());
                const currentIdentifiers = [passData.studentId, passData.studentEmail, passData.studentDisplayName].filter(Boolean).map(id => String(id).toLowerCase());
                
                let isConflict = false;

                // CHECK A: Is active student on the requester's restricted list?
                if (noContactList.some(peerStr => {
                    const peerLower = String(peerStr).toLowerCase();
                    return activeIdentifiers.some(id => peerLower.includes(id) || id.includes(peerLower));
                })) {
                    console.log(`   ❌ CONFLICT CAUGHT (CHECK A)`);
                    isConflict = true;
                }

                // CHECK B (BI-DIRECTIONAL): Is the requester on the active student's restricted list?
                if (!isConflict) {
                    const activeEmail = activePass.studentEmail || activePass.studentId;
                    const hallwayNoContact = await getRestrictionsByEmail(activeEmail);
                    console.log(`   🛑 [HALLWAY CHECK] Active student's list:`, hallwayNoContact);
                    
                    if (hallwayNoContact.some(peerStr => {
                        const peerLower = String(peerStr).toLowerCase();
                        return currentIdentifiers.some(id => peerLower.includes(id) || id.includes(peerLower));
                    })) {
                        console.log(`   ❌ CONFLICT CAUGHT (CHECK B)`);
                        isConflict = true;
                    }
                }

                if (isConflict) {
                    const peerName = activePass.studentDisplayName || activePass.studentEmail || "Unknown Student";
                    console.log(`   🚫 BLOCKING PASS! Conflict with: ${peerName}`);

                    await addDoc(passesRef, {
                        ...passData,
                        status: "pending_restricted",
                        restrictedPeer: activePass.studentId || "Unknown", 
                        restrictedPeerName: peerName,
                        restrictionReason: "Admin No-Contact Restriction",
                        createdAt: getSpoofSafeTimestamp()
                    });
                    
                    return { success: true, status: "blocked_blind" };
                }
            }
            console.log(`✅ [RESTRICTION ENGINE] All checks cleared.`);
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
            const startOfDay = getAdjustedNow();
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
                        warningReason = `Last pass was ${Math.round(minutesSinceLastPass)} minutes ago.`;
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
                        createdAt: getSpoofSafeTimestamp()
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
            createdAt: getSpoofSafeTimestamp()
        });
        
        return { success: true, status: finalStatus };
        
    } catch (error) {
        console.error("Error creating pass:", error);
        alert("Failed to create pass. Check console.");
        return { success: false, error: error };
    }
}