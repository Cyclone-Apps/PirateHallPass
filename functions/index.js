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

// =======================================================
// 🎓 CLEVER INTEGRATION
// =======================================================
const { onRequest } = require("firebase-functions/v2/https");

exports.cleverCallback = onRequest(async (req, res) => {
    try {
        const code = req.query.code;
        
        if (!code) {
            res.status(400).send("No authorization code provided by Clever.");
            return;
        }

        const clientId = process.env.CLEVER_CLIENT_ID;
        const clientSecret = process.env.CLEVER_CLIENT_SECRET;
        const redirectUri = "https://us-central1-pirate-hall-pass.cloudfunctions.net/cleverCallback";
        const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

        // 1. Trade the code for an Access Token
        const tokenResponse = await axios.post('https://clever.com/oauth/tokens', {
            code: code,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri
        }, {
            headers: {
                'Authorization': `Basic ${authHeader}`,
                'Content-Type': 'application/json'
            }
        });

        const accessToken = tokenResponse.data.access_token;

        // 2. Ask Clever: "Who does this token belong to?"
        const meResponse = await axios.get('https://api.clever.com/v3.0/me', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        const cleverId = meResponse.data.data.id;
        const userType = meResponse.data.data.type; // student, teacher, etc.

        // 3. Fetch their actual profile details (Name, Email, etc.)
        const userResponse = await axios.get(`https://api.clever.com/v3.0/users/${cleverId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        const userData = userResponse.data.data;
        const firstName = userData.name.first;
        const lastName = userData.name.last;
        const email = (userData.email || "").toLowerCase().trim();

        if (!email || email === "no email provided") {
            res.status(400).send(`Authentication failed: Clever account for ${firstName} ${lastName} is missing an email address.`);
            return;
        }

        // 4. Fetch and Parse their Sections (Schedule) 
        let parsedSchedule = [];
        let rawScheduleDebug = "";

        try {
            const sectionsResponse = await axios.get(`https://api.clever.com/v3.0/users/${cleverId}/sections`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            
            const rawSections = sectionsResponse.data.data || [];
            rawScheduleDebug = JSON.stringify(rawSections, null, 2);

            // Clean up Clever data into a highly readable array for our app
            parsedSchedule = rawSections.map(sec => ({
                sectionId: sec.id || "",
                className: sec.name || "Unknown Class",
                period: sec.period || "N/A",
                teacherId: sec.teacher || (sec.teachers && sec.teachers[0]) || "N/A"
            }));

        } catch (sectionError) {
            console.error("Could not fetch sections for user:", sectionError.message);
            rawScheduleDebug = `Failed to sync sections: ${sectionError.message}`;
        }

        // 5. 🔥 SAVE THE COMPERHENSIVE USER PROFILE TO FIRESTORE
        const userRef = db.collection("users").doc(email);
        
        const userPayload = {
            cleverId: cleverId,
            email: email,
            displayName: `${firstName} ${lastName}`,
            role: (userType === "teacher" || userType === "staff") ? "teacher" : "student",
            schedule: parsedSchedule, // Hand their fresh class schedule to the database!
            lastLogin: admin.firestore.FieldValue.serverTimestamp()
        };

        // Maintain absolute backwards compatibility with existing UI hooks
        if (userPayload.role === "student") {
            userPayload.studentName = `${firstName} ${lastName}`;
        }

        // Write to Firestore with merge: true so we don't wipe out manual configurations or special overrides
        await userRef.set(userPayload, { merge: true });
        console.log(`Successfully synced and saved Clever profile for ${email}`);

        // 6. Display confirmation back to the tester
        res.send(`
            <div style="font-family: sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                <h1 style="color: #4CAF50; text-align: center;">✅ Clever Sync Successful!</h1>
                <p style="text-align: center; color: #666;">Your identity and active schedule are now safely stored in Firestore.</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                
                <h3>Database Document Linked: <span style="color: #007bff;">users/${email}</span></h3>
                <p><strong>Name:</strong> ${firstName} ${lastName}</p>
                <p><strong>Mapped Role:</strong> ${userPayload.role}</p>
                <p><strong>Clever ID:</strong> ${cleverId}</p>

                <h3>Structured Schedule Saved (${parsedSchedule.length} Classes Found)</h3>
                <pre style="background: #eef1f6; padding: 15px; border-radius: 4px; overflow-x: auto; font-size: 12px; border-left: 4px solid #007bff;">${JSON.stringify(parsedSchedule, null, 2)}</pre>

                <h3 style="color: #666; margin-top: 25px;">Raw Clever Response Payload</h3>
                <pre style="background: #f4f4f4; padding: 15px; border-radius: 4px; overflow-x: auto; font-size: 11px; color: #555;">${rawScheduleDebug}</pre>
            </div>
        `);

    } catch (error) {
        console.error("Clever OAuth Error:", error.response ? error.response.data : error.message);
        res.status(500).send("Failed to securely exchange token with Clever.");
    }
});