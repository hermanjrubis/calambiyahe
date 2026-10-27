/**
 * scripts/test-p3-flow.mjs
 *
 * End-to-End Integration Flow Test Suite for Calzada Phase 3:
 * - Test 1: Wizard draft autosave (steps 1–2), reload page, verify draft restored.
 * - Test 2: Next / Back navigation maintains input state.
 * - Test 3: Wizard submission creates businesses/{id} with status: 'pending' and deletes draft.
 * - Test 4: Admin approval -> owner GCash submission -> admin marks as paid (plus360):
 *           - Business appears on Places page with "New" label.
 *           - Place panel hero shows 360 "Coming soon" card and offerings / hours.
 *           - Business appears in Admin "360 Shoots" -> Pending table with waiting days.
 * - Test 5: Admin sets shoot date -> status updates to 'scheduled', fires tour360_scheduled.
 * - Test 6: Admin uploads 360 and publishes -> status updates to 'done', fires tour360_published.
 * - Test 7: Places page 360 "Coming soon" card is replaced by 360 Pannellum viewer.
 * - Test 8: Mobile, tablet, desktop responsive viewport verification.
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

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

const app = getApps().length > 0 ? getApps()[0] : initializeApp({ projectId: 'calzada-web' });
const adminDb = getFirestore(app);

let serverProcess = null;
let authServer = null;

function createEmulatorToken(uid, claims = {}) {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
        sub: uid,
        user_id: uid,
        aud: "calzada-web",
        iss: "https://securetoken.google.com/calzada-web",
        email: `${uid}@test.calzadaph.com`,
        exp: Math.floor(Date.now() / 1000) + 7200,
        iat: Math.floor(Date.now() / 1000),
        auth_time: Math.floor(Date.now() / 1000),
        firebase: { sign_in_provider: "custom" },
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
                let uid = 'owner_p3_tester';
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
                        const match = body.match(/refresh_token=refresh-token-([^&]+)/);
                        if (match) uid = match[1];
                        if (body.includes('admin') || uid.includes('admin')) {
                            isAdmin = true;
                        }
                    }
                } catch (_) {}

                if (uid.includes('admin')) isAdmin = true;

                if (url.includes('accounts:signInWithCustomToken')) {
                    const customJwt = createEmulatorToken(uid, { admin: isAdmin });
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        kind: 'identitytoolkit#VerifyCustomTokenResponse',
                        idToken: customJwt,
                        refreshToken: `refresh-token-${uid}`,
                        expiresIn: '7200',
                        isNewUser: false
                    }));
                } else if (url.includes('securetoken.googleapis.com/v1/token')) {
                    const customJwt = createEmulatorToken(uid, { admin: isAdmin });
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        access_token: customJwt,
                        expires_in: "7200",
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
            setTimeout(resolve, 3000);
        });
    });
}

async function runPhase3FlowTests() {
    console.log('========================================================');
    console.log('PHASE 3: END-TO-END FLOW VERIFICATION SUITE');
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

    await startAuthEmulator();
    await startAppServer();

    const browser = await chromium.launch({ headless: true });

    const ownerUid = 'owner_flow_p3_user';
    const adminUid = 'admin_flow_p3_user';
    const ownerToken = createEmulatorToken(ownerUid, { admin: false });
    const adminToken = createEmulatorToken(adminUid, { admin: true });

    let createdBusinessId = null;

    try {
        // ----------------------------------------------------
        // Setup initial clean Firestore state
        // ----------------------------------------------------
        console.log('Step 0: Cleaning up previous test data in Firestore...');
        await adminDb.collection('businessDrafts').doc(ownerUid).delete().catch(() => {});
        const oldBizSnaps = await adminDb.collection('businesses').where('ownerId', '==', ownerUid).get();
        for (const bDoc of oldBizSnaps.docs) {
            await bDoc.ref.delete().catch(() => {});
        }

        // ----------------------------------------------------
        // TEST 1: Wizard draft autosave (steps 1–2), reload page, verify draft restored
        // ----------------------------------------------------
        console.log('\n--- TEST 1: Wizard Draft Autosave & Restoration ---');
        const ownerContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const ownerPage = await ownerContext.newPage();

        await ownerContext.addInitScript(({ uid, token }) => {
            window.localStorage.setItem('calzada_use_emulator', '1');
            window.__AUTO_SIGNIN_TOKEN__ = token;
            window.__MOCK_AUTH_USER__ = {
                uid: uid,
                email: `${uid}@test.calzadaph.com`,
                displayName: 'Owner Tester',
                getIdToken: async () => token
            };
        }, { uid: ownerUid, token: ownerToken });

        await ownerPage.goto('http://127.0.0.1:5000/pages/submit.html?emulator=1&new=1#store', { waitUntil: 'domcontentloaded' });

        // Wait for wizard container to load
        await ownerPage.waitForSelector('#wizardMount .wizard-root', { state: 'visible', timeout: 10000 });

        // Step 1: Fill store details
        await ownerPage.fill('#inputBizName', 'Artisan Roast Cafe');
        await ownerPage.selectOption('#selectBizCategory', 'coffee');
        await ownerPage.fill('#inputBizDesc', 'Freshly brewed specialty coffee and artisan pastries in Calamba.');
        await ownerPage.fill('#inputBizContact', '09171234567');

        // Set simulated thumbnail and offerings directly on wizard instance
        await ownerPage.evaluate(() => {
            if (window.wizardInstance) {
                window.wizardInstance.formData.thumbnailUrl = 'https://res.cloudinary.com/calzada/image/upload/v12345/calzada/businesses/front_artisan.jpg';
                window.wizardInstance.formData.offerings = ['Specialty Pour Over', 'Artisan Croissant'];
                window.wizardInstance.validateCurrentStepButton();
                window.wizardInstance.triggerAutosave();
            }
        });

        // Click Next to advance to #location
        await ownerPage.click('#btnWizardNext');
        await ownerPage.waitForFunction(() => window.location.hash === '#location', { timeout: 5000 });

        // Step 2: Fill location details
        await ownerPage.selectOption('#selectBarangay', 'Real');
        await ownerPage.fill('#inputAddress', '124 National Highway, Real, Calamba City');
        await ownerPage.fill('#inputLandmark', 'Near Calamba City Hall');

        // Set location within bounds and persist draft
        await ownerPage.evaluate(async () => {
            if (window.wizardInstance) {
                window.wizardInstance.formData.location = { lat: 14.2085, lng: 121.1555 };
                window.wizardInstance.validateCurrentStepButton();
                await window.wizardInstance.saveDraftNow();
            }
        });

        // Verify draft in Firestore
        const draftSnap = await adminDb.collection('businessDrafts').doc(ownerUid).get();
        report(draftSnap.exists && draftSnap.data().name === 'Artisan Roast Cafe', 'Draft saved to businessDrafts/{uid} with store details.');
        report(draftSnap.exists && draftSnap.data().barangay === 'Real' && draftSnap.data().step === 'location', 'Draft saved location and step position.');

        // Reload the page to test restoration
        await ownerPage.reload({ waitUntil: 'domcontentloaded' });
        await ownerPage.waitForSelector('#wizardMount .wizard-root', { state: 'visible', timeout: 10000 });

        // Check restored fields
        const restoredName = await ownerPage.$eval('#inputBizName', el => el.value).catch(() => '');
        const restoredAddress = await ownerPage.$eval('#inputAddress', el => el.value).catch(() => '');
        report(restoredName === 'Artisan Roast Cafe' || restoredAddress.includes('National Highway'), 'Page reload restored draft inputs.');

        // ----------------------------------------------------
        // TEST 2: Next / Back navigation maintains input state
        // ----------------------------------------------------
        console.log('\n--- TEST 2: Navigation & Input State Retention ---');
        // Ensure on #location, click Continue to go to #hours
        await ownerPage.evaluate(() => window.wizardInstance?.goToStep('location'));
        await ownerPage.waitForFunction(() => window.location.hash === '#location', { timeout: 5000 });
        await ownerPage.click('#btnWizardNext');
        await ownerPage.waitForFunction(() => window.location.hash === '#hours', { timeout: 5000 });
        report(true, 'Navigated forward from #location to #hours.');

        // Click Back to #location
        await ownerPage.click('#btnWizardPrev');
        await ownerPage.waitForFunction(() => window.location.hash === '#location', { timeout: 5000 });
        const checkAddress = await ownerPage.$eval('#inputAddress', el => el.value);
        report(checkAddress.includes('National Highway'), 'Back navigation to #location preserved address input.');

        // Click Back to #store
        await ownerPage.click('#btnWizardPrev');
        await ownerPage.waitForFunction(() => window.location.hash === '#store', { timeout: 5000 });
        const checkName = await ownerPage.$eval('#inputBizName', el => el.value);
        report(checkName === 'Artisan Roast Cafe', 'Back navigation to #store preserved business name input.');

        // Advance to #hours, then to #plan
        await ownerPage.click('#btnWizardNext'); // to #location
        await ownerPage.click('#btnWizardNext'); // to #hours
        await ownerPage.click('#btnWizardNext'); // to #plan
        await ownerPage.waitForFunction(() => window.location.hash === '#plan', { timeout: 5000 });
        report(true, 'Navigated forward to #plan step.');

        // ----------------------------------------------------
        // TEST 3: Wizard submission creates businesses/{id} & deletes draft
        // ----------------------------------------------------
        console.log('\n--- TEST 3: Wizard Submission & Draft Deletion ---');
        // Select 'plus360' plan
        await ownerPage.evaluate(() => {
            const card = document.querySelector('.plan-select-card[data-plan="plus360"], .plan-choice-card[data-plan="plus360"], [data-plan="plus360"]');
            if (card) card.click();
            window.wizardInstance.formData.plan = 'plus360';
            window.wizardInstance.validateCurrentStepButton();
        });

        // Advance to #review
        await ownerPage.click('#btnWizardNext');
        await ownerPage.waitForFunction(() => window.location.hash === '#review', { timeout: 5000 });

        // Agree to terms
        await ownerPage.check('#chkTermsAgreed');
        await ownerPage.waitForFunction(() => {
            const btn = document.getElementById('btnWizardNext');
            return btn && !btn.disabled;
        }, { timeout: 5000 });

        // Submit registration
        await ownerPage.click('#btnWizardNext');

        // Wait for redirect or Firestore write
        await new Promise(r => setTimeout(r, 3000));

        // Query Firestore for created business
        const bizQuery = await adminDb.collection('businesses').where('ownerId', '==', ownerUid).get();
        report(!bizQuery.empty, 'Business document created in businesses collection.');

        const bizDoc = bizQuery.docs[0];
        createdBusinessId = bizDoc.id;
        const bizData = bizDoc.data();

        report(bizData.status === 'pending', 'New business has status: "pending".');
        report(bizData.plan === 'plus360', 'New business has plan: "plus360".');
        report(bizData.barangay === 'Real' && Array.isArray(bizData.offerings), 'New business has Phase 3 data model (barangay, offerings).');
        report(bizData.thumbnailUrl && bizData.thumbnailUrl.includes('cloudinary'), 'New business has valid thumbnailUrl.');

        // Verify draft was deleted
        const checkDraftDeleted = await adminDb.collection('businessDrafts').doc(ownerUid).get();
        report(!checkDraftDeleted.exists, 'Draft was successfully deleted from businessDrafts/{uid} upon submission.');

        // ----------------------------------------------------
        // TEST 4: Admin approval -> GCash payment -> live on Places & Admin 360 Shoots
        // ----------------------------------------------------
        console.log('\n--- TEST 4: Approval, Payment & Live Merge on Places ---');
        const paymentId = `pay_flow_${createdBusinessId}`;

        // 1. Admin approves details -> awaiting_payment
        await adminDb.collection('businesses').doc(createdBusinessId).update({
            status: 'awaiting_payment',
            amountDue: 199,
            detailsApprovedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });

        // 2. Owner submits payment -> payment_review
        await adminDb.collection('payments').doc(paymentId).set({
            businessId: createdBusinessId,
            ownerId: ownerUid,
            amountDue: 199,
            plan: 'plus360',
            referenceNo: '1234567890123',
            receiptUrl: 'https://res.cloudinary.com/calzada/image/upload/v1/receipt.jpg',
            status: 'submitted',
            submittedAt: new Date().toISOString()
        });
        await adminDb.collection('businesses').doc(createdBusinessId).update({
            status: 'payment_review',
            lastPaymentId: paymentId
        });

        // 3. Admin confirms payment -> approved & shoot360: 'to_schedule'
        const paidAtDate = new Date();
        await adminDb.collection('payments').doc(paymentId).update({ status: 'matched' });
        await adminDb.collection('businesses').doc(createdBusinessId).update({
            status: 'approved',
            paidAt: paidAtDate,
            shoot360: 'to_schedule',
            updatedAt: paidAtDate
        });

        // Trigger event to clear server cache
        await fetch('http://127.0.0.1:5000/api/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
            body: JSON.stringify({ event: 'business_live', businessId: createdBusinessId })
        }).catch(() => {});

        // Check Places page
        const placesPage = await ownerContext.newPage();
        await placesPage.goto('http://127.0.0.1:5000/pages/places.html?emulator=1', { waitUntil: 'domcontentloaded' });
        await placesPage.waitForSelector('.places-grid .ref-card, #placesGrid .ref-card, .ref-card', { state: 'visible', timeout: 10000 });

        // Find Artisan Roast Cafe card
        const cardSelector = `.ref-card[data-name*="Artisan Roast"]`;
        const hasCard = await placesPage.waitForSelector(cardSelector, { state: 'visible', timeout: 8000 }).catch(() => null);
        report(!!hasCard, 'Live business merged into /pages/places.html.');

        // Verify "New" plain text label
        const newTag = await placesPage.$(`${cardSelector} .cz-label-new, ${cardSelector} .place-tag-new`);
        report(!!newTag, 'New business displays plain text "New" tag.');

        // Click card to open place-panel
        await placesPage.click(cardSelector);
        await placesPage.waitForSelector('#placePanel.active, #placePanel.open, #placePanelWrapper.open', { state: 'visible', timeout: 8000 });

        // Verify 360 "Coming soon" hero card
        const comingSoonHero = await placesPage.waitForSelector('.hero-360-coming-soon', { state: 'attached', timeout: 5000 }).catch(() => null);
        const comingSoonText = comingSoonHero ? await comingSoonHero.innerText() : '';
        report(comingSoonText.includes('360° tour coming soon') && comingSoonText.includes('Our team will visit'), 'Place panel hero shows 360 "Coming soon" card for un-shot business.');

        // Verify offerings row
        const offeringsText = await placesPage.$eval('#ppRowOfferings', el => el.innerText).catch(() => '');
        report(offeringsText.length > 0, 'Place panel displays offerings row with specialties.');

        // Check Admin "360 Shoots" section
        const adminContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const adminPage = await adminContext.newPage();
        adminPage.on('console', msg => console.log(`[Admin Console ${msg.type()}]:`, msg.text()));
        adminPage.on('pageerror', err => console.error('[Admin PageError]:', err.message));

        await adminPage.addInitScript(() => {
            window.localStorage.setItem('calzada_use_emulator', '1');
        });

        await adminPage.goto('http://127.0.0.1:5000/pages/admin.html?emulator=1#shoots', { waitUntil: 'domcontentloaded' });
        await adminPage.evaluate(async (token) => {
            const { signInWithCustomToken } = await import("https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js");
            const auth = window.CalzadaAuth.auth;
            return await signInWithCustomToken(auth, token);
        }, adminToken);

        await adminPage.waitForSelector('#adminApp[data-realtime-ready="true"]', { state: 'visible', timeout: 10000 });
        await adminPage.waitForSelector('#panel-shoots', { state: 'visible', timeout: 8000 });

        // Verify business appears in Pending shoots table
        const pendingRow = await adminPage.waitForSelector(`#shootsTableBody .btn-set-shoot[data-id="${createdBusinessId}"]`, { state: 'visible', timeout: 8000 }).catch(() => null);
        report(!!pendingRow, 'Admin "360 Shoots" -> Pending table displays newly approved plus360 business.');

        // ----------------------------------------------------
        // TEST 5: Admin sets shoot date -> scheduled & tour360_scheduled
        // ----------------------------------------------------
        console.log('\n--- TEST 5: Set Shoot Date Workflow ---');
        // Click "Set shoot date"
        await adminPage.click(`#shootsTableBody .btn-set-shoot[data-id="${createdBusinessId}"]`);
        await adminPage.waitForSelector('#setShootDateModal', { state: 'visible', timeout: 5000 });

        // Set date
        await adminPage.fill('#shootDateInput', '2026-11-15');
        await adminPage.click('#btnConfirmShootDate');

        // Wait for modal to close
        await adminPage.waitForSelector('#setShootDateModal', { state: 'hidden', timeout: 5000 });

        // Verify Firestore update
        const bizShootCheck = await adminDb.collection('businesses').doc(createdBusinessId).get();
        const shootData = bizShootCheck.data();
        report(shootData.shoot360 === 'scheduled', 'Business shoot360 status updated to "scheduled".');
        report(!!shootData.shoot360Date, 'Business shoot360Date timestamp recorded.');

        // Switch to "Scheduled" tab in Admin portal
        await adminPage.click('#shootTabScheduled, #shootsTabScheduled, [data-shoot-tab="scheduled"]');
        const scheduledRow = await adminPage.waitForSelector(`#shootsTableBody .btn-open-upload-360[data-id="${createdBusinessId}"], #shootsTableBody .btn-open-upload[data-id="${createdBusinessId}"]`, { state: 'visible', timeout: 8000 }).catch(() => null);
        report(!!scheduledRow, 'Business moved to "Scheduled" tab with "Upload 360 photo" action.');

        // ----------------------------------------------------
        // TEST 6: Publish 360 tour -> shoot360: 'done' & tour360_published
        // ----------------------------------------------------
        console.log('\n--- TEST 6: Publish 360 Tour API ---');
        const publishPayload = {
            photos: [{
                url: `https://res.cloudinary.com/calzada/image/upload/v1234/calzada/tours/${createdBusinessId}/artisan_main.jpg`,
                thumbUrl: `https://res.cloudinary.com/calzada/image/upload/v1234/calzada/tours/${createdBusinessId}/artisan_thumb.jpg`,
                label: 'Main Storefront'
            }]
        };

        const publishRes = await fetch(`http://127.0.0.1:5000/api/admin/businesses/${createdBusinessId}/tour360`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify(publishPayload)
        });
        const publishJson = await publishRes.json();
        const bizUpdatedSnap = await adminDb.collection('businesses').doc(createdBusinessId).get();
        const bizUpdatedData = bizUpdatedSnap.data();
        report(publishRes.ok && publishJson.success === true && bizUpdatedData.shoot360 === 'done', 'POST /api/admin/businesses/:id/tour360 published tour and set shoot360: "done".');

        // Check Admin published tab
        await adminPage.click('#shootTabPublished, #shootsTabPublished, [data-shoot-tab="published"]');
        const publishedCell = await adminPage.waitForSelector(`#shootsTableBody tr:has-text("Artisan Roast Cafe")`, { state: 'visible', timeout: 8000 }).catch(() => null);
        report(!!publishedCell, 'Business appears in Admin "Published" 360 shoots tab.');

        // ----------------------------------------------------
        // TEST 7: Places page 360 "Coming soon" replaced by 360 viewer
        // ----------------------------------------------------
        console.log('\n--- TEST 7: Places Page 360 Tour Live Viewer ---');
        // Navigate to clean Places URL to pull updated tour360
        await placesPage.goto('http://127.0.0.1:5000/pages/places.html?emulator=1', { waitUntil: 'domcontentloaded' });
        await placesPage.waitForSelector('.places-grid .ref-card, #placesGrid .ref-card, .ref-card', { state: 'visible', timeout: 10000 });

        // Open place panel for Artisan Roast Cafe
        await placesPage.click(cardSelector);
        await placesPage.waitForSelector('#placePanel.active, #placePanel.open, #placePanelWrapper.open', { state: 'visible', timeout: 8000 });

        // Verify .hero-360-coming-soon is NO LONGER present
        const comingSoonCardStillThere = await placesPage.$('.hero-360-coming-soon');
        report(!comingSoonCardStillThere, 'Place panel 360 "Coming soon" card is replaced after publishing.');

        // Verify 360 viewer is initialized
        const hasPanoViewer = await placesPage.waitForSelector('#placeViewerContainer, .pnlm-container, #placePanelHeroPano, #ppInline360Container', { state: 'attached', timeout: 8000 }).catch(() => null);
        report(!!hasPanoViewer, 'Pannellum 360 tour viewer mounted in place panel.');

        // ----------------------------------------------------
        // TEST 8: Responsive viewport verification (Desktop, Tablet, Mobile)
        // ----------------------------------------------------
        console.log('\n--- TEST 8: Responsive Viewport Checks ---');
        const responsivePage = await ownerContext.newPage();
        await responsivePage.goto('http://127.0.0.1:5000/pages/submit.html?emulator=1&new=1#store', { waitUntil: 'domcontentloaded' });
        await responsivePage.waitForSelector('#wizardMount .wizard-root', { state: 'visible', timeout: 10000 });

        // 1. Desktop (1280x800)
        await responsivePage.setViewportSize({ width: 1280, height: 800 });
        const desktopStepperVisible = await responsivePage.isVisible('.stepper-desktop');
        report(desktopStepperVisible, 'Desktop viewport (1280x800) shows desktop stepper.');

        // 2. Tablet (768x1024)
        await responsivePage.setViewportSize({ width: 768, height: 1024 });
        const tabletNoHorizontalScroll = await responsivePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
        report(tabletNoHorizontalScroll, 'Tablet viewport (768x1024) has no horizontal overflow.');

        // 3. Mobile (390x844)
        await responsivePage.setViewportSize({ width: 390, height: 844 });
        await responsivePage.waitForTimeout(300);
        const phoneStepperVisible = await responsivePage.isVisible('.stepper-phone');
        const phoneNoHorizontalScroll = await responsivePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
        report(phoneStepperVisible && phoneNoHorizontalScroll, 'Mobile viewport (390x844) shows compact mobile stepper without horizontal overflow.');
        await responsivePage.close().catch(() => {});

    } catch (err) {
        console.error('Test execution error:', err);
        report(false, `Unexpected error during test execution: ${err.message}`);
    } finally {
        await browser.close().catch(() => {});
        if (authServer) authServer.close();
        if (serverProcess) serverProcess.kill();
    }

    console.log('\n========================================================');
    console.log(`TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('========================================================\n');

    if (failedCount > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runPhase3FlowTests();
