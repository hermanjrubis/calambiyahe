/**
 * scripts/test-p1-gate.mjs
 *
 * Browser Verification for Phase 1:
 * - Signed out: /planner?destName=...&destLat=...&destLng=...
 *   Pick a starting place -> gate shows -> 0 network calls to routing hosts.
 * - Click Sign in -> sign in via emulator -> redirects back -> route generated -> 1 planned doc in Firestore.
 * - Start -> Cancel -> doc status updated to cancelled.
 * - Starting point "Your location" -> confirm calzada_pending_route never contains lat/lng for origin.
 * - Responsive: gate card and Route history modal have no horizontal scroll at 320, 768, 1024, 1280.
 */

import http from 'http';
import { spawn } from 'child_process';
import { chromium } from 'playwright';

const PORT = 5000;
const AUTH_EMU_PORT = 9099;

let serverProcess = null;
let authServer = null;

function createEmulatorToken(uid = 'emulator_user_p1') {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
        sub: uid,
        user_id: uid,
        aud: "calzada-web",
        iss: "https://securetoken.google.com/calzada-web",
        email: 'test@calzada.ph',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        auth_time: Math.floor(Date.now() / 1000),
        firebase: {
            sign_in_provider: "password"
        }
    })).toString('base64url');
    return `${header}.${payload}.`;
}

// Firebase Auth Emulator REST server
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
                console.log(`[Auth Emu] ${req.method} ${url}`);
                const mockJwt = createEmulatorToken('emulator_user_p1');

                if (url.includes('accounts:createAuthUri')) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        kind: 'identitytoolkit#CreateAuthUriResponse',
                        allProviders: ['password'],
                        registered: true,
                        signinMethods: ['password']
                    }));
                } else if (url.includes('accounts:signInWithPassword') || url.includes('accounts:signUp')) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        kind: 'identitytoolkit#VerifyPasswordResponse',
                        localId: 'emulator_user_p1',
                        email: 'test@calzada.ph',
                        displayName: 'Tester Commuter',
                        idToken: mockJwt,
                        registered: true,
                        refreshToken: 'refresh-mock-token',
                        expiresIn: '3600'
                    }));
                } else if (url.includes('accounts:lookup')) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        kind: 'identitytoolkit#GetAccountInfoResponse',
                        users: [{
                            localId: 'emulator_user_p1',
                            email: 'test@calzada.ph',
                            displayName: 'Tester Commuter',
                            emailVerified: true
                        }]
                    }));
                } else {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({}));
                }
            });
        });

        authServer.listen(AUTH_EMU_PORT, '127.0.0.1', () => {
            console.log(`[Auth Emulator] listening on 127.0.0.1:${AUTH_EMU_PORT}`);
            resolve();
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
            console.log(`[App Server] Starting node server.js on port ${PORT} (CALZADA_EMULATORS=1)...`);
            serverProcess = spawn('node', ['server.js'], {
                env: { ...process.env, PORT: String(PORT), CALZADA_EMULATORS: '1', DRY_RUN_EMAIL: 'true' },
                stdio: 'pipe'
            });
            setTimeout(resolve, 2500);
        });
    });
}

async function runTests() {
    console.log('========================================================');
    console.log('PHASE 1: BROWSER PLAYWRIGHT VERIFICATION');
    console.log('========================================================\n');

    await startAuthEmulator();
    await startAppServer();

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

    const browser = await chromium.launch({
        channel: 'chrome',
        headless: true
    });

    try {
        // --- TEST 1: Signed out planner gate & 0 routing calls ---
        console.log('--- Test 1: Signed out Planner Gate ---');
        const context = await browser.newContext({
            viewport: { width: 1280, height: 800 },
            permissions: ['geolocation'],
            geolocation: { latitude: 14.1940522, longitude: 121.1596881, accuracy: 10 }
        });
        await context.addInitScript(() => {
            sessionStorage.setItem('calzada_use_emulator', '1');
            localStorage.setItem('calzada_use_emulator', '1');
        });

        const page = await context.newPage();
        page.on('console', msg => console.log('[Browser console]', msg.text()));
        page.on('pageerror', err => console.log('[Browser error]', err.message));
        let routingRequestsCount = 0;
        page.on('request', req => {
            const u = req.url();
            if (u.includes('project-osrm.org') || u.includes('routing.openstreetmap.de') || u.includes('transit-planner')) {
                routingRequestsCount++;
            }
        });

        const plannerUrl = `http://localhost:${PORT}/planner?destName=SM%20Calamba&destLat=14.2033&destLng=121.1557`;
        await page.goto(plannerUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500);

        // Pick a starting point through real UI: Calamba City Hall
        // Setting both inputs when signed out should toast "Sign in to see your route"
        // and navigate to /login?redirect=%2Fplanner%3Fresume%3D1&reason=route after ~900ms
        const navToLoginPromise = page.waitForNavigation({ timeout: 15000 });
        await page.click('#openOriginModal');
        await page.waitForSelector('.cps-input', { state: 'visible', timeout: 5000 });
        await page.fill('.cps-input', 'City Hall');
        const cityHallOption = page.locator('.cps-row[role="option"]').filter({ hasText: 'Calamba City Hall' }).first();
        await cityHallOption.waitFor({ state: 'visible', timeout: 5000 });
        await cityHallOption.click();

        // Wait for redirect to login
        await navToLoginPromise;

        report(routingRequestsCount === 0, `0 network calls to routing servers (actual: ${routingRequestsCount}).`);

        const loginState = await page.evaluate(() => {
            const notice = document.getElementById('routeGateNotice');
            const line = document.getElementById('routeGateLine');
            const backLink = document.getElementById('routeGateBackLink');
            return {
                url: window.location.href,
                noticeVisible: notice ? window.getComputedStyle(notice).display !== 'none' : false,
                lineText: line ? line.innerText : '',
                backLinkHref: backLink ? backLink.getAttribute('href') : '',
                backLinkText: backLink ? backLink.innerText : ''
            };
        });

        report(loginState.url.includes('/login') && loginState.url.includes('reason=route'), 'Navigated to /login with reason=route and redirect param.');
        report(loginState.noticeVisible, 'Route gate notice is visible on login page.');
        report(loginState.lineText.includes('Sign in to plan your route to SM Calamba'), `Login shows plain line with destination (actual: "${loginState.lineText}").`);
        report(loginState.backLinkHref === '/planner' && loginState.backLinkText.includes('Back to map'), 'Login shows "Back to map" link pointing to /planner.');

        // --- TEST 2: sessionStorage handoff & origin coordinates check ---
        console.log('\n--- Test 2: Pending route handoff privacy check ("Your location") ---');
        // Click "Back to map" to return to planner
        const backNavPromise = page.waitForNavigation({ timeout: 15000 });
        await page.click('#routeGateBackLink');
        await backNavPromise;
        await page.waitForTimeout(1000);

        // Pick destination SM Calamba if needed
        await page.goto(`${plannerUrl}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1000);

        // Now pick "Your location" through the real UI (no window.selectLocation)
        const yourLocNavPromise = page.waitForNavigation({ timeout: 15000 });
        await page.click('#openOriginModal');
        const yourLocBtn = page.locator('.cps-shortcut').filter({ hasText: /Your location|lokasyon/i }).first();
        await yourLocBtn.waitFor({ state: 'visible', timeout: 5000 });
        await yourLocBtn.click();
        await yourLocNavPromise;

        // On the login page, inspect sessionStorage.calzada_pending_route
        const rawPending = await page.evaluate(() => sessionStorage.getItem('calzada_pending_route'));
        const pendingData = rawPending ? JSON.parse(rawPending) : null;

        report(!!pendingData, 'sessionStorage.calzada_pending_route written on sign-in redirect.');
        report(
            pendingData && pendingData.origin && pendingData.origin.kind === 'my_location' && pendingData.origin.lat === undefined && pendingData.origin.lng === undefined,
            'Pending route origin has kind "my_location" and ZERO coordinates (privacy RA 10173 preserved).'
        );

        // --- TEST 3: Login hand-off and route history doc creation ---
        console.log('\n--- Test 3: Sign in & Route Generation ---');
        // Clear any previous routeHistory docs for this test user in Firestore emulator before starting
        await page.evaluate(async () => {
            try {
                await fetch('http://127.0.0.1:8080/emulator/v1/projects/calzada-web/databases/(default)/documents', { method: 'DELETE' });
            } catch (_) {}
        });

        // Step 1: fill email and submit
        await page.fill('#emailInput', 'test@calzada.ph');
        await page.click('#btnEmailContinue');

        // Step 2: wait for password step to become active
        await page.waitForSelector('#loginPass:not([disabled])', { timeout: 5000 });
        await page.fill('#loginPass', 'password123');

        // Submit login and wait for redirect to planner
        const loginNavPromise = page.waitForNavigation({ timeout: 15000 });
        await page.click('#loginSubmitBtn');
        await loginNavPromise;
        await page.waitForTimeout(1500);

        // Confirm we are back on planner
        const currentUrl = page.url();
        report(currentUrl.includes('/planner'), 'Redirected back to /planner after login.');
        report(!currentUrl.includes('resume=1'), 'resume=1 is removed from URL via replaceState.');

        // Check if pending route was cleaned from sessionStorage
        const pendingKeyAfterResume = await page.evaluate(() => sessionStorage.getItem('calzada_pending_route'));
        report(pendingKeyAfterResume === null, 'sessionStorage.calzada_pending_route is deleted immediately.');

        // Wait for route calculation and start button to enable
        try {
            await page.waitForSelector('#startJourneyBtn:not([disabled])', { timeout: 8000 });
        } catch (_) {}
        await page.waitForTimeout(2000);

        let routeHistoryInDb = { count: 0, docs: [] };
        for (let i = 0; i < 20; i++) {
            routeHistoryInDb = await page.evaluate(async () => {
                try {
                    const user = window.CalzadaAuth?.getCurrentUser();
                    if (!user) return { error: 'No authenticated user' };
                    const snap = await window.CalzadaAuth.getDocs(
                        window.CalzadaAuth.collection(window.CalzadaAuth.db, `users/${user.uid}/routeHistory`)
                    );
                    const docs = [];
                    snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
                    return { count: docs.length, docs };
                } catch (e) {
                    return { error: e.message };
                }
            });
            if (routeHistoryInDb.count >= 1) break;
            await page.waitForTimeout(500);
        }

        report(
            routeHistoryInDb.count >= 1 && routeHistoryInDb.docs[0].status === 'planned' && routeHistoryInDb.docs[0].mode === 'jeepney',
            `Initial planned Jeepney route doc recorded in Firestore (found ${routeHistoryInDb.count || 0}).`
        );
        const initialJeepDocId = routeHistoryInDb.docs[0]?.id;

        // --- TEST 4: Mode Switching & Lifecycle (a, b, c) ---
        console.log('\n--- Test 4: Mode Switching & Lifecycle (a, b, c) ---');

        // 4a. plan Jeepney, switch to Walk -> first doc cancelled/switched_route, second planned
        console.log('--- 4a: Switch Jeepney to Walk in planning mode ---');
        await page.click('#modeWalking');

        let docs4a = [];
        let initialDocAfterSwitch = null;
        let secondWalkDoc = null;
        for (let i = 0; i < 25; i++) {
            docs4a = await page.evaluate(async () => {
                const user = window.CalzadaAuth?.getCurrentUser();
                const snap = await window.CalzadaAuth.getDocs(
                    window.CalzadaAuth.collection(window.CalzadaAuth.db, `users/${user.uid}/routeHistory`)
                );
                const list = [];
                snap.forEach(d => list.push({ id: d.id, ...d.data() }));
                return list;
            });
            initialDocAfterSwitch = docs4a.find(d => d.id === initialJeepDocId);
            secondWalkDoc = docs4a.find(d => d.id !== initialJeepDocId && d.mode === 'walk');
            if (secondWalkDoc && initialDocAfterSwitch?.status === 'cancelled') break;
            await page.waitForTimeout(500);
        }

        report(
            initialDocAfterSwitch?.status === 'cancelled' && initialDocAfterSwitch?.cancelReason === 'switched_route',
            '4a: First doc (Jeepney) cancelled with switched_route on mode switch.'
        );
        report(
            secondWalkDoc?.status === 'planned',
            '4a: Second doc (Walk) created with status "planned".'
        );

        // 4b. start, switch mode mid-journey -> old doc cancelled with endedAt, new doc started
        console.log('\n--- 4b: Start journey and switch mode mid-journey ---');
        await page.waitForSelector('#startJourneyBtn:not([disabled])', { timeout: 8000 });
        await page.click('#startJourneyBtn');

        let walkDocAfterStart = null;
        for (let i = 0; i < 20; i++) {
            walkDocAfterStart = await page.evaluate(async (id) => {
                const user = window.CalzadaAuth?.getCurrentUser();
                const snap = await window.CalzadaAuth.getDoc(
                    window.CalzadaAuth.doc(window.CalzadaAuth.db, `users/${user.uid}/routeHistory/${id}`)
                );
                return snap.data();
            }, secondWalkDoc?.id);
            if (walkDocAfterStart?.status === 'started') break;
            await page.waitForTimeout(500);
        }

        report(
            walkDocAfterStart?.status === 'started' && !!walkDocAfterStart?.startedAt,
            'Walk doc transitioned to status "started".'
        );

        // Switch mode mid-journey: click Jeepney in active nav panel
        const navJeepBtn = page.locator('.active-nav-panel .nav-panel-mode-btn[data-mode="jeepney"], .nav-panel-mode-btn[data-mode="jeepney"]').first();
        await navJeepBtn.waitFor({ state: 'visible', timeout: 5000 });
        await navJeepBtn.click();

        let docs4b = [];
        let cancelledWalkMid = null;
        let startedJeepMid = null;
        for (let i = 0; i < 25; i++) {
            docs4b = await page.evaluate(async () => {
                const user = window.CalzadaAuth?.getCurrentUser();
                const snap = await window.CalzadaAuth.getDocs(
                    window.CalzadaAuth.collection(window.CalzadaAuth.db, `users/${user.uid}/routeHistory`)
                );
                const list = [];
                snap.forEach(d => list.push({ id: d.id, ...d.data() }));
                return list;
            });
            cancelledWalkMid = docs4b.find(d => d.id === secondWalkDoc?.id);
            startedJeepMid = docs4b.find(d => d.id !== secondWalkDoc?.id && d.id !== initialJeepDocId && d.mode === 'jeepney');
            if (cancelledWalkMid?.status === 'cancelled' && startedJeepMid?.status === 'started') break;
            await page.waitForTimeout(500);
        }

        report(
            cancelledWalkMid?.status === 'cancelled' && cancelledWalkMid?.cancelReason === 'switched_route' && !!cancelledWalkMid?.endedAt,
            '4b: Old doc cancelled with switched_route and endedAt when switching mode mid-journey.'
        );
        report(
            startedJeepMid?.status === 'started' && !!startedJeepMid?.startedAt,
            '4b: New doc started mid-journey with startedAt.'
        );

        // 4c. start, reload the page, resume, trigger arrival -> the same doc becomes arrived
        console.log('\n--- 4c: Reload page, resume journey, trigger arrival ---');
        const midJourneyDocId = startedJeepMid?.id;
        await page.reload({ waitUntil: 'domcontentloaded' });

        let navActiveAfterReload = false;
        for (let i = 0; i < 20; i++) {
            navActiveAfterReload = await page.evaluate(() => document.body.classList.contains('navigation-active'));
            if (navActiveAfterReload) break;
            await page.waitForTimeout(500);
        }
        report(navActiveAfterReload, '4c: Active journey resumed after page reload.');

        // Wait until auth is fully initialized and simulate arrival via Playwright geolocation
        await page.waitForFunction(() => {
            return !!window.CalzadaAuth?.getCurrentUser();
        }, { timeout: 10000 });

        const destCoords = await page.evaluate(() => window.selectedCoords?.destination);
        if (destCoords) {
            await context.setGeolocation({ latitude: destCoords[0], longitude: destCoords[1] });
        }

        let arrivedDoc = null;
        for (let i = 0; i < 25; i++) {
            arrivedDoc = await page.evaluate(async (id) => {
                const user = window.CalzadaAuth?.getCurrentUser();
                if (!user) return { userNull: true };
                try {
                    const snap = await window.CalzadaAuth.getDoc(
                        window.CalzadaAuth.doc(window.CalzadaAuth.db, `users/${user.uid}/routeHistory/${id}`)
                    );
                    if (!snap.exists()) return { exists: false };
                    const d = snap.data({ serverTimestamps: 'estimate' });
                    return {
                        id: snap.id,
                        status: d?.status,
                        hasEndedAt: !!d?.endedAt,
                        cancelReason: d?.cancelReason
                    };
                } catch (e) {
                    return { evalError: e.message };
                }
            }, midJourneyDocId);
            if (arrivedDoc?.status === 'arrived' && arrivedDoc?.hasEndedAt) {
                console.log(`[4c Arrival] Arrived with endedAt after ${i + 1} polls!`, arrivedDoc);
                break;
            }
            if (i % 5 === 0) {
                console.log(`[4c Arrival Poll #${i}]`, arrivedDoc);
            }
            await page.waitForTimeout(500);
        }

        report(
            arrivedDoc?.id === midJourneyDocId && arrivedDoc?.status === 'arrived' && arrivedDoc?.hasEndedAt,
            `4c: The same doc (${midJourneyDocId}) transitioned to "arrived" with endedAt timestamp.`
        );

        // --- TEST 5: Responsive checks at 320, 768, 1024, 1280 ---
        console.log('\n--- Test 5: Responsive Verification (no horizontal scroll) ---');
        const viewports = [320, 768, 1024, 1280];

        // Ensure Route history modal is opened to test its layout
        await page.evaluate(() => {
            if (typeof window.openRouteHistoryModal === 'function') {
                window.openRouteHistoryModal();
            }
        });
        await page.waitForTimeout(500);

        for (const w of viewports) {
            await page.setViewportSize({ width: w, height: 800 });
            await page.waitForTimeout(300);

            const scrollInfo = await page.evaluate(() => {
                const docEl = document.documentElement;
                const modal = document.querySelector('#modalRouteHistory .profile-modal-box');
                return {
                    docHasScroll: docEl.scrollWidth > docEl.clientWidth,
                    modalHasScroll: modal ? modal.scrollWidth > modal.clientWidth : false
                };
            });

            const noScroll = !scrollInfo.docHasScroll && !scrollInfo.modalHasScroll;
            report(noScroll, `Width ${w}px: No horizontal scroll on page or Route history modal.`);
        }

        await context.close();
    } catch (err) {
        console.error('Test execution error:', err);
        failedCount++;
    } finally {
        await browser.close();
        if (authServer) authServer.close();
        if (serverProcess) serverProcess.kill();
    }

    console.log('\n========================================================');
    if (failedCount === 0) {
        console.log(`ALL BROWSER VERIFICATIONS PASSED (${passedCount} checks)!`);
    } else {
        console.error(`${failedCount} CHECKS FAILED!`);
        process.exit(1);
    }
    console.log('========================================================');
}

runTests().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
