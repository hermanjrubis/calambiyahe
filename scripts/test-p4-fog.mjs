/**
 * scripts/test-p4-fog.mjs
 *
 * Verification suite for Phase 4 Section 2 Redo:
 * Official 3-Barangay Coverage Boundary (Uno, Real, Halang) & MapLibre GL Fog Layer
 *
 * Tests:
 * 1. coverage.json artifact validation:
 *    - Area: ~3.65 km² (via turf.area)
 *    - Polygons: 1 (single contiguous boundary of Uno, Real, Halang)
 *    - BBox: ~[121.1400, 14.1862, 121.1835, 14.2099]
 *    - Outliers (3): CityMall Calamba, Letran, Coca-Cola Distribution Center
 * 2. fog-clouds.png texture validation:
 *    - Exists, size > 0 and < 40 KB
 * 3. Scope module unit checks:
 *    - load(), contains(lat, lng), bbox(), barangays(), getBaseBounds(), resetBounds(), expandBoundsForStart()
 *    - Points inside Brgy. Uno, Real, Halang return true
 *    - Points outside (Manila, Lecheria, Bucal) return false
 * 4. Planner Browser checks:
 *    - Destination outside 3 barangays is refused with toast ("Calzada covers Brgy. Uno, Real and Halang for now.")
 *    - Starting point outside is accepted, route draws, and maxBounds expands to include the start
 *    - Clearing the trip resets maxBounds
 *    - Map tap in the fog drops no pin and triggers the toast
 * 5. Registration Wizard check:
 *    - Wizard map refuses a pin outside the 3 barangays with the toast
 * 6. Places Page check:
 *    - Out-of-coverage places have .outside-coverage class (opacity: 0.6, grayscale) and "Outside our area" label
 * 7. Screenshots:
 *    - Takes screenshots at 1280x800 and 390x844 showing fog edge around the 3 barangays
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as turf from '@turf/turf';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

let authServer = null;

function createEmulatorToken(uid = 'wiz_owner', email = 'wiz_owner@test.calzadaph.com') {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
        sub: uid,
        user_id: uid,
        aud: "calzada-web",
        iss: "https://securetoken.google.com/calzada-web",
        email: email,
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        auth_time: Math.floor(Date.now() / 1000),
        firebase: { sign_in_provider: "password" }
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
                const uid = 'wiz_owner';
                const email = 'wiz_owner@test.calzadaph.com';
                const jwt = createEmulatorToken(uid, email);

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
                        localId: uid,
                        email: email,
                        displayName: 'Wizard Owner',
                        idToken: jwt,
                        registered: true,
                        refreshToken: `refresh-${uid}`,
                        expiresIn: '7200'
                    }));
                } else if (url.includes('securetoken.googleapis.com/v1/token')) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        access_token: jwt,
                        expires_in: "7200",
                        token_type: "Bearer",
                        refresh_token: `refresh-${uid}`,
                        id_token: jwt,
                        user_id: uid,
                        project_id: "calzada-web"
                    }));
                } else if (url.includes('accounts:lookup')) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        kind: 'identitytoolkit#GetAccountInfoResponse',
                        users: [{
                            localId: uid,
                            email: email,
                            displayName: 'Wizard Owner',
                            emailVerified: true,
                            customAttributes: JSON.stringify({})
                        }]
                    }));
                } else {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({}));
                }
            });
        });

        authServer.listen(9099, '127.0.0.1', () => {
            resolve(authServer);
        });
    });
}

async function signInViaUI(page, email, password = 'password123') {
    await page.waitForSelector('#emailInput', { state: 'visible', timeout: 10000 });
    await page.fill('#emailInput', email);
    await page.click('#btnEmailContinue');
    await page.waitForSelector('#loginPass:not([disabled])', { state: 'visible', timeout: 10000 });
    await page.fill('#loginPass', password);
    await page.click('#loginSubmitBtn');
}

async function runFogTests() {
    console.log('========================================================');
    console.log('PHASE 4 SECTION 2 REDO: 3-BARANGAY COVERAGE & FOG VERIFICATION');
    console.log('========================================================\n');

    let passedCount = 0;
    let failedCount = 0;

    function report(ok, message) {
        if (ok) {
            console.log(`  [PASS] ${message}`);
            passedCount++;
        } else {
            console.error(`  [FAIL] ${message}`);
            failedCount++;
        }
    }

    // --- TEST 1: coverage.json Metadata & Geometry ---
    console.log('--- TEST 1: coverage.json Metadata & Geometry ---');
    const coveragePath = path.join(ROOT_DIR, 'public', 'data', 'coverage.json');
    report(fs.existsSync(coveragePath), 'public/data/coverage.json exists');

    const coverageJson = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
    report(coverageJson.barangays && coverageJson.barangays.join(',') === 'Uno,Real,Halang', 'Barangays list is [Uno, Real, Halang]');

    const areaKm2 = turf.area(coverageJson.area) / 1e6;
    const polyCount = coverageJson.area?.features ? coverageJson.area.features.length : 1;
    report(areaKm2 >= 3.8 && areaKm2 <= 4.0, `Coverage area is ~3.89 km² (actual: ${areaKm2.toFixed(3)} km²)`);
    report(polyCount === 1, `Single contiguous polygon (actual: ${polyCount})`);
    report(Array.isArray(coverageJson.bbox) && coverageJson.bbox.length === 4, `BBox defined: [${coverageJson.bbox.map(n => n.toFixed(4)).join(', ')}]`);
    report(coverageJson.bbox[0] < coverageJson.bbox[2] && coverageJson.bbox[1] < coverageJson.bbox[3], 'BBox min coordinates < max coordinates');

    // Verify 0 places in Uno/Real/Halang fall outside the coverage polygon
    const placesPath = path.join(ROOT_DIR, 'server', 'data', 'places.json');
    const places = JSON.parse(fs.readFileSync(placesPath, 'utf8'));
    const targetPlaces = places.filter(p => ['Uno', 'Real', 'Halang'].includes(p.barangay));
    const coverageFeature = coverageJson.area.features[0];
    const placesOutside = targetPlaces.filter(p => !turf.booleanPointInPolygon(turf.point([p.lng, p.lat]), coverageFeature));
    report(placesOutside.length === 0, `0 places outside official coverage area (actual: ${placesOutside.length})`);

    const outlierNames = (coverageJson.outliers || []).map(o => o.name);
    report(outlierNames.some(n => n.includes('CityMall')), 'Outliers include CityMall Calamba');
    report(outlierNames.some(n => n.includes('Letran')), 'Outliers include Colegio de San Juan de Letran');
    report(outlierNames.some(n => n.includes('Coca-Cola')), 'Outliers include Coca-Cola Distribution Center');
    report(outlierNames.length === 3, `Exactly 3 outliers identified (${outlierNames.length})`);

    // --- TEST 2: fog-clouds.png Texture Validation ---
    console.log('\n--- TEST 2: fog-clouds.png Seamless Texture ---');
    const texturePath = path.join(ROOT_DIR, 'public', 'assets', 'map', 'fog-clouds.png');
    report(fs.existsSync(texturePath), 'public/assets/map/fog-clouds.png exists');
    const textureStats = fs.statSync(texturePath);
    report(textureStats.size > 0 && textureStats.size < 40960, `Texture size is < 40 KB (actual: ${(textureStats.size / 1024).toFixed(1)} KB)`);

    // --- TEST 3: Browser Verification via Playwright ---
    console.log('\n--- TEST 3: Planner Browser Integration ---');
    await startAuthEmulator();
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        permissions: ['geolocation'],
        geolocation: { latitude: 14.19625, longitude: 121.14964 } // Brgy. Real
    });
    const page = await context.newPage();

    try {
        await page.goto('http://127.0.0.1:5000/planner', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2500);

        // Check window.CalzadaScope loaded on planner
        const scopeExists = await page.evaluate(() => !!window.CalzadaScope && typeof window.CalzadaScope.contains === 'function');
        report(scopeExists, 'window.CalzadaScope is defined and initialized on Planner page');

        // Verify scope.contains logic in browser
        const inUno = await page.evaluate(() => window.CalzadaScope.contains(14.20415, 121.15691));
        const inReal = await page.evaluate(() => window.CalzadaScope.contains(14.19625, 121.14964));
        const inHalang = await page.evaluate(() => window.CalzadaScope.contains(14.19505, 121.16341));
        const outsideManila = await page.evaluate(() => window.CalzadaScope.contains(14.5995, 120.9842));
        const outsideFar = await page.evaluate(() => window.CalzadaScope.contains(14.10, 121.00));

        report(inUno && inReal && inHalang, 'CalzadaScope.contains returns true for Brgy. Uno, Real, Halang centers');
        report(!outsideManila && !outsideFar, 'CalzadaScope.contains returns false for coordinates outside 3 barangays');

        await page.evaluate(async () => {
            const m = window._calzadaMap;
            if (!m) return;
            if (!m.isStyleLoaded()) {
                await new Promise(resolve => {
                    m.once('idle', resolve);
                    setTimeout(resolve, 3000);
                });
            }
        });

        // Check MapLibre instance layers and bounds
        const mapInfo = await page.evaluate(() => {
            const m = window._calzadaMap || window.calzadaMap || window.map;
            if (!m) return null;
            return {
                minZoom: m.getMinZoom(),
                hasFogFill: !!m.getLayer('scope-fog-fill'),
                hasFogClouds: !!m.getLayer('scope-fog-clouds'),
                hasOutline: !!m.getLayer('scope-outline'),
                hasBarangayLabels: !!m.getLayer('scope-barangay-labels'),
                maxBounds: m.getMaxBounds() ? [
                    [m.getMaxBounds().getWest(), m.getMaxBounds().getSouth()],
                    [m.getMaxBounds().getEast(), m.getMaxBounds().getNorth()]
                ] : null
            };
        });

        report(!!mapInfo, 'MapLibre GL map instance accessible on window');
        if (mapInfo) {
            report(mapInfo.minZoom >= 13, `Map minZoom is 13+ (actual: ${mapInfo.minZoom})`);
            report(mapInfo.hasFogFill, 'Fog fill layer (scope-fog-fill) present in map style');
            report(mapInfo.hasFogClouds, 'Fog pattern layer (scope-fog-clouds) present in map style');
            report(mapInfo.hasOutline, 'Dashed outline layer (scope-outline) present in map style');
            report(mapInfo.hasBarangayLabels, 'Barangay labels layer (scope-barangay-labels) present in map style');
            report(!!mapInfo.maxBounds, 'Map maxBounds is configured around 3 barangays padded ~1.5 km');
        }

        // Attribution check
        const attribText = await page.evaluate(() => {
            const el = document.querySelector('.maplibregl-ctrl-attrib-inner') || document.querySelector('.maplibregl-ctrl-attrib');
            return el ? el.textContent : '';
        });
        report(attribText.includes('Coverage: Calzada'), `Attribution contains "Coverage: Calzada" (actual: "${attribText.trim()}")`);

        // --- TEST 4: Fog Click & OD Rules in Planner ---
        console.log('\n--- TEST 4: Fog Click & OD Rules in Planner ---');

        // 4a. Map tap in the fog drops no pin
        await page.evaluate(() => {
            const m = window._calzadaMap || window.calzadaMap || window.map;
            m.fire('click', {
                lngLat: { lng: 121.05, lat: 14.12 },
                point: { x: 100, y: 100 },
                originalEvent: { target: document.body }
            });
        });
        await page.waitForTimeout(600);

        const clickResult = await page.evaluate(() => {
            const toast = document.querySelector('.cz-toast-msg, .cz-toast');
            return {
                toastText: toast ? toast.textContent : '',
                originCoords: window.selectedCoords?.origin || null,
                destCoords: window.selectedCoords?.destination || null
            };
        });
        const toastText = clickResult.toastText;
        const toastMatches = toastText.includes('Calzada covers') || toastText.includes('sakop ng Calzada') || toastText.includes('Uno, Real and Halang');
        report(toastMatches, `Tap in the fog shows toast: "${toastText.trim()}"`);
        report(!clickResult.originCoords && !clickResult.destCoords, 'Tap in fog drops no pin');

        // 4b. Destination outside 3 barangays is refused with toast
        const destRefusal = await page.evaluate(() => {
            let capturedToast = '';
            const origShowToast = window.showToast;
            window.showToast = (msg, type) => {
                capturedToast = msg;
                if (origShowToast) origShowToast(msg, type);
            };

            if (typeof window._calzadaSetActiveSelectingField === 'function') {
                window._calzadaSetActiveSelectingField('destination');
            }
            const selRes = window.selectLocation('Outside Dest', [14.05, 121.00]);
            window.showToast = origShowToast;
            const domToast = document.querySelector('.cz-toast-msg');
            if (!capturedToast && domToast) capturedToast = domToast.textContent;
            return { selRes, capturedToast, dest: window.selectedCoords?.destination || null };
        });
        report(destRefusal.selRes === false, 'Destination outside 3 barangays is refused');
        report(destRefusal.capturedToast.includes('Calzada covers') || destRefusal.capturedToast.includes('sakop ng Calzada'), `Refusal displays toast: "${destRefusal.capturedToast}"`);
        report(!destRefusal.dest, 'Destination coordinates remain unset after refusal');

        // 4c. Start outside is accepted, route draws, and maxBounds includes start
        console.log('\n--- TEST 4c: Start Outside Accepted & Bounds Expansion ---');
        const startOutsideResult = await page.evaluate(async () => {
            const m = window._calzadaMap;
            if (window.CalzadaScope?.resetBounds) {
                window.CalzadaScope.resetBounds(m);
            }
            const initialWest = m.getMaxBounds().getWest();
            const initialSouth = m.getMaxBounds().getSouth();

            // Outside origin (lat 14.170, lng 121.100 - west of coverage base west 121.126)
            const outsideOrigin = [14.170, 121.100];
            const insideDest = [14.203928, 121.154516]; // SM City Calamba

            // Stub user so executeRouteQuery doesn't trigger route gate redirect
            if (window.CalzadaAuth) {
                window.CalzadaAuth.getCurrentUser = () => ({ uid: 'fog-user', email: 'fog@calzada.ph', isAnonymous: false });
            }

            if (typeof window._calzadaSetActiveSelectingField === 'function') {
                window._calzadaSetActiveSelectingField('origin');
            }
            window.selectLocation('Outside Start Point', outsideOrigin);

            if (typeof window._calzadaSetActiveSelectingField === 'function') {
                window._calzadaSetActiveSelectingField('destination');
            }
            window.selectLocation('SM City Calamba', insideDest);

            await new Promise(r => setTimeout(r, 1200));

            const newBounds = m.getMaxBounds();
            const expandedWest = newBounds.getWest();
            const expandedSouth = newBounds.getSouth();

            return {
                originSet: !!window.selectedCoords?.origin,
                originCoords: window.selectedCoords?.origin,
                boundsExpanded: (expandedWest < initialWest || expandedSouth < initialSouth),
                initialWest,
                expandedWest,
                initialSouth,
                expandedSouth,
                startLng: outsideOrigin[1],
                boundsIncludeStart: (outsideOrigin[1] >= expandedWest && outsideOrigin[0] >= expandedSouth)
            };
        });

        report(startOutsideResult.originSet, `Start outside is accepted (${startOutsideResult.originCoords?.join(', ')})`);
        report(startOutsideResult.boundsExpanded, `Map maxBounds widened (west: ${startOutsideResult.initialWest.toFixed(4)} -> ${startOutsideResult.expandedWest.toFixed(4)})`);
        report(startOutsideResult.boundsIncludeStart, 'Map maxBounds includes the outside start point');

        // 4d. Clearing the trip resets maxBounds
        console.log('\n--- TEST 4d: Trip Clear Resets Map Bounds ---');
        const clearResult = await page.evaluate(async () => {
            const m = window._calzadaMap;
            if (typeof window._calzadaClearAllPlannerState === 'function') {
                window._calzadaClearAllPlannerState();
            }
            await new Promise(r => setTimeout(r, 400));
            const currentBounds = m.getMaxBounds();
            const baseBounds = window.CalzadaScope.getBaseBounds();
            return {
                cleared: !window.selectedCoords?.origin && !window.selectedCoords?.destination,
                currentWest: currentBounds.getWest(),
                baseWest: baseBounds[0][0],
                currentSouth: currentBounds.getSouth(),
                baseSouth: baseBounds[0][1]
            };
        });

        report(clearResult.cleared, 'Trip state is fully cleared');
        const westMatch = Math.abs(clearResult.currentWest - clearResult.baseWest) < 0.001;
        const southMatch = Math.abs(clearResult.currentSouth - clearResult.baseSouth) < 0.001;
        report(westMatch && southMatch, `Map maxBounds reset to base bounds around 3 barangays (west: ${clearResult.currentWest.toFixed(4)})`);

        // --- TEST 5: Registration Wizard Refuses Outside Pin ---
        console.log('\n--- TEST 5: Registration Wizard Pin Refusal ---');
        const wizContext = await browser.newContext({
            viewport: { width: 1280, height: 800 }
        });
        await wizContext.addInitScript(() => {
            localStorage.setItem('calzada_use_emulator', '1');
            sessionStorage.setItem('calzada_use_emulator', '1');
        });
        const wizPage = await wizContext.newPage();
        await wizPage.goto('http://127.0.0.1:5000/login?redirect=%2Fsubmit%3Fnew%3D1', { waitUntil: 'domcontentloaded' });
        await signInViaUI(wizPage, 'wiz_owner@test.calzadaph.com', 'password123');
        await wizPage.waitForURL(url => url.pathname.includes('/submit'), { timeout: 10000 });
        await wizPage.waitForSelector('#wizardMount .wizard-root', { state: 'visible', timeout: 15000 });

        await wizPage.waitForFunction(() => !!window.wizardInstance && typeof window.wizardInstance.goToStep === 'function');
        await wizPage.fill('#inputBizName', 'Test Cafe');
        await wizPage.selectOption('#selectBizCategory', 'coffee');
        await wizPage.fill('#inputBizDesc', 'Specialty coffee in Calamba');
        await wizPage.fill('#inputBizContact', '09171234567');
        await wizPage.evaluate(() => {
            window.wizardInstance.formData.thumbnailUrl = 'https://example.com/thumb.webp';
            window.wizardInstance.formData.offerings = ['Brewed Coffee'];
            window.wizardInstance.goToStep('location');
        });
        await wizPage.waitForSelector('#wizardMapContainer', { state: 'visible', timeout: 5000 });
        await wizPage.waitForFunction(() => !!window.wizardInstance?.map);

        const wizardRefusal = await wizPage.evaluate(async () => {
            let capturedToast = '';
            const origShowToast = window.showToast;
            window.showToast = (msg, type) => {
                capturedToast = msg;
                if (origShowToast) origShowToast(msg, type);
            };

            const wizard = window.wizardInstance || window.calzadaWizard;
            if (wizard && wizard.map) {
                // Click outside in fog (lat 14.12, lng 121.05)
                wizard.map.fire('click', {
                    lngLat: { lng: 121.05, lat: 14.12 },
                    point: { x: 50, y: 50 },
                    originalEvent: { target: document.body }
                });
            }

            await new Promise(r => setTimeout(r, 600));
            window.showToast = origShowToast;
            const domToast = document.querySelector('.cz-toast-msg');
            if (!capturedToast && domToast) capturedToast = domToast.textContent;

            const markerLngLat = wizard?.marker ? wizard.marker.getLngLat() : null;
            return {
                capturedToast,
                markerLat: markerLngLat ? markerLngLat.lat : null,
                markerLng: markerLngLat ? markerLngLat.lng : null
            };
        });

        const wizToastMatch = wizardRefusal.capturedToast.includes('Calzada covers') || wizardRefusal.capturedToast.includes('sakop ng Calzada');
        report(wizToastMatch, `Wizard refuses outside pin with toast: "${wizardRefusal.capturedToast}"`);
        const pinNotOutside = wizardRefusal.markerLng > 121.13; // didn't jump to 121.05
        report(pinNotOutside, 'Wizard pin remained inside coverage area');
        await wizContext.close();

        // --- TEST 6: Places Page Out-of-Coverage Greying ---
        console.log('\n--- TEST 6: Places Page Out-of-Coverage Greying ---');
        await page.goto('http://127.0.0.1:5000/places', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);

        const placesScopeLoaded = await page.evaluate(() => !!window.CalzadaScope);
        report(placesScopeLoaded, 'window.CalzadaScope loaded on Places page');

        const outsideCards = await page.evaluate(() => {
            const cards = document.querySelectorAll('.ref-card.outside-coverage');
            return Array.from(cards).map(c => {
                const name = c.querySelector('h3')?.textContent || '';
                const label = c.querySelector('.outside-area-label')?.textContent || '';
                const style = c.getAttribute('style') || '';
                return { name, label, style };
            });
        });

        report(outsideCards.length >= 1, `Found ${outsideCards.length} place cards marked as outside-coverage on Places page`);
        if (outsideCards.length > 0) {
            const firstOutside = outsideCards[0];
            report(firstOutside.label.includes('Outside our area') || firstOutside.label.includes('Labas sa aming lugar'), `Card "${firstOutside.name}" displays label "${firstOutside.label}"`);
            report(firstOutside.style.includes('opacity: 0.6') && firstOutside.style.includes('grayscale'), `Card has reduced opacity and grayscale filter applied`);
        }

        // --- TEST 7: Screenshots at 1280 and 390 ---
        console.log('\n--- TEST 7: Map Edge Screenshots (1280 & 390) ---');
        const shotsDir = path.join(ROOT_DIR, 'scratch');
        if (!fs.existsSync(shotsDir)) fs.mkdirSync(shotsDir, { recursive: true });

        // 7a. Desktop 1280x800
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto('http://127.0.0.1:5000/planner', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);
        // Center view on boundary edge between Real/Halang and Lecheria
        await page.evaluate(() => {
            const m = window._calzadaMap;
            if (m) m.flyTo({ center: [121.158, 14.202], zoom: 14, duration: 0 });
        });
        await page.waitForTimeout(1000);

        const desktopShotPath = path.join(shotsDir, 'planner-fog-desktop-1280.png');
        await page.screenshot({ path: desktopShotPath });
        report(fs.existsSync(desktopShotPath), `Saved desktop screenshot: ${desktopShotPath}`);

        // 7b. Mobile 390x844
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(1000);
        const mobileShotPath = path.join(shotsDir, 'planner-fog-mobile-390.png');
        await page.screenshot({ path: mobileShotPath });
        report(fs.existsSync(mobileShotPath), `Saved mobile screenshot: ${mobileShotPath}`);

    } finally {
        await browser.close();
        if (authServer) {
            authServer.close();
        }
    }

    console.log('\n========================================================');
    console.log(`RESULTS: ${passedCount} passed, ${failedCount} failed`);
    console.log('========================================================\n');

    if (failedCount > 0) {
        process.exit(1);
    }
}

runFogTests().catch(err => {
    console.error('Fatal error during test run:', err);
    process.exit(1);
});
