/**
 * scripts/build-walk-graph.mjs
 *
 * Builds public/data/walk-graph.json, the pedestrian network the planner walks on inside the
 * coverage area (Brgy. Uno, Real, Halang and a margin around them). Read by public/js/walk-router.js.
 *
 *   node scripts/build-walk-graph.mjs                    # fetch fresh OpenStreetMap data (Overpass)
 *   node scripts/build-walk-graph.mjs --in osm.json      # use a saved Overpass JSON export instead
 *
 * The data comes from OpenStreetMap as it is; this script never edits OSM. What OSM cannot know is
 * set in LOCAL RULES below, from people who walk these roads (checked Nov 2026):
 *   - Calamba Crossing and SM City Calamba: people cross only by the footbridges (all stairs usable).
 *     Crossing the big roads at street level near any footbridge that spans them is not allowed.
 *   - The Saint Francis of Assisi footbridge (Halang) is not usable.
 *   - Real (near Jollibee) and Halang (near Chicken Joo): people cross at the pedestrian lane by the
 *     traffic light. Those are mapped crossings, so the normal crossing rules already prefer them.
 *
 * Output (compact; coordinates in millionths of a degree, delta-encoded):
 *   nodes  [dLat0, dLng0, dLat1, dLng1, ...]
 *   ways   [[cls, nameIndex|-1, private 0/1, dNode0, dNode1, ...]]   (node indexes delta-encoded)
 *          cls: 0 highway (trunk/primary), 1 secondary/tertiary, 2 minor road, 3 footway/path,
 *               4 steps, 5 footbridge
 *   cross  [[nodeIndex, code]]  code: 's' traffic light, 'z' pedestrian lane, 'u' unmarked,
 *          'x' no crossing at street level (footbridge zone)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'data', 'walk-graph.json');

// Coverage (Uno, Real, Halang) plus a margin, as south, west, north, east
const BBOX = [14.1855, 121.1365, 14.2100, 121.1730];

// ── LOCAL RULES ──────────────────────────────────────────────────────────────────────────────
const CLOSED_WAYS = new Set([
    1253919200 // Saint Francis of Assisi footbridge, Halang: not usable
]);
const FOOTBRIDGE_ZONE_M = 120; // no street-level crossing of big roads this close to a footbridge over them
// ─────────────────────────────────────────────────────────────────────────────────────────────

const OVERPASS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.openstreetmap.fr/api/interpreter'
];

async function fetchOsm() {
    const b = BBOX.join(',');
    const ql = `[out:json][timeout:90];(way["highway"](${b});node["highway"~"^(crossing|traffic_signals)$"](${b}););out geom;`;
    for (const ep of OVERPASS) {
        try {
            const res = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(ql) });
            if (res.ok) return await res.json();
            console.warn(`${ep}: HTTP ${res.status}`);
        } catch (e) { console.warn(`${ep}: ${e.message}`); }
    }
    throw new Error('Overpass not reachable. Save an export and use --in <file>.');
}

const CLS = {
    trunk: 0, trunk_link: 0, primary: 0, primary_link: 0,
    secondary: 1, secondary_link: 1, tertiary: 1, tertiary_link: 1,
    residential: 2, unclassified: 2, service: 2, living_street: 2, road: 2, track: 2,
    footway: 3, path: 3, pedestrian: 3, cycleway: 3, corridor: 3, bridleway: 3,
    steps: 4
};
const isPrivate = (t) => /^(private|no)$/.test(t.access || '') && !/^(yes|designated|permissive)$/.test(t.foot || '');

function wayClass(t) {
    if (t.foot === 'no') return null;
    if (t.area === 'yes' && t.highway !== 'pedestrian') return null;
    let c = CLS[t.highway];
    if (c === undefined) return null; // motorway, construction, proposed, ...
    if (c === 3 && t.bridge && t.bridge !== 'no') c = 5;
    return c;
}

const mx = (lat, lng) => [lat * 110574, lng * 107550]; // metres, good enough at 14°N
function segDist(p, a, b) {
    const [py, px] = mx(...p), [ay, ax] = mx(...a), [by, bx] = mx(...b);
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
    return Math.hypot(ax + t * dx - px, ay + t * dy - py);
}
function segsCross(a, b, c, d) {
    const o = (p, q, r) => (q[1] - p[1]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[1] - p[1]);
    return o(c, d, a) * o(c, d, b) < 0 && o(a, b, c) * o(a, b, d) < 0;
}

async function main() {
    const inIdx = process.argv.indexOf('--in');
    const osm = inIdx > 0 ? JSON.parse(fs.readFileSync(process.argv[inIdx + 1], 'utf8')) : await fetchOsm();
    const [S, W, N, E] = BBOX;
    const inBox = (g) => g.some((p) => p.lat >= S && p.lat <= N && p.lon >= W && p.lon <= E);

    // Nodes are matched by position (OSM shared nodes have identical coordinates)
    const key = (lat, lng) => `${Math.round(lat * 1e6)},${Math.round(lng * 1e6)}`;
    const nodeIdx = new Map();
    const coords = [];
    const nodeOf = (lat, lng) => {
        const k = key(lat, lng);
        let i = nodeIdx.get(k);
        if (i === undefined) { i = coords.length; coords.push([Math.round(lat * 1e6) / 1e6, Math.round(lng * 1e6) / 1e6]); nodeIdx.set(k, i); }
        return i;
    };

    const names = [];
    const nameIdx = new Map();
    const ways = [];
    const stats = {};
    for (const el of osm.elements) {
        if (el.type !== 'way' || !el.geometry || !el.tags || CLOSED_WAYS.has(el.id) || !inBox(el.geometry)) continue;
        const cls = wayClass(el.tags);
        if (cls === null) continue;
        const name = el.tags.name || el.tags.ref || '';
        let ni = -1;
        if (name) { if (!nameIdx.has(name)) { nameIdx.set(name, names.length); names.push(name); } ni = nameIdx.get(name); }
        const ids = [];
        el.geometry.forEach((p) => { const i = nodeOf(p.lat, p.lon); if (ids[ids.length - 1] !== i) ids.push(i); });
        if (ids.length < 2) continue;
        ways.push({ id: el.id, cls, ni, priv: isPrivate(el.tags) ? 1 : 0, ids });
        stats[cls] = (stats[cls] || 0) + 1;
    }

    // Crossing codes from crossing / traffic light nodes that sit on the network
    const cross = new Map();
    for (const el of osm.elements) {
        if (el.type !== 'node' || !el.tags) continue;
        const i = nodeIdx.get(key(el.lat, el.lon));
        if (i === undefined) continue;
        const t = el.tags;
        let code = null;
        if (t.highway === 'traffic_signals' || t.crossing === 'traffic_signals') code = 's';
        else if (t.highway === 'crossing') code = /^(unmarked|no)$/.test(t.crossing || '') ? 'u' : 'z';
        if (code && cross.get(i) !== 's') cross.set(i, code);
    }

    // Footbridge zones: footbridges that pass over a big road (cls 0/1); the big roads' nodes near them get 'x'
    const big = ways.filter((w) => w.cls <= 1);
    const zoneBridges = ways.filter((w) => w.cls === 5 && big.some((r) => {
        for (let i = 0; i + 1 < w.ids.length; i++) for (let j = 0; j + 1 < r.ids.length; j++) {
            if (segsCross(coords[w.ids[i]], coords[w.ids[i + 1]], coords[r.ids[j]], coords[r.ids[j + 1]])) return true;
        }
        return false;
    }));
    let zoned = 0;
    big.forEach((r) => r.ids.forEach((n) => {
        if (cross.get(n) === 'x') return;
        const p = coords[n];
        const near = zoneBridges.some((w) => {
            for (let i = 0; i + 1 < w.ids.length; i++) if (segDist(p, coords[w.ids[i]], coords[w.ids[i + 1]]) <= FOOTBRIDGE_ZONE_M) return true;
            return false;
        });
        if (near) { cross.set(n, 'x'); zoned++; }
    }));

    // Compact output
    const nodes = [];
    let pl = 0, pg = 0;
    coords.forEach(([lat, lng]) => {
        const a = Math.round(lat * 1e6), b = Math.round(lng * 1e6);
        nodes.push(a - pl, b - pg); pl = a; pg = b;
    });
    const outWays = ways.map((w) => {
        let last = 0;
        return [w.cls, w.ni, w.priv, ...w.ids.map((i) => { const d = i - last; last = i; return d; })];
    });
    const out = {
        version: 1,
        about: 'Calzada walk graph: OpenStreetMap footways, roads, crossings and footbridges for Brgy. Uno, Real and Halang, with local crossing rules. Built by scripts/build-walk-graph.mjs. Map data (c) OpenStreetMap contributors, ODbL.',
        built: new Date().toISOString().slice(0, 10),
        source: osm.generator || 'Overpass API',
        bbox: BBOX,
        names,
        nodes,
        ways: outWays,
        cross: [...cross.entries()].sort((a, b) => a[0] - b[0])
    };
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    const outPath = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : OUT;
    fs.writeFileSync(outPath, JSON.stringify(out));
    const codes = {};
    cross.forEach((c) => { codes[c] = (codes[c] || 0) + 1; });
    console.log(`walk graph: ${coords.length} nodes, ${ways.length} ways`, stats, 'crossings', codes,
        `footbridges over big roads: ${zoneBridges.length}, big-road nodes with no street crossing: ${zoned}`,
        `→ ${path.relative(process.cwd(), outPath)} (${(fs.statSync(outPath).size / 1024).toFixed(0)} KB)`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
