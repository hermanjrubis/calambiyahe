#!/usr/bin/env node
/**
 * scripts/build-360-graph.mjs — rebuilds the 360 street view links in public/assets/360/manifest.json so moving
 * through the photos works like Google Maps Street View (Nov 22, 2026):
 *
 *   1. One photo per spot: photos taken within MERGE_M of each other (two passes through the same intersection,
 *      a second shot at the same place) become one node. The other photo's id is kept in manifest.aliases, so
 *      links to it still open the kept node. The image files are not touched.
 *   2. Links follow the roads (public/data/walk-graph.json, OpenStreetMap): each photo links to the first photo
 *      along each road leaving it, never through a building or across a block. At an intersection that means
 *      one arrow per street.
 *   3. Each arrow points along the road (the road's direction for the first ARROW_M), not straight at the next
 *      photo (straight at it when the road leaves almost sideways). Two arrows in almost the same direction
 *      become one: the nearer photo, which then links on to the farther one, but only along one street (the
 *      arrow down a main road never leads to a photo just around the corner on a side road). At a fork the
 *      arrows follow each road further until they come apart, or are turned a little apart so both show.
 *   4. A photo away from the roads (a parking lot, a building's entrance) links to the nearest photo.
 *
 * northOffset, heading, street, area and source stay as they are.
 *
 *   node scripts/build-360-graph.mjs            rebuild the links and write manifest.json (keeps a .bak copy)
 *   node scripts/build-360-graph.mjs --dry      only print the report
 *   node scripts/build-360-graph.mjs --chains   also list each "farther photo through the nearer one" change
 *
 * Run it again after adding photos (after generate-360-manifest.js and the calibration).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'public/assets/360/manifest.json');
const GRAPH = path.join(ROOT, 'public/data/walk-graph.json');
const DRY = process.argv.includes('--dry');

const MERGE_M = 7;          // photos closer than this are the same spot
const MERGE_PASS_M = 10;    // photos from two different passes (taken 2+ min apart) closer than this, too
const SNAP_M = 22;          // a photo farther than this from every road is "off the road"
const MAX_LINK_M = 130;     // longest road gap between two linked photos (no photos in between)
const MAX_DETOUR = 1.6;     // road distance / straight distance limit for a link
const ARROW_M = 12;         // the arrow follows the road for this far
const SAME_DIR_DEG = 30;    // arrows closer than this are one arrow (the viewer hides the farther one too)
const OFFROAD_LINK_M = 45;  // an off-road photo links to photos this close
const TURN_M = 45;          // photos of another pass this close along the roads are linked (a turn at an intersection)

const M_LAT = 110574, M_LNG = 107550;
const toXY = (lat, lng) => [lng * M_LNG, lat * M_LAT];
const hav = (a, b) => { const R = 6371000, r = Math.PI / 180; const dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r; const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(s))); };
const bearingXY = (a, b) => (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180 / Math.PI + 360) % 360;
const angDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const r1 = (x) => Math.round(x * 10) / 10;

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const g = JSON.parse(fs.readFileSync(GRAPH, 'utf8'));

// ── Roads (classes 0 highway, 1 secondary/tertiary, 2 small road; footways only for photos far from roads) ──
const gx = [], gy = [];
for (let i = 0, a = 0, b = 0; i < g.nodes.length; i += 2) { a += g.nodes[i]; b += g.nodes[i + 1]; const [x, y] = toXY(a / 1e6, b / 1e6); gx.push(x); gy.push(y); }
const edges = []; // {u, v, cls, name}
const seen = new Set();
for (const w of g.ways) {
    const [cls, ni] = w;
    let id = 0, prev = -1;
    for (let i = 3; i < w.length; i++) {
        id += w[i];
        if (prev >= 0 && prev !== id) {
            const k = prev < id ? `${prev}_${id}` : `${id}_${prev}`;
            if (!seen.has(k)) { seen.add(k); edges.push({ u: prev, v: id, cls, name: g.names[ni] || '' }); }
        }
        prev = id;
    }
}
function project(e, x, y) {
    const ax = gx[e.u], ay = gy[e.u], bx = gx[e.v], by = gy[e.v];
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0;
    const qx = ax + t * dx, qy = ay + t * dy;
    return { t, d: Math.hypot(x - qx, y - qy), x: qx, y: qy };
}

// ── 1. One photo per spot ──
const nodes = manifest.nodes.map((n) => ({ ...n }));
const byId = new Map(nodes.map((n) => [n.id, n]));
const parent = new Map(nodes.map((n) => [n.id, n.id]));
const find = (a) => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
const mergedPairs = [];
// "IMG_20261024_135542_00_487" -> seconds; photos of one pass are seconds apart, another pass minutes apart
const shotAt = (n) => { const m = /IMG_(\d{8})_(\d{2})(\d{2})(\d{2})/.exec(n.source || ''); return m ? [m[1], (+m[2]) * 3600 + (+m[3]) * 60 + (+m[4])] : null; };
const otherPass = (a, b) => { const x = shotAt(a), y = shotAt(b); return !x || !y || x[0] !== y[0] || Math.abs(x[1] - y[1]) >= 120; };
for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
        const d = hav([nodes[i].lat, nodes[i].lng], [nodes[j].lat, nodes[j].lng]);
        if (d < MERGE_M || (d < MERGE_PASS_M && otherPass(nodes[i], nodes[j]))) { parent.set(find(nodes[i].id), find(nodes[j].id)); mergedPairs.push([nodes[i].id, nodes[j].id, r1(d)]); }
    }
}
const snapOf = (n, maxCls = 2) => {
    const [x, y] = toXY(n.lat, n.lng);
    let best = null;
    let named = null; // the photo's own street (GPS can sit closer to a side road at a corner)
    const street = (n.street || '').toLowerCase();
    for (const e of edges) {
        if (e.cls > maxCls) continue;
        const p = project(e, x, y);
        if (!best || p.d < best.d) best = { e, ...p };
        if (street && e.name && e.name.toLowerCase().startsWith(street) && p.d <= SNAP_M && (!named || p.d < named.d)) named = { e, ...p };
    }
    return named || best;
};
const clusters = new Map();
for (const n of nodes) { const r = find(n.id); if (!clusters.has(r)) clusters.set(r, []); clusters.get(r).push(n); }
const aliases = { ...(manifest.aliases || {}) };
const kept = [];
for (const members of clusters.values()) {
    // Keep the photo nearest the middle of the road (the car's line), then the one with more links
    members.sort((a, b) => (snapOf(a).d - snapOf(b).d) || (b.connections.length - a.connections.length));
    const keep = members[0];
    for (const m of members.slice(1)) aliases[m.id] = keep.id;
    kept.push(keep);
}
for (const [k, v] of Object.entries(aliases)) { let t = v; while (aliases[t]) t = aliases[t]; aliases[k] = t; }

// ── 2. Photos on the road graph ──
const P = kept.map((n) => { const [x, y] = toXY(n.lat, n.lng); const s = snapOf(n); return { n, x, y, s, onRoad: s && s.d <= SNAP_M }; });
// Split each road edge at the photos on it: adjacency over road nodes ("r<i>") and photos ("p<i>")
const adj = new Map();
const addAdj = (a, b, w, ax, ay, bx, by) => {
    if (!adj.has(a)) adj.set(a, []); if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push({ to: b, w, pts: [[ax, ay], [bx, by]] });
    adj.get(b).push({ to: a, w, pts: [[bx, by], [ax, ay]] });
};
const onEdge = new Map();
P.forEach((p, i) => { if (p.onRoad) { const key = edges.indexOf(p.s.e); if (!onEdge.has(key)) onEdge.set(key, []); onEdge.get(key).push(i); } });
edges.forEach((e, k) => {
    if (e.cls > 2) return;
    const stops = [{ id: `r${e.u}`, t: 0, x: gx[e.u], y: gy[e.u] }];
    for (const i of onEdge.get(k) || []) stops.push({ id: `p${i}`, t: P[i].s.t, x: P[i].s.x, y: P[i].s.y });
    stops.push({ id: `r${e.v}`, t: 1, x: gx[e.v], y: gy[e.v] });
    stops.sort((a, b) => a.t - b.t);
    for (let s = 0; s + 1 < stops.length; s++) {
        const a = stops[s], b = stops[s + 1];
        addAdj(a.id, b.id, Math.hypot(b.x - a.x, b.y - a.y), a.x, a.y, b.x, b.y);
    }
});

// From a photo, the first photo along each road: Dijkstra that does not go past another photo
function reach(i, maxM = MAX_LINK_M) {
    const start = `p${i}`;
    const dist = new Map([[start, 0]]), prev = new Map();
    const pq = [[0, start]];
    const found = [];
    while (pq.length) {
        pq.sort((a, b) => a[0] - b[0]);
        const [d, u] = pq.shift();
        if (d > (dist.get(u) ?? Infinity)) continue;
        if (u !== start && u[0] === 'p') { found.push({ j: +u.slice(1), d, path: pathTo(u) }); continue; }
        if (d > maxM) continue;
        for (const ed of adj.get(u) || []) {
            const nd = d + ed.w;
            if (nd < (dist.get(ed.to) ?? Infinity)) { dist.set(ed.to, nd); prev.set(ed.to, { from: u, ed }); pq.push([nd, ed.to]); }
        }
    }
    function pathTo(u) {
        const pts = [];
        let cur = u;
        while (prev.has(cur)) { const { from, ed } = prev.get(cur); pts.unshift(...(pts.length ? [ed.pts[0]] : ed.pts)); cur = from; }
        return pts;
    }
    return found;
}
// The road's direction from the start of a path, over its first ARROW_M
function pathBearing(pts, L = ARROW_M) {
    let acc = 0;
    for (let k = 1; k < pts.length; k++) {
        const seg = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
        if (acc + seg >= L || k === pts.length - 1) {
            const f = seg ? Math.min(1, (L - acc) / seg) : 0;
            const end = [pts[k - 1][0] + f * (pts[k][0] - pts[k - 1][0]), pts[k - 1][1] + f * (pts[k][1] - pts[k - 1][1])];
            return bearingXY(pts[0], end);
        }
        acc += seg;
    }
    return bearingXY(pts[0], pts[pts.length - 1]);
}

const links = new Map(P.map((_, i) => [i, new Map()])); // i -> (j -> {bearing, distance, road})
const idx = new Map(P.map((p, i) => [p.n.id, i]));
const keptOf = (id) => idx.get(aliases[id] || id);
const roadTo = new Map(); // "i>j" -> {d, path} along the roads
P.forEach((p, i) => { if (p.onRoad) for (const f of reach(i, 400)) roadTo.set(`${i}>${f.j}`, f); });
const straightOf = (i, j) => hav([P[i].n.lat, P[i].n.lng], [P[j].n.lat, P[j].n.lng]);
const alongRoad = (i, j) => {
    const f = roadTo.get(`${i}>${j}`);
    const s = straightOf(i, j);
    return f && f.d <= Math.max(s * MAX_DETOUR, s + 25) ? f : null;
};
const setLink = (i, j, why) => {
    if (i === j || i == null || j == null) return;
    const f = alongRoad(i, j);
    const straightB = bearingXY([P[i].x, P[i].y], [P[j].x, P[j].y]);
    let b = f ? pathBearing(f.path) : straightB;
    // The road leaves almost sideways (a GPS fix beside the road, a U-turn): point at the photo instead
    if (angDiff(b, straightB) > 60) b = straightB;
    const s = straightOf(i, j);
    links.get(i).set(j, { bearing: b, distance: s, road: f ? f.d : s, why, path: f ? f.path : null });
};
// a) The capture order: the original links (to the kept photo of a merged spot)
let crossBlock = 0;
for (const p of P) {
    const i = idx.get(p.n.id);
    for (const c of manifest.nodes.find((n) => n.id === p.n.id).connections) {
        const j = keptOf(c.targetId);
        if (j === undefined || j === i) continue;
        // A link that cuts across a block (no road anywhere near its line) is dropped later if not needed
        setLink(i, j, 'capture');
    }
}
// Merged photos' links go to the kept photo
for (const [gone, keep] of Object.entries(aliases)) {
    const i = idx.get(keep);
    const old = manifest.nodes.find((n) => n.id === gone);
    if (!old || i === undefined) continue;
    for (const c of old.connections) { const j = keptOf(c.targetId); if (j !== undefined && j !== i) setLink(i, j, 'capture'); }
}
// b) Turns at intersections: photos of different passes this close along the roads (the first one per road)
let turns = 0;
P.forEach((p, i) => {
    if (!p.onRoad) return;
    for (const f of reach(i, MAX_LINK_M)) {
        if (links.get(i).has(f.j) || f.d > TURN_M) continue;
        const s = straightOf(i, f.j);
        if (f.d > Math.max(s * MAX_DETOUR, s + 25)) continue;
        setLink(i, f.j, 'turn'); setLink(f.j, i, 'turn'); turns++;
    }
});
// c) Both ways
for (const [i, m] of links) for (const j of [...m.keys()]) if (!links.get(j).has(i)) setLink(j, i, m.get(j).why);
// d) Links that cut across blocks (far from any road along the line), when the photos stay reachable without them
const lineOffRoad = (i, j) => {
    const A = [P[i].x, P[i].y], B = [P[j].x, P[j].y];
    let worst = 0;
    for (let k = 1; k < 8; k++) {
        const x = A[0] + (B[0] - A[0]) * k / 8, y = A[1] + (B[1] - A[1]) * k / 8;
        let best = Infinity;
        for (const e of edges) { if (e.cls > 3) continue; const pr = project(e, x, y); if (pr.d < best) best = pr.d; }
        worst = Math.max(worst, best);
    }
    return worst;
};
for (const [i, m] of links) for (const j of [...m.keys()]) {
    if (j < i || alongRoad(i, j) || alongRoad(j, i)) continue;
    if (lineOffRoad(i, j) > 25) {
        m.delete(j); links.get(j).delete(i);
        if (!reachableWithout(i, j)) { setLink(i, j, 'keep'); setLink(j, i, 'keep'); } else crossBlock++;
    }
}
console.log('turn links added:', turns, '| cross-block links removed:', crossBlock);
// One arrow per direction: the nearer photo (unless that leaves a photo unreachable)
let droppedSameDir = 0;
const CHAIN_LOG = process.argv.includes("--chains"); const chainLog = [];
// One arrow per direction: when two arrows point almost the same way, the farther photo is reached through the
// nearer one (near -> far is linked), as along a street in Google Maps
for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    for (const [i, m] of links) {
        const arr = [...m.entries()].sort((a, b) => a[1].road - b[1].road);
        for (let a = 0; a < arr.length; a++) for (let b = a + 1; b < arr.length; b++) {
            const near = arr[a][0], far = arr[b][0];
            if (!m.has(near) || !m.has(far)) continue;
            if (angDiff(arr[a][1].bearing, arr[b][1].bearing) >= SAME_DIR_DEG) continue;
            const nf = straightOf(near, far);
            if (nf > MAX_LINK_M || nf >= arr[b][1].distance) continue; // the near photo is not on the way
            // Only along one street: a photo just around the corner (a side road) is not on the way down the
            // main road, even when the first metres of both roads point the same way
            if ((P[near].n.street || '') !== (P[far].n.street || '') && (P[i].n.street || '') === (P[far].n.street || '')) continue;
            if (CHAIN_LOG) chainLog.push(`${P[i].n.id} (${P[i].n.street}): ${P[far].n.id} via ${P[near].n.id} (${P[near].n.street})`);
            if (!links.get(near).has(far)) { setLink(near, far, 'chain'); setLink(far, near, 'chain'); }
            m.delete(far); links.get(far).delete(i); droppedSameDir++; changed = true;
        }
    }
    if (!changed) break;
}
// Two arrows still pointing the same way go to photos on different roads that start together (a fork):
// look further along each road until the arrows come apart (the straight line as a last resort)
let separated = 0, stillSame = [];
// (a chain made at one photo can bring two arrows together at the next, so go round until nothing changes)
for (let round = 0; round < 4; round++) {
const before = separated + droppedSameDir;
stillSame = [];
for (const [i, m] of links) {
    for (let guard = 0; guard < 4; guard++) {
        const arr = [...m.entries()];
        let pair = null;
        for (let a = 0; a < arr.length && !pair; a++) for (let b = a + 1; b < arr.length; b++) if (angDiff(arr[a][1].bearing, arr[b][1].bearing) < SAME_DIR_DEG) { pair = [arr[a], arr[b]]; break; }
        if (!pair) break;
        const bOf = ([j, l], L) => (l.path && L !== Infinity) ? pathBearing(l.path, L) : bearingXY([P[i].x, P[i].y], [P[j].x, P[j].y]);
        let done = false;
        for (const L of [20, 30, 45, Infinity]) {
            const b1 = bOf(pair[0], L), b2 = bOf(pair[1], L);
            if ((angDiff(b1, b2) >= SAME_DIR_DEG || L === Infinity)) {
                pair[0][1].bearing = b1; pair[1][1].bearing = b2; done = angDiff(b1, b2) >= SAME_DIR_DEG; break;
            }
        }
        if (done) { separated++; continue; }
        // Still together: nearly the same way -> keep the nearer photo (if the farther stays reachable);
        // a real fork a little narrower than SAME_DIR_DEG -> turn both arrows apart a bit so both show
        const [nearE, farE] = pair[0][1].distance <= pair[1][1].distance ? pair : [pair[1], pair[0]];
        const gap = angDiff(nearE[1].bearing, farE[1].bearing);
        if (gap < 15 && straightOf(nearE[0], farE[0]) < farE[1].distance) {
            // the farther photo is reached through the nearer one (a long link, like the capture link it replaces)
            if (!links.get(nearE[0]).has(farE[0])) { setLink(nearE[0], farE[0], 'chain'); setLink(farE[0], nearE[0], 'chain'); }
            m.delete(farE[0]); links.get(farE[0]).delete(i); droppedSameDir++; continue;
        } else {
            const mid = (nearE[1].bearing + ((((farE[1].bearing - nearE[1].bearing) % 360) + 540) % 360 - 180) / 2 + 360) % 360;
            const sign = ((((farE[1].bearing - nearE[1].bearing) % 360) + 540) % 360 - 180) >= 0 ? 1 : -1;
            const half = (SAME_DIR_DEG + 1) / 2;
            nearE[1].bearing = (mid - sign * half + 360) % 360;
            farE[1].bearing = (mid + sign * half + 360) % 360;
            separated++; continue;
        }
        stillSame.push(`${P[i].n.id} -> ${P[pair[0][0]].n.id} / ${P[pair[1][0]].n.id}`); break;
    }
}
if (separated + droppedSameDir === before) break;
}
if (CHAIN_LOG) console.log(chainLog.join('\n'));
console.log('forks separated:', separated, '| still the same way:', stillSame.join('; ') || 'none');
function reachableWithout(i, j) {
    const q = [i], seenR = new Set([i]);
    while (q.length) { const u = q.shift(); for (const v of links.get(u).keys()) { if (u === i && v === j) continue; if (v === j) return true; if (!seenR.has(v)) { seenR.add(v); q.push(v); } } }
    return false;
}

// ── Write ──
const out = P.map((p, i) => {
    const { connections, ...rest } = p.n;
    return {
        ...rest,
        connections: [...links.get(i).entries()]
            .map(([j, l]) => ({ targetId: P[j].n.id, bearing: r1(l.bearing), distance: r1(l.distance) }))
            .sort((a, b) => a.bearing - b.bearing)
    };
});
// Report
const deg = {}; out.forEach((n) => { deg[n.connections.length] = (deg[n.connections.length] || 0) + 1; });
const comp = (() => { const idx = new Map(out.map((n, i) => [n.id, i])); const seenC = new Set(); let c = 0, sizes = []; for (let i = 0; i < out.length; i++) { if (seenC.has(i)) continue; c++; let s = 0; const q = [i]; seenC.add(i); while (q.length) { const u = q.shift(); s++; for (const cn of out[u].connections) { const v = idx.get(cn.targetId); if (!seenC.has(v)) { seenC.add(v); q.push(v); } } } sizes.push(s); } return sizes.sort((a, b) => b - a); })();
const offRoad = P.filter((p) => !p.onRoad).map((p) => `${p.n.id} (${Math.round(p.s.d)} m, ${p.n.street})`);
console.log(`photos ${manifest.nodes.length} -> nodes ${out.length} (merged ${manifest.nodes.length - out.length})`);
console.log('merged:', mergedPairs.map(([a, b, d]) => `${a} + ${b} (${d} m)`).join('; '));
console.log('links per node:', JSON.stringify(deg), '| same-direction arrows dropped:', droppedSameDir);
console.log('connected groups:', comp.length, 'sizes', comp.slice(0, 12).join(', '));
console.log('off the road:', offRoad.join('; ') || 'none');
const doc = { ...manifest, about: 'Built by scripts/build-360-graph.mjs: links follow the roads (OSM), one node per spot; aliases map merged photo ids to the kept node.', updated: '2026-11-22', aliases, nodes: out };
if (!DRY) {
    fs.copyFileSync(MANIFEST, MANIFEST.replace(/\.json$/, '.bak.json'));
    fs.writeFileSync(MANIFEST, JSON.stringify(doc, null, 1) + '\n');
    console.log('wrote', path.relative(ROOT, MANIFEST));
}
