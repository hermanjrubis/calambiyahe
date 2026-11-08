// scripts/test-poblacion-playwright.mjs
// Browser checks for trips from the poblacion (Barangay 2–7, San Jose, San Juan; transit-engine 1.7.0):
// no jeep passes there, so to Real / Halang the user walks to a terminal they pick and rides from it;
// to Uno it stays a walk. Run: node scripts/test-poblacion-playwright.mjs
// Offline machines: MAPLIBRE_DIR=/path/to/maplibre-gl/dist and CHROMIUM_PATH, as in test-traffic-line-playwright.mjs.

import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';

const here = path.dirname(fileURLToPath(import.meta.url));
const pubPath = path.resolve(here, '../public');
const scratch = path.resolve(here, '../scratch');
fs.mkdirSync(scratch, { recursive: true });
process.env.TRAFFIC_MOCK = '1';
const { createTrafficRouter } = await import('../server/traffic.js');

const app = express();
app.use('/api/traffic', createTrafficRouter());
app.use(express.static(pubPath));
app.use(express.static(path.join(pubPath, 'pages')));
const server = http.createServer(app);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}/pages/planner.html`;
const trip = (o, oName, d, dName) => `${base}?origLat=${o[0]}&origLng=${o[1]}&originName=${encodeURIComponent(oName)}&destLat=${d[0]}&destLng=${d[1]}&destName=${encodeURIComponent(dName)}`;

const BRGY7 = [14.2103, 121.1696];             // Barangay 7, east of Barretto St
const BRGY3 = [14.2082, 121.1628];
const ALL_DAY_CAFE = [14.195444, 121.144667];  // All Day Cafe & All Wash, Real
const CHICKEN_JOO = [14.197064, 121.162786];   // Halang
const SM = [14.2036, 121.1560];                // SM City Calamba, Uno

let passed = 0, failed = 0;
const assert = (ok, msg) => { if (ok) { passed++; console.log('PASS ', msg); } else { failed++; console.log('FAIL ', msg); } };

const MAPLIBRE_DIR = process.env.MAPLIBRE_DIR;
const BLANK_STYLE = { version: 8, glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf', sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#EEF0F3' } }] };
async function preparePage(context) {
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
    if (MAPLIBRE_DIR) {
        await page.route('**/*', (route) => {
            const u = route.request().url();
            if (u.startsWith(`http://127.0.0.1:${port}`)) return route.continue();
            if (u.includes('maplibre-gl') && u.endsWith('.js')) return route.fulfill({ path: path.join(MAPLIBRE_DIR, 'maplibre-gl.js'), contentType: 'application/javascript' });
            if (u.includes('maplibre-gl') && u.endsWith('.css')) return route.fulfill({ path: path.join(MAPLIBRE_DIR, 'maplibre-gl.css'), contentType: 'text/css' });
            if (u.includes('openfreemap.org/styles/')) return route.fulfill({ body: JSON.stringify(BLANK_STYLE), contentType: 'application/json' });
            return route.abort();
        });
    }
    return page;
}

// Planner state after a trip is planned
const state = (page) => page.evaluate(() => {
    const radios = Array.from(document.querySelectorAll('#transitTerminalChoices [role=radio]'));
    const hint = document.getElementById('walkableTripHint');
    const jeepBtn = document.querySelector('[data-mode="jeepney"], #modeJeepney, .mode-btn.jeepney, button[data-mode="jeepney"]');
    const transit = window.map.getSource('transit-route');
    const tData = transit && transit._data;
    const tCoords = tData && tData.geometry ? tData.geometry.coordinates : [];
    return {
        radios: radios.length,
        checked: radios.findIndex((r) => r.getAttribute('aria-checked') === 'true'),
        names: radios.map((r) => (r.querySelector('.czt-term-name, b, strong') || r).textContent.trim().split('\n')[0].slice(0, 40)),
        hint: hint && getComputedStyle(hint).display !== 'none' ? hint.textContent.trim() : '',
        jeepLine: tCoords.length,
        board: (document.querySelector('.cz-stop-label, .czt-stop-chip, .transit-stop-label') || {}).textContent || '',
        itinerary: (document.getElementById('itineraryLegs') || document.body).textContent.replace(/\s+/g, ' ').slice(0, 400)
    };
});

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { headless: true, executablePath: process.env.CHROMIUM_PATH } : { headless: true });
try {
    for (const vp of [{ name: 'Phone 390x844', width: 390, height: 844 }, { name: 'Desktop 1280x800', width: 1280, height: 800 }]) {
        console.log(`\n=== ${vp.name} ===`);
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });

        // Barangay 7 -> All Day Cafe (Real): walk to a terminal, jeep from there
        let page = await preparePage(context);
        await page.goto(trip(BRGY7, 'Barretto Street, Barangay 7', ALL_DAY_CAFE, 'All Day Cafe & All Wash'), { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.querySelectorAll('#transitTerminalChoices [role=radio]').length > 0, { timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(2500);
        let s = await state(page);
        assert(s.radios === 3 && s.checked === 0, `${vp.name}: Barangay 7 -> All Day Cafe: 3 terminals, recommended picked (${s.radios} radios: ${s.names.join(' | ')})`);
        assert(!/No jeepney|Walang jeep/.test(s.hint), `${vp.name}: no "no jeepney" notice (hint: "${s.hint}")`);
        assert(s.jeepLine >= 2, `${vp.name}: jeep line drawn from the terminal (${s.jeepLine} points)`);
        const walk1 = await page.evaluate(() => { const w = window.walkRouteGeojson; return w && w.coordinates ? w.coordinates.length : 0; });
        assert(walk1 >= 2, `${vp.name}: walk to the terminal drawn (${walk1} points)`);
        await page.screenshot({ path: path.join(scratch, `poblacion-real-${vp.width}.png`) });
        // Pick the third terminal
        const third = s.names[2];
        await page.locator('#transitTerminalChoices [role=radio]').nth(2).click();
        await page.waitForTimeout(3000);
        s = await state(page);
        assert(s.checked === 2, `${vp.name}: picking "${third}" checks it`);
        const boardsThere = await page.evaluate(() => {
            const t = window.transitRouteGeojson;
            return t ? t.boardName : null;
        });
        assert(!!boardsThere && third && third.toLowerCase().includes(String(boardsThere).toLowerCase().split(' ')[0]), `${vp.name}: the ride now boards at the picked terminal (board "${boardsThere}")`);
        await page.close();

        // Barangay 3 -> Chicken Joo (Halang): 2 terminals
        page = await preparePage(context);
        await page.goto(trip(BRGY3, 'Barangay 3', CHICKEN_JOO, 'Chicken Joo - Halang'), { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.querySelectorAll('#transitTerminalChoices [role=radio]').length > 0, { timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(2000);
        s = await state(page);
        assert(s.radios === 2, `${vp.name}: Barangay 3 -> Chicken Joo Halang: 2 terminals (${s.names.join(' | ')})`);
        await page.close();

        // Barangay 3 -> SM City Calamba (Uno): still a walk, with the notice
        page = await preparePage(context);
        await page.goto(trip(BRGY3, 'Barangay 3', SM, 'SM City Calamba'), { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.map && window.map.getSource('walk-route'), { timeout: 20000 });
        await page.waitForTimeout(4000);
        s = await state(page);
        assert(s.radios === 0 && s.jeepLine === 0, `${vp.name}: Barangay 3 -> SM City Calamba: walk, no jeep (${s.jeepLine} jeep points)`);
        assert(/No jeepney|Walang jeep|walkable/.test(s.hint), `${vp.name}: walk notice shown ("${s.hint}")`);
        await page.close();

        await context.close();
    }

    // Offline route PDF of a trip with a transfer (Lawa -> Real): same total time and fare as the app,
    // both jeeps and the last walk in the timeline data
    console.log('\n=== Route PDF: transfer trip ===');
    {
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const page = await preparePage(context);
        await page.goto(trip([14.2190, 121.1330], 'Lawa', [14.1905, 121.1450], 'Real'), { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window._calzadaGetRouteExportData && window.map && window.map.getSource('next-transit-route'), { timeout: 20000 });
        await page.waitForTimeout(5000);
        const r = await page.evaluate(async () => {
            const data = window._calzadaGetRouteExportData();
            const blob = await window.CalzadaRoutePdf.generateRoutePdfBlob(data);
            const num = (id) => parseInt((document.getElementById(id) || {}).textContent.replace(/[^0-9]/g, ''), 10);
            return {
                size: blob.size,
                pages: (window._calzadaLastPdfPages || []).length,
                pdfMin: data._pdfTotalMin,
                pdfFare: data._pdfRegularFare,
                appMin: num('sumTime'),
                appFare: num('sumFare'),
                transfer: data.transfer ? { board: data.transfer.boardName, jeepKm: data.transfer.jeep.distM / 1000, walkM: data.transfer.finalWalkM } : null
            };
        });
        assert(r.size > 50000 && r.pages >= 1, `PDF built (${Math.round(r.size / 1024)} KB, ${r.pages} pages)`);
        assert(!!r.transfer && r.transfer.jeepKm > 0 && r.transfer.walkM > 0, `export data has the next jeep and the last walk (${JSON.stringify(r.transfer)})`);
        assert(r.pdfMin === r.appMin, `PDF total time = app (${r.pdfMin} vs ${r.appMin} min)`);
        assert(r.pdfFare === r.appFare, `PDF fare = app, both jeeps (₱${r.pdfFare} vs ₱${r.appFare})`);
        await context.close();
    }
} finally {
    await browser.close();
    server.close();
}

console.log('\n========================================');
console.log(`Poblacion Playwright: ${passed} passed, ${failed} failed`);
console.log('========================================');
process.exit(failed ? 1 : 0);
