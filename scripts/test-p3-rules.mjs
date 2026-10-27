/**
 * scripts/test-p3-rules.mjs
 *
 * Firestore Security Rules Unit Tests for Phase 3:
 * - A create with every wizard field -> allowed.
 * - 11 offerings -> denied.
 * - A barangay outside the list -> denied.
 * - The owner writes tour360 or shoot360 -> denied.
 * - The admin -> allowed.
 * - Another user reads a draft -> denied.
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

const PROJECT_ID = 'demo-calzada-p3-rules';

async function runRulesTests() {
    console.log('========================================================');
    console.log('PHASE 3: FIRESTORE RULES UNIT TESTS (@firebase/rules-unit-testing)');
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

        const ownerUid = 'owner_user_p3';
        const otherUid = 'other_user_p3';
        const adminUid = 'admin_user_p3';

        const ownerContext = testEnv.authenticatedContext(ownerUid, { admin: false });
        const otherContext = testEnv.authenticatedContext(otherUid, { admin: false });
        const adminContext = testEnv.authenticatedContext(adminUid, { admin: true });

        const ownerDb = ownerContext.firestore();
        const otherDb = otherContext.firestore();
        const adminDb = adminContext.firestore();

        const validWizardPayload = {
            ownerId: ownerUid,
            status: 'pending',
            submittedAt: serverTimestamp(),
            name: 'Calamba Coffee Hub',
            category: 'coffee',
            address: '123 Rizal St, Uno, Calamba',
            description: 'Freshly brewed local coffee.',
            contactNumber: '09123456789',
            location: { lat: 14.21, lng: 121.16 },
            plan: 'plus360',
            thumbnailUrl: 'https://res.cloudinary.com/calzada/image/upload/v12345/store.jpg',
            offerings: ['Brewed Coffee', 'Espresso', 'Pastries'],
            openHours: {
                mon: [{ open: '08:00', close: '18:00' }],
                tue: [{ open: '08:00', close: '18:00' }],
                wed: [{ open: '08:00', close: '18:00' }],
                thu: [{ open: '08:00', close: '18:00' }],
                fri: [{ open: '08:00', close: '20:00' }],
                sat: [{ open: '08:00', close: '20:00' }],
                sun: []
            },
            barangay: 'Uno',
            landmark: 'Near Rizal Shrine'
        };

        // 1. A create with every wizard field -> allowed.
        console.log('--- Test 1: Create with every wizard field ---');
        try {
            await assertSucceeds(setDoc(doc(ownerDb, 'businesses/biz_valid'), validWizardPayload));
            report(true, 'A create with every wizard field -> allowed.');
        } catch (err) {
            report(false, `A create with every wizard field failed: ${err.message}`);
        }

        // 2. 11 offerings -> denied.
        console.log('\n--- Test 2: 11 offerings -> denied ---');
        try {
            const elevenOfferings = {
                ...validWizardPayload,
                offerings: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']
            };
            await assertFails(setDoc(doc(ownerDb, 'businesses/biz_11_offerings'), elevenOfferings));
            report(true, '11 offerings -> denied.');
        } catch (err) {
            report(false, `11 offerings test unexpected error: ${err.message}`);
        }

        // 3. A barangay outside the list -> denied.
        console.log('\n--- Test 3: Barangay outside the list -> denied ---');
        try {
            const badBarangay = {
                ...validWizardPayload,
                barangay: 'BarangayOutsideList'
            };
            await assertFails(setDoc(doc(ownerDb, 'businesses/biz_bad_brgy'), badBarangay));
            report(true, 'A barangay outside the list -> denied.');
        } catch (err) {
            report(false, `Barangay outside list unexpected error: ${err.message}`);
        }

        // Setup an approved business owned by ownerUid for update tests
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const bypassDb = context.firestore();
            await setDoc(doc(bypassDb, 'businesses/biz_approved'), {
                ...validWizardPayload,
                status: 'approved',
                shoot360: 'to_schedule'
            });
        });

        // 4. The owner writes tour360 or shoot360 -> denied.
        console.log('\n--- Test 4: Owner writes tour360 or shoot360 -> denied ---');
        try {
            await assertFails(updateDoc(doc(ownerDb, 'businesses/biz_approved'), {
                shoot360: 'scheduled'
            }));
            report(true, 'The owner writes shoot360 -> denied.');
        } catch (err) {
            report(false, `Owner write shoot360 unexpected error: ${err.message}`);
        }

        try {
            await assertFails(updateDoc(doc(ownerDb, 'businesses/biz_approved'), {
                tour360: {
                    photos: [{ url: 'https://res.cloudinary.com/calzada/tour.jpg', thumbUrl: 'https://res.cloudinary.com/calzada/thumb.jpg', label: 'Entrance' }],
                    publishedAt: serverTimestamp(),
                    version: 1
                }
            }));
            report(true, 'The owner writes tour360 -> denied.');
        } catch (err) {
            report(false, `Owner write tour360 unexpected error: ${err.message}`);
        }

        // 5. The admin -> allowed.
        console.log('\n--- Test 5: The admin -> allowed ---');
        try {
            await assertSucceeds(updateDoc(doc(adminDb, 'businesses/biz_approved'), {
                shoot360: 'scheduled',
                shoot360Date: serverTimestamp()
            }));
            report(true, 'The admin writes shoot360 and shoot360Date -> allowed.');
        } catch (err) {
            report(false, `Admin update shoot360 failed: ${err.message}`);
        }

        try {
            await assertSucceeds(updateDoc(doc(adminDb, 'businesses/biz_approved'), {
                shoot360: 'done',
                tour360: {
                    photos: [{
                        url: 'https://res.cloudinary.com/calzada/image/upload/v1/tour.jpg',
                        thumbUrl: 'https://res.cloudinary.com/calzada/image/upload/v1/thumb.jpg',
                        label: 'Entrance'
                    }],
                    publishedAt: serverTimestamp(),
                    version: 1
                }
            }));
            report(true, 'The admin writes tour360 and sets shoot360: done -> allowed.');
        } catch (err) {
            report(false, `Admin update tour360 failed: ${err.message}`);
        }

        // 6. Another user reads a draft -> denied.
        console.log('\n--- Test 6: Another user reads a draft -> denied ---');
        try {
            // Owner creates a draft
            await assertSucceeds(setDoc(doc(ownerDb, `businessDrafts/${ownerUid}`), {
                step: 'store',
                data: { name: 'Draft Store' }
            }));
            report(true, 'Owner creates draft in businessDrafts/{uid} -> allowed.');

            // Other user tries to read owner draft -> denied
            await assertFails(getDoc(doc(otherDb, `businessDrafts/${ownerUid}`)));
            report(true, 'Another user reads a draft -> denied.');

            // Owner reads own draft -> allowed
            await assertSucceeds(getDoc(doc(ownerDb, `businessDrafts/${ownerUid}`)));
            report(true, 'Owner reads own draft -> allowed.');
        } catch (err) {
            report(false, `Draft security rules failed: ${err.message}`);
        }

    } finally {
        await testEnv.cleanup();
    }

    console.log('\n========================================================');
    console.log(`P3 RULES RESULTS: ${passedCount} passed, ${failedCount} failed`);
    console.log('========================================================');
    if (failedCount > 0) {
        process.exit(1);
    }
}

runRulesTests().catch(err => {
    console.error('P3 Rules test execution error:', err);
    process.exit(1);
});
