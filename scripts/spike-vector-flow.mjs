// scripts/spike-vector-flow.mjs
// Real check of the TomTom vector flow tiles behind the traffic-coloured jeep line.
// Needs TOMTOM_API_KEY in .env. Uses ~10-20 vector tiles from the free 200K/month.
//
// Run:  node scripts/spike-vector-flow.mjs
// Then paste the whole output to Claude. Files land in scratch/ (gitignored).
//
// It answers:
//  1. What the tiles hold (layers, tags, sample values) and whether roadTypes changes them.
//  2. On the National Highway at Crossing: are there two one_side shapes, one per direction, and
//     does each shape run in its own direction of travel? (server/traffic-match.js assumes yes:
//     ONE_SIDE_IS_DIRECTIONAL = true)
//  3. How well three real jeep legs match, both directions, through the real /leg-colors endpoint.

import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import express from 'express';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, '..');
dotenv.config({ path: path.join(rootDir, '.env') });
delete process.env.TRAFFIC_MOCK;
const require = createRequire(import.meta.url);
const TR = require('../server/traffic.js');
const TM = require('../server/traffic-match.js');

const KEY = process.env.TOMTOM_API_KEY;
if (!KEY) { console.error('TOMTOM_API_KEY is missing from .env'); process.exit(1); }
const scratch = path.join(rootDir, 'scratch');
fs.mkdirSync(scratch, { recursive: true });

const get = (url) => new Promise((resolve) => {
    https.get(url, (r) => {
        const chunks = [];
        r.on('data', (c) => chunks.push(c));
        r.on('end', () => resolve({ status: r.statusCode, type: r.headers['content-type'], buf: Buffer.concat(chunks) }));
    }).on('error', (e) => resolve({ status: 0, error: e.message, buf: Buffer.alloc(0) }));
});

const hideKey = (u) => u.replace(KEY, 'KEY');
const toGeoJSON = (feats) => ({
    type: 'FeatureCollection',
    features: feats.flatMap((f) => f.lines.map((l) => ({
        type: 'Feature', properties: f.props, geometry: { type: 'LineString', coordinates: l.map(([lat, lng]) => [lng, lat]) }
    })))
});

async function tileReport(label, z, x, y) {
    console.log(`\n=== ${label}: tile ${z}/${x}/${y} ===`);
    const variants = [
        ['roadTypes [0..6] (what the server sends)', TR.vectorTileUrl(z, x, y, KEY)],
        ['TomTom default road types', `https://api.tomtom.com/traffic/map/4/tile/flow/relative/${z}/${x}/${y}.pbf?key=${encodeURIComponent(KEY)}`]
    ];
    let main = null;
    for (const [name, url] of variants) {
        const r = await get(url);
        console.log(`- ${name}: HTTP ${r.status}, ${r.type}, ${r.buf.length} bytes  (${hideKey(url)})`);
        if (r.status !== 200) { console.log('  body:', r.buf.toString('utf8').slice(0, 300)); continue; }
        const feats = TR.decodeVectorTile(r.buf, z, x, y);
        console.log(`  features: ${feats.length}`);
        if (!main) main = feats;
    }
    if (!main) return [];
    // Layers and tags
    const { VectorTile } = require('@mapbox/vector-tile');
    const Pbf = require('pbf');
    const raw = await get(TR.vectorTileUrl(z, x, y, KEY));
    const vt = new VectorTile(new Pbf(raw.buf[0] === 0x1f ? require('zlib').gunzipSync(raw.buf) : raw.buf));
    Object.keys(vt.layers).forEach((n) => {
        const L = vt.layers[n];
        const types = new Set(); const tags = {};
        for (let i = 0; i < L.length; i++) {
            const f = L.feature(i); types.add(f.type);
            Object.entries(f.properties).forEach(([k, v]) => { (tags[k] = tags[k] || new Set()).add(v); });
        }
        console.log(`  layer "${n}": ${L.length} features, geometry types ${[...types].join(',')} (2 = line), extent ${L.extent}`);
        Object.entries(tags).forEach(([k, vs]) => console.log(`    ${k}: ${[...vs].slice(0, 8).map((v) => JSON.stringify(v)).join(', ')}${vs.size > 8 ? ` … (${vs.size} values)` : ''}`));
    });
    return main;
}

function nearReport(feats, center, label) {
    console.log(`\n--- Shapes within 30 m of ${label} (${center.join(', ')}) ---`);
    const near = [];
    feats.forEach((f, fi) => f.lines.forEach((l) => {
        for (let i = 1; i < l.length; i++) {
            const mid = [(l[i - 1][0] + l[i][0]) / 2, (l[i - 1][1] + l[i][1]) / 2];
            const d = TM.haversineM(mid, center);
            if (d <= 30) { near.push({ fi, d: Math.round(d), bearing: Math.round(TM.bearingDeg(l[i - 1], l[i])), ...f.props }); break; }
        }
    }));
    near.sort((a, b) => a.d - b.d).forEach((n) => console.log('  ', JSON.stringify(n)));
    const oneSide = near.filter((n) => n.traffic_road_coverage === 'one_side');
    if (oneSide.length >= 2) {
        const b = oneSide.map((n) => n.bearing);
        const opposite = b.some((x, i) => b.some((y, j) => j > i && Math.abs(((x - y + 540) % 360) - 180) < 30));
        console.log(`  -> ${oneSide.length} one_side shapes; opposite bearings present: ${opposite}`);
    } else {
        console.log(`  -> ${oneSide.length} one_side shape(s) here`);
    }
}

// 1-2. Tiles over Crossing and over Real Road
const crossing = [14.2061875, 121.1545625];
const tC = TM.tileOf(crossing[0], crossing[1], 15);
const featsC = await tileReport('Calamba Crossing', 15, tC.x, tC.y);
fs.writeFileSync(path.join(scratch, 'vector-flow-crossing.geojson'), JSON.stringify(toGeoJSON(featsC)));
nearReport(featsC, crossing, 'National Highway at Crossing');

const real = [14.1954, 121.1438]; // Real Road by Jollibee Real
const tR = TM.tileOf(real[0], real[1], 15);
const featsR = await tileReport('Real Road', 15, tR.x, tR.y);
fs.writeFileSync(path.join(scratch, 'vector-flow-real.geojson'), JSON.stringify(toGeoJSON(featsR)));
nearReport(featsR, real, 'Real Road by Jollibee Real');

// traffic_level spread (to set the class thresholds)
const levels = featsC.concat(featsR).map((f) => Number(f.props.traffic_level)).filter(Number.isFinite);
const hist = {};
levels.forEach((v) => { const b = (Math.floor(v * 10) / 10).toFixed(1); hist[b] = (hist[b] || 0) + 1; });
console.log('\n--- traffic_level spread (both tiles) ---');
Object.keys(hist).sort().forEach((k) => console.log(`  ${k}: ${hist[k]}`));
console.log('  Classes now: >=0.75 normal, 0.40-0.75 slow, 0.20-0.40 heavy, <0.20 stopped');
console.log('  Compare the same roads with scratch/tile-check.png (green / amber / orange / red).');

// 3. Real legs through the real endpoint, both directions
const app = express();
app.use('/api/traffic', TR.createTrafficRouter());
const server = http.createServer(app);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/api/traffic`;
const legs = [
    ['crossing-halang', 0, 1550],
    ['calamba-tanauan', 0, 2150],
    ['starosa-calamba', 7450, 12450]
];
const preview = { type: 'FeatureCollection', features: [] };
for (const [route, from, to] of legs) {
    for (const dir of ['f', 'r']) {
        const url = `/leg-colors?route=${route}&from=${from}&to=${to}${dir === 'r' ? '&dir=r' : ''}`;
        const res = await fetch(base + url);
        const j = await res.json();
        console.log(`\n=== /leg-colors ${route} ${from}-${to} ${dir === 'r' ? 'backwards' : 'forwards'} ===`);
        console.log(`  live ${j.live}${j.reason ? ` (${j.reason})` : ''}, matchedPct ${j.matchedPct}`);
        (j.stretches || []).forEach((s) => console.log(`  ${String(s.fromM).padStart(6)} - ${String(s.toM).padEnd(6)} ${s.cls}${s.closed ? ' CLOSED' : ''}`));
        if (j.live) {
            const r = TR.getPreparedRoute(route);
            j.stretches.forEach((s) => preview.features.push({
                type: 'Feature',
                properties: { route, dir, cls: s.cls, closed: s.closed },
                geometry: { type: 'LineString', coordinates: TR.sliceRoutePath(r, s.fromM, s.toM).map(([lat, lng]) => [lng, lat]) }
            }));
        }
    }
}
server.close();
fs.writeFileSync(path.join(scratch, 'leg-colors.geojson'), JSON.stringify(preview));

// Small MapLibre page to look at the result (open scratch/leg-colors-preview.html in a browser)
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Leg colours preview</title>
<link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet">
<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
<style>body{margin:0}#m{position:absolute;inset:0}#k{position:absolute;left:10px;top:10px;background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:8px 12px;font:13px system-ui}</style></head>
<body><div id="m"></div><div id="k">Forwards: left of the road · Backwards: right. Blue normal/unknown, amber slow, orange heavy, red stopped.</div><script>
const data = ${JSON.stringify(preview)};
const map = new maplibregl.Map({ container: 'm', style: 'https://tiles.openfreemap.org/styles/liberty', center: [121.15, 14.205], zoom: 14 });
map.on('load', () => {
  map.addSource('s', { type: 'geojson', data });
  map.addLayer({ id: 'l', type: 'line', source: 's', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: {
    'line-width': 6, 'line-offset': ['match', ['get', 'dir'], 'f', -5, 5],
    'line-color': ['match', ['get', 'cls'], 'slow', '#F0A81F', 'heavy', '#E8590C', 'stopped', '#B42318', '#378ADD'] } });
});
</script></body></html>`;
fs.writeFileSync(path.join(scratch, 'leg-colors-preview.html'), html);
console.log('\nSaved scratch/vector-flow-crossing.geojson, scratch/vector-flow-real.geojson, scratch/leg-colors.geojson, scratch/leg-colors-preview.html');
