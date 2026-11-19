// Live traffic in the planner before the journey, offline: /api/traffic is mocked and the page runs on
// a fake clock. Checks that the line colours refresh every minute and the jeep times every 2 min, and
// that the summary and the cards follow TomTom's times (no reordering), also when the first answer is
// slower than the planner's 2.5 s wait.
// Usage: node scripts/test-live-traffic-playwright.mjs
import { chromium } from 'playwright';
import http from 'http';
import path from 'path';
import express from 'express';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pub = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const MAPLIBRE_DIR = path.dirname(require.resolve('maplibre-gl/dist/maplibre-gl.js'));
const BLANK = { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#EEF0F3' } }] };

const TRIPS = [
    { name: 'plain options', o: [14.197064, 121.162786], on: 'Chicken Joo – Halang', d: [14.206417, 121.151944], dn: 'Calamba Medical Center' },
    { name: 'terminal picker', o: [14.206417, 121.151944], on: 'Calamba Medical Center', d: [14.194585, 121.164881], dn: 'Puregold – Halang' }
];

const app = express();
app.use(express.static(pub));
app.use(express.static(path.join(pub, 'pages')));
const server = http.createServer(app);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

let passed = 0, failed = 0;
const check = (ok, msg, detail) => {
    if (ok) { passed++; console.log(`PASS  ${msg}`); } else { failed++; console.log(`FAIL  ${msg}${detail ? `\n      ${detail}` : ''}`); }
};
const minOf = (s) => { const m = /(\d+)\s*min/.exec(s || ''); return m ? Number(m[1]) : null; };

async function runTrip(browser, trip, firstDelayMs) {
    let factor = 3; // jeep road time = factor × free flow (3 = heavy traffic)
    const hits = { leg: 0, colors: 0 };
    let slow = !!firstDelayMs; // only the first answers are slow
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.clock.install();
    await page.route('**/*', async (r) => {
        const u = r.request().url();
        if (u.includes('/api/traffic/leg-colors')) {
            hits.colors++;
            const q = new URL(u).searchParams; const f = +q.get('from'), t = +q.get('to');
            return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ live: true, routeId: q.get('route'), fromM: f, toM: t, dir: 1, matchedPct: 100,
                stretches: [{ fromM: f, toM: t, cls: factor > 2 ? 'heavy' : 'normal', closed: false }], updated: new Date().toISOString() }) });
        }
        if (u.includes('/api/traffic/leg')) {
            hits.leg++;
            if (slow) await new Promise((z) => setTimeout(z, firstDelayMs));
            const q = new URL(u).searchParams; const L = (+q.get('to')) - (+q.get('from'));
            const free = L / (30 / 3.6);
            return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ live: true, routeId: q.get('route'), fromM: +q.get('from'), toM: +q.get('to'), dir: 1,
                lengthM: L, travelSec: free * factor, noTrafficSec: free, historicSec: free * factor, liveSec: free * factor, delaySec: free * (factor - 1), updated: new Date().toISOString() }) });
        }
        if (u.startsWith(`http://127.0.0.1:${port}`)) return r.continue();
        if (u.includes('maplibre-gl') && u.endsWith('.js')) return r.fulfill({ path: path.join(MAPLIBRE_DIR, 'maplibre-gl.js'), contentType: 'application/javascript' });
        if (u.includes('maplibre-gl') && u.endsWith('.css')) return r.fulfill({ path: path.join(MAPLIBRE_DIR, 'maplibre-gl.css'), contentType: 'text/css' });
        if (u.includes('openfreemap.org/styles/')) return r.fulfill({ body: JSON.stringify(BLANK), contentType: 'application/json' });
        return r.abort();
    });
    await page.clock.resume();
    const url = `http://127.0.0.1:${port}/pages/planner.html?origLat=${trip.o[0]}&origLng=${trip.o[1]}&originName=${encodeURIComponent(trip.on)}&destLat=${trip.d[0]}&destLng=${trip.d[1]}&destName=${encodeURIComponent(trip.dn)}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { const b = document.getElementById('startJourneyBtn'); return b && !b.disabled; }, null, { timeout: 45000 });
    await page.waitForTimeout(firstDelayMs ? firstDelayMs + 2000 : 3000);
    const snap = () => page.evaluate(() => {
        const txt = (id) => { const e = document.getElementById(id); return e && !e.hidden ? e.innerText.replace(/\s+/g, ' ').trim() : ''; };
        const cards = txt('transitTerminalChoices') || txt('transitOptions');
        return { sum: txt('sumTime'), cards };
    });

    const label = `${trip.name}${firstDelayMs ? ' (slow first answer)' : ''}`;
    const a = await snap();
    check(/Traffic: \+\d+ min/.test(a.cards), `${label}: heavy traffic shows on the cards`, a.cards.slice(0, 200));
    check(a.cards.includes(String(minOf(a.sum)) + ' min'), `${label}: summary time matches a card (${a.sum})`, a.cards.slice(0, 200));
    const legHits0 = hits.leg, colorHits0 = hits.colors;
    slow = false;

    factor = 1; // the traffic clears
    await page.clock.fastForward(65 * 1000);
    await page.waitForTimeout(1500);
    check(hits.colors > colorHits0, `${label}: line colours refreshed after a minute`, JSON.stringify(hits));
    check(hits.leg === legHits0, `${label}: jeep times not refetched before 2 min`, JSON.stringify(hits));

    await page.clock.fastForward(65 * 1000);
    await page.waitForTimeout(2500);
    const b = await snap();
    check(hits.leg > legHits0, `${label}: jeep times refreshed after 2 min`, JSON.stringify(hits));
    check(minOf(b.sum) < minOf(a.sum), `${label}: summary follows the cleared road (${a.sum} -> ${b.sum})`);
    check(!/Traffic: \+\d+ min/.test(b.cards) && b.cards.includes(String(minOf(b.sum)) + ' min'), `${label}: cards updated, summary matches`, b.cards.slice(0, 200));
    check(b.cards.includes('Clear road'), `${label}: ride strip shows the new colours`, b.cards.slice(0, 200));
    check(!errs.length, `${label}: no page errors`, errs.slice(0, 3).join(' | '));
    await page.close();
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { headless: true, executablePath: process.env.CHROMIUM_PATH } : { headless: true });
try {
    for (const trip of TRIPS) {
        await runTrip(browser, trip, 0);
        await runTrip(browser, trip, 4000);
    }
} finally {
    await browser.close();
    server.close();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
