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
            // Fallback to title only if description is completely empty
            if (!e.description) return e.summary || ""; 
            
            // 1. Convert Google Calendar <br> tags into standard newlines
            let desc = e.description.replace(/<br\s*[\/]?>/gi, "\n");
            
            // 2. Remove all other HTML formatting Google might sneak in
            desc = desc.replace(/(<([^>]+)>)/gi, "");
            
            // 3. Fix weird spacing entities
            desc = desc.replace(/&nbsp;/gi, " ");
            
            // 4. Split the text by the line breaks, clean up spacing, and rejoin with " / "
            // This turns "L-Tacos \n\n Fiesta Rice" directly into "L-Tacos / Fiesta Rice"
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