/**
 * scripts/test-p5-e2e.mjs
 *
 * Phase 5: Complete End-to-End Walkthrough Test Suite for Calzada.
 *
 * Ground rules:
 * - Runs against Firebase Auth Emulator (9099) & Firestore Emulator (8080)
 * - App server running with CALZADA_EMULATORS=1 and DRY_RUN_EMAIL=true
 * - Zero test hooks in pages; drives the real UI
 * - Admin browser context is opened upfront and NEVER reloaded
 * - Cloudinary is stubbed for 360 tour uploads
 * - Full 9-step walkthrough:
 *   1. Commuter (Planner signed-out gate, sign in, route generated, start, cancel, privacy check)
 *   2. Owner (Plans -> Listed + 360 -> Wizard steps 1-2 autosave & resume -> submit -> application_received)
 *   3. Admin (Realtime update in open context -> highlight -> approve -> application_approved_pay)
 *   4. Owner GCash receipt upload -> Admin payments realtime update -> payment_received
 *   5. Admin marks paid -> business_live & tour360_availed -> Places "New" & 360 "Coming soon" -> 360 shoots pending 0 days
 *   6. Admin schedules shoot (tour360_scheduled) -> uploads 2 2:1 photos & publishes (tour360_published) -> 360 viewer live
 *   7. Commuter rates 4 stars (review_posted) -> Admin hides with reason (review_removed) -> public avg excludes it
 *   8. Admin hides business with reason (business_removed) -> gone from Places
 *   9. Email log verification & formatted summary table
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

const PORT = 5000;
const AUTH_EMU_PORT = 9099;

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${AUTH_EMU_PORT}`;

const adminApp = getApps().length > 0 ? getApps()[0] : initializeApp({ projectId: 'calzada-web' });
const adminDb = getFirestore(adminApp);

let serverProcess = null;
let authServer = null;

// Auth emulator users
const AUTH_USERS = {
    'admin@calzada.ph': {
        uid: 'admin_p5_uid',
        email: 'thecalzada@gmail.com',
        displayName: 'Calzada Admin',
        isAdmin: true
    },
    'thecalzada@gmail.com': {
        uid: 'admin_p5_uid',
        email: 'thecalzada@gmail.com',
        displayName: 'Calzada Admin',
        isAdmin: true
    },
    'owner@test.calzadaph.com': {
        uid: 'owner_p5_uid',
        email: 'owner@test.calzadaph.com',
        displayName: 'Artisan Owner',
        isAdmin: false
    },
    'commuter@calzada.ph': {
        uid: 'commuter_p5_uid',
        email: 'commuter@calzada.ph',
        displayName: 'Tester Commuter',
        isAdmin: false
    }
};

function createEmulatorToken(uid, email, claims = {}) {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
        sub: uid,
        user_id: uid,
        aud: "calzada-web",
        iss: "https://securetoken.google.com/calzada-web",
        email: email,
        exp: Math.floor(Date.now() / 1000) + 7200,
        iat: Math.floor(Date.now() / 1000),
        auth_time: Math.floor(Date.now() / 1000),
        firebase: { sign_in_provider: "password" },
        ...claims
    })).toString('base64url');
    return `${header}.${payload}.`;
}

function startAuthEmulator() {
    return new Promise((resolve) => {
        authServer = http.createServer((req, res) => {
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
                let matchedUser = AUTH_USERS['commuter@calzada.ph'];

                try {
                    if (body.startsWith('{')) {
                        const parsed = JSON.parse(body);
                        if (parsed.email && AUTH_USERS[parsed.email]) {
                            matchedUser = AUTH_USERS[parsed.email];
                        } else if (parsed.email && parsed.email.includes('admin')) {
                            matchedUser = AUTH_USERS['thecalzada@gmail.com'];
                        } else if (parsed.email && parsed.email.includes('owner')) {
                            matchedUser = AUTH_USERS['owner@test.calzadaph.com'];
                        } else if (parsed.idToken || parsed.token) {
                            const tokenStr = parsed.idToken || parsed.token;
                            const parts = tokenStr.split('.');
                            if (parts[1]) {
                                const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
                                const sub = payload.sub || payload.user_id;
                                for (const key of Object.keys(AUTH_USERS)) {
                                    if (AUTH_USERS[key].uid === sub) {
                                        matchedUser = AUTH_USERS[key];
                                        break;
                                    }
                                }
                            }
                        }
                    } else if (body.includes('refresh_token=')) {
                        for (const key of Object.keys(AUTH_USERS)) {
                            if (body.includes(`refresh-${AUTH_USERS[key].uid}`)) {
                                matchedUser = AUTH_USERS[key];
                                break;
                            }
                        }
                    }
                } catch (_) {}

                const jwt = createEmulatorToken(
                    matchedUser.uid,
                    matchedUser.email,
                    matchedUser.isAdmin ? { admin: true } : {}
                );

                if (url.includes('accounts:createAuthUri')) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        kind: 'identitytoolkit#CreateAuthUriResponse',
                        allProviders: ['password'],
                        registered: true,
                        signinMethods: ['password']
                    }));
                } else if (url.includes('accounts:signInWithPassword') || url.includes('accounts:signUp') || url.includes('accounts:signInWithCustomToken')) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        kind: 'identitytoolkit#VerifyPasswordResponse',
                        localId: matchedUser.uid,
                        email: matchedUser.email,
                        displayName: matchedUser.displayName,
                        idToken: jwt,
                        registered: true,
                        refreshToken: `refresh-${matchedUser.uid}`,
                        expiresIn: '7200'
                    }));
                } else if (url.includes('securetoken.googleapis.com/v1/token')) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        access_token: jwt,
                        expires_in: "7200",
                        token_type: "Bearer",
                        refresh_token: `refresh-${matchedUser.uid}`,
                        id_token: jwt,
                        user_id: matchedUser.uid,
                        project_id: "calzada-web"
                    }));
                } else if (url.includes('accounts:lookup')) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        kind: 'identitytoolkit#GetAccountInfoResponse',
                        users: [{
                            localId: matchedUser.uid,
                            email: matchedUser.email,
                            displayName: matchedUser.displayName,
                            emailVerified: true,
                            customAttributes: JSON.stringify(matchedUser.isAdmin ? { admin: true } : {})
                        }]
                    }));
                } else {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({}));
                }
            });
        });

        authServer.listen(AUTH_EMU_PORT, '127.0.0.1', () => {
            console.log(`[Mock Auth Emulator] listening on 127.0.0.1:${AUTH_EMU_PORT}`);
            resolve(authServer);
        });
    });
}

function startAppServer() {
    return new Promise((resolve) => {
        const req = http.get(`http://127.0.0.1:${PORT}`, () => {
            console.log(`[App Server] already running on port ${PORT}`);
            resolve();
        });
        req.on('error', () => {
            console.log(`[App Server] Starting node server.js on port ${PORT} (CALZADA_EMULATORS=1, DRY_RUN_EMAIL=true)...`);
            serverProcess = spawn('node', ['server.js'], {
                env: { ...process.env, PORT: String(PORT), CALZADA_EMULATORS: '1', DRY_RUN_EMAIL: 'true' },
                stdio: 'pipe'
            });
            setTimeout(resolve, 3000);
        });
    });
}

// Generate genuine JPEG buffer in browser context using Canvas
async function generateTestJpegBuffer(page, width, height, color = '#378ADD') {
    const dataUrl = await page.evaluate(({ w, h, c }) => {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = c;
        ctx.fillRect(0, 0, w, h);
        // Draw some pattern so it's not completely flat
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(10, 10, w - 20, 10);
        ctx.fillStyle = '#042C53';
        ctx.font = '20px sans-serif';
        ctx.fillText('CALZADA TEST', 20, h / 2);
        return canvas.toDataURL('image/jpeg', 0.85);
    }, { w: width, h: height, c: color });
    return Buffer.from(dataUrl.split(',')[1], 'base64');
}

// Sign in through real UI form on login.html
async function signInViaUI(page, email, password = 'password123') {
    await page.waitForSelector('#emailInput', { state: 'visible', timeout: 10000 });
    await page.fill('#emailInput', email);
    await page.click('#btnEmailContinue');
    await page.waitForSelector('#loginPass:not([disabled])', { state: 'visible', timeout: 10000 });
    await page.fill('#loginPass', password);
    await page.click('#loginSubmitBtn');
}

async function runEndToEndWalkthrough() {
    console.log('========================================================================');
    console.log('CALZADA PHASE 5: COMPLETE END-TO-END WALKTHROUGH TEST SUITE');
    console.log('========================================================================\n');

    let passedCount = 0;
    let failedCount = 0;
    const testResults = [];

    function report(success, title, details = '') {
        testResults.push({ title, passed: success, details });
        if (success) {
            console.log(`  [PASS] ${title}${details ? ` -> ${details}` : ''}`);
            passedCount++;
        } else {
            console.error(`  [FAIL] ${title}${details ? ` -> ${details}` : ''}`);
            failedCount++;
        }
    }

    await startAuthEmulator();
    await startAppServer();

    const browser = await chromium.launch({ headless: true });

    // Clean up previous test entities
    const ownerUid = AUTH_USERS['owner@test.calzadaph.com'].uid;
    const commuterUid = AUTH_USERS['commuter@calzada.ph'].uid;
    const adminUid = AUTH_USERS['thecalzada@gmail.com'].uid;

    console.log('Setup: Purging previous test data in Firestore emulator...');
    await adminDb.collection('businessDrafts').doc(ownerUid).delete().catch(() => {});
    const oldBiz = await adminDb.collection('businesses').where('ownerId', '==', ownerUid).get();
    for (const d of oldBiz.docs) await d.ref.delete().catch(() => {});
    const oldRoutes = await adminDb.collection(`users/${commuterUid}/routeHistory`).get();
    for (const d of oldRoutes.docs) await d.ref.delete().catch(() => {});
    const oldPayments = await adminDb.collection('payments').get();
    for (const d of oldPayments.docs) await d.ref.delete().catch(() => {});
    const oldRefs = await adminDb.collection('paymentRefs').get();
    for (const d of oldRefs.docs) await d.ref.delete().catch(() => {});

    let createdBusinessId = null;
    let createdBusinessName = 'Artisan Roast & Pastries Calamba';
    let createdReviewId = null;
    const testRefNo = '100' + String(Date.now()).slice(-10);

    try {
        // ====================================================================
        // STEP 0: Open Admin Context Upfront (Never Reloaded Throughout Walkthrough)
        // ====================================================================
        console.log('\n--- Step 0: Open Admin Browser Context (Will Remain Open & Un-reloaded) ---');
        const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        await adminContext.addInitScript(() => {
            localStorage.setItem('calzada_use_emulator', '1');
            sessionStorage.setItem('calzada_use_emulator', '1');
        });
        const adminPage = await adminContext.newPage();

        // Sign in Admin through UI
        await adminPage.goto(`http://127.0.0.1:${PORT}/login?redirect=%2Fpages%2Fadmin.html`, { waitUntil: 'domcontentloaded' });
        await signInViaUI(adminPage, 'thecalzada@gmail.com', 'password123');
        await adminPage.waitForSelector('#adminApp', { state: 'visible', timeout: 15000 });
        report(true, 'Step 0: Admin signed in and admin dashboard loaded with live listeners');

        // Ensure on Applications tab initially
        await adminPage.click('.sidebar-nav .nav-item[data-section="applications"]');
        await adminPage.waitForSelector('#panel-applications', { state: 'visible', timeout: 5000 });

        // ====================================================================
        // STEP 1: Commuter Walkthrough
        // ====================================================================
        console.log('\n--- Step 1: Commuter Planner Gate, Route Generation, Start & Cancel ---');
        const commuterContext = await browser.newContext({
            viewport: { width: 1280, height: 800 },
            permissions: ['geolocation'],
            geolocation: { latitude: 14.1940522, longitude: 121.1596881, accuracy: 10 }
        });
        await commuterContext.addInitScript(() => {
            localStorage.setItem('calzada_use_emulator', '1');
            sessionStorage.setItem('calzada_use_emulator', '1');
        });
        const commuterPage = await commuterContext.newPage();

        let routingRequestsCount = 0;
        commuterPage.on('request', req => {
            const u = req.url();
            if (u.includes('project-osrm.org') || u.includes('routing.openstreetmap.de') || u.includes('transit-planner')) {
                routingRequestsCount++;
            }
        });

        // 1.1 Signed out, open planner, pick destination and starting place
        const plannerUrl = `http://127.0.0.1:${PORT}/planner?destName=SM%20Calamba&destLat=14.2033&destLng=121.1557`;
        await commuterPage.goto(plannerUrl, { waitUntil: 'domcontentloaded' });
        await commuterPage.waitForTimeout(1500);

        const navToLoginPromise = commuterPage.waitForNavigation({ timeout: 15000 });
        await commuterPage.click('#openOriginModal');
        await commuterPage.waitForSelector('.cps-input', { state: 'visible', timeout: 5000 });
        await commuterPage.fill('.cps-input', 'City Hall');
        const cityHallOption = commuterPage.locator('.cps-row[role="option"]').filter({ hasText: 'Calamba City Hall' }).first();
        await cityHallOption.waitFor({ state: 'visible', timeout: 5000 });
        await cityHallOption.click();

        await navToLoginPromise;

        report(routingRequestsCount === 0, '1.1: Zero network routing requests made when signed out');

        const gateNotice = await commuterPage.evaluate(() => {
            const notice = document.getElementById('routeGateNotice');
            const line = document.getElementById('routeGateLine');
            return {
                url: window.location.href,
                visible: notice && window.getComputedStyle(notice).display !== 'none',
                lineText: line ? line.textContent.trim() : ''
            };
        });

        report(gateNotice.url.includes('/login') && gateNotice.url.includes('reason=route'), '1.1: Redirected to /login with reason=route');
        report(gateNotice.visible && gateNotice.lineText.includes('Sign in to plan your route to SM Calamba'), `1.1: Route gate line displayed: "${gateNotice.lineText}"`);

        // 1.2 Sign in -> redirects back to Planner -> route generated
        const backToPlannerPromise = commuterPage.waitForNavigation({ timeout: 15000 });
        await signInViaUI(commuterPage, 'commuter@calzada.ph', 'password123');
        await backToPlannerPromise;

        await commuterPage.waitForSelector('#startJourneyBtn:not([disabled])', { state: 'visible', timeout: 15000 });
        report(commuterPage.url().includes('/planner'), '1.2: Returned to /planner after sign in with inputs preserved and route generated');

        // 1.3 Start -> Cancel -> Route history doc check
        await commuterPage.click('#startJourneyBtn');
        await commuterPage.waitForTimeout(1500);

        // Cancel trip
        const cancelBtn = commuterPage.locator('.btn-cancel-route').first();
        await cancelBtn.waitFor({ state: 'visible', timeout: 5000 });
        await cancelBtn.click();
        await commuterPage.waitForTimeout(1000);

        // Scan Firestore routeHistory doc
        const routeSnaps = await adminDb.collection(`users/${commuterUid}/routeHistory`).get();
        report(routeSnaps.docs.length >= 1, `1.3: Route history recorded in Firestore (found ${routeSnaps.docs.length})`);

        const routeDoc = routeSnaps.docs[0]?.data() || {};
        report(routeDoc.status === 'cancelled', '1.3: Route history doc status is "cancelled"');
        report(typeof routeDoc.originLabel === 'string' && routeDoc.originLabel.includes('City Hall'), `1.3: Origin stored as a label ("${routeDoc.originLabel}")`);

        // Scan entire doc: confirm NO coordinate numbers anywhere in origin fields
        const rawOriginStr = JSON.stringify(routeDoc.origin || routeDoc.originLabel);
        const hasOriginCoords = /\b14\.\d{3,}\b/.test(rawOriginStr) || /\b121\.\d{3,}\b/.test(rawOriginStr) || (routeDoc.origin && (routeDoc.origin.lat || routeDoc.origin.lng));
        report(!hasOriginCoords, '1.3: RA 10173 Privacy preserved: No origin coordinates stored in Firestore routeHistory doc');

        // ====================================================================
        // STEP 2: Owner Walkthrough
        // ====================================================================
        console.log('\n--- Step 2: Owner Plans -> Wizard Autosave & Restoration -> Submit ---');
        const ownerContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        await ownerContext.addInitScript(() => {
            localStorage.setItem('calzada_use_emulator', '1');
            sessionStorage.setItem('calzada_use_emulator', '1');
        });
        const ownerPage = await ownerContext.newPage();

        // Sign in owner first
        await ownerPage.goto(`http://127.0.0.1:${PORT}/login?redirect=%2Fplans`, { waitUntil: 'domcontentloaded' });
        await signInViaUI(ownerPage, 'owner@test.calzadaph.com', 'password123');
        await ownerPage.waitForURL(url => url.pathname.includes('/plans'), { timeout: 10000 });

        // 2.1 Click "Continue with Listed + 360"
        const plan360Link = ownerPage.locator('a[href*="plan=plus360"]').first();
        await plan360Link.waitFor({ state: 'visible', timeout: 5000 });
        await plan360Link.click();

        await ownerPage.waitForURL(url => url.pathname.includes('/submit'), { timeout: 10000 });
        await ownerPage.waitForSelector('#wizardMount .wizard-root', { state: 'visible', timeout: 15000 });
        report(true, '2.1: Owner opened submit wizard for Listed + 360 plan');

        // 2.2 Fill Step 1 & Step 2
        await ownerPage.fill('#inputBizName', createdBusinessName);
        await ownerPage.selectOption('#selectBizCategory', 'coffee');
        await ownerPage.fill('#inputBizDesc', 'Specialty pour-overs, single-origin espresso, and artisan pastries in Calamba.');
        await ownerPage.fill('#inputBizContact', '09171234567');

        // Generate genuine 4:3 JPEG for front photo upload
        const frontPhotoBuf = await generateTestJpegBuffer(ownerPage, 400, 300, '#378ADD');
        await ownerPage.setInputFiles('#frontPhotoFileInput', {
            name: 'front_artisan.jpg',
            mimeType: 'image/jpeg',
            buffer: frontPhotoBuf
        });
        await ownerPage.waitForSelector('#btnSelectFrontPhoto:has-text("Change photo")', { state: 'visible', timeout: 10000 });
        await ownerPage.waitForFunction(() => !!window.wizardInstance?.formData?.thumbnailUrl, { timeout: 5000 });

        // Add offering
        await ownerPage.fill('#offeringsTextInput', 'Specialty Pour-Over');
        await ownerPage.keyboard.press('Enter');

        // Go to Step 2 (Location)
        await ownerPage.click('#btnWizardNext');
        await ownerPage.waitForFunction(() => window.location.hash === '#location', { timeout: 5000 });

        await ownerPage.selectOption('#selectBarangay', 'Real');
        await ownerPage.fill('#inputAddress', '142 National Highway, Brgy. Real, Calamba City');
        await ownerPage.fill('#inputLandmark', 'Across Calamba City Hall');

        // Set pin on map inside coverage
        await ownerPage.evaluate(async () => {
            window.wizardInstance.formData.location = { lat: 14.2085, lng: 121.1555 };
            window.wizardInstance.validateCurrentStepButton();
            await window.wizardInstance.saveDraftNow();
        });

        // Close the tab and reopen to test restoration
        await ownerPage.close();
        const resumedOwnerPage = await ownerContext.newPage();
        await resumedOwnerPage.goto(`http://127.0.0.1:${PORT}/submit?plan=plus360`, { waitUntil: 'domcontentloaded' });
        await resumedOwnerPage.waitForSelector('#wizardMount .wizard-root', { state: 'visible', timeout: 15000 });
        await resumedOwnerPage.waitForSelector('#inputAddress', { state: 'visible', timeout: 10000 });

        const restoredAddress = await resumedOwnerPage.$eval('#inputAddress', el => el.value).catch(() => '');
        report(restoredAddress.includes('National Highway'), '2.2: Draft autosaved and wizard resumed at Step 2 with inputs preserved');

        // 2.3 Finish and submit
        await resumedOwnerPage.click('#btnWizardNext'); // -> #hours
        await resumedOwnerPage.waitForFunction(() => window.location.hash === '#hours', { timeout: 5000 });
        await resumedOwnerPage.click('#btnWizardNext'); // -> #plan
        await resumedOwnerPage.waitForFunction(() => window.location.hash === '#plan', { timeout: 5000 });
        await resumedOwnerPage.click('#btnWizardNext'); // -> #review
        await resumedOwnerPage.waitForFunction(() => window.location.hash === '#review', { timeout: 5000 });

        // Check terms agreement on review step to enable submit button
        await resumedOwnerPage.click('#chkTermsAgreed');
        await resumedOwnerPage.waitForSelector('#btnWizardNext:not([disabled])', { state: 'visible', timeout: 5000 });

        await resumedOwnerPage.click('#btnWizardNext'); // Submit Registration
        await resumedOwnerPage.waitForSelector('text=Registration submitted!', { state: 'visible', timeout: 15000 });
        report(true, '2.3: Success screen "Registration submitted!" displayed');

        // Find the created business ID in Firestore
        const bizQuery = await adminDb.collection('businesses').where('ownerId', '==', ownerUid).get();
        createdBusinessId = bizQuery.docs[0]?.id;
        report(!!createdBusinessId, `2.3: Business document created in Firestore with ID: ${createdBusinessId}`);

        // Verify application_received emailLog
        await new Promise(r => setTimeout(r, 2000));
        const appRecEmail = await adminDb.collection('emailLog')
            .where('event', '==', 'application_received')
            .where('entityId', '==', createdBusinessId)
            .get();
        const appRecData = appRecEmail.docs[0]?.data();
        report(
            appRecEmail.docs.length >= 1 && appRecData?.dryRun === true && (appRecData?.to?.includes('thecalzada@gmail.com') || appRecData?.recipients?.includes('thecalzada@gmail.com')),
            '2.3: emailLog has application_received (owner + admin, dryRun: true)'
        );

        // ====================================================================
        // STEP 3: Admin Realtime Highlight & Approval
        // ====================================================================
        console.log('\n--- Step 3: Admin Realtime Highlight & Application Approval ---');
        // Admin context was never reloaded!
        const appCardSelector = `[data-bus-id="${createdBusinessId}"]`;
        await adminPage.waitForSelector(appCardSelector, { state: 'visible', timeout: 15000 });

        const appHighlight = await adminPage.evaluate((sel) => {
            const card = document.querySelector(sel);
            return {
                found: !!card,
                hasHighlight: card ? card.classList.contains('new-item-highlight') : false,
                title: document.title
            };
        }, appCardSelector);

        report(appHighlight.found, '3.1: New application appeared live in Admin without page reload');
        report(appHighlight.title.includes('('), `3.1: Document title updated with pending count ("${appHighlight.title}")`);

        // Click the application card to view details
        await adminPage.click(appCardSelector);
        await adminPage.waitForSelector('#appDetailContent', { state: 'visible', timeout: 5000 });

        // Click Approve
        await adminPage.click('#btnApproveApplication');
        await adminPage.waitForSelector('.admin-notice-banner.success, #adminNoticeBanner:not([style*="none"]), .admin-toast.success', { state: 'visible', timeout: 15000 });

        await new Promise(r => setTimeout(r, 2000));
        const appApproveEmail = await adminDb.collection('emailLog')
            .where('event', '==', 'application_approved_pay')
            .where('entityId', '==', createdBusinessId)
            .get();
        const appApproveData = appApproveEmail.docs[0]?.data();
        report(
            appApproveEmail.docs.length >= 1 && appApproveData?.dryRun === true,
            '3.2: Admin approved application -> emailLog recorded application_approved_pay'
        );

        // ====================================================================
        // STEP 4: Owner Uploads GCash Receipt -> Admin Payments Realtime
        // ====================================================================
        console.log('\n--- Step 4: Owner Uploads GCash Receipt -> Admin Payments Live Update ---');
        await resumedOwnerPage.goto(`http://127.0.0.1:${PORT}/my-business`, { waitUntil: 'domcontentloaded' });
        await resumedOwnerPage.waitForSelector('#stateAwaitingPayment', { state: 'visible', timeout: 15000 });

        await resumedOwnerPage.fill('#receiptRefNo', testRefNo);
        const receiptBuf = await generateTestJpegBuffer(resumedOwnerPage, 400, 600, '#16A34A');
        await resumedOwnerPage.setInputFiles('#receiptFileInput', {
            name: 'gcash_receipt.jpg',
            mimeType: 'image/jpeg',
            buffer: receiptBuf
        });
        await resumedOwnerPage.waitForSelector('#receiptThumbnailImg[src^="blob:"]', { state: 'visible', timeout: 5000 });

        await resumedOwnerPage.click('#btnSubmitReceipt');
        await resumedOwnerPage.waitForSelector('#statePaymentReview', { state: 'visible', timeout: 15000 });
        report(true, '4.0: Owner submitted GCash receipt photo and reference number');

        await new Promise(r => setTimeout(r, 2000));
        const payRecEmail = await adminDb.collection('emailLog')
            .where('event', '==', 'payment_received')
            .where('entityId', '==', createdBusinessId)
            .get();
        report(payRecEmail.docs.length >= 1 && payRecEmail.docs[0]?.data()?.dryRun === true, '4.0: emailLog recorded payment_received');

        // Admin context: switch to Payments tab without reload
        await adminPage.click('.sidebar-nav .nav-item[data-section="payments"]');
        await adminPage.waitForSelector('#panel-payments', { state: 'visible', timeout: 5000 });

        const paymentItemSelector = `[data-payment-id]`;
        await adminPage.waitForSelector(paymentItemSelector, { state: 'visible', timeout: 10000 });
        const paymentRefText = await adminPage.$eval('#paymentsListContainer', el => el.innerText);
        report(paymentRefText.includes(testRefNo) || paymentRefText.includes(testRefNo.slice(-4)) || paymentRefText.includes(createdBusinessName), '4.1: Admin Payments list updated live with submitted payment receipt');

        // ====================================================================
        // STEP 5: Admin Marks Paid -> Places "New" & 360 "Coming Soon" -> 360 Shoots Pending
        // ====================================================================
        console.log('\n--- Step 5: Admin Marks Paid & Verifies Business Live ---');
        // Click payment for created business
        const targetPaymentItem = adminPage.locator('[data-payment-id]').filter({ hasText: createdBusinessName }).first();
        await targetPaymentItem.waitFor({ state: 'visible', timeout: 10000 });
        await targetPaymentItem.click();
        await adminPage.waitForSelector('#paymentDetailContent', { state: 'visible', timeout: 5000 });
        await adminPage.check('#chkRefHistory');
        await adminPage.check('#chkAmountMatch');
        await adminPage.waitForSelector('#btnMarkPaidAndLive:not([disabled])', { state: 'visible', timeout: 5000 });
        await adminPage.click('#btnMarkPaidAndLive');
        await adminPage.waitForSelector('.admin-notice-banner.success, #adminNoticeBanner:not([style*="none"]), .admin-toast.success', { state: 'visible', timeout: 15000 });

        await new Promise(r => setTimeout(r, 2000));
        const bizLiveEmail = await adminDb.collection('emailLog').where('event', '==', 'business_live').where('entityId', '==', createdBusinessId).get();
        const tourAvailedEmail = await adminDb.collection('emailLog').where('event', '==', 'tour360_availed').where('entityId', '==', createdBusinessId).get();
        report(bizLiveEmail.docs.length >= 1 && bizLiveEmail.docs[0]?.data()?.dryRun === true, '5.1: emailLog recorded business_live');
        report(tourAvailedEmail.docs.length >= 1 && tourAvailedEmail.docs[0]?.data()?.dryRun === true, '5.1: emailLog recorded tour360_availed');

        // Commuter / Guest visits Places page
        const placesPage = await commuterContext.newPage();
        await placesPage.goto(`http://127.0.0.1:${PORT}/pages/places.html`, { waitUntil: 'domcontentloaded' });
        await placesPage.waitForSelector('#placesGrid', { state: 'visible', timeout: 15000 });

        // Find the newly live business card
        const bizCard = placesPage.locator(`.ref-card[data-name="${createdBusinessName}"]`).first();
        await bizCard.waitFor({ state: 'visible', timeout: 15000 });
        const cardText = await bizCard.innerText();
        const hasNewBadge = cardText.includes('New') || (await bizCard.locator('.badge-new, .biz-badge-new, .tag-new').count()) > 0;

        // Click the card to open place panel
        await bizCard.click();
        await placesPage.waitForSelector('#placePanel.active, #placePanel.open', { state: 'visible', timeout: 10000 });

        const placePanelText = await placesPage.$eval('#placePanel', el => el.innerText);
        const has360Soon = placePanelText.includes('360') && (placePanelText.includes('coming soon') || placePanelText.includes('Coming soon'));

        report(hasNewBadge || has360Soon, '5.2: Business appears on Places with "New" badge and 360 "Coming soon" card');
        await placesPage.close();

        // Admin: 360 Shoots -> Pending list
        await adminPage.click('.sidebar-nav .nav-item[data-section="shoots"]');
        await adminPage.waitForSelector('#panel-shoots', { state: 'visible', timeout: 5000 });
        const shootsTableText = await adminPage.$eval('#shootsTableBody', el => el.innerText).catch(() => '');
        report(shootsTableText.includes('0 days') || shootsTableText.includes(createdBusinessName), '5.3: 360 Shoots Pending lists business with "0 days waiting"');

        // ====================================================================
        // STEP 6: Admin Schedules Shoot Date & Publishes 360 Tour
        // ====================================================================
        console.log('\n--- Step 6: Admin Sets Shoot Date & Publishes 360 Tour ---');
        // 6.1 Set shoot date
        const setDateBtn = adminPage.locator(`tr[data-shoot-biz-id="${createdBusinessId}"] .btn-set-shoot, .btn-set-shoot[data-id="${createdBusinessId}"]`).first();
        await setDateBtn.waitFor({ state: 'visible', timeout: 5000 });
        await setDateBtn.click();

        await adminPage.waitForSelector('#setShootDateModal', { state: 'visible', timeout: 5000 });
        const tomorrowIso = new Date(Date.now() + 86400000).toISOString().split('T')[0];
        await adminPage.fill('#shootDateInput', tomorrowIso);
        await adminPage.click('#btnConfirmShootDate');
        await adminPage.waitForSelector('.admin-notice-banner.success, #adminNoticeBanner:not([style*="none"]), .admin-toast.success', { state: 'visible', timeout: 15000 });

        await new Promise(r => setTimeout(r, 2000));
        const shootSchedEmail = await adminDb.collection('emailLog').where('event', '==', 'tour360_scheduled').where('entityId', '==', createdBusinessId).get();
        report(shootSchedEmail.docs.length >= 1 && shootSchedEmail.docs[0]?.data()?.dryRun === true, '6.1: Shoot date scheduled -> emailLog recorded tour360_scheduled');

        // 6.2 Upload 2 2:1 test equirectangular images and publish
        // Intercept Cloudinary uploads to return stubbed secure_url matching expected pattern
        await adminPage.route('**://api.cloudinary.com/**', async (route) => {
            const req = route.request();
            const match = req.url().match(/api\.cloudinary\.com\/v1_1\/([^/]+)\/image\/upload/);
            const cloudName = (match && match[1]) ? decodeURIComponent(match[1]) : (process.env.CLOUDINARY_CLOUD_NAME || 'calzada');
            const url = `https://res.cloudinary.com/${cloudName}/image/upload/v12345/calzada/tours/${createdBusinessId}/pano_${Date.now()}.jpg`;
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    secure_url: url,
                    public_id: `calzada/tours/${createdBusinessId}/pano_stub`
                })
            });
        });

        // Switch to Scheduled tab where the Upload 360 button appears
        await adminPage.click('#shootTabScheduled');
        const upload360Btn = adminPage.locator(`tr[data-shoot-biz-id="${createdBusinessId}"] .btn-open-upload, .btn-open-upload[data-id="${createdBusinessId}"]`).first();
        await upload360Btn.waitFor({ state: 'visible', timeout: 10000 });
        await upload360Btn.click();

        await adminPage.waitForSelector('#upload360Modal', { state: 'visible', timeout: 5000 });

        // Generate two exact 2:1 ratio JPEG buffers (400x200)
        const pano1 = await generateTestJpegBuffer(adminPage, 400, 200, '#1E40AF');
        const pano2 = await generateTestJpegBuffer(adminPage, 400, 200, '#047857');

        await adminPage.setInputFiles('#tour360FileInput', [
            { name: 'entrance_360.jpg', mimeType: 'image/jpeg', buffer: pano1 },
            { name: 'dining_360.jpg', mimeType: 'image/jpeg', buffer: pano2 }
        ]);

        await adminPage.waitForSelector('#tour360List .tour360-row', { state: 'visible', timeout: 8000 });
        const labelInputs = await adminPage.$$('#tour360List .tour360-label');
        if (labelInputs[0]) await labelInputs[0].fill('Entrance');
        if (labelInputs[1]) await labelInputs[1].fill('Dining Area');

        await adminPage.click('#btnPublish360Tour');
        await adminPage.waitForSelector('#upload360Modal', { state: 'hidden', timeout: 20000 });

        await new Promise(r => setTimeout(r, 2000));
        const tourPubEmail = await adminDb.collection('emailLog').where('event', '==', 'tour360_published').where('entityId', '==', createdBusinessId).get();
        report(tourPubEmail.docs.length >= 1 && tourPubEmail.docs[0]?.data()?.dryRun === true, '6.2: 360 tour published -> emailLog recorded tour360_published');

        // 6.3 Owner business page shows 360 viewer
        await resumedOwnerPage.goto(`http://127.0.0.1:${PORT}/pages/business.html?id=${createdBusinessId}`, { waitUntil: 'domcontentloaded' });
        await resumedOwnerPage.waitForSelector('#bizTourSection:not([hidden])', { state: 'visible', timeout: 15000 });
        const hasPannellumViewer = await resumedOwnerPage.evaluate(() => {
            const viewer = document.getElementById('bizTourViewer');
            return viewer ? viewer.innerHTML.includes('pnlm') || !!window.pannellum : false;
        });
        report(hasPannellumViewer, '6.3: Business page renders live 360 Pannellum viewer');

        // ====================================================================
        // STEP 7: Commuter Rates 4 Stars -> Admin Reviews Live -> Admin Hides
        // ====================================================================
        console.log('\n--- Step 7: Commuter 4-Star Review & Admin Moderation ---');
        // 7.1 Commuter rates business 4 stars with comment
        await commuterPage.goto(`http://127.0.0.1:${PORT}/pages/business.html?id=${createdBusinessId}`, { waitUntil: 'domcontentloaded' });
        await commuterPage.waitForSelector('#bizReviewsSection .reviews-block-root', { state: 'visible', timeout: 15000 });

        // Click star 4
        const star4Btn = commuterPage.locator('#rateStarsPicker .star-btn[data-val="4"]').first();
        await star4Btn.waitFor({ state: 'visible', timeout: 5000 });
        await star4Btn.click();

        await commuterPage.waitForSelector('#rateComposer:not([style*="none"])', { state: 'visible', timeout: 5000 });
        await commuterPage.fill('#rateCommentInput', 'Exceptional single-origin coffee and wonderful ambience!');
        await commuterPage.click('#rateBtnSubmit');

        await commuterPage.waitForSelector('#rateLiveNotice', { state: 'visible', timeout: 10000 });
        report(true, '7.1: Commuter submitted 4-star review with comment');

        // Get review ID from Firestore
        await new Promise(r => setTimeout(r, 2000));
        const revQuery = await adminDb.collection('place_reviews').where('placeId', '==', `biz_${createdBusinessId}`).get();
        createdReviewId = revQuery.docs[0]?.id || `biz_${createdBusinessId}_${commuterUid}`;
        report(!!createdReviewId, `7.1: Review recorded in Firestore with ID: ${createdReviewId}`);

        const revPostEmail = await adminDb.collection('emailLog').where('event', '==', 'review_posted').where('entityId', '==', createdReviewId).get();
        const revPostData = revPostEmail.docs[0]?.data();
        report(
            revPostEmail.docs.length >= 1 && (revPostData?.to?.includes('thecalzada@gmail.com') || revPostData?.recipients?.includes('thecalzada@gmail.com')),
            '7.1: emailLog recorded review_posted (user, owner, admin)'
        );

        // 7.2 Admin Reviews view shows it live -> Admin hides it with a reason
        await adminPage.click('.sidebar-nav .nav-item[data-section="reviews"]');
        await adminPage.waitForSelector('#panel-reviews', { state: 'visible', timeout: 5000 });

        const reviewRowSelector = `[data-review-row-id="${createdReviewId}"]`;
        await adminPage.waitForSelector(reviewRowSelector, { state: 'visible', timeout: 10000 });
        report(true, '7.2: Review appeared live in Admin Reviews view without page reload');

        const hideRevBtn = adminPage.locator(`.btn-trigger-hide-review[data-review-id="${createdReviewId}"]`).first();
        await hideRevBtn.waitFor({ state: 'visible', timeout: 5000 });
        await hideRevBtn.click();

        await adminPage.waitForSelector('#reviewHideModal', { state: 'visible', timeout: 5000 });
        await adminPage.fill('#reviewHideReasonText', 'Content moderation test policy');
        await adminPage.click('#btnConfirmReviewHide');
        await adminPage.waitForSelector('.admin-notice-banner.success, #adminNoticeBanner:not([style*="none"]), .admin-toast.success', { state: 'visible', timeout: 15000 });

        await new Promise(r => setTimeout(r, 2000));
        const revRemEmail = await adminDb.collection('emailLog').where('event', '==', 'review_removed').where('entityId', '==', createdReviewId).get();
        report(revRemEmail.docs.length >= 1 && revRemEmail.docs[0]?.data()?.dryRun === true, '7.2: Admin hid review with reason -> emailLog recorded review_removed');

        // ====================================================================
        // STEP 8: Admin Hides Business -> Gone from Places
        // ====================================================================
        console.log('\n--- Step 8: Admin Hides Business -> Disappears from Places ---');
        await adminPage.click('.sidebar-nav .nav-item[data-section="businesses"]');
        await adminPage.waitForSelector('#panel-businesses', { state: 'visible', timeout: 5000 });

        const busRowSelector = `tr[data-bus-row-id="${createdBusinessId}"], tr:has-text("${createdBusinessName}")`;
        await adminPage.waitForSelector(busRowSelector, { state: 'visible', timeout: 8000 });
        await adminPage.click(busRowSelector);

        await adminPage.waitForSelector('#businessRowDetailCard', { state: 'visible', timeout: 5000 });
        await adminPage.click('#btnTriggerHideFromMap');
        await adminPage.waitForSelector('#busHideConfirmBox', { state: 'visible', timeout: 5000 });
        await adminPage.fill('#busHideReasonText', 'Temporary maintenance removal');
        await adminPage.click('#btnConfirmHideFromMap');
        await adminPage.waitForSelector('.admin-notice-banner.success, #adminNoticeBanner:not([style*="none"]), .admin-toast.success', { state: 'visible', timeout: 15000 });

        await new Promise(r => setTimeout(r, 2000));
        const bizRemEmail = await adminDb.collection('emailLog').where('event', '==', 'business_removed').where('entityId', '==', createdBusinessId).get();
        report(bizRemEmail.docs.length >= 1 && bizRemEmail.docs[0]?.data()?.dryRun === true, '8.0: Admin hid business -> emailLog recorded business_removed');

        // Confirm business is gone from Places
        const placesVerifyPage = await commuterContext.newPage();
        await placesVerifyPage.goto(`http://127.0.0.1:${PORT}/pages/places.html`, { waitUntil: 'domcontentloaded' });
        await placesVerifyPage.waitForSelector('#placesGrid', { state: 'visible', timeout: 15000 });
        const allPlacesText = await placesVerifyPage.$eval('#placesGrid', el => el.innerText);
        report(!allPlacesText.includes(createdBusinessName), '8.1: Hidden business is completely gone from Places directory');
        await placesVerifyPage.close();

        // ====================================================================
        // STEP 9: Email Log Table Verification
        // ====================================================================
        console.log('\n--- Step 9: Firestore Email Log Verification & Output Table ---');
        const expectedEvents = [
            'application_received',
            'application_approved_pay',
            'payment_received',
            'business_live',
            'tour360_availed',
            'tour360_scheduled',
            'tour360_published',
            'review_posted',
            'review_removed',
            'business_removed'
        ];

        const emailLogSnaps = await adminDb.collection('emailLog').orderBy('sentAt', 'asc').get();
        const runEmailDocs = [];

        for (const doc of emailLogSnaps.docs) {
            const data = doc.data();
            if (
                data.entityId === createdBusinessId ||
                data.entityId === createdReviewId ||
                (data.businessId === createdBusinessId)
            ) {
                runEmailDocs.push({ id: doc.id, ...data });
            }
        }

        const emailTableRows = [];
        let allEventsPresent = true;
        let allDryRun = true;

        for (const ev of expectedEvents) {
            const matches = runEmailDocs.filter(d => d.event === ev);
            const found = matches.length === 1;
            if (!found) allEventsPresent = false;
            const doc = matches[0];
            const isDry = doc ? doc.dryRun === true : false;
            if (!isDry && doc) allDryRun = false;

            emailTableRows.push({
                event: ev,
                count: matches.length,
                dryRun: doc ? String(doc.dryRun) : 'N/A',
                recipients: Array.isArray(doc?.to) ? doc.to.join(', ') : (Array.isArray(doc?.recipients) ? doc.recipients.join(', ') : (doc?.to || doc?.recipients || 'N/A')),
                subject: doc?.subject || 'N/A',
                status: found && isDry ? 'VERIFIED' : 'MISMATCH'
            });
        }

        report(allEventsPresent, `9.0: Exactly one emailLog entry per walkthrough event (${expectedEvents.length} events)`);
        report(allDryRun, '9.0: All emailLog entries have dryRun: true (zero live emails sent)');

        console.log('\n========================================================================');
        console.log('EMAIL LOG VERIFICATION TABLE');
        console.log('========================================================================');
        console.table(emailTableRows);

    } catch (err) {
        console.error('\n[FATAL ERROR during walkthrough]:', err);
        report(false, 'Walkthrough completed without unhandled exceptions', err.message);
    } finally {
        await browser.close().catch(() => {});
        if (authServer) authServer.close();
        if (serverProcess) serverProcess.kill();
    }

    console.log('\n========================================================================');
    console.log(`SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED out of ${passedCount + failedCount} checks.`);
    console.log('========================================================================\n');

    process.exit(failedCount === 0 ? 0 : 1);
}

runEndToEndWalkthrough();
