const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();
const db = admin.firestore();

// 📅 AUTOMATED DAILY SYNC (Runs every day at 4:00 AM Central Time)
exports.syncGoogleCalendars = onSchedule({
    schedule: "0 4 * * *",
    timeZone: "America/Chicago" 
}, async (event) => {
    try {
        console.log("Starting Daily Google Calendar Sync...");

        const settingsSnap = await db.collection("system").doc("settings").get();
        if (!settingsSnap.exists) return null;
        
        const settings = settingsSnap.data();
        const apiKey = settings.calendarApiKey;
        const rotationCalId = settings.rotationCalId;
        const lunchCalId = settings.lunchCalId;

        if (!apiKey) return null;

        const now = new Date();
        const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }); 
        const todayYYYYMMDD = formatter.format(now);
        const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const tomorrowYYYYMMDD = formatter.format(tomorrowDate);

        const timeMin = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
        const timeMax = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();

        let todayRotation = "N/A";
        if (rotationCalId) {
            try {
                const rotRes = await axios.get(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(rotationCalId)}/events?key=${apiKey}&timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true`);
                const todayEvent = rotRes.data.items.find(e => e.start && e.start.date === todayYYYYMMDD);
                if (todayEvent) todayRotation = todayEvent.summary;
            } catch (e) { console.error("Rotation Error:", e.message); }
        }

        // 🍽️ HELPER TO PARSE THE DESCRIPTION ONLY AND REPLACE LINE BREAKS WITH " / "
        const processMealEvent = (e) => {
            if (!e.description) return e.summary || ""; 
            
            let desc = e.description.replace(/<br\s*[\/]?>/gi, "\n");
            desc = desc.replace(/(<([^>]+)>)/gi, "");
            desc = desc.replace(/&nbsp;/gi, " ");
            desc = desc.split(/\n+/).map(line => line.trim()).filter(line => line.length > 0).join(" / ");
            
            return desc;
        };

        let todayMeals = "";
        let tomorrowMeals = "";
        if (lunchCalId) {
            try {
                const lunchRes = await axios.get(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(lunchCalId)}/events?key=${apiKey}&timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`);
                
                const todayItems = lunchRes.data.items.filter(e => e.start && e.start.date === todayYYYYMMDD);
                todayMeals = todayItems.map(processMealEvent).join("<br>");

                const tomorrowItems = lunchRes.data.items.filter(e => e.start && e.start.date === tomorrowYYYYMMDD);
                tomorrowMeals = tomorrowItems.map(processMealEvent).join("<br>");

            } catch (e) { console.error("Lunch Error:", e.message); }
        }

        await db.collection("system").doc("daily_info").set({
            rotationDay: todayRotation,
            lunchMenu: todayMeals,
            tomorrowMenu: tomorrowMeals,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        console.log("Successfully updated daily context in database!");
        return null;

    } catch (error) {
        console.error("Critical error inside sync:", error);
        return null;
    }
});

exports.manualCalendarSync = onCall(async (request) => {
    return { status: "Manual sync hook verified on backend." };
});

// ⏱️ AUTOMATED WAITLIST TIMEOUT SWEEPER (Runs every 1 minute)
exports.waitlistTimeoutSweep = onSchedule({
    schedule: "* * * * *", // Every minute
    timeZone: "America/Chicago"
}, async (event) => {
    try {
        const now = Date.now();
        
        // Fetch dynamic timeout setting
        const settingsSnap = await db.collection("system").doc("settings").get();
        let timeoutSeconds = 120; 
        if (settingsSnap.exists && settingsSnap.data().waitlistTimeoutSeconds) {
            timeoutSeconds = settingsSnap.data().waitlistTimeoutSeconds;
        }
        
        const TIMEOUT_MS = timeoutSeconds * 1000;
        const passesRef = db.collection("passes");
        
        // Find passes waiting for the student to accept ("pending_student")
        const snapshot = await passesRef.where("status", "==", "pending_student").get();
        if (snapshot.empty) return null;

        const batch = db.batch();
        const timeoutsToProcess = [];

        // Identify who has timed out
        snapshot.forEach(doc => {
            const pass = doc.data();
            if (pass.promotedAt) {
                const promotedTime = pass.promotedAt.toDate().getTime();
                if (now - promotedTime > TIMEOUT_MS) {
                    timeoutsToProcess.push({ doc, pass });
                }
            }
        });

        // Process the "Swaps"
        for (const item of timeoutsToProcess) {
            const timedOutDoc = item.doc;
            const passData = item.pass;
            const roomId = passData.destination;

            // Find the NEXT person in line for this specific room
            const waitlistSnap = await passesRef
                .where("destination", "==", roomId)
                .where("status", "==", "waitlist")
                .orderBy("createdAt", "asc")
                .limit(1) 
                .get();

            if (!waitlistSnap.empty) {
                const nextPassDoc = waitlistSnap.docs[0];
                const nextPassData = nextPassDoc.data();
                
                // SAFE TIMESTAMP CALCULATION: 1 millisecond behind
                const nextTimeMillis = nextPassData.createdAt.toDate().getTime();
                const newTimeForA = new Date(nextTimeMillis + 1); 

                // 1. Demote Student A to waitlist, slipping them right behind Student B
                batch.update(timedOutDoc.ref, {
                    status: "waitlist",
                    createdAt: newTimeForA,
                    promotedAt: null 
                });

                // 2. Promote Student B to the active spot
                batch.update(nextPassDoc.ref, {
                    status: "pending_student",
                    promotedAt: new Date() 
                });
                
                console.log(`Swapped timed out pass ${timedOutDoc.id} with next in line ${nextPassDoc.id}`);
            } else {
                // No one is behind them in line. Put back on waitlist.
                batch.update(timedOutDoc.ref, {
                    status: "waitlist",
                    createdAt: new Date(),
                    promotedAt: null
                });
                console.log(`Pass ${timedOutDoc.id} timed out. No one behind them. Placed back on waitlist.`);
            }
        }

        await batch.commit();
        return null;
    } catch (error) {
        console.error("Critical error in waitlist sweep:", error);
        return null;
    }
});