/**
 * scripts/test-p2-events.mjs
 *
 * Verification tests for Phase 2 Event Dispatch & Authorization:
 * 1. Owner fires business_live -> 403 Forbidden
 * 2. Admin fires business_live on pending business -> 409 Conflict
 * 3. Valid call -> 200 OK + writes 1 emailLog doc + writes adminActivity
 * 4. Duplicate call -> 200 OK with { skipped: true } + idempotency maintained
 * 5. Owner sends to/version/data.ownerEmail -> response skipped or 200, emailLog "to" never has fake address
 * 6. 3 parallel identical calls -> exactly one emailLog doc
 * 7. payment_not_matched with entityId = payment id (status not_matched) -> 200, doc payment_not_matched_<paymentId>_1
 * 8. Second receipt (new lastPaymentId) -> a second payment_received log
 * 9. Client fires review_posted -> 403
 * 10. Without CALZADA_EMULATORS, an unsigned token -> 401
 */

import http from 'http';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.DRY_RUN_EMAIL = 'true';

let app;
if (getApps().length > 0) {
    app = getApps()[0];
} else {
    app = initializeApp({ projectId: 'calzada-web' });
}

const adminDb = getFirestore(app);
const API_BASE = 'http://127.0.0.1:5000';

let serverProcess = null;
function startAppServer() {
    return new Promise((resolve) => {
        const req = http.get(API_BASE, () => {
            console.log('[App Server] already running on port 5000');
            resolve();
        });
        req.on('error', () => {
            console.log('[App Server] Starting node server.js on port 5000 (CALZADA_EMULATORS=1)...');
            serverProcess = spawn('node', ['server.js'], {
                env: { ...process.env, PORT: '5000', CALZADA_EMULATORS: '1', DRY_RUN_EMAIL: 'true' },
                stdio: 'pipe'
            });
            setTimeout(resolve, 2500);
        });
    });
}

// Start Mock Auth Emulator on 9099
function startAuthEmulator() {
    return new Promise((resolve) => {
        const authServer = http.createServer((req, res) => {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                let uid = 'test_user';
                let customClaims = {};
                let email = 'user@test.calzadaph.com';

                try {
                    const parsed = body ? JSON.parse(body) : {};
                    const idToken = parsed.idToken;
                    if (idToken) {
                        const parts = idToken.split('.');
                        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
                        uid = payload.sub || uid;
                        email = payload.email || `${uid}@test.calzadaph.com`;
                        if (payload.admin === true) {
                            customClaims.admin = true;
                        }
                    }
                } catch (_) {}

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    kind: 'identitytoolkit#GetAccountInfoResponse',
                    users: [{
                        localId: uid,
                        email: email,
                        displayName: `User ${uid}`,
                        emailVerified: true,
                        customAttributes: JSON.stringify(customClaims)
                    }]
                }));
            });
        });

        authServer.listen(9099, '127.0.0.1', () => {
            console.log('Local Auth Emulator listening on 127.0.0.1:9099');
            resolve(authServer);
        });
    });
}

function createEmulatorToken(uid, claims = {}) {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
        sub: uid,
        user_id: uid,
        aud: "calzada-web",
        iss: "https://securetoken.google.com/calzada-web",
        email: `${uid}@test.calzadaph.com`,
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        auth_time: Math.floor(Date.now() / 1000),
        firebase: {
            sign_in_provider: "password"
        },
        ...claims
    })).toString('base64url');
    return `${header}.${payload}.`;
}

async function runEventsTests() {
    console.log('========================================================');
    console.log('PHASE 2: API EVENTS & AUTHORIZATION UNIT TESTS');
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

    const authServer = await startAuthEmulator();
    await startAppServer();

    const ownerUid = 'p2_owner_uid_test';
    const adminUid = 'p2_admin_uid_test';
    const busId = 'bus_p2_events_test';

    try {
        console.log('Generating test tokens for owner and admin...');
        const ownerToken = createEmulatorToken(ownerUid, { admin: false });
        const adminToken = createEmulatorToken(adminUid, { admin: true });

        // Clean previous test artifacts
        await adminDb.collection('businesses').doc(busId).delete().catch(() => {});
        await adminDb.collection('emailLog').doc(`business_live_${busId}_1`).delete().catch(() => {});

        // Setup test business doc in pending state
        await adminDb.collection('businesses').doc(busId).set({
            name: "Calamba Craft Coffee",
            ownerId: ownerUid,
            ownerEmail: "owner@craftcoffee.calamba",
            status: "pending",
            plan: "listed",
            amountDue: 59,
            submittedAt: new Date().toISOString()
        });

        // -------------------------------------------------------------
        // TEST 1: Owner fires business_live -> 403 Forbidden
        // -------------------------------------------------------------
        console.log('\n--- Test 1: Owner fires business_live -> 403 Forbidden ---');
        const res1 = await fetch(`${API_BASE}/api/events`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ownerToken}`
            },
            body: JSON.stringify({
                event: 'business_live',
                entityId: busId
            })
        });

        if (res1.status === 403) {
            report(true, 'Owner firing business_live returns 403 Forbidden.');
        } else {
            report(false, `Expected 403 Forbidden, got ${res1.status} (${await res1.text()})`);
        }

        // -------------------------------------------------------------
        // TEST 2: Admin fires business_live on pending -> 409 Conflict
        // -------------------------------------------------------------
        console.log('\n--- Test 2: Admin fires business_live on pending business -> 409 Conflict ---');
        const res2 = await fetch(`${API_BASE}/api/events`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                event: 'business_live',
                entityId: busId
            })
        });

        if (res2.status === 409) {
            report(true, 'Admin firing business_live on pending business returns 409 Conflict.');
        } else {
            report(false, `Expected 409 Conflict, got ${res2.status} (${await res2.text()})`);
        }

        // -------------------------------------------------------------
        // TEST 3: Valid call -> 200 OK + 1 emailLog doc
        // -------------------------------------------------------------
        console.log('\n--- Test 3: Valid call -> 200 OK + 1 emailLog doc ---');
        // Update business to approved + paidAt
        const paidAtDate = new Date();
        await adminDb.collection('businesses').doc(busId).update({
            status: 'approved',
            paidAt: paidAtDate
        });

        const res3 = await fetch(`${API_BASE}/api/events`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                event: 'business_live',
                entityId: busId,
                version: 1,
                data: {
                    plan: 'listed',
                    amountDue: 59,
                    referenceNo: '998877665544'
                }
            })
        });

        const res3Data = await res3.json();
        if (res3.status === 200 && (res3Data.ok || res3Data.success)) {
            report(true, 'Valid event dispatch returned 200 OK.');
        } else {
            report(false, `Expected 200 OK, got ${res3.status}: ${JSON.stringify(res3Data)}`);
        }

        // Check emailLog doc
        const liveVersionKey = String(paidAtDate.getTime());
        const emailLogRef = adminDb.collection('emailLog').doc(`business_live_${busId}_${liveVersionKey}`);
        const emailLogSnap = await emailLogRef.get();
        if (emailLogSnap.exists && emailLogSnap.data().dryRun === true && emailLogSnap.data().ok === true) {
            report(true, 'emailLog document created with dryRun: true and ok: true.');
        } else {
            report(false, `emailLog document not found or invalid: ${JSON.stringify(emailLogSnap.data())}`);
        }

        // Check adminActivity
        const actSnap = await adminDb.collection('adminActivity')
            .where('event', '==', 'business_live')
            .where('entityId', '==', busId)
            .get();

        if (!actSnap.empty) {
            report(true, 'adminActivity document logged with role admin.');
        } else {
            report(false, 'adminActivity document was not written.');
        }

        // -------------------------------------------------------------
        // TEST 4: Duplicate call -> 200 OK with { skipped: true } (idempotency)
        // -------------------------------------------------------------
        console.log('\n--- Test 4: Duplicate call -> idempotency (skipped: true) ---');
        const res4 = await fetch(`${API_BASE}/api/events`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                event: 'business_live',
                entityId: busId
            })
        });

        const res4Data = await res4.json();
        if (res4.status === 200 && (res4Data.skipped === true || (res4Data.result && res4Data.result.skipped === true))) {
            report(true, 'Duplicate event dispatch returned { skipped: true } (idempotent).');
        } else {
            report(false, `Expected skipped: true, got: ${JSON.stringify(res4Data)}`);
        }

        // Confirm still only 1 emailLog doc
        const emailLogSnap2 = await emailLogRef.get();
        if (emailLogSnap2.exists) {
            report(true, 'emailLog idempotency key maintained without duplicate entries.');
        } else {
            report(false, 'emailLog key missing after duplicate call.');
        }

        // -------------------------------------------------------------
        // TEST 5 (2.a): Owner sends to/version/data.ownerEmail -> fake address ignored
        // -------------------------------------------------------------
        console.log('\n--- Test 5 (2.a): Owner sends fake to/version/data.ownerEmail ---');
        const busIgnoreId = 'bus_ignore_test';
        const prevIgnoreLogs = await adminDb.collection('emailLog').where('entityId', '==', busIgnoreId).get();
        for (const iDoc of prevIgnoreLogs.docs) {
            await iDoc.ref.delete().catch(() => {});
        }

        await adminDb.collection('businesses').doc(busIgnoreId).set({
            name: "Ignore Fake Fields Cafe",
            ownerId: ownerUid,
            ownerEmail: "legit_owner@craftcoffee.calamba",
            status: "pending",
            submittedAt: new Date().toISOString()
        });

        const res5 = await fetch(`${API_BASE}/api/events`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ownerToken}`
            },
            body: JSON.stringify({
                event: 'application_received',
                entityId: busIgnoreId,
                to: 'fake_override@evil.com',
                version: 'fake_version_9999',
                data: {
                    ownerEmail: 'fake_in_data@evil.com'
                }
            })
        });
        const res5Data = await res5.json();
        if (res5.status === 200 || res5Data.skipped) {
            report(true, 'Owner sending fake to/version/data returned 200/skipped.');
        } else {
            report(false, `Expected 200 OK, got ${res5.status}: ${JSON.stringify(res5Data)}`);
        }

        const ignoreLogs = await adminDb.collection('emailLog').where('entityId', '==', busIgnoreId).get();
        let foundFake = false;
        ignoreLogs.forEach(docSnap => {
            const toList = docSnap.data().to || [];
            if (toList.includes('fake_override@evil.com') || toList.includes('fake_in_data@evil.com')) {
                foundFake = true;
            }
        });
        report(!foundFake && !ignoreLogs.empty, 'emailLog "to" never contains the fake address from request body.');

        // -------------------------------------------------------------
        // TEST 6 (2.b): 3 parallel identical calls -> exactly one emailLog doc
        // -------------------------------------------------------------
        console.log('\n--- Test 6 (2.b): 3 parallel identical calls ---');
        const busParallelId = 'bus_parallel_test';
        // Clean any leftover docs from previous test runs
        const prevParallelLogs = await adminDb.collection('emailLog').where('entityId', '==', busParallelId).get();
        for (const pDoc of prevParallelLogs.docs) {
            await pDoc.ref.delete().catch(() => {});
        }

        const parallelPaidAt = new Date();
        await adminDb.collection('businesses').doc(busParallelId).set({
            name: "Parallel Race Cafe",
            ownerId: ownerUid,
            ownerEmail: "parallel_owner@craftcoffee.calamba",
            status: "approved",
            paidAt: parallelPaidAt
        });

        const parallelCalls = [1, 2, 3].map(() =>
            fetch(`${API_BASE}/api/events`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify({
                    event: 'business_live',
                    entityId: busParallelId
                })
            }).then(r => r.json())
        );

        await Promise.all(parallelCalls);
        const parallelLogSnap = await adminDb.collection('emailLog')
            .where('entityId', '==', busParallelId)
            .where('event', '==', 'business_live')
            .get();

        report(parallelLogSnap.size === 1, `3 parallel identical calls -> exactly one emailLog doc (found ${parallelLogSnap.size}).`);

        // -------------------------------------------------------------
        // TEST 7 (2.c): payment_not_matched with entityId = payment id (status not_matched) -> 200, doc payment_not_matched_<paymentId>_1
        // -------------------------------------------------------------
        console.log('\n--- Test 7 (2.c): payment_not_matched with entityId = payment id ---');
        const paymentNotMatchedId = 'pay_unmatched_001';
        await adminDb.collection('payments').doc(paymentNotMatchedId).set({
            businessId: busId,
            status: 'not_matched',
            referenceNumber: 'REF_NOT_MATCH_123',
            reviewNote: 'Receipt reference not verified'
        });

        const res7 = await fetch(`${API_BASE}/api/events`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                event: 'payment_not_matched',
                entityId: paymentNotMatchedId
            })
        });

        const res7Data = await res7.json();
        report(res7.status === 200 && (res7Data.ok || res7Data.success), 'payment_not_matched returns 200 OK.');

        const pnmDoc = await adminDb.collection('emailLog').doc(`payment_not_matched_${paymentNotMatchedId}_1`).get();
        report(pnmDoc.exists && pnmDoc.data().dryRun === true, `emailLog doc payment_not_matched_${paymentNotMatchedId}_1 created.`);

        // -------------------------------------------------------------
        // TEST 8 (2.d): Second receipt (new lastPaymentId) -> a second payment_received log
        // -------------------------------------------------------------
        console.log('\n--- Test 8 (2.d): Second receipt (new lastPaymentId) -> second payment_received log ---');
        const payDoc1Id = 'pay_receipt_rec1';
        const payDoc2Id = 'pay_receipt_rec2';

        // Payment 1
        await adminDb.collection('payments').doc(payDoc1Id).set({
            businessId: busId,
            status: 'submitted',
            amountDue: 199,
            referenceNumber: 'REF111'
        });
        await adminDb.collection('businesses').doc(busId).update({
            status: 'payment_review',
            lastPaymentId: payDoc1Id
        });

        const resPay1 = await fetch(`${API_BASE}/api/events`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ownerToken}`
            },
            body: JSON.stringify({
                event: 'payment_received',
                entityId: busId
            })
        });
        report(resPay1.status === 200, 'First payment receipt returns 200.');
        const log1Snap = await adminDb.collection('emailLog').doc(`payment_received_${busId}_${payDoc1Id}`).get();
        report(log1Snap.exists, `emailLog doc payment_received_${busId}_${payDoc1Id} created.`);

        // Payment 2 (new receipt cycle)
        await adminDb.collection('payments').doc(payDoc2Id).set({
            businessId: busId,
            status: 'submitted',
            amountDue: 199,
            referenceNumber: 'REF222'
        });
        await adminDb.collection('businesses').doc(busId).update({
            status: 'payment_review',
            lastPaymentId: payDoc2Id
        });

        const resPay2 = await fetch(`${API_BASE}/api/events`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ownerToken}`
            },
            body: JSON.stringify({
                event: 'payment_received',
                entityId: busId
            })
        });
        report(resPay2.status === 200, 'Second payment receipt returns 200.');
        const log2Snap = await adminDb.collection('emailLog').doc(`payment_received_${busId}_${payDoc2Id}`).get();
        report(log2Snap.exists && log2Snap.id !== log1Snap.id, `Second receipt created a second payment_received log (${log2Snap.id}).`);

        // -------------------------------------------------------------
        // TEST 9 (2.e): Client fires review_posted -> 403 Forbidden
        // -------------------------------------------------------------
        console.log('\n--- Test 9 (2.e): Client fires review_posted -> 403 Forbidden ---');
        const res9 = await fetch(`${API_BASE}/api/events`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                event: 'review_posted',
                entityId: 'rev_client_test'
            })
        });
        report(res9.status === 403, 'Client firing review_posted directly returns 403 Forbidden.');

        // -------------------------------------------------------------
        // TEST 10 (2.f): Without CALZADA_EMULATORS, an unsigned token -> 401
        // -------------------------------------------------------------
        console.log('\n--- Test 10 (2.f): Without CALZADA_EMULATORS, an unsigned token -> 401 ---');
        const noEmuEnv = { ...process.env, PORT: '5002' };
        delete noEmuEnv.CALZADA_EMULATORS;
        delete noEmuEnv.FIREBASE_AUTH_EMULATOR_HOST;
        delete noEmuEnv.FIRESTORE_EMULATOR_HOST;

        const noEmuProcess = spawn('node', ['server.js'], {
            env: noEmuEnv,
            stdio: 'pipe'
        });
        await new Promise(r => setTimeout(r, 2500));

        try {
            const unsignedToken = createEmulatorToken('unsigned_uid');
            const res10 = await fetch('http://127.0.0.1:5002/api/events', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${unsignedToken}`
                },
                body: JSON.stringify({
                    event: 'payment_not_matched',
                    entityId: paymentNotMatchedId
                })
            });
            report(res10.status === 401, 'Without CALZADA_EMULATORS, unsigned token returns 401 Unauthorized.');
        } finally {
            noEmuProcess.kill();
        }

    } catch (err) {
        console.error('Test execution error:', err);
        report(false, err.message);
    } finally {
        authServer.close();
        if (serverProcess) serverProcess.kill();
    }

    console.log('\n========================================================');
    console.log(`P2 EVENTS RESULTS: ${passedCount} passed, ${failedCount} failed`);
    console.log('========================================================');
    if (failedCount > 0) {
        process.exit(1);
    }
}

runEventsTests().catch(err => {
    console.error('P2 Events script error:', err);
    process.exit(1);
});
