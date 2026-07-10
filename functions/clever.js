const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const axios = require("axios");

// 🔑 GLOBAL API TOKEN
const CLEVER_DISTRICT_TOKEN = "4087e150fd39cce1cf0e5b6ae089b6e13bd28dab"; 

// Grab the database instance (already initialized in index.js)
const db = admin.firestore();

// =======================================================
// 🎓 NIGHTLY STUDENT & SCHEDULE SYNC
// =======================================================
exports.nightlyStudentSync = onSchedule({
    schedule: "30 2 * * *",         // Runs at 2:30 AM
    timeZone: "America/Chicago",   
}, async (event) => {
    try {
        if (!CLEVER_DISTRICT_TOKEN) {
            console.error("❌ Aborting Sync: Clever API Token is missing.");
            return;
        }

        console.log("🚀 Starting Nightly Student and Schedule Sync...");

        // ---------------------------------------------------------
        // PHASE 1: Fetch All Active Students from Clever
        // ---------------------------------------------------------
        console.log("📥 Step 1: Fetching student profiles...");
        const studentMap = {}; 
        
        // 🔥 FIX: Corrected Clever v3.0 endpoint for students
        let studentUrl = "https://api.clever.com/v3.0/users?role=student&limit=100";

        while (studentUrl) {
            const response = await axios.get(studentUrl, {
                headers: { Authorization: `Bearer ${CLEVER_DISTRICT_TOKEN}` }
            });

            const records = response.data.data || [];
            records.forEach(item => {
                const s = item.data;
                const docId = s.email ? s.email.toLowerCase().trim() : s.id;

                studentMap[s.id] = {
                    docId: docId,
                    cleverId: s.id,
                    firstName: s.name?.first || "",
                    lastName: s.name?.last || "",
                    displayName: `${s.name?.first || ""} ${s.name?.last || ""}`.trim(),
                    email: s.email ? s.email.toLowerCase().trim() : "",
                    grade: s.roles?.student?.grade || "N/A",
                    role: "student",
                    schedule: {} 
                };
            });

            const nextLink = response.data.links?.find(l => l.rel === "next");
            studentUrl = nextLink ? (nextLink.uri.startsWith("http") ? nextLink.uri : `https://api.clever.com${nextLink.uri}`) : null;
        }

        console.log(`✅ Loaded ${Object.keys(studentMap).length} students into memory cache.`);

        // ---------------------------------------------------------
        // PHASE 2: Fetch All Class Sections & Map to Student Schedules
        // ---------------------------------------------------------
        console.log("📥 Step 2: Fetching academic sections and building schedules...");
        let sectionsUrl = "https://api.clever.com/v3.0/sections?limit=100";

        while (sectionsUrl) {
            const response = await axios.get(sectionsUrl, {
                headers: { Authorization: `Bearer ${CLEVER_DISTRICT_TOKEN}` }
            });

            const sections = response.data.data || [];
            sections.forEach(item => {
                const sec = item.data;
                const period = sec.period || "Unknown";
                const className = sec.name || "Unnamed Class";
                const primaryTeacherId = sec.teacher || (sec.teachers && sec.teachers[0]) || "";
                const enrolledStudentIds = sec.students || [];

                enrolledStudentIds.forEach(studentId => {
                    if (studentMap[studentId]) {
                        studentMap[studentId].schedule[period] = {
                            className: className,
                            teacherCleverId: primaryTeacherId
                        };
                    }
                });
            });

            const nextLink = response.data.links?.find(l => l.rel === "next");
            sectionsUrl = nextLink ? (nextLink.uri.startsWith("http") ? nextLink.uri : `https://api.clever.com${nextLink.uri}`) : null;
        }

        console.log("✅ Schedules compiled successfully. Preparing Firestore push...");

        // ---------------------------------------------------------
        // PHASE 3: Batch Commit to Firestore
        // ---------------------------------------------------------
        let batch = db.batch();
        let operationCount = 0;
        let totalSaved = 0;

        const studentsArray = Object.values(studentMap);

        for (const student of studentsArray) {
            const docRef = db.collection("users").doc(student.docId);

            batch.set(docRef, {
                cleverId: student.cleverId,
                firstName: student.firstName,
                lastName: student.lastName,
                displayName: student.displayName,
                email: student.email,
                grade: student.grade, // 🔥 ADD THIS LINE
                role: student.role,
                schedule: student.schedule,
                lastCleverSync: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            operationCount++;
            totalSaved++;

            if (operationCount >= 450) {
                await batch.commit();
                console.log(`⏳ Progress: Saved ${totalSaved} student schedules...`);
                batch = db.batch();
                operationCount = 0;
            }
        }

        if (operationCount > 0) {
            await batch.commit();
        }

        console.log(`🎉 Success! Nightly sync finished. Updated ${totalSaved} student accounts.`);

    } catch (error) {
        console.error("❌ Critical Error during nightlyStudentSync execution:", error);
    }
});
    
// =======================================================
// 🔑 CLEVER LOGIN CALLBACK
// =======================================================
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

        const meResponse = await axios.get('https://api.clever.com/v3.0/me', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        const cleverId = meResponse.data.data.id;
        const userType = meResponse.data.data.type; 

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

        let parsedSchedule = [];
        let rawScheduleDebug = "";

        try {
            const sectionsResponse = await axios.get(`https://api.clever.com/v3.0/users/${cleverId}/sections`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            
            const rawSections = sectionsResponse.data.data || [];
            rawScheduleDebug = JSON.stringify(rawSections, null, 2);

            parsedSchedule = rawSections.map(sec => ({
                sectionId: sec.data.id || "",
                className: sec.data.name || "Unknown Class",
                period: sec.data.period || "N/A",
                teacherId: sec.data.teacher || (sec.data.teachers && sec.data.teachers[0]) || "N/A",
                termId: sec.data.term_id || "" 
            }));

        } catch (sectionError) {
            console.error("Could not fetch sections for user:", sectionError.message);
            rawScheduleDebug = `Failed to sync sections: ${sectionError.message}`;
        }

        const userRef = db.collection("users").doc(email);
        const userPayload = {
            cleverId: cleverId,
            email: email,
            displayName: `${firstName} ${lastName}`,
            role: (userType === "teacher" || userType === "staff" || userType === "district_admin") ? "teacher" : "student",
            schedule: parsedSchedule, 
            lastLogin: admin.firestore.FieldValue.serverTimestamp()
        };

        if (userPayload.role === "student") {
            userPayload.studentName = `${firstName} ${lastName}`;
        }

        await userRef.set(userPayload, { merge: true });
        console.log(`Successfully synced and saved Clever profile for ${email}`);

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
            </div>
        `);

    } catch (error) {
        console.error("Clever OAuth Error:", error.response ? error.response.data : error.message);
        res.status(500).send("Failed to securely exchange token with Clever.");
    }
});


// =======================================================
// 🏫 NIGHTLY STAFF SYNC
// =======================================================
exports.nightlyTeacherSync = onSchedule({
    schedule: "0 2 * * *",         
    timeZone: "America/Chicago",   
}, async (event) => {
    try {
        console.log("Starting nightly staff sync from Clever...");
        
        const headers = { "Authorization": `Bearer ${CLEVER_DISTRICT_TOKEN}` };

        const [teachersRes, staffRes, districtAdminsRes] = await Promise.all([
            axios.get("https://api.clever.com/v3.0/users?role=teacher", { headers }),
            axios.get("https://api.clever.com/v3.0/users?role=staff", { headers }),
            axios.get("https://api.clever.com/v3.0/users?role=district_admin", { headers })
        ]);
        
        const allCleverStaff = [
            ...(teachersRes.data.data || []),
            ...(staffRes.data.data || []),
            ...(districtAdminsRes.data.data || [])
        ];
        
        if (allCleverStaff.length === 0) {
            console.log("No staff found or Clever API error.");
            return;
        }

        const usersSnapshot = await db.collection("users").get();
        const existingUsers = {};
        usersSnapshot.forEach(doc => {
            existingUsers[doc.id] = doc.data();
        });

        const batch = db.batch();
        let count = 0;

        allCleverStaff.forEach(staffObj => {
            const t = staffObj.data;
            if (!t.email) return; 
            
            const docRef = db.collection("users").doc(t.email); 
            const existingData = existingUsers[t.email] || {};
            
            let defaultRole = "teacher";
            if (t.roles && (t.roles.staff || t.roles.district_admin)) {
                defaultRole = "admin";
            }
            
            const userRole = existingData.role || defaultRole;

            // 🛡️ Name Protection Logic
            let finalFirstName = t.name.first || "";
            let finalLastName = t.name.last || "";
            let finalDisplayName = `${finalFirstName} ${finalLastName}`.trim();

            if (existingData.manualNameOverride) {
                finalFirstName = existingData.firstName || finalFirstName;
                finalLastName = existingData.lastName || finalLastName;
                finalDisplayName = existingData.displayName || finalDisplayName;
            }
            
            batch.set(docRef, {
                cleverId: t.id,
                firstName: finalFirstName,
                lastName: finalLastName,
                displayName: finalDisplayName,
                email: t.email,
                role: userRole, 
                lastCleverSync: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true }); 
            
            count++;
        });

        await batch.commit();
        console.log(`✅ Successfully synced ${count} staff members from Clever.`);
        
    } catch (error) {
        console.error("❌ Error during nightly staff sync:", error);
    }
});