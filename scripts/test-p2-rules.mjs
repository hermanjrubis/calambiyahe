/**
 * scripts/test-p2-rules.mjs
 *
 * Firestore Security Rules Unit Tests for Phase 2:
 * - Admin may read and write place_reviews
 * - Non-admin client reads and writes to place_reviews are denied
 * - Admin may read adminActivity and emailLog
 * - Non-admin client reads to adminActivity and emailLog are denied
 * - Client writes to adminActivity and emailLog are denied (write: if false)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rulesPath = path.resolve(__dirname, '../firestore.rules');
const rulesContent = fs.readFileSync(rulesPath, 'utf8');

const PROJECT_ID = 'demo-calzada-p2-rules';

async function runRulesTests() {
    console.log('========================================================');
    console.log('PHASE 2: FIRESTORE RULES UNIT TESTS (@firebase/rules-unit-testing)');
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

        const adminUid = 'admin_user_p2';
        const regularUid = 'regular_user_p2';

        const adminContext = testEnv.authenticatedContext(adminUid, { admin: true });
        const regularContext = testEnv.authenticatedContext(regularUid, { admin: false });
        const unauthContext = testEnv.unauthenticatedContext();

        const adminDb = adminContext.firestore();
        const regularDb = regularContext.firestore();
        const unauthDb = unauthContext.firestore();

        // Setup pre-existing documents using admin security rules context bypass
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const bypassDb = context.firestore();
            await setDoc(doc(bypassDb, 'place_reviews/rev_1'), {
                placeId: 'place_123',
                rating: 5,
                commentText: 'Great place!',
                status: 'active'
            });
            await setDoc(doc(bypassDb, 'adminActivity/act_1'), {
                event: 'payment_received',
                entityId: 'bus_123',
                summary: 'Payment received'
            });
            await setDoc(doc(bypassDb, 'emailLog/log_1'), {
                event: 'business_live',
                entityId: 'bus_123',
                to: ['owner@test.com']
            });
        });

        // 1. Admin may read place_reviews
        console.log('--- Test 1: Admin may read place_reviews ---');
        try {
            await assertSucceeds(getDoc(doc(adminDb, 'place_reviews/rev_1')));
            report(true, 'Admin may read place_reviews -> allowed.');
        } catch (err) {
            report(false, `Admin read place_reviews failed: ${err.message}`);
        }

        // 2. Admin operations on place_reviews
        console.log('\n--- Test 2: Admin place_reviews permissions ---');
        try {
            await assertSucceeds(updateDoc(doc(adminDb, 'place_reviews/rev_1'), {
                status: 'hidden',
                hiddenReason: 'Moderated',
                updatedAt: serverTimestamp()
            }));
            report(true, 'Admin sets status hidden + hiddenReason + updatedAt -> allowed.');
        } catch (err) {
            report(false, `Admin update place_reviews (hidden+reason+updatedAt) failed: ${err.message}`);
        }

        try {
            await assertFails(deleteDoc(doc(adminDb, 'place_reviews/rev_1')));
            report(true, 'Admin deletes a place_review -> denied.');
        } catch (err) {
            report(false, `Admin delete place_review unexpected: ${err.message}`);
        }

        try {
            await assertFails(updateDoc(doc(adminDb, 'place_reviews/rev_1'), {
                rating: 1
            }));
            report(true, 'Admin updates rating -> denied.');
        } catch (err) {
            report(false, `Admin update rating unexpected: ${err.message}`);
        }

        // 3. Non-admin client reads to place_reviews are denied
        console.log('\n--- Test 3: Non-admin reads place_reviews ---');
        try {
            await assertFails(getDoc(doc(regularDb, 'place_reviews/rev_1')));
            report(true, 'Regular user read place_reviews -> denied.');
        } catch (err) {
            report(false, `Regular user read place_reviews unexpected: ${err.message}`);
        }

        try {
            await assertFails(getDoc(doc(unauthDb, 'place_reviews/rev_1')));
            report(true, 'Unauthenticated user read place_reviews -> denied.');
        } catch (err) {
            report(false, `Unauth read place_reviews unexpected: ${err.message}`);
        }

        // 4. Non-admin client writes to place_reviews are denied
        console.log('\n--- Test 4: Non-admin writes place_reviews ---');
        try {
            await assertFails(updateDoc(doc(regularDb, 'place_reviews/rev_1'), { status: 'active' }));
            report(true, 'Regular user write place_reviews -> denied.');
        } catch (err) {
            report(false, `Regular user write place_reviews unexpected: ${err.message}`);
        }

        // 5. Admin may read adminActivity
        console.log('\n--- Test 5: Admin may read adminActivity ---');
        try {
            await assertSucceeds(getDoc(doc(adminDb, 'adminActivity/act_1')));
            report(true, 'Admin may read adminActivity -> allowed.');
        } catch (err) {
            report(false, `Admin read adminActivity failed: ${err.message}`);
        }

        // 6. Non-admin reads to adminActivity denied
        console.log('\n--- Test 6: Non-admin reads adminActivity ---');
        try {
            await assertFails(getDoc(doc(regularDb, 'adminActivity/act_1')));
            report(true, 'Regular user read adminActivity -> denied.');
        } catch (err) {
            report(false, `Regular user read adminActivity unexpected: ${err.message}`);
        }

        // 7. Client writes to adminActivity denied (both admin and non-admin)
        console.log('\n--- Test 7: Client writes to adminActivity ---');
        try {
            await assertFails(setDoc(doc(adminDb, 'adminActivity/act_client'), {
                event: 'test_event',
                summary: 'Should fail'
            }));
            report(true, 'Admin client write to adminActivity -> denied.');
        } catch (err) {
            report(false, `Admin write to adminActivity unexpected: ${err.message}`);
        }

        try {
            await assertFails(setDoc(doc(regularDb, 'adminActivity/act_client_reg'), {
                event: 'test_event',
                summary: 'Should fail'
            }));
            report(true, 'Regular user client write to adminActivity -> denied.');
        } catch (err) {
            report(false, `Regular user write to adminActivity unexpected: ${err.message}`);
        }

        // 8. Admin may read emailLog
        console.log('\n--- Test 8: Admin may read emailLog ---');
        try {
            await assertSucceeds(getDoc(doc(adminDb, 'emailLog/log_1')));
            report(true, 'Admin may read emailLog -> allowed.');
        } catch (err) {
            report(false, `Admin read emailLog failed: ${err.message}`);
        }

        // 9. Non-admin reads to emailLog denied
        console.log('\n--- Test 9: Non-admin reads emailLog ---');
        try {
            await assertFails(getDoc(doc(regularDb, 'emailLog/log_1')));
            report(true, 'Regular user read emailLog -> denied.');
        } catch (err) {
            report(false, `Regular user read emailLog unexpected: ${err.message}`);
        }

        // 10. Client writes to emailLog denied (both admin and non-admin)
        console.log('\n--- Test 10: Client writes to emailLog ---');
        try {
            await assertFails(setDoc(doc(adminDb, 'emailLog/log_client'), {
                event: 'test_event',
                to: ['test@example.com']
            }));
            report(true, 'Admin client write to emailLog -> denied.');
        } catch (err) {
            report(false, `Admin write to emailLog unexpected: ${err.message}`);
        }

        try {
            await assertFails(setDoc(doc(regularDb, 'emailLog/log_client_reg'), {
                event: 'test_event',
                to: ['test@example.com']
            }));
            report(true, 'Regular user client write to emailLog -> denied.');
        } catch (err) {
            report(false, `Regular user write to emailLog unexpected: ${err.message}`);
        }

    } finally {
        await testEnv.cleanup();
    }

    console.log('\n========================================================');
    console.log(`P2 RULES RESULTS: ${passedCount} passed, ${failedCount} failed`);
    console.log('========================================================');
    if (failedCount > 0) {
        process.exit(1);
    }
}

runRulesTests().catch(err => {
    console.error('P2 Rules test execution error:', err);
    process.exit(1);
});
