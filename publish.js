const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const fs = require("fs");
const { execSync } = require("child_process");

// 1. Initialize Firebase Admin
// Make sure serviceAccountKey.json is in the same directory and gitignored!
const serviceAccount = require("./serviceAccountKey.json"); 

initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();
const FILES_TO_CHECK = [
    'index.html', 'admin.html', 'student.html', 'teacher.html', 'map.html', 'reports.html', '404.html', 'logo.png', 'icon-192.png', 'icon-512.png',
    'css/components.css', 'css/states.css', 'css/student.css', 'css/style.css',
    'js/firebase-config.js', 'js/main-admin.js', 'js/main-student.js', 'js/main-teacher.js', 'js/map.js',
    'js/modules/admin-engine.js', 'js/modules/auth-roles.js', 'js/modules/create-pass.js', 'js/modules/map-engine.js', 'js/modules/pass-engine.js', 'js/modules/student-ui.js', 'js/modules/time-engine.js', 'js/modules/ui-widgets.js',
    'js/features/f-edit-pass.js', 'js/features/f-finalize-pass.js', 'js/features/f-lockdowns-admin.js', 'js/features/f-lockdowns-ui.js', 'js/features/f-lockdowns.js', 'js/features/f-map-room-settings.js', 'js/features/f-ota-updater.js', 'js/features/f-pass-history.js', 'js/features/f-retro-pass.js', 'js/features/f-room-names.js', 'js/features/f-schedule-popup.js', 'js/features/f-schedule-utils.js', 'js/features/f-scheduled-pass-engine.js', 'js/features/f-send-pass.js', 'js/features/f-staff-rooms.js', 'js/features/f-staff-roster.js', 'js/features/f-staff-schedule.js', 'js/features/f-staff-sync.js', 'js/features/f-student-management.js', 'js/features/f-teacher-history.js', 'js/features/f-time-controls.js',
    'js/admin/admin-dashboard.js', 'js/admin/admin-message.js', 'js/admin/admin-passes.js', 'js/admin/admin-restrictions.js', 'js/admin/admin-settings.js', 'js/admin/admin-students.js',
    'js/reports/r-compare.js', 'js/reports/r-intersections.js', 'js/reports/r-select.js', 'js/reports/r-single.js', 'js/reports/r-timeframe.js', 'js/reports/r-utils.js', 'js/reports/reports-main.js', 'js/reports/two-students.js'
];

async function publishAndDeploy() {
    console.log("🚀 Starting publish sequence...");
    
    const fileVersions = {};
    
    // 3. Read local file modification times (Prepended with public/ for the local file system)
    FILES_TO_CHECK.forEach(file => {
        try {
            const stats = fs.statSync(`public/${file}`); // <--- CRITICAL FIX HERE
            fileVersions[file] = stats.mtime.toISOString(); 
        } catch (e) {
            console.warn(`⚠️ Could not find public/${file}, skipping...`);
        }
    });

    // ... (rest of the publishAndDeploy function remains exactly the same)

    // 4. Update Firestore with the new timestamps
    console.log("📝 Writing file versions to Firestore...");
    try {
        await db.collection("settings").doc("file_versions").set(fileVersions);
        console.log("✅ Firestore updated successfully.");
    } catch (error) {
        console.error("❌ Failed to update Firestore:", error);
        process.exit(1);
    }

    // 5. Run standard Firebase Deploy
    console.log("🔥 Deploying to Firebase Hosting...");
    try {
        // stdio: "inherit" ensures you still see Firebase's colorful deployment logs in your terminal
        execSync("firebase deploy --only hosting", { stdio: "inherit" });
        console.log("🎉 Deployment Complete!");
    } catch (error) {
        console.error("❌ Deployment failed:", error.message);
    }
    
    process.exit(0);
}

publishAndDeploy();