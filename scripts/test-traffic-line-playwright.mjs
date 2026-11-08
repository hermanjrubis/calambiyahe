// scripts/test-traffic-line-playwright.mjs
// Browser checks for the traffic-coloured jeep line, ride strip, jam label, legend and crossing
// markers, with TRAFFIC_MOCK=1 data. Run: node scripts/test-traffic-line-playwright.mjs
//
// Offline machines (no CDN): MAPLIBRE_DIR=/path/to/node_modules/maplibre-gl/dist serves MapLibre
// locally and swaps the OpenFreeMap style for a plain background, so the route layers still draw.
// Screenshots go to scratch/traffic-line-*.png.

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
// SM City Calamba -> Jollibee Real (calamba-tanauan from SM Calamba Inner Rd Terminal)
const routeUrl = `${base}?origLat=14.203928&origLng=121.154516&originName=SM+City+Calamba&destLat=14.195495&destLng=121.143531&destName=Jollibee+-+Real`;

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

const layerOrder = (page) => page.evaluate(() => (window.map.getStyle().layers || []).map((l) => l.id));
const activeOverlay = (page) => page.evaluate(() => {
    const m = window.map;
    for (const k of ['a', 'b']) {
        const id = `tl-cur-${k}`;
        if (m.getLayer(id) && m.getPaintProperty(id, 'line-opacity') > 0) return { id, gradient: m.getPaintProperty(id, 'line-gradient') };
    }
    return null;
});

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { headless: true, executablePath: process.env.CHROMIUM_PATH } : { headless: true });
try {
    for (const vp of [{ name: 'Phone 390x844', width: 390, height: 844 }, { name: 'Desktop 1280x800', width: 1280, height: 800 }]) {
        console.log(`\n=== ${vp.name} ===`);
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2 });
        const page = await preparePage(context);
        const colourCalls = [];
        page.on('request', (r) => { if (r.url().includes('/api/traffic/leg-colors')) colourCalls.push(r.url()); });
        await page.goto(routeUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.map && window.map.getLayer('transit-route-layer'), { timeout: 20000 });
        await page.waitForFunction(() => {
            const m = window.map;
            return ['tl-cur-a', 'tl-cur-b'].some((id) => m.getLayer(id) && m.getPaintProperty(id, 'line-opacity') > 0);
        }, { timeout: 15000 }).catch(() => {});

        assert(colourCalls.length > 0, `${vp.name}: leg-colors requested (${colourCalls.map((u) => u.split('?')[1]).join(' | ')})`);
        const ov = await activeOverlay(page);
        assert(!!ov, `${vp.name}: coloured overlay shown on the jeep line`);
        const g = ov ? JSON.stringify(ov.gradient) : '';
        assert(g.includes('#F0A81F') && g.includes('#E8590C') && g.includes('#B42318'), `${vp.name}: gradient has slow, heavy and stopped colours`);
        assert(g.includes('#378ADD'), `${vp.name}: SM driveway / normal parts keep the jeep blue`);

        const ids = await layerOrder(page);
        const ix = (id) => ids.indexOf(id);
        assert(ix('transit-route-halo') !== -1 && ix('transit-route-halo') < ix('transit-route-casing'), `${vp.name}: halo under the white casing`);
        assert(ix('transit-route-layer') < ix('tl-cur-a') && ix('tl-cur-b') < ix('walk-route-layer'), `${vp.name}: overlay above the jeep line, under the walk dots`);
        assert(ix('transit-route-chev') > ix('tl-cur-b') && ix('transit-route-chev') < ix('walk-route-layer'), `${vp.name}: chevrons on top of the colours`);
        assert(ix('calzada-traffic-layer') === -1 || ix('calzada-traffic-layer') < ix('transit-route-halo'), `${vp.name}: traffic heatmap stays under the jeep line layers (heatmap ${ix('calzada-traffic-layer')}, halo ${ix('transit-route-halo')}, completed ${ix('completed-route-layer')})`);
        const chev = await page.evaluate(() => { const l = window.map.getLayer('transit-route-chev'); return l && l.minzoom; });
        assert(chev === 14, `${vp.name}: chevrons from zoom 14 (minzoom ${chev})`);

        // Zoom in on the route: jam label shows at >= 14, hides below
        await page.evaluate(() => { window.map.jumpTo({ center: [121.1495, 14.1995], zoom: 15.6 }); });
        await page.waitForTimeout(800);
        const jamVisible = await page.evaluate(() => { const e = document.querySelector('.cz-jam-label'); return !!e && e.style.display !== 'none'; });
        assert(jamVisible, `${vp.name}: one jam label at zoom >= 14`);
        assert((await page.locator('.cz-jam-label').count()) === 1, `${vp.name}: exactly one jam label`);
        const jamText = await page.locator('.cz-jam-label').textContent().catch(() => '');
        assert(/m of the ride|m ng biyahe/.test(jamText), `${vp.name}: jam label text "${jamText}"`);
        await page.screenshot({ path: path.join(scratch, `traffic-line-${vp.width}-zoom.png`) });
        await page.evaluate(() => { window.map.jumpTo({ zoom: 13 }); });
        await page.waitForTimeout(300);
        const jamHidden = await page.evaluate(() => { const e = document.querySelector('.cz-jam-label'); return !e || e.style.display === 'none'; });
        assert(jamHidden, `${vp.name}: jam label hidden under zoom 14`);

        // Ride strip on the selected card / terminal card and in the itinerary
        const strip = await page.evaluate(() => {
            const box = document.querySelector('.czt-opt.is-selected .czt-ride, .czt-term.is-selected .czt-ride');
            if (!box) return null;
            const segs = Array.from(box.querySelectorAll('.czt-ride-seg')).map((s) => parseFloat(s.style.width));
            return { segs, sum: segs.reduce((a, b) => a + b, 0), text: box.textContent };
        });
        assert(strip && strip.segs.length >= 3 && Math.abs(strip.sum - 100) < 1, `${vp.name}: ride strip on the selected card (${strip ? strip.segs.join('/') : 'none'})`);
        assert(strip && /Heavy on about|Masikip sa/.test(strip.text), `${vp.name}: strip says how much of the ride is heavy`);
        assert((await page.locator('#itineraryLegs .czt-ride, .timeline-jeep-content .czt-ride').count()) >= 1, `${vp.name}: ride strip in the itinerary jeep step`);

        const legendShown = await page.evaluate(() => { const e = document.querySelector('.cz-route-colors-legend'); return !!e && getComputedStyle(e).display !== 'none'; });
        assert(vp.width >= 1024 ? legendShown : !legendShown, `${vp.name}: route colours legend ${vp.width >= 1024 ? 'shown' : 'hidden'}`);

        // Overview screenshot
        await page.evaluate(() => { window.map.jumpTo({ center: [121.1495, 14.2], zoom: 14.6 }); });
        await page.waitForTimeout(600);
        await page.screenshot({ path: path.join(scratch, `traffic-line-${vp.width}.png`) });

        // Failure: leg-colors answers live:false -> plain blue line, no jam label
        const page2 = await preparePage(context);
        await page2.route('**/api/traffic/leg-colors**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ live: false, reason: 'low_match' }) }));
        await page2.goto(routeUrl, { waitUntil: 'domcontentloaded' });
        await page2.waitForFunction(() => window.map && window.map.getLayer('transit-route-layer'), { timeout: 20000 });
        await page2.waitForTimeout(3500);
        assert(!(await activeOverlay(page2)), `${vp.name}: live:false keeps the plain jeep line`);
        assert((await page2.locator('.cz-jam-label').count()) === 0, `${vp.name}: live:false shows no jam label`);
        assert((await page2.locator('.czt-ride').count()) === 0, `${vp.name}: live:false shows no ride strip`);
        await page2.close();

        // Closed road: white dashes over the stopped stretch, "Road closed" on the strip
        const page3 = await preparePage(context);
        await page3.route('**/api/traffic/leg-colors**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({
            live: true, routeId: 'calamba-tanauan', fromM: 0, toM: 2150, dir: 1, matchedPct: 95, updated: new Date().toISOString(),
            stretches: [{ fromM: 0, toM: 625, cls: 'unknown', closed: false }, { fromM: 625, toM: 1100, cls: 'heavy', closed: false },
                { fromM: 1100, toM: 1500, cls: 'stopped', closed: true }, { fromM: 1500, toM: 2150, cls: 'normal', closed: false }]
        }) }));
        await page3.goto(routeUrl, { waitUntil: 'domcontentloaded' });
        await page3.waitForFunction(() => window.map && window.map.getLayer('transit-route-layer'), { timeout: 20000 });
        await page3.waitForFunction(() => document.querySelector('.czt-ride'), { timeout: 15000 }).catch(() => {});
        const closed = await page3.evaluate(() => {
            const src = window.map.getSource('tl-cur-closed');
            const feats = src && src._data && src._data.features ? src._data.features.length : -1;
            const note = document.querySelector('.czt-ride-note--closed');
            return { feats, note: note ? note.textContent : null };
        });
        assert(closed.feats === 1, `${vp.name}: closed stretch drawn with white dashes (${closed.feats} feature)`);
        assert(!!closed.note, `${vp.name}: strip says the road is closed ("${closed.note}")`);
        await page3.close();

        // All clear: the line stays blue, so the strip says the road is clear
        const page4 = await preparePage(context);
        await page4.route('**/api/traffic/leg-colors**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({
            live: true, routeId: 'calamba-tanauan', fromM: 0, toM: 2150, dir: 1, matchedPct: 98, updated: new Date().toISOString(),
            stretches: [{ fromM: 0, toM: 625, cls: 'unknown', closed: false }, { fromM: 625, toM: 2150, cls: 'normal', closed: false }]
        }) }));
        await page4.goto(routeUrl, { waitUntil: 'domcontentloaded' });
        await page4.waitForFunction(() => window.map && window.map.getLayer('transit-route-layer'), { timeout: 20000 });
        await page4.waitForFunction(() => document.querySelector('.czt-ride'), { timeout: 15000 }).catch(() => {});
        const clearNote = await page4.evaluate(() => { const n = document.querySelector('.czt-ride-note--clear'); return n ? n.textContent : null; });
        assert(!!clearNote, `${vp.name}: all-clear ride says so ("${clearNote}")`);
        await page4.close();

        await context.close();
    }

    // Transfer trip (Lawa -> Real, two jeeps): the walk after the second jeep reaches the destination,
    // also after picking another terminal. Traffic button sits below the top bar, not under it.
    console.log('\n=== Transfer: last walk, Traffic button ===');
    const DEST = [14.1905, 121.1450];
    const xferUrl = `${base}?origLat=14.2190&origLng=121.1330&originName=Lawa&destLat=${DEST[0]}&destLng=${DEST[1]}&destName=Real`;
    const lastWalkEnd = (page) => page.evaluate(() => {
        const s = window.map.getSource('walk-route');
        const d = s && s._data;
        const g = d && (d.geometry || (d.features && d.features[0] && d.features[0].geometry));
        if (!g) return null;
        const lines = g.type === 'MultiLineString' ? g.coordinates : [g.coordinates];
        const last = lines[lines.length - 1];
        // The walk graph ends at the nearest footpath; the dashed connector covers the rest to the pin
        const c = window.map.getSource('route-connector');
        const feats = (c && c._data && c._data.features) || [];
        const dc = feats.find((f) => f.properties && f.properties.role === 'dest-connector');
        return { lines: lines.length, end: last[last.length - 1], conn: dc ? dc.geometry.coordinates : null };
    });
    const reachesDest = (w) => !!w && (distM(w.end, DEST) < 30
        || (!!w.conn && distM(w.conn[0], [w.end[1], w.end[0]]) < 1 && distM(w.conn[1], DEST) < 1));
    const distM = (a, b) => Math.hypot((a[0] - b[1]) * 107900, (a[1] - b[0]) * 110600);
    for (const vp of [{ name: 'Phone 390x844', width: 390, height: 844 }, { name: 'Tablet 768x1024', width: 768, height: 1024 }]) {
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        const pg = await preparePage(ctx);
        await pg.goto(xferUrl, { waitUntil: 'domcontentloaded' });
        await pg.waitForFunction(() => window.map && window.map.getSource('next-transit-route') && document.querySelector('.czt-term'), { timeout: 20000 });
        await pg.waitForTimeout(4000);
        let w = await lastWalkEnd(pg);
        assert(w && w.lines >= 2 && reachesDest(w), `${vp.name}: last walk after the second jeep drawn to the destination (${w ? `${w.lines} lines, walk ends ${Math.round(distM(w.end, DEST))} m away${w.conn ? ', connector to the pin' : ''}` : 'none'})`);
        await pg.locator('.czt-term').nth(2).click();
        await pg.waitForTimeout(3500);
        w = await lastWalkEnd(pg);
        assert(reachesDest(w), `${vp.name}: last walk still drawn after picking another terminal (${w ? `${w.lines} lines, ${Math.round(distM(w.end, DEST))} m${w.conn ? ' + connector' : ''}` : 'none'})`);
        const pos = await pg.evaluate(() => {
            const b = document.getElementById('mapTopBar').getBoundingClientRect();
            const c = document.getElementById('trafficToggleBtn').getBoundingClientRect();
            const hit = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
            return { barBottom: b.bottom, barRight: b.right, top: c.top, right: c.right, onTop: !!hit && !!hit.closest('#trafficToggleBtn') };
        });
        assert(pos.top >= pos.barBottom && pos.onTop, `${vp.name}: Traffic button below the top bar and tappable (top ${Math.round(pos.top)}, bar ${Math.round(pos.barBottom)})`);
        assert(Math.abs(pos.right - pos.barRight) <= 1, `${vp.name}: Traffic button lined up with the top bar's right edge`);
        await pg.screenshot({ path: path.join(scratch, `traffic-line-transfer-${vp.width}.png`) });
        await ctx.close();
    }

    // Crossing markers: a walk over the Crossing footbridge (walk graph), drawn through the planner
    console.log('\n=== Crossing markers ===');
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await preparePage(context);
    // Jollibee Crossing -> SM City Calamba: the walk crosses NH1 by the footbridge
    await page.goto(`${base}?origLat=14.206306&origLng=121.155194&originName=Jollibee+Crossing&destLat=14.2036&destLng=121.1560&destName=SM+City+Calamba`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.map && window.map.getSource('walk-route'), { timeout: 20000 });
    await page.waitForTimeout(5000);
    const markers = await page.evaluate(() => ({
        bridges: document.querySelectorAll('.cz-cross-marker .cz-cross-label').length,
        all: document.querySelectorAll('.cz-cross-marker').length
    }));
    assert(markers.all >= 2 && markers.bridges >= 1, `footbridge markers on the walk (${markers.all} markers, ${markers.bridges} labelled)`);
    await page.screenshot({ path: path.join(scratch, 'traffic-line-crossing.png') });
    await context.close();
} finally {
    await browser.close();
    server.close();
}

console.log('\n========================================');
console.log(`Traffic line Playwright: ${passed} passed, ${failed} failed`);
console.log('========================================');
process.exit(failed ? 1 : 0);
