// scripts/test-journey-playwright.mjs
// The real planner page through two trips, with made-up GPS fixes fed one per (fake) second:
//   A. Walk to the National Highway, wait, flag a jeep to SM City Calamba, ride, walk to the place
//   B. Wait 12 min at the SM City Calamba Transport Terminal for a jeep to Halang, then ride
// At every journey state change it records the state, the next direction, the bottom line and the
// highlighted itinerary row, and takes a phone screenshot (scratch/journey-*.png).
// Run: node scripts/test-journey-playwright.mjs
// Offline machines: MAPLIBRE_DIR=/path/to/maplibre-gl/dist and CHROMIUM_PATH, as in the other tests.

import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import express from 'express';

const here = path.dirname(fileURLToPath(import.meta.url));
const pubPath = path.resolve(here, '../public');
const scratch = path.resolve(here, '../scratch');
fs.mkdirSync(scratch, { recursive: true });
const require = createRequire(import.meta.url);
const T = require(path.join(pubPath, 'js', 'transit-engine.js'));
const data = JSON.parse(fs.readFileSync(path.join(pubPath, 'data', 'transit-routes.json'), 'utf8'));

const app = express();
app.use(express.static(pubPath));
app.use(express.static(path.join(pubPath, 'pages')));
const server = http.createServer(app);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}/pages/planner.html`;
const trip = (o, oName, d, dName) => `${base}?origLat=${o[0]}&origLng=${o[1]}&originName=${encodeURIComponent(oName)}&destLat=${d[0]}&destLng=${d[1]}&destName=${encodeURIComponent(dName)}`;

let passed = 0, failed = 0;
const check = (ok, msg, detail) => {
    if (ok) { passed++; console.log(`PASS  ${msg}`); } else { failed++; console.log(`FAIL  ${msg}${detail ? `\n      ${detail}` : ''}`); }
};

// ── Geometry ([lat, lng], metres) ─────────────────────────────────────────────────
const mPerLat = 111195;
const distM = (a, b) => {
    const R = 6371000, toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1]);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
};
const offsetPt = (p, n, e) => [p[0] + n / mPerLat, p[1] + e / (mPerLat * Math.cos(p[0] * Math.PI / 180))];
function lineOf(pts) { const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + distM(pts[i - 1], pts[i])); return { pts, cum, len: cum[cum.length - 1] }; }
function at(line, m) {
    const x = Math.max(0, Math.min(line.len, m));
    let i = 1;
    while (i < line.cum.length - 1 && line.cum[i] < x) i++;
    const a = line.pts[i - 1], b = line.pts[i], span = line.cum[i] - line.cum[i - 1];
    const t = span > 0 ? (x - line.cum[i - 1]) / span : 0;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
let seed = 11;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const gauss = () => { let u = 0, v = 0; while (!u) u = rand(); while (!v) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// One fix a second along the planned lines: walk, wait, ride (with stops), get off, walk
function fixesFor(route, o) {
    const out = [];
    const marks = {};
    const push = (p, v) => { const q = offsetPt(p, gauss() * 4, gauss() * 4); out.push([q[0], q[1], 8, Math.max(0, v + gauss() * 0.3)]); };
    const along = (line, from, to, mps) => { const n = Math.max(1, Math.round((to - from) / mps)); for (let i = 1; i <= n; i++) push(at(line, from + (to - from) * i / n), mps); };
    const still = (p, sec) => { for (let i = 0; i < sec; i++) push(p, 0); };
    const walk = lineOf(route.walk.length >= 2 ? route.walk : [route.walk[0], route.walk[0]]);
    const jeep = lineOf(route.jeep);
    const fw = route.finalWalk.length >= 2 ? lineOf(route.finalWalk) : null;
    marks.start = 0;
    if (walk.len > 1) along(walk, 0, walk.len, 1.3);
    marks.atStop = out.length;
    still(jeep.pts[0], o.waitSec);
    marks.jeepMoves = out.length;
    const stopAt = Math.min(600, jeep.len / 2);
    along(jeep, 0, stopAt, 6.5);
    still(at(jeep, stopAt), 40);              // a red light
    along(jeep, stopAt, jeep.len, 6.5);
    marks.stepOff = out.length;
    still(jeep.pts[jeep.pts.length - 1], 6);
    if (fw) along(fw, 0, fw.len, 1.3);
    marks.end = out.length;
    return { fixes: out, marks };
}

const FAKE_GEO = () => {
    const subs = new Map();
    let id = 1;
    let last = null;
    const geo = {
        watchPosition(ok) { const i = id++; subs.set(i, ok); if (last) setTimeout(() => ok(last), 0); return i; },
        clearWatch(i) { subs.delete(i); },
        getCurrentPosition(ok, err) { if (last) setTimeout(() => ok(last), 0); else if (err) setTimeout(() => err({ code: 2, message: 'no fix yet' }), 0); }
    };
    Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
    // Time runs ahead one second per fix, so a 15-minute trip replays in a minute
    const realNow = Date.now.bind(Date);
    let ahead = 0;
    Date.now = () => realNow() + ahead;
    window.__advance = (ms) => { ahead += ms; };
    window.__fakeFix = (lat, lng, acc, speed) => {
        last = { coords: { latitude: lat, longitude: lng, accuracy: acc, speed, heading: null, altitude: null, altitudeAccuracy: null }, timestamp: Date.now() };
        subs.forEach((cb) => cb(last));
    };
};

const MAPLIBRE_DIR = process.env.MAPLIBRE_DIR;
const BLANK_STYLE = { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#EEF0F3' } }] };

async function runTrip(browser, name, url, o) {
    console.log(`\n=== ${name} ===`);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await context.addInitScript(FAKE_GEO);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => { errors.push(e.message); console.log('  [pageerror]', e.message); });
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
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
        const b = document.getElementById('startJourneyBtn');
        return b && !b.disabled && window.transitRouteGeojson && (window.transitRouteGeojson.coordinates || []).length > 1;
    }, null, { timeout: 60000 });
    if (o.pickTerminal) {
        // Terminal choice: the terminal of the trip
        await page.evaluate((stopName) => {
            const radios = Array.from(document.querySelectorAll('#transitTerminalChoices [role=radio]'));
            const r = radios.find((x) => x.textContent.includes(stopName));
            if (r && r.getAttribute('aria-checked') !== 'true') r.click();
        }, o.pickTerminal);
        await page.waitForTimeout(2500);
    }
    const itinerary = await page.evaluate(() => (document.getElementById('itineraryLegs') || document.body).innerText.replace(/\s+/g, ' ').trim());
    console.log('  itinerary:', itinerary.slice(0, 400));
    if (o.expectItinerary) o.expectItinerary(itinerary);

    // Start the journey (signed-in path; the sign-in prompt is not what is tested here)
    await page.evaluate(() => { window._calzadaStartJourney(); window._calzadaStartLiveTracking(); });
    const route = await page.evaluate(() => {
        const d = window._calzadaJourneyDebug();
        return {
            walk: (window.walkRouteGeojson && window.walkRouteGeojson.coordinates) || [],
            jeep: window.transitRouteGeojson.coordinates,
            finalWalk: (window.transitRouteGeojson.finalWalk && window.transitRouteGeojson.finalWalk.coordinates) || [],
            dbg: d
        };
    });
    const { fixes, marks } = fixesFor(route, o);
    console.log(`  ${fixes.length} fixes; walk ${Math.round(lineOf(route.walk.length > 1 ? route.walk : [route.walk[0], route.walk[0]]).len)} m, ride ${Math.round(lineOf(route.jeep).len)} m; marks ${JSON.stringify(marks)}`);

    const seen = [];
    const etaWhileWaiting = [];
    let i = 0;
    let lastPhase = null;
    while (i < fixes.length) {
        // Up to 60 fixes in the page, one fake second apart; stop at the first change of state
        const res = await page.evaluate(([batch, prev]) => {
            const txt = (id) => { const el = document.getElementById(id); return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; };
            const waits = [];
            for (let k = 0; k < batch.length; k++) {
                window.__advance(1000);
                window.__fakeFix(...batch[k]);
                if (window._calzadaJourneyDebug().phase === 'waiting') {
                    // the once-a-second refresh, as the page's own timer would
                    waits.push(parseInt(txt('pillMin'), 10));
                }
                const ph = window._calzadaJourneyDebug().phase;
                if (ph !== prev) {
                    const d = window._calzadaJourneyDebug();
                    return { used: k + 1, waits, snap: { phase: ph, step: d.step, instr: txt('guideCurrentText'), dist: txt('mNavNextDist'), sub: txt('pillSubLine'), min: txt('pillMin') } };
                }
            }
            return { used: batch.length, waits, snap: null };
        }, [fixes.slice(i, i + 60), lastPhase]);
        res.waits.forEach((m) => etaWhileWaiting.push({ i, min: m }));
        i += res.used;
        if (res.snap) {
            // Let the 1 s timer run once, then look at the screen
            await page.waitForTimeout(1100);
            const snap = await page.evaluate(() => {
                const txt = (id) => { const el = document.getElementById(id); return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; };
                const d = window._calzadaJourneyDebug();
                window._calzadaRenderExpandedNavTimeline && window._calzadaRenderExpandedNavTimeline();
                const a = document.querySelector('#pillItineraryLegs .timeline-row--active');
                const done = document.querySelectorAll('#pillItineraryLegs .timeline-row--done').length;
                return { phase: d.phase, step: d.step, instr: txt('guideCurrentText'), dist: txt('mNavNextDist'), sub: txt('pillSubLine'), min: txt('pillMin'),
                    row: { active: a ? a.textContent.replace(/\s+/g, ' ').trim().slice(0, 80) : '', done } };
            });
            const at = i - 1;
            seen.push({ at, ...snap });
            console.log(`  t=${at}s ${snap.phase}: "${snap.instr}" [${snap.dist}] · ${snap.sub} · row: ${snap.row.active} (${snap.row.done} done)`);
            await page.screenshot({ path: path.join(scratch, `journey-${name}-${seen.length}-${snap.phase}.png`) });
            lastPhase = res.snap.phase;
        }
    }
    // The trip recorder (?trace=1): what it kept, for scripts/test-journey-state.mjs
    let trace = null;
    if (url.includes('trace=1')) {
        trace = await page.evaluate(() => {
            const chip = document.getElementById('calzadaTraceChip');
            let data = null;
            try { data = JSON.parse(sessionStorage.getItem('calzada_trace') || 'null'); } catch (_) { /* none */ }
            return { chip: chip ? chip.textContent : null, data };
        });
        if (trace.data) fs.writeFileSync(path.join(scratch, `journey-${name}-trace.json`), JSON.stringify(trace.data));
    }
    await context.close();
    return { seen, marks, errors, etaWhileWaiting, route, trace };
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { headless: true, executablePath: process.env.CHROMIUM_PATH } : { headless: true });
try {
    // A. Origin 300 m off the National Highway, 3 km before Calamba on the Sta. Rosa – Calamba route
    const planner = T.createPlanner(data, null);
    const sr = planner.routes.find((r) => r.id === 'starosa-calamba');
    const srLine = lineOf(sr.pts.map((p) => [p[0], p[1]]));
    const bp = at(srLine, srLine.len - 3000), bq = at(srLine, srLine.len - 2990);
    const n = (bq[0] - bp[0]) * mPerLat, e = (bq[1] - bp[1]) * mPerLat * Math.cos(bp[0] * Math.PI / 180), L = Math.hypot(n, e);
    const originA = offsetPt(bp, (-e / L) * 300, (n / L) * 300);
    const SM = [14.2036, 121.1560];
    const a = await runTrip(browser, 'highway', trip(originA, 'Near the National Highway', SM, 'SM City Calamba') + '&trace=1', { waitSec: 180 });
    const phasesA = a.seen.map((s) => s.phase);
    check(phasesA.join('>').startsWith('walking>waiting>riding'), 'Highway: walking, waiting, riding in order', phasesA.join(' > '));
    const ridA = a.seen.find((s) => s.phase === 'riding');
    check(ridA && ridA.at >= a.marks.jeepMoves && ridA.at <= a.marks.jeepMoves + 30, 'Highway: riding within 30 s of the jeep moving', ridA ? `at ${ridA.at}, jeep moved at ${a.marks.jeepMoves}` : 'never riding');
    check(ridA && /riding|nakasakay/i.test(ridA.sub), 'Highway: the bottom line says Riding', ridA && ridA.sub);
    check(ridA && ridA.row.active.toLowerCase().includes('jeepney'), 'Highway: the itinerary highlights the jeep row', ridA && ridA.row.active);
    const offA = a.seen.find((s) => s.phase === 'final_walk');
    check(!a.route.finalWalk.length || (offA && offA.at <= a.marks.stepOff + 30), 'Highway: last walk within 30 s of getting off', offA ? `at ${offA.at}, off at ${a.marks.stepOff}` : 'no last walk');
    check(a.errors.length === 0, 'Highway: no page errors', a.errors.join(' | '));
    const tr = a.trace && a.trace.data;
    check(!!(a.trace && a.trace.chip) && tr && tr.legs && tr.legs.jeep.length > 1 && tr.fixes.length > 500 && tr.fixes.some((f) => f.state === 'riding'),
        'Highway: the trip recorder (?trace=1) shows its chip and keeps the fixes, states and lines', a.trace ? `${a.trace.chip} · ${tr ? tr.fixes.length : 0} fixes` : 'no trace');

    // B. Near the SM City Calamba Transport Terminal, to Halang: a 12-minute wait until the jeep fills
    const TERM = [14.202953, 121.15715];
    const originB = offsetPt(TERM, 90, 60);
    const CHICKEN_JOO = [14.197064, 121.162786];
    const b = await runTrip(browser, 'terminal', trip(originB, 'Near SM Transport Terminal', CHICKEN_JOO, 'Chicken Joo Halang'), {
        waitSec: 720,
        pickTerminal: 'SM City Calamba Transport Terminal',
        expectItinerary: (txt) => check(/Wait about 10–15 min/.test(txt) && /Jeeps leave when full/.test(txt), 'Terminal: the itinerary has the wait row (about 10–15 min)', txt.slice(0, 300))
    });
    const phasesB = b.seen.map((s) => s.phase);
    check(phasesB.includes('waiting') && phasesB.includes('riding'), 'Terminal: waiting, then riding', phasesB.join(' > '));
    const ridB = b.seen.find((s) => s.phase === 'riding');
    check(ridB && ridB.at >= b.marks.jeepMoves && ridB.at <= b.marks.jeepMoves + 30, 'Terminal: riding within 30 s after a 12-min wait', ridB ? `at ${ridB.at}, moved at ${b.marks.jeepMoves}` : 'never riding');
    // While waiting the minutes left count the wait down, then hold (never below the ride ahead)
    const w = b.etaWhileWaiting.filter((x) => Number.isFinite(x.min));
    const firstMin = w.length ? w[0].min : NaN, lastMin = w.length ? w[w.length - 1].min : NaN;
    check(w.length > 0 && firstMin - lastMin >= 8 && lastMin >= 3, 'Terminal: minutes left count the wait down and keep the ride (never too early)', `first ${firstMin} min, last ${lastMin} min while waiting`);
    check(b.errors.length === 0, 'Terminal: no page errors', b.errors.join(' | '));
} finally {
    await browser.close();
    server.close();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
