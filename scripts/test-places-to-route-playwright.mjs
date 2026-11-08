// scripts/test-places-to-route-playwright.mjs
// End to end: Places page -> place panel -> "Plan route" -> planner ("Your location") -> the route.
// For every place it checks that the coordinates stay the same at each step (card, panel button, URL,
// planner destination), that a route comes out, and how far the drawn route ends from the pin.
//
// Run:  node scripts/test-places-to-route-playwright.mjs
// Env:  SAMPLE=20 (only every n-th place), WORKERS=4, ORIGIN=lat,lng (GPS; default Barangay 7),
//       MAPLIBRE_DIR / CHROMIUM_PATH for offline machines (see test-traffic-line-playwright.mjs).
// Output: scratch/places-to-route.json (one row per place) and a summary here.
// The planner is signed in with a stub (CalzadaAuth); /api/places serves server/data/places.json.

import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const pub = path.join(root, 'public');
const scratch = path.join(root, 'scratch');
fs.mkdirSync(scratch, { recursive: true });
process.env.TRAFFIC_MOCK = '1';
const { createTrafficRouter } = await import('../server/traffic.js');
const places = JSON.parse(fs.readFileSync(path.join(root, 'server/data/places.json'), 'utf8'));

const app = express();
app.use('/api/traffic', createTrafficRouter());
app.get('/api/places', (req, res) => res.json(places));
app.get('/api/places/:id', (req, res) => {
    const p = places.find((x) => String(x.id) === req.params.id || x.slug === req.params.id);
    if (p) res.json(p); else res.status(404).json({ error: 'not found' });
});
['planner', 'places', 'login'].forEach((n) => app.get('/' + n, (req, res) => res.sendFile(path.join(pub, 'pages', n + '.html'))));
app.use(express.static(pub));
app.use(express.static(path.join(pub, 'pages')));
const server = http.createServer(app);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const [oLat, oLng] = (process.env.ORIGIN || '14.2103,121.1696').split(',').map(Number);
const SAMPLE = Math.max(1, parseInt(process.env.SAMPLE || '1', 10));
const WORKERS = Math.max(1, parseInt(process.env.WORKERS || '4', 10));
const MAPLIBRE_DIR = process.env.MAPLIBRE_DIR;
const BLANK_STYLE = { version: 8, glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf', sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#EEF0F3' } }] };

const toRad = (d) => d * Math.PI / 180;
const distM = (a, b) => {
    const dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1]);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(s));
};

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { headless: true, executablePath: process.env.CHROMIUM_PATH } : { headless: true });

async function newContext() {
    const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 },
        geolocation: { latitude: oLat, longitude: oLng, accuracy: 10 },
        permissions: ['geolocation']
    });
    // Signed in (firebase-init.js loads from a CDN; this stub stands in for it)
    await ctx.addInitScript(() => {
        window.CalzadaAuth = {
            getCurrentUser: () => ({ uid: 'test', isAnonymous: false }),
            getFirebaseIdToken: async () => null,
            serverTimestamp: () => new Date(),
            onAuthStateChanged: (cb) => { setTimeout(() => cb({ uid: 'test', isAnonymous: false }), 0); return () => {}; }
        };
    });
    if (MAPLIBRE_DIR) {
        await ctx.route('**/*', (route) => {
            const u = route.request().url();
            if (u.startsWith(base)) return route.continue();
            if (u.includes('maplibre-gl') && u.endsWith('.js')) return route.fulfill({ path: path.join(MAPLIBRE_DIR, 'maplibre-gl.js'), contentType: 'application/javascript' });
            if (u.includes('maplibre-gl') && u.endsWith('.css')) return route.fulfill({ path: path.join(MAPLIBRE_DIR, 'maplibre-gl.css'), contentType: 'text/css' });
            if (u.includes('openfreemap.org/styles/')) return route.fulfill({ body: JSON.stringify(BLANK_STYLE), contentType: 'application/json' });
            return route.abort();
        });
    }
    return ctx;
}

async function runPlace(ctx, place) {
    const row = { name: place.name, barangay: place.barangay, lat: place.lat, lng: place.lng, problems: [] };
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
    try {
        await page.goto(`${base}/places`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.querySelectorAll('.ref-card').length > 0 && typeof window.openPlacePanel === 'function', { timeout: 20000 });
        // 1. The card on the Places page
        const card = page.locator(`.ref-card[data-name="${place.name.replace(/"/g, '\\"')}"]`).first();
        // Cards render in batches: wait for this one
        await card.waitFor({ state: 'attached', timeout: 15000 }).catch(() => {});
        if (!(await card.count())) { row.problems.push('no card on the Places page'); return row; }
        const cLat = parseFloat(await card.getAttribute('data-lat')), cLng = parseFloat(await card.getAttribute('data-lng'));
        row.cardOffM = Math.round(distM([cLat, cLng], [place.lat, place.lng]) * 10) / 10;
        if (!(row.cardOffM <= 1)) row.problems.push(`card coords ${row.cardOffM} m off`);
        // 2. Panel -> Plan route button
        await card.scrollIntoViewIfNeeded();
        await card.click();
        await page.waitForFunction(() => { const b = document.getElementById('ppPlanBtn'); return b && b.getAttribute('data-lat'); }, { timeout: 10000 });
        const btn = await page.evaluate(() => { const b = document.getElementById('ppPlanBtn'); return { name: b.getAttribute('data-dest'), lat: parseFloat(b.getAttribute('data-lat')), lng: parseFloat(b.getAttribute('data-lng')) }; });
        row.buttonOffM = Math.round(distM([btn.lat, btn.lng], [place.lat, place.lng]) * 10) / 10;
        if (btn.name !== place.name) row.problems.push(`panel name "${btn.name}"`);
        if (!(row.buttonOffM <= 1)) row.problems.push(`panel button coords ${row.buttonOffM} m off`);
        // 3. Plan route -> planner URL
        await Promise.all([page.waitForURL(/\/planner\?/, { timeout: 15000 }), page.locator('#ppPlanBtn').click()]);
        const u = new URL(page.url());
        const uLat = parseFloat(u.searchParams.get('destLat')), uLng = parseFloat(u.searchParams.get('destLng'));
        row.urlOffM = Math.round(distM([uLat, uLng], [place.lat, place.lng]) * 10) / 10;
        if (!(row.urlOffM <= 1)) row.problems.push(`URL coords ${row.urlOffM} m off`);
        if (u.searchParams.get('destName') !== place.name) row.problems.push(`URL name "${u.searchParams.get('destName')}"`);
        // 4. Planner: the destination, then "Your location" as the origin
        await page.waitForFunction(() => typeof window._calzadaGetRouteExportData === 'function' && window._calzadaGetRouteExportData().destCoords, { timeout: 20000 });
        const yourLoc = page.getByText('Your location', { exact: true }).first();
        await yourLoc.waitFor({ timeout: 8000 });
        await yourLoc.click();
        await page.waitForFunction(() => /\d/.test((document.getElementById('sumTime') || {}).textContent || ''), { timeout: 25000 }).catch(() => {});
        // The time can show before the lines (the walks are routed after the option is picked)
        await page.waitForFunction(() => ['walk-route', 'transit-route'].some((id) => {
            const s = window.map && window.map.getSource(id); const d = s && s._data;
            return d && ((d.features && d.features.length) || d.geometry);
        }), { timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(1000);
        const st = await page.evaluate(() => {
            const d = window._calzadaGetRouteExportData();
            const src = (id) => { const s = window.map.getSource(id); return s && s._data; };
            const lines = (g) => {
                if (!g) return [];
                const fs = g.features ? g.features : [g];
                return fs.flatMap((f) => !f.geometry ? [] : (f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates]));
            };
            const conn = (src('route-connector') && src('route-connector').features) || [];
            const dc = conn.find((f) => f.properties && f.properties.role === 'dest-connector');
            const radios = document.querySelectorAll('#transitTerminalChoices [role=radio]').length;
            return {
                dest: d.destName, destCoords: d.destCoords, origin: d.originName, originCoords: d.originCoords, mode: d.selectedMode,
                sumTime: (document.getElementById('sumTime') || {}).textContent, sumFare: (document.getElementById('sumFare') || {}).textContent,
                to: ((document.getElementById('openDestModal') || {}).textContent || '').trim(),
                walk: lines(src('walk-route')), transit: lines(src('transit-route')), next: lines(src('next-transit-route')),
                destConnM: dc ? dc.properties.distanceM : 0, radios
            };
        });
        row.destOffM = st.destCoords ? Math.round(distM(st.destCoords, [place.lat, place.lng]) * 10) / 10 : null;
        if (!(row.destOffM <= 1)) row.problems.push(`planner destination ${row.destOffM} m off`);
        if (st.dest !== place.name) row.problems.push(`planner destination name "${st.dest}"`);
        if (!st.to.includes(place.name.slice(0, 12))) row.problems.push(`"To" field shows "${st.to.slice(0, 40)}"`);
        row.originOk = !!st.originCoords && distM(st.originCoords, [oLat, oLng]) < 30;
        if (!row.originOk) row.problems.push(`origin not your location (${st.origin})`);
        row.mode = st.mode;
        row.sumTime = st.sumTime;
        row.sumFare = st.sumFare;
        row.terminals = st.radios;
        if (!/\d/.test(st.sumTime || '')) row.problems.push('no route time');
        // 5. Where the drawn route ends vs the pin: the last walk line, else the last jeep line
        const all = [...st.walk, ...st.transit, ...st.next].filter((l) => l && l.length >= 2);
        const endsLL = all.map((l) => l[l.length - 1]);
        const nearest = endsLL.reduce((m, e) => Math.min(m, distM([e[1], e[0]], [place.lat, place.lng])), Infinity);
        row.routeEndM = Number.isFinite(nearest) ? Math.round(nearest) : null;
        row.destConnectorM = Math.round(st.destConnM || 0);
        if (!all.length) row.problems.push('no route line drawn');
        if (row.problems.length && process.env.SHOTS) await page.screenshot({ path: path.join(scratch, `place-fail-${place.slug || place.id}.png`) });
        if (errors.length) row.problems.push(`page errors: ${[...new Set(errors)].join(' | ')}`);
    } catch (e) {
        row.problems.push(`failed: ${e.message.split('\n')[0].slice(0, 160)}`);
    } finally {
        await page.close();
    }
    return row;
}

const only = process.env.ONLY ? process.env.ONLY.split('|') : null;
const todo = places.filter((p, i) => (only ? only.includes(p.name) : i % SAMPLE === 0));
console.log(`Places -> Plan route -> route: ${todo.length} places, origin ${oLat},${oLng} (GPS), ${WORKERS} workers`);
const rows = [];
let next = 0;
await Promise.all(Array.from({ length: WORKERS }, async () => {
    const ctx = await newContext();
    while (next < todo.length) {
        const p = todo[next++];
        const r = await runPlace(ctx, p);
        rows.push(r);
        console.log(`${r.problems.length ? 'FAIL' : 'PASS'}  ${p.name} [${p.barangay}] ${r.mode || ''} ${r.sumTime || ''} ${r.terminals ? r.terminals + ' terminals ' : ''}end ${r.routeEndM}m conn ${r.destConnectorM}m${r.problems.length ? '  <- ' + r.problems.join('; ') : ''}`);
    }
    await ctx.close();
}));
await browser.close();
server.close();

rows.sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync(path.join(scratch, 'places-to-route.json'), JSON.stringify(rows, null, 1));
const failed = rows.filter((r) => r.problems.length);
const farConn = rows.filter((r) => r.destConnectorM > 100).sort((a, b) => b.destConnectorM - a.destConnectorM);
console.log('\n========================================');
console.log(`Places -> route: ${rows.length - failed.length} passed, ${failed.length} failed`);
console.log(`Modes: ${['jeepney', 'walking'].map((m) => `${m} ${rows.filter((r) => r.mode === m).length}`).join(', ')}; terminal picker on ${rows.filter((r) => r.terminals).length}`);
console.log(`Pin more than 100 m from the walkable route end (check these coordinates): ${farConn.length}`);
farConn.forEach((r) => console.log(`  ${r.destConnectorM} m  ${r.name} [${r.barangay}] ${r.lat},${r.lng}`));
console.log('========================================');
process.exit(failed.length ? 1 : 0);
