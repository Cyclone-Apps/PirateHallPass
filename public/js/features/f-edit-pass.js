import { renderPassList } from '../modules/ui-widgets.js';
import { updatePassStatus } from '../modules/pass-engine.js';

/**
 * Initializes the Fix Issues tab logic
 */
export function initFixIssuesTab() {
    const tabToday = document.getElementById('tab-history-today');
    const tabYesterday = document.getElementById('tab-history-yesterday');
    const tabIssues = document.getElementById('tab-history-issues');
    
    const listToday = document.getElementById('list-history-today');
    const listYesterday = document.getElementById('list-history-yesterday');
    const listIssues = document.getElementById('list-history-issues');

    if (!tabIssues) return;

    tabIssues.addEventListener('click', () => {
        // Toggle Active States
        tabToday.style.background = '#e0e0e0'; tabToday.style.color = '#333';
        tabYesterday.style.background = '#e0e0e0'; tabYesterday.style.color = '#333';
        tabIssues.style.background = '#c62828'; tabIssues.style.color = 'white';

        // Toggle Views
        listToday.classList.add('hidden');
        listYesterday.classList.add('hidden');
        listIssues.classList.remove('hidden');
    });
}

/**
 * Filters and routes stuck passes to the Fix Issues tab.
 * Call this inside your main pass listener whenever passes are fetched.
 */
export function processStuckPasses(stalePasses, currentUser) {
    const tabIssues = document.getElementById('tab-history-issues');
    const issuesCount = document.getElementById('issues-count');
    if (!tabIssues) return;

    // 🔍 LOG: Who does the computer think is logged in?
    console.log(`[STALE FILTER] Processing for user:`, currentUser?.displayName);

    // 1. TEACHER CHECK (Enforces accountability + catches orphans)
    const myStalePasses = stalePasses.filter(pass => {
        const hasOriginTeacher = pass.originTeacher && pass.originTeacher !== "Unknown" && pass.originTeacher.trim() !== "";
        const hasTargetTeacher = pass.targetTeacher && pass.targetTeacher !== "Unknown" && pass.targetTeacher.trim() !== "";
        const isOrphanedPass = !hasOriginTeacher && !hasTargetTeacher;

        const isMine = pass.originTeacher === currentUser?.displayName || 
               pass.targetTeacher === currentUser?.displayName ||
               pass.senderName === currentUser?.displayName || 
               currentUser?.role === 'admin' ||
               isOrphanedPass; 
               
        // 🔍 LOG: Why is it keeping/rejecting this pass?
        console.log(`[STALE FILTER] Pass ${pass.id} | Target: "${pass.targetTeacher}" | Origin: "${pass.originTeacher}" | Is Mine? ${isMine}`);

        return isMine;
    });
    
    // 🔍 LOG: Final count
    console.log(`[STALE FILTER] Total passes surviving the filter:`, myStalePasses.length);

    if (myStalePasses.length > 0) {
        tabIssues.classList.remove('hidden');
        tabIssues.style.display = 'flex';
        issuesCount.innerText = myStalePasses.length;
        
        renderPassList(myStalePasses, 'list-history-issues', 'issues-count');
        tabIssues.style.animation = "pulseAlert 2s infinite";

        // 🎯 NEW: Auto-open the tab if it's currently hidden
        if (document.getElementById('list-history-issues').classList.contains('hidden')) {
            tabIssues.click();
        }
        
    } else {
        tabIssues.classList.add('hidden');
        document.getElementById('list-history-issues').innerHTML = "";
    }
}

// 🎯 GLOBAL BUTTON ACTIONS
window.resolveStalePass = async (passId, action) => {
    const { getFirestore, doc, updateDoc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
    const db = getFirestore();

    if (action === 'deleted') {
        if (confirm("Are you sure you want to delete this pass record entirely?")) {
            await deleteDoc(doc(db, "passes", passId));
        }
    } else if (action === 'completed') {
        if (confirm("Mark this pass as properly completed?")) {
            await updateDoc(doc(db, "passes", passId), {
                status: 'completed',
                needsVerification: false // Removes the flag so it clears from the red tab!
            });
        }
    } else if (action === 'acknowledge') {
        await updateDoc(doc(db, "passes", passId), {
            needsVerification: false // Keeps it 'cancelled' but clears it from the red tab
        });
    }
};

/**
 * Exportable helper to quickly cancel a stuck pass
 */
export async function forceCloseStuckPass(passId) {
    if (confirm("Are you sure you want to cancel this old pass and remove it from the system?")) {
        // Leverages your existing updatePassStatus function
        await updatePassStatus(passId, "cancelled"); 
    }
}