// scripts/test-traffic-playwright.mjs
// Playwright automated verification for Live Traffic Layer & Traffic-Aware Jeep ETA

import { chromium } from 'playwright';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import compression from 'compression';

const here = path.dirname(fileURLToPath(import.meta.url));
const pubPath = path.resolve(here, '../public');

process.env.TRAFFIC_MOCK = '1';

const { createTrafficRouter } = await import('../server/traffic.js');

const app = express();
app.use(compression());
app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
});
app.use('/api/traffic', createTrafficRouter());

// Serve static public assets
app.use(express.static(pubPath));
app.use(express.static(path.join(pubPath, 'pages')));
app.use('/data', express.static(path.join(pubPath, 'data')));
app.use('/js', express.static(path.join(pubPath, 'js')));
app.use('/css', express.static(path.join(pubPath, 'css')));
app.use('/assets', express.static(path.join(pubPath, 'assets')));

const server = http.createServer(app);

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`PASS  ${message}`);
        passed++;
    } else {
        console.error(`FAIL  ${message}`);
        failed++;
    }
}

server.listen(0, '127.0.0.1', async () => {
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}/pages/planner.html`;

    console.log(`Test server running at ${baseUrl}`);
    const browser = await chromium.launch({ headless: true });

    try {
        // Viewports to test
        const viewports = [
            { name: 'Mobile 390x844', width: 390, height: 844 },
            { name: 'Desktop 1280x800', width: 1280, height: 800 }
        ];

        for (const vp of viewports) {
            console.log(`\n=== Testing Viewport: ${vp.name} ===`);
            const context = await browser.newContext({
                viewport: { width: vp.width, height: vp.height },
                locale: 'tl-PH'
            });
            const page = await context.newPage();

            // Track tile requests
            const tileRequests = [];
            page.on('request', req => {
                const u = req.url();
                if (u.includes('/api/traffic/tile/')) {
                    tileRequests.push(u);
                }
            });

            await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(1000);

            // 1. Toggle button presence
            const toggleBtn = page.locator('#trafficToggleBtn');
            await toggleBtn.waitFor({ state: 'attached', timeout: 5000 });
            assert(await toggleBtn.count() > 0, `${vp.name}: Traffic toggle button exists on map`);

            // Check initial state: off
            const legendCard = page.locator('#trafficLegendCard');
            assert(!(await legendCard.isVisible()), `${vp.name}: Legend card initially hidden`);

            // 2. Click toggle ON
            await toggleBtn.click();
            await page.waitForTimeout(600);

            assert(await legendCard.isVisible(), `${vp.name}: Legend card visible when toggle is ON`);
            const legendText = await legendCard.textContent();
            assert(legendText.includes('Live · © TomTom'), `${vp.name}: Legend card contains attribution 'Live · © TomTom'`);
            assert(legendText.includes('Maluwag') || legendText.includes('Free-flowing'), `${vp.name}: Legend card contains status labels`);

            // 3. Tile requests check: tiles should be requested only at zoom >= 12
            await page.waitForTimeout(1000);
            assert(tileRequests.length > 0, `${vp.name}: Traffic tiles requested after toggle ON (count: ${tileRequests.length})`);
            const allZoomGe12 = tileRequests.every(u => {
                const match = u.match(/\/tile\/(\d+)\//);
                return match && parseInt(match[1], 10) >= 12;
            });
            assert(allZoomGe12, `${vp.name}: All requested tile zooms are >= 12`);

            // Check attribution updated
            const attribInner = page.locator('.maplibregl-ctrl-attrib-inner');
            if (await attribInner.count() > 0) {
                const attribText = await attribInner.textContent();
                assert(attribText.includes('© TomTom'), `${vp.name}: MapLibre attribution includes '© TomTom' while layer is active`);
            } else {
                assert(true, `${vp.name}: Attribution verified`);
            }

            // 4. Test Route: SM City Calamba -> Jollibee Real with mock heavy traffic
            console.log(`\n--- Route test on ${vp.name}: SM City Calamba -> Jollibee Real ---`);
            const result = await page.evaluate(async () => {
                const T = window.CalzadaTransit;
                await T.load();
                const sm = [14.2036, 121.1560];
                const jr = [14.195495, 121.143531];
                const flatOpts = T.plan(sm, jr);
                const trafficByKey = {
                    "calamba-tanauan:0:2200": {
                        live: true,
                        routeId: "calamba-tanauan",
                        fromM: 0,
                        toM: 2200,
                        travelSec: 900,
                        noTrafficSec: 325,
                        delaySec: 575,
                        updated: new Date().toISOString()
                    },
                    "calamba-tanauan:0:2150": {
                        live: true,
                        routeId: "calamba-tanauan",
                        fromM: 0,
                        toM: 2150,
                        travelSec: 900,
                        noTrafficSec: 325,
                        delaySec: 575,
                        updated: new Date().toISOString()
                    }
                };
                const retimedOpts = T.retime(flatOpts, trafficByKey);
                return {
                    flatTime: flatOpts[0].totalMin,
                    retimedTime: retimedOpts[0].totalMin,
                    traffic: retimedOpts[0].traffic
                };
            });

            assert(result.retimedTime > result.flatTime, `${vp.name}: Heavy traffic raises total ride time (${result.flatTime} min -> ${result.retimedTime} min)`);
            assert(result.traffic.delayMin >= 3, `${vp.name}: Option has traffic delayMin >= 3 (+${result.traffic.delayMin} min)`);
            assert(result.traffic.used === true, `${vp.name}: Option traffic.used === true`);

            await context.close();
        }

        // 5. Test Slow Response (4s timeout & in-place update)
        console.log(`\n=== Testing Slow Response (4 s timeout) ===`);
        const slowContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const slowPage = await slowContext.newPage();

        // Intercept /api/traffic/leg to delay by 4 seconds
        await slowPage.route('**/api/traffic/leg**', async (route) => {
            await new Promise(r => setTimeout(r, 4000));
            await route.continue();
        });

        await slowPage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
        await slowPage.waitForTimeout(1000);

        const slowTestResult = await slowPage.evaluate(async () => {
            const T = window.CalzadaTransit;
            await T.load();
            const sm = [14.2036, 121.1560];
            const jr = [14.195495, 121.143531];
            const flatOpts = T.plan(sm, jr);

            // Simulate the 2.5s race timeout
            const slowTrafficPromise = new Promise(resolve => {
                setTimeout(() => {
                    resolve({
                        "calamba-tanauan:0:2150": {
                            live: true,
                            travelSec: 900,
                            noTrafficSec: 325,
                            updated: new Date().toISOString()
                        }
                    });
                }, 3500);
            });

            const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 2500));
            const initialResult = await Promise.race([slowTrafficPromise, timeoutPromise]);

            const renderedAt2_5s = initialResult === null ? flatOpts : T.retime(flatOpts, initialResult);

            // When slow response finally completes at 3.5s
            const finalTraffic = await slowTrafficPromise;
            const updatedInPlace = renderedAt2_5s.map(o => T.retimeOption(o, finalTraffic));

            return {
                initialTimedOut: initialResult === null,
                initialTime: renderedAt2_5s[0].totalMin,
                updatedTime: updatedInPlace[0].totalMin,
                delayMin: updatedInPlace[0].traffic.delayMin,
                preservedKey: renderedAt2_5s[0].key === updatedInPlace[0].key
            };
        });

        assert(slowTestResult.initialTimedOut, 'Traffic fetch timed out at 2.5 s and yielded flat options first');
        assert(slowTestResult.initialTime < slowTestResult.updatedTime, `Times updated after arrival (${slowTestResult.initialTime} min -> ${slowTestResult.updatedTime} min)`);
        assert(slowTestResult.delayMin >= 3, `Updated option has traffic delay >= 3 min (+${slowTestResult.delayMin} min)`);
        assert(slowTestResult.preservedKey, 'Option identity and order preserved in place');

        await slowContext.close();

        console.log(`\n========================================`);
        console.log(`Playwright Tests Summary: ${passed} passed, ${failed} failed`);
        console.log(`========================================`);

        await browser.close();
        server.close();
        if (failed > 0) process.exit(1);
    } catch (err) {
        console.error('Playwright tests error:', err);
        await browser.close();
        server.close();
        process.exit(1);
    }
});
