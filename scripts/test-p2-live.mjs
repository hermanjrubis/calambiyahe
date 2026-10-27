/**
 * scripts/test-p2-live.mjs
 *
 * Playwright Multi-Context Real-time Verification for Phase 2:
 * - Admin panel listening via onSnapshot on payments
 * - Owner submits payment receipt (or payment is created in Firestore)
 * - Within 3 seconds without page reload:
 *   1. Admin payments list shows the submitted payment
 *   2. Sidebar nav payments count increases (+1)
 *   3. Tab title updates to (N) Calzada Admin
 *   4. Item receives .new-item-highlight
 *   5. Real-time toast notification appears
 */

import http from 'http';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let serverProcess = null;
function startAppServer() {
    return new Promise((resolve) => {
        const req = http.get('http://127.0.0.1:5000', () => {
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

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

const app = getApps().length > 0 ? getApps()[0] : initializeApp({ projectId: 'calzada-web' });
const adminDb = getFirestore(app);

function startAuthEmulator() {
    return new Promise((resolve) => {
        const authServer = http.createServer((req, res) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
            res.setHeader('Access-Control-Allow-Headers', '*');

            if (req.method === 'OPTIONS') {
                res.writeHead(204);
                res.end();
                return;
            }

            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                const url = req.url || '';
                let uid = 'test_user';
                let isAdmin = false;

                try {
                    if (body.startsWith('{')) {
                        const parsed = JSON.parse(body);
                        const tokenStr = parsed.token || parsed.idToken;
                        if (tokenStr) {
                            const parts = tokenStr.split('.');
                            const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
                            uid = payload.sub || uid;
                            if (payload.admin === true || uid.includes('admin')) {
                                isAdmin = true;
                            }
                        }
                    } else if (body.includes('refresh_token')) {
                        // refresh token grant
                        if (body.includes('admin') || uid.includes('admin')) {
                            isAdmin = true;
                        }
                    }
                } catch (_) {}

                if (uid.includes('admin')) {
                    isAdmin = true;
                }

                if (url.includes('accounts:signInWithCustomToken')) {
                    const customJwt = createEmulatorToken(uid, { admin: isAdmin });
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        kind: 'identitytoolkit#VerifyCustomTokenResponse',
                        idToken: customJwt,
                        refreshToken: `refresh-token-${uid}`,
                        expiresIn: '3600',
                        isNewUser: false
                    }));
                } else if (url.includes('securetoken.googleapis.com/v1/token')) {
                    const customJwt = createEmulatorToken(uid, { admin: isAdmin });
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        access_token: customJwt,
                        expires_in: "3600",
                        token_type: "Bearer",
                        refresh_token: `refresh-token-${uid}`,
                        id_token: customJwt,
                        user_id: uid,
                        project_id: "calzada-web"
                    }));
                } else if (url.includes('accounts:lookup')) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        kind: 'identitytoolkit#GetAccountInfoResponse',
                        users: [{
                            localId: uid,
                            email: `${uid}@test.calzadaph.com`,
                            displayName: `User ${uid}`,
                            emailVerified: true,
                            customAttributes: JSON.stringify({ admin: isAdmin })
                        }]
                    }));
                } else {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({}));
                }
            });
        });

        authServer.listen(9099, '127.0.0.1', () => {
            console.log('[Mock Auth Emulator] listening on 127.0.0.1:9099');
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
        ...claims
    })).toString('base64url');
    return `${header}.${payload}.`;
}

async function runLiveTest() {
    console.log('========================================================');
    console.log('PHASE 2: REAL-TIME LIVE UPDATE VERIFICATION (PLAYWRIGHT)');
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
    const browser = await chromium.launch({ headless: true });

    const adminUid = 'admin_live_tester';
    const ownerUid = 'owner_live_tester';
    const busId = 'bus_live_stream_cafe';
    const paymentId = 'pay_live_stream_001';

    try {
        console.log('1. Setting up initial Firestore state in emulator (8080)...');
        await adminDb.collection('businesses').doc(busId).delete().catch(() => {});
        await adminDb.collection('payments').doc(paymentId).delete().catch(() => {});
        await adminDb.collection('emailLog').doc(`payment_received_${busId}_1`).delete().catch(() => {});

        // Business awaiting payment
        await adminDb.collection('businesses').doc(busId).set({
            name: "Live Stream Cafe",
            ownerId: ownerUid,
            ownerEmail: `${ownerUid}@test.calzadaph.com`,
            status: "payment_review",
            lastPaymentId: paymentId,
            plan: "plus360",
            amountDue: 199,
            submittedAt: new Date().toISOString()
        });

        const adminToken = createEmulatorToken(adminUid, { admin: true });
        const ownerToken = createEmulatorToken(ownerUid, { admin: false });

        // 2. Open Admin Browser Context
        console.log('2. Opening Admin Playwright context and signing in...');
        const adminContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const adminPage = await adminContext.newPage();

        adminPage.on('console', msg => console.log(`[Browser Console ${msg.type()}]:`, msg.text()));
        adminPage.on('pageerror', err => console.error('[Browser PageError]:', err.message));

        await adminPage.goto('http://127.0.0.1:5000/pages/admin.html?emulator=1#payments', { waitUntil: 'domcontentloaded' });

        // Sign in via custom token in page context
        const signInResult = await adminPage.evaluate(async (token) => {
            try {
                const { signInWithCustomToken } = await import("https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js");
                const auth = window.CalzadaAuth.auth;
                const cred = await signInWithCustomToken(auth, token);
                return { ok: true, uid: cred.user.uid };
            } catch (err) {
                return { ok: false, error: err.message, stack: err.stack };
            }
        }, adminToken);
        console.log('signInResult in browser:', signInResult);

        // Wait for admin portal app to become visible and initial sync to complete
        await adminPage.waitForSelector('#adminApp[data-realtime-ready="true"]', { state: 'visible', timeout: 10000 });
        console.log('Admin portal loaded and initial sync complete.');

        // Wait for connection status indicator to show "Live"
        await adminPage.waitForFunction(() => {
            const label = document.getElementById('connectionLabel');
            return label && label.textContent.trim() === 'Live';
        }, { timeout: 10000 });
        report(true, 'Admin panel topbar connection indicator displays "Live".');

        // Record baseline count & title
        const initialCount = await adminPage.evaluate(() => {
            const el = document.getElementById('navCountPayments');
            return Number(el?.textContent?.trim()) || 0;
        });
        const initialTitle = await adminPage.title();
        console.log(`Baseline state: payments count = ${initialCount}, title = "${initialTitle}"`);

        // 3. Owner submits payment receipt (Context 2 / Firestore emulator write)
        console.log('3. Triggering payment submission in real-time...');
        const startTimestamp = Date.now();

        await adminDb.collection('payments').doc(paymentId).set({
            businessId: busId,
            ownerId: ownerUid,
            plan: 'plus360',
            amountDue: 199,
            referenceNo: '1234567890123',
            receiptUrl: 'https://res.cloudinary.com/calzada/image/upload/v1/receipts/test.jpg',
            status: 'submitted',
            submittedAt: Timestamp.now()
        });

        // 4. In Admin Context: Assert live update within 3 seconds WITHOUT reloading!
        console.log('4. Checking Admin real-time updates within 3s without page reload...');

        // Check A: payments count goes +1
        await adminPage.waitForFunction((expected) => {
            const el = document.getElementById('navCountPayments');
            return Number(el?.textContent?.trim()) === expected;
        }, initialCount + 1, { timeout: 3000 });

        const elapsedMs = Date.now() - startTimestamp;
        report(true, `Sidebar nav payments count increased to ${initialCount + 1} in ${elapsedMs}ms (< 3000ms).`);

        // Check B: Payments list displays the submitted business
        const cardFound = await adminPage.waitForSelector(`[data-payment-id="${paymentId}"]`, { state: 'visible', timeout: 3000 });
        report(Boolean(cardFound), 'Admin Payments list shows the newly submitted payment without reload.');

        // Check C: Item has .new-item-highlight class
        const hasHighlight = await adminPage.evaluate((id) => {
            const card = document.querySelector(`[data-payment-id="${id}"]`);
            return card ? card.classList.contains('new-item-highlight') : false;
        }, paymentId);
        report(hasHighlight, 'New payment card has .new-item-highlight animation class.');

        // Check D: Tab title updates to (N) Calzada Admin
        const updatedTitle = await adminPage.title();
        const titleRegex = /^\(\d+\)\s+Calzada Admin$/;
        report(titleRegex.test(updatedTitle), `Tab title updated to "${updatedTitle}" with count badge.`);

        // Check E: Toast notification displayed
        const toastVisible = await adminPage.waitForSelector('.admin-toast', { state: 'visible', timeout: 3000 });
        report(Boolean(toastVisible), 'Toast notification appeared for new payment submission.');

        await adminContext.close();

    } catch (err) {
        console.error('Live verification error:', err);
        report(false, err.message);
    } finally {
        await browser.close();
        authServer.close();
        if (serverProcess) serverProcess.kill();
    }

    console.log('\n========================================================');
    console.log(`P2 LIVE RESULTS: ${passedCount} passed, ${failedCount} failed`);
    console.log('========================================================');
    if (failedCount > 0) {
        process.exit(1);
    }
}

runLiveTest().catch(err => {
    console.error('Fatal live test error:', err);
    process.exit(1);
});
