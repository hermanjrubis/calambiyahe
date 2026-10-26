/**
 * scripts/test-p1-rules.mjs
 *
 * Firestore Security Rules Unit Tests for Phase 1:
 * - The owner creates a planned entry -> allowed.
 * - Another user reads it -> denied.
 * - originLabel "14.2045, 121.1641" -> denied.
 * - planned -> cancelled -> allowed.
 * - arrived -> planned -> denied.
 * - Changing destName on update -> denied.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rulesPath = path.resolve(__dirname, '../firestore.rules');
const rulesContent = fs.readFileSync(rulesPath, 'utf8');

const PROJECT_ID = 'demo-calzada-p1-rules';

async function runRulesTests() {
    console.log('========================================================');
    console.log('PHASE 1: FIRESTORE RULES UNIT TESTS (@firebase/rules-unit-testing)');
    console.log('========================================================\n');

    let passedCount = 0;
    let failedCount = 0;

    function report(success, message) {
        if (success) {
            console.log(`  [PASS] ${message}`);
            passedCount++;
        } else {
            console.error(`  [FAIL] ${message}`);
            failedCount++;
        }
    }

    const testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: {
            host: '127.0.0.1',
            port: 8080,
            rules: rulesContent
        }
    });

    try {
        await testEnv.clearFirestore();

        const ownerUid = 'user_p1_owner';
        const otherUid = 'user_p1_other';

        const ownerContext = testEnv.authenticatedContext(ownerUid);
        const otherContext = testEnv.authenticatedContext(otherUid);

        const ownerDb = ownerContext.firestore();
        const otherDb = otherContext.firestore();

        const validPlannedData = {
            status: 'planned',
            destName: 'SM City Calamba',
            destLat: 14.2033,
            destLng: 121.1557,
            destCategory: 'malls',
            originLabel: 'Calamba City Hall',
            originKind: 'place',
            originBarangay: 'Real',
            mode: 'jeepney',
            estimatedMinutes: 15,
            distanceKm: 2.4,
            fare: 15,
            plannedAt: serverTimestamp(),
            startedAt: null,
            endedAt: null,
            cancelReason: null
        };

        // 1. The owner creates a planned entry -> allowed
        console.log('--- Test 1: Owner creates planned entry ---');
        const routeDocRef = doc(ownerDb, `users/${ownerUid}/routeHistory/route_123`);
        try {
            await assertSucceeds(setDoc(routeDocRef, validPlannedData));
            report(true, 'The owner creates a planned entry -> allowed.');
        } catch (err) {
            report(false, `The owner creates a planned entry failed: ${err.message}`);
        }

        // 2. Another user reads it -> denied
        console.log('\n--- Test 2: Another user reads it ---');
        const otherReadDocRef = doc(otherDb, `users/${ownerUid}/routeHistory/route_123`);
        try {
            await assertFails(getDoc(otherReadDocRef));
            report(true, 'Another user reads it -> denied.');
        } catch (err) {
            report(false, `Another user reads it was unexpectedly allowed: ${err.message}`);
        }

        // 3. originLabel with coordinates "14.2045, 121.1641" -> denied
        console.log('\n--- Test 3: originLabel containing coordinates ---');
        const badCoordDocRef = doc(ownerDb, `users/${ownerUid}/routeHistory/route_coord_test`);
        const badCoordData = {
            ...validPlannedData,
            originLabel: '14.2045, 121.1641'
        };
        try {
            await assertFails(setDoc(badCoordDocRef, badCoordData));
            report(true, 'originLabel "14.2045, 121.1641" -> denied.');
        } catch (err) {
            report(false, `originLabel with coordinates was unexpectedly allowed: ${err.message}`);
        }

        // 4. planned -> cancelled -> allowed
        console.log('\n--- Test 4: planned -> cancelled transition ---');
        try {
            await assertSucceeds(updateDoc(routeDocRef, {
                status: 'cancelled',
                cancelReason: 'user_cancelled',
                endedAt: serverTimestamp()
            }));
            report(true, 'planned -> cancelled -> allowed.');
        } catch (err) {
            report(false, `planned -> cancelled failed: ${err.message}`);
        }

        // Setup for Test 5 & 6: Create an arrived doc and an active planned doc
        console.log('\n--- Test 5: arrived -> planned transition ---');
        const arrivedDocRef = doc(ownerDb, `users/${ownerUid}/routeHistory/route_arrived_test`);
        // Use withSecurityRulesDisabled to set up initial arrived document
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const adminDb = context.firestore();
            await setDoc(doc(adminDb, `users/${ownerUid}/routeHistory/route_arrived_test`), {
                ...validPlannedData,
                status: 'arrived',
                startedAt: new Date(),
                endedAt: new Date()
            });
        });

        // Attempt arrived -> planned
        try {
            await assertFails(updateDoc(arrivedDocRef, {
                status: 'planned'
            }));
            report(true, 'arrived -> planned -> denied.');
        } catch (err) {
            report(false, `arrived -> planned was unexpectedly allowed: ${err.message}`);
        }

        // 6. Changing destName on update -> denied
        console.log('\n--- Test 6: Changing destName on update ---');
        const updateDestDocRef = doc(ownerDb, `users/${ownerUid}/routeHistory/route_dest_test`);
        await assertSucceeds(setDoc(updateDestDocRef, {
            ...validPlannedData,
            destName: 'Original Destination'
        }));

        try {
            await assertFails(updateDoc(updateDestDocRef, {
                destName: 'Tampered Destination'
            }));
            report(true, 'Changing destName on update -> denied.');
        } catch (err) {
            report(false, `Changing destName on update was unexpectedly allowed: ${err.message}`);
        }

        // 7. Anonymous user creates routeHistory -> denied
        console.log('\n--- Test 7: Anonymous user creates routeHistory ---');
        const anonUid = 'user_p1_anonymous';
        const anonContext = testEnv.authenticatedContext(anonUid, {
            provider_id: 'anonymous',
            firebase: { sign_in_provider: 'anonymous' }
        });
        const anonDb = anonContext.firestore();
        const anonDocRef = doc(anonDb, `users/${anonUid}/routeHistory/route_anon`);
        try {
            await assertFails(setDoc(anonDocRef, validPlannedData));
            report(true, 'anonymous user creates routeHistory -> denied.');
        } catch (err) {
            report(false, `anonymous user creates routeHistory was unexpectedly allowed: ${err.message}`);
        }

        // 8. started -> cancelled with switched_route + endedAt -> allowed
        console.log('\n--- Test 8: started -> cancelled with switched_route + endedAt ---');
        const startedDocRef = doc(ownerDb, `users/${ownerUid}/routeHistory/route_started_switch_test`);
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const adminDb = context.firestore();
            await setDoc(doc(adminDb, `users/${ownerUid}/routeHistory/route_started_switch_test`), {
                ...validPlannedData,
                status: 'started',
                startedAt: new Date()
            });
        });

        try {
            await assertSucceeds(updateDoc(startedDocRef, {
                status: 'cancelled',
                cancelReason: 'switched_route',
                endedAt: serverTimestamp()
            }));
            report(true, 'started -> cancelled with switched_route + endedAt -> allowed.');
        } catch (err) {
            report(false, `started -> cancelled with switched_route + endedAt failed: ${err.message}`);
        }

    } finally {
        await testEnv.cleanup();
    }

    console.log('\n========================================================');
    if (failedCount === 0) {
        console.log(`ALL ${passedCount} RULES UNIT TESTS PASSED SUCCESSFULLY!`);
    } else {
        console.error(`${failedCount} RULES UNIT TEST(S) FAILED!`);
        process.exit(1);
    }
    console.log('========================================================\n');
}

runRulesTests().catch(err => {
    console.error('Fatal error during rules test execution:', err);
    process.exit(1);
});
