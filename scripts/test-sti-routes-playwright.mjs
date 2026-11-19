// scripts/test-sti-routes-playwright.mjs
// Browser checks for trips from inside STI College Calamba (Drei, Nov 19 2026):
//  1. The walk leaves STI by the front, on the National Highway. The roads behind the campus (and the cemetery
//     paths beyond them, up to Elepaño II and Chipeco Ave) cannot be reached from STI; the planner used to
//     snap a GPS fix deep in the campus to them and walk a 1.7–2 km loop.
//  2. No jeep is drawn where none runs: the old fallback turned a car route into a jeep ride (from SM
//     Transport Terminal up Sampaguita St, Elepaño II and down Chipeco Ave to Halang). On a local trip
//     (Uno / Real / Halang) every jeep line must lie on a jeep route from the route data, or the trip is a
//     walk with the notice "No jeepney route makes this trip faster".
// Run: node scripts/test-sti-routes-playwright.mjs
// Offline machines: MAPLIBRE_DIR=/path/to/maplibre-gl/dist and CHROMIUM_PATH, as in test-traffic-line-playwright.mjs.

import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import express from 'express';

const here = path.dirname(fileURLToPath(import.meta.url));
const pubPath = path.resolve(here, '../public');
const scratch = path.resolve(here, '../scratch');
fs.mkdirSync(scratch, { recursive: true });
process.env.TRAFFIC_MOCK = '1';
const { createTrafficRouter } = await import('../server/traffic.js');
const require = createRequire(import.meta.url);
const T = require(path.join(pubPath, 'js', 'transit-engine.js'));
const routeData = JSON.parse(fs.readFileSync(path.join(pubPath, 'data', 'transit-routes.json'), 'utf8'));
const jeepPaths = routeData.routes.map((r) => T.decodePolyline(r.polyline, routeData.polylinePrecision || 5));

const app = express();
app.use('/api/traffic', createTrafficRouter());
app.use(express.static(pubPath));
app.use(express.static(path.join(pubPath, 'pages')));
const server = http.createServer(app);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}/pages/planner.html`;
const trip = (o, oName, d, dName) => `${base}?origLat=${o[0]}&origLng=${o[1]}&originName=${encodeURIComponent(oName)}&destLat=${d[0]}&destLng=${d[1]}&destName=${encodeURIComponent(dName)}`;

const STI_PIN = [14.2025089, 121.1583962];      // STI College - Calamba (the listed pin, by the highway)
const STI_INSIDE = [14.2031, 121.1592];         // a GPS fix deep in the campus (where Drei's walk looped)
const SM_CITY = [14.203928, 121.154516];
const LAONG_LAAN = [14.19573, 121.16130];       // Laong Laan Restaurant, Chipeco Ave Ext, Halang
const CITY_HALL = [14.1940522, 121.1596881];
const BACK_LNG = 121.1597;                      // the roads behind STI start east of this

let passed = 0, failed = 0;
const assert = (ok, msg) => { if (ok) { passed++; console.log('PASS ', msg); } else { failed++; console.log('FAIL ', msg); } };

const ML = 110574, MG = 107550;
const segD = (p, a, b) => {
    const py = p[0] * ML, px = p[1] * MG, ay = a[0] * ML, ax = a[1] * MG, by = b[0] * ML, bx = b[1] * MG;
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
    return Math.hypot(ax + t * dx - px, ay + t * dy - py);
};
// How far the drawn jeep line ([lng, lat] points) gets from every jeep route in the data, in metres
const offJeepRoutes = (line) => Math.max(0, ...line.map(([lng, lat]) => Math.min(...jeepPaths.map((pl) => Math.min(...pl.slice(1).map((q, i) => segD([lat, lng], pl[i], q)))))));
const lineM = (line) => line.slice(1).reduce((m, p, i) => m + T.haversineM([line[i][1], line[i][0]], [p[1], p[0]]), 0);

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

// The lines on the map after a trip is planned ([lng, lat] points), the mode and the notice
const state = (page) => page.evaluate(() => {
    const src = (id) => { const s = window.map.getSource(id); return s && s._data; };
    const lines = (g) => { if (!g) return []; const fs2 = g.features ? g.features : [g]; return fs2.flatMap((f) => !f.geometry ? [] : (f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates])); };
    const hint = document.getElementById('walkableTripHint');
    const d = window._calzadaGetRouteExportData ? window._calzadaGetRouteExportData() : {};
    return {
        mode: d.selectedMode,
        time: (document.getElementById('sumTime') || {}).textContent || '',
        fare: (document.getElementById('sumFare') || {}).textContent || '',
        hint: hint && getComputedStyle(hint).display !== 'none' ? hint.textContent.trim() : '',
        walk: lines(src('walk-route')).filter((l) => l.length >= 2),
        jeep: lines(src('transit-route')).filter((l) => l.length >= 2),
        next: lines(src('next-transit-route')).filter((l) => l.length >= 2)
    };
});
async function plan(context, o, oName, d, dName, mode) {
    const page = await preparePage(context);
    await page.goto(trip(o, oName, d, dName), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => /\d/.test((document.getElementById('sumTime') || {}).textContent || ''), { timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(3000);
    if (mode === 'jeepney') {
        await page.evaluate(() => { const b = document.getElementById('modeJeepney'); if (b) b.click(); });
        await page.waitForTimeout(4000);
    }
    return { page, s: await state(page) };
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { headless: true, executablePath: process.env.CHROMIUM_PATH } : { headless: true });
try {
    for (const vp of [{ name: 'Phone', width: 390, height: 844 }, { name: 'Desktop', width: 1280, height: 800 }]) {
        console.log(`\n=== ${vp.name} ${vp.width}x${vp.height} ===`);
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });

        for (const [oName, o] of [['STI (inside the campus)', STI_INSIDE], ['STI College - Calamba', STI_PIN]]) {
            // To SM City Calamba: a walk out the front (Jeepney picked too: still a walk, with the notice)
            let { page, s } = await plan(context, o, oName, SM_CITY, 'SM City Calamba', 'jeepney');
            const walkM = s.walk.reduce((m, l) => m + lineM(l), 0);
            const eastmost = Math.max(...s.walk.flat().map((p) => p[0]));
            assert(s.mode === 'walking' && s.jeep.length === 0, `${vp.name}: ${oName} -> SM City Calamba, Jeepney picked: shown as a walk, no jeep drawn (${s.time}, ${s.fare})`);
            assert(/No jeepney route makes this trip faster|Walang rutang jeep/.test(s.hint), `${vp.name}: ... with the notice ("${s.hint}")`);
            assert(walkM < 900 && eastmost < BACK_LNG, `${vp.name}: ... the walk leaves STI by the front, not the back roads (${Math.round(walkM)} m drawn, east-most lng ${eastmost.toFixed(5)})`);
            if (o === STI_INSIDE) await page.screenshot({ path: path.join(scratch, `sti-sm-${vp.width}.png`) });
            await page.close();

            // To Halang (a listed place, and the same spot as a plain map pin): the jeep from SM Transport
            // Terminal down the National Highway, every jeep line on a jeep route
            for (const [dName, d] of [['Laong Laan Restaurant', LAONG_LAAN], ['Pin sa mapa', [LAONG_LAAN[0], LAONG_LAAN[1]]]]) {
                ({ page, s } = await plan(context, o, oName, d, dName, 'jeepney'));
                const off = Math.max(0, ...[...s.jeep, ...s.next].map(offJeepRoutes));
                const firstWalk = s.walk[0] || [];
                const walkEast = firstWalk.length ? Math.max(...firstWalk.map((p) => p[0])) : 0;
                assert(s.jeep.length > 0 && off <= 30, `${vp.name}: ${oName} -> ${dName}: jeep line on a jeep route (max ${Math.round(off)} m off), not on Sampaguita / Elepaño / Chipeco Ave (${s.time}, ${s.fare})`);
                assert(walkEast < BACK_LNG && lineM(firstWalk) < 700, `${vp.name}: ... walk to the jeep out the front (${Math.round(lineM(firstWalk))} m)`);
                if (o === STI_INSIDE && dName === 'Pin sa mapa') await page.screenshot({ path: path.join(scratch, `sti-halang-${vp.width}.png`) });
                await page.close();
            }
        }

        // A local trip with no jeep that helps: a walk with the notice, never a guessed ride
        const { page, s } = await plan(context, STI_PIN, 'STI College - Calamba', CITY_HALL, 'Calamba City Hall', 'jeepney');
        assert(s.mode === 'walking' && s.jeep.length === 0 && /No jeepney route|Walang rutang jeep/.test(s.hint), `${vp.name}: STI -> Calamba City Hall, Jeepney picked: walk with the notice (${s.time}; "${s.hint}")`);
        await page.close();
        await context.close();
    }
} finally {
    await browser.close();
    server.close();
}
console.log(`\nSTI routes Playwright: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
