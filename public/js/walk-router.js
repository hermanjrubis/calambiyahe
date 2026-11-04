/**
 * Calzada walk router (v1.0.0)
 *
 * Walking routes inside the coverage area (Brgy. Uno, Real, Halang) on /data/walk-graph.json
 * (built by scripts/build-walk-graph.mjs from OpenStreetMap plus local crossing rules).
 *
 * Unlike the public foot routers, it knows which side of a road the walker is on. Every graph node
 * is split into "sectors", the corners between the roads that meet there; walking along a road keeps
 * the walker on one side, and changing sides means crossing that road at a node, which costs:
 *   - highways (trunk/primary): at a traffic light or pedestrian lane only, in practice (anywhere
 *     else costs as much as a long detour); never at street level near a footbridge over them
 *   - secondary/tertiary roads: cheap at crossings and corners, a bit more mid-block
 *   - small streets: almost free; footways, stairs and footbridges: free
 * Footbridges and their stairs are part of the network, so routes use them where the street
 * crossing is not allowed (Calamba Crossing, SM City Calamba).
 *
 * The route comes back in the planner's OSRM shape: coordinates [[lat, lng]], distance (m),
 * duration (s, 4 km/h), steps (with walk: 'footbridge' | 'cross' on the special steps). On the big
 * roads the line is drawn a few metres to the walker's side, so a crossing shows as a line across.
 *
 * Browser: window.CalzadaWalk. Node: require('.../public/js/walk-router.js') (tests).
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.CalzadaWalk = api;
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const VERSION = '1.0.0';
    const WALK_SPEED_KPH = 4.0;
    const M_LAT = 110574, M_LNG = 107550;   // metres per degree at about 14°N

    // Road classes in the graph: 0 highway, 1 secondary/tertiary, 2 small road, 3 footway/path, 4 steps, 5 footbridge
    const DRAW_OFFSET_M = [7, 4.5, 0, 0, 0, 0];
    // Extra cost (in metres of walking) to cross a road of each class at a node
    const CROSS_COST = {
        0: { s: 50, z: 25, u: 60, x: Infinity, junction: 400, plain: 600 },
        1: { s: 25, z: 8, u: 15, x: Infinity, junction: 20, plain: 40 },
        2: 3
    };
    const STEPS_FACTOR = 2, STEPS_EXTRA_M = 10;   // stairs are slower
    const PRIVATE_FACTOR = 1.2;                   // gated roads (used only at the start / end): a public way wins if about as short
    const ATTACH_M = 15;                          // loose footway ends join the nearest road this close
    const SNAP_MAX_M = 150;                       // farther from any road than this: not covered
    const BOTH_SIDES_M = 1.5;                     // a point this close to the centre line is on both sides

    const toM = (lat, lng) => [lat * M_LAT, lng * M_LNG];

    function createRouter(g) {
        // ── Decode ──
        const lat = [], lng = [];
        for (let i = 0, a = 0, b = 0; i < g.nodes.length; i += 2) { a += g.nodes[i]; b += g.nodes[i + 1]; lat.push(a / 1e6); lng.push(b / 1e6); }
        const names = g.names || [];
        const code = new Map(g.cross || []);
        const [S, W, N, E] = g.bbox;

        // Edges (undirected), deduplicated by node pair
        const eu = [], ev = [], ecls = [], ename = [], epriv = [];
        const seen = new Set();
        const addEdge = (u, v, cls, ni, priv) => {
            if (u === v) return -1;
            const k = u < v ? `${u}_${v}` : `${v}_${u}`;
            if (seen.has(k)) return -1;
            seen.add(k);
            eu.push(u); ev.push(v); ecls.push(cls); ename.push(ni); epriv.push(priv);
            return eu.length - 1;
        };
        const removed = new Set();
        g.ways.forEach((w) => {
            const [cls, ni, priv] = w;
            let id = 0, prev = -1;
            for (let i = 3; i < w.length; i++) { id += w[i]; if (prev >= 0) addEdge(prev, id, cls, ni, priv); prev = id; }
        });
        const addNode = (la, ln) => { lat.push(la); lng.push(ln); return lat.length - 1; };
        const len = (e) => { const [ay, ax] = toM(lat[eu[e]], lng[eu[e]]), [by, bx] = toM(lat[ev[e]], lng[ev[e]]); return Math.hypot(bx - ax, by - ay); };

        // Nearest point on an edge: { t, d (m), side (+1 left of u→v, -1 right), la, ln }
        const project = (e, pla, pln) => {
            const [ay, ax] = toM(lat[eu[e]], lng[eu[e]]), [by, bx] = toM(lat[ev[e]], lng[ev[e]]), [py, px] = toM(pla, pln);
            const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
            const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
            const qx = ax + t * dx, qy = ay + t * dy;
            const crossZ = dx * (py - ay) - dy * (px - ax);
            return { t, d: Math.hypot(px - qx, py - qy), side: crossZ >= 0 ? 1 : -1, la: qy / M_LAT, ln: qx / M_LNG };
        };
        // Nearest edge; privatePenaltyM makes a public road win over a gated one that is only a little closer
        const nearestEdge = (pla, pln, ok, privatePenaltyM = 0) => {
            let best = null, bestScore = Infinity;
            for (let e = 0; e < eu.length; e++) {
                if (removed.has(e) || !ok(e)) continue;
                const p = project(e, pla, pln);
                const score = p.d + (epriv[e] ? privatePenaltyM : 0);
                if (score < bestScore) { bestScore = score; best = { e, ...p }; }
            }
            return best;
        };
        const PRIVATE_SNAP_PENALTY_M = 25;
        const onGround = (e) => ecls[e] <= 3;

        // Loose ends of footways and stairs: join the nearest road or footway (split it there)
        const degree = new Array(lat.length).fill(0);
        eu.forEach((u, e) => { degree[u]++; degree[ev[e]]++; });
        const nodeEdges = () => {
            const ne = Array.from({ length: lat.length }, () => []);
            eu.forEach((u, e) => { if (!removed.has(e)) { ne[u].push(e); ne[ev[e]].push(e); } });
            return ne;
        };
        let ne0 = nodeEdges();
        const loose = [];
        for (let n = 0; n < lat.length; n++) if (degree[n] === 1 && (ecls[ne0[n][0]] === 3 || ecls[ne0[n][0]] === 4)) loose.push(n);
        let attached = 0;
        loose.forEach((n) => {
            const own = ne0[n][0];
            const hit = nearestEdge(lat[n], lng[n], (e) => onGround(e) && e !== own && eu[e] !== n && ev[e] !== n);
            if (!hit || hit.d > ATTACH_M) return;
            let target;
            const L = len(hit.e);
            if (hit.t * L < 1) target = eu[hit.e];
            else if ((1 - hit.t) * L < 1) target = ev[hit.e];
            else {
                target = addNode(hit.la, hit.ln);
                const e = hit.e;
                removed.add(e);
                seen.delete(eu[e] < ev[e] ? `${eu[e]}_${ev[e]}` : `${ev[e]}_${eu[e]}`);
                addEdge(eu[e], target, ecls[e], ename[e], epriv[e]);
                addEdge(target, ev[e], ecls[e], ename[e], epriv[e]);
            }
            if (addEdge(n, target, 3, -1, 0) >= 0) attached++;
        });

        // ── Sectors ──
        const nodeCount = lat.length;
        const inc = Array.from({ length: nodeCount }, () => []);
        for (let e = 0; e < eu.length; e++) {
            if (removed.has(e)) continue;
            const add = (a, b) => {
                const [ay, ax] = toM(lat[a], lng[a]), [by, bx] = toM(lat[b], lng[b]);
                inc[a].push({ e, ang: Math.atan2(by - ay, bx - ax) });
            };
            add(eu[e], ev[e]); add(ev[e], eu[e]);
        }
        const base = new Int32Array(nodeCount + 1);
        const posU = new Int32Array(eu.length), posV = new Int32Array(eu.length);
        for (let n = 0; n < nodeCount; n++) {
            inc[n].sort((a, b) => a.ang - b.ang);
            inc[n].forEach((it, i) => { if (eu[it.e] === n && !(ev[it.e] === n)) posU[it.e] = i; else posV[it.e] = i; });
            base[n + 1] = base[n] + Math.max(1, inc[n].length);
        }
        const sector = (n, i) => { const k = Math.max(1, inc[n].length); return base[n] + (((i % k) + k) % k); };
        // Sectors beside edge e on side s (+1 left / -1 right of u→v): [at u, at v]
        const sidesOf = (e, s) => s > 0 ? [sector(eu[e], posU[e]), sector(ev[e], posV[e] - 1)] : [sector(eu[e], posU[e] - 1), sector(ev[e], posV[e])];
        const sectorNode = new Int32Array(base[nodeCount]);
        for (let n = 0; n < nodeCount; n++) for (let s = base[n]; s < base[n + 1]; s++) sectorNode[s] = n;

        const walkCost = (e, metres) => {
            let c = metres;
            if (ecls[e] === 4) c = c * STEPS_FACTOR + STEPS_EXTRA_M;
            if (epriv[e]) c *= PRIVATE_FACTOR;
            return c;
        };
        const crossCost = (e, n) => {
            const cls = ecls[e];
            if (cls >= 3) return 0;
            if (cls === 2) return CROSS_COST[2];
            const t = CROSS_COST[cls], c = code.get(n);
            if (c) return t[c];
            return inc[n].length >= 3 ? t.junction : t.plain;
        };

        // Links (directed, both ways): kind 0 = along edge, 1 = cross edge at a node
        const SN = base[nodeCount];
        const adj = Array.from({ length: SN }, () => []);
        const link = (a, b, cost, kind, e, side) => {
            adj[a].push({ to: b, cost, kind, e, side });
            adj[b].push({ to: a, cost, kind, e, side });
        };
        for (let e = 0; e < eu.length; e++) {
            if (removed.has(e)) continue;
            const c = walkCost(e, len(e));
            const L = sidesOf(e, 1), R = sidesOf(e, -1);
            link(L[0], L[1], c, 0, e, 1);
            if (R[0] !== L[0] || R[1] !== L[1]) link(R[0], R[1], c, 0, e, -1);
        }
        for (let n = 0; n < nodeCount; n++) {
            const k = inc[n].length;
            if (k < 2) continue;
            inc[n].forEach((it, i) => link(sector(n, i - 1), sector(n, i), crossCost(it.e, n), 1, it.e, 0));
        }

        // Connected parts of the network. Only the largest one is used: the others are streets that join
        // the rest outside the graph's box (e.g. Lawa / Prinza) or small loose bits.
        const root = Int32Array.from({ length: nodeCount }, (_, i) => i);
        const find = (x) => { while (root[x] !== x) { root[x] = root[root[x]]; x = root[x]; } return x; };
        for (let e = 0; e < eu.length; e++) if (!removed.has(e)) root[find(eu[e])] = find(ev[e]);
        const partSize = new Map();
        for (let n = 0; n < nodeCount; n++) { const r = find(n); partSize.set(r, (partSize.get(r) || 0) + 1); }
        let mainPart = -1, mainSize = 0;
        partSize.forEach((size, r) => { if (size > mainSize) { mainSize = size; mainPart = r; } });
        const inMain = (e) => find(eu[e]) === mainPart;

        // ── Query ──
        const inBox = (p, marginM) => p[0] >= S + marginM / M_LAT && p[0] <= N - marginM / M_LAT && p[1] >= W + marginM / M_LNG && p[1] <= E - marginM / M_LNG;
        // The road a point is on. Null when that road is not part of the main network (the point is
        // somewhere the graph does not cover well) or nothing is near.
        const snap = (p) => {
            const hit = nearestEdge(p[0], p[1], (e) => ecls[e] <= 3, PRIVATE_SNAP_PENALTY_M);
            return hit && hit.d <= SNAP_MAX_M && inMain(hit.e) ? hit : null;
        };
        const covers = (p) => inBox(p, 100) && !!snap(p);

        // Sector ends of a snapped point, with the walking cost from the point to each
        const ends = (hit) => {
            const e = hit.e, L = len(e);
            const sides = (ecls[e] <= 1 && hit.d > BOTH_SIDES_M) ? [hit.side] : [1, -1];
            const out = [];
            sides.forEach((s) => {
                const [su, sv] = sidesOf(e, s);
                out.push({ sec: su, cost: walkCost(e, hit.t * L), side: s, toward: eu[e] });
                out.push({ sec: sv, cost: walkCost(e, (1 - hit.t) * L), side: s, toward: ev[e] });
            });
            return out;
        };

        // A street crossing that is not allowed is used only when there is no other way at all
        // (e.g. a place in a corner the footbridge stairs do not reach), at this cost
        const RELAXED_CROSS_M = 2000;

        function route(a, b) {
            return search(a, b, false) || search(a, b, true);
        }

        // Gated roads (access=private) are used only to leave the place the walk starts in or to reach
        // the place it ends in, never as a shortcut through a subdivision in between. Each sector is
        // searched in three phases: 0 still inside the starting gated area, 1 on public ways,
        // 2 inside the destination's gated area. (The relaxed search drops this rule too.)
        function search(a, b, relaxed) {
            if (!inBox(a, 0) || !inBox(b, 0)) return null;
            const ha = snap(a), hb = snap(b);
            if (!ha || !hb) return null;
            const NS = SN * 3, SRC = NS, DST = NS + 1;
            const dist = new Float64Array(NS + 2).fill(Infinity);
            const prev = new Int32Array(NS + 2).fill(-1);
            const via = new Array(NS + 2);
            const startPhase = epriv[ha.e] ? 0 : 1;
            const goalPhases = epriv[hb.e] ? [0, 2] : [1];
            const startEnds = ends(ha), goalEnds = ends(hb);
            const goalBySec = new Map();
            goalEnds.forEach((g2) => { const o = goalBySec.get(g2.sec); if (!o || g2.cost < o.cost) goalBySec.set(g2.sec, g2); });
            const nextPhase = (ph, e) => {
                if (relaxed) return ph;
                if (epriv[e]) return ph === 1 ? 2 : ph;   // 0 → 0, 1 → 2, 2 → 2
                return ph === 2 ? -1 : 1;                 // public way: 0 → 1, 1 → 1, not after the end area
            };

            // Binary heap
            const hk = [], hv = [];
            const push = (k, v) => { hk.push(k); hv.push(v); let i = hk.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= hk[i]) break; [hk[p], hk[i]] = [hk[i], hk[p]]; [hv[p], hv[i]] = [hv[i], hv[p]]; i = p; } };
            const pop = () => { const k = hk[0], v = hv[0]; const lk = hk.pop(), lv = hv.pop(); if (hk.length) { hk[0] = lk; hv[0] = lv; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < hk.length && hk[l] < hk[m]) m = l; if (r < hk.length && hk[r] < hk[m]) m = r; if (m === i) break; [hk[m], hk[i]] = [hk[i], hk[m]]; [hv[m], hv[i]] = [hv[i], hv[m]]; i = m; } } return [k, v]; };

            dist[SRC] = 0;
            // Both on the same edge and side (or a small street): straight along it
            if (ha.e === hb.e && (ha.side === hb.side || ecls[ha.e] >= 2 || ha.d <= BOTH_SIDES_M || hb.d <= BOTH_SIDES_M)) {
                const L = len(ha.e);
                const c = walkCost(ha.e, Math.abs(ha.t - hb.t) * L) + (ha.side !== hb.side && ecls[ha.e] === 2 ? CROSS_COST[2] : 0);
                dist[DST] = c; prev[DST] = SRC; via[DST] = { kind: 2 };
                push(c, DST);
            }
            startEnds.forEach((s) => {
                const st = s.sec * 3 + (relaxed ? 1 : startPhase);
                if (s.cost < dist[st]) { dist[st] = s.cost; prev[st] = SRC; via[st] = { kind: 3, side: s.side }; push(s.cost, st); }
            });
            while (hk.length) {
                const [d, x] = pop();
                if (d > dist[x]) continue;
                if (x === DST) break;
                const u = (x / 3) | 0, ph = x % 3;
                const g2 = goalBySec.get(u);
                if (g2 && (relaxed || goalPhases.includes(ph)) && d + g2.cost < dist[DST]) { dist[DST] = d + g2.cost; prev[DST] = x; via[DST] = { kind: 4, side: g2.side }; push(dist[DST], DST); }
                const list = adj[u];
                for (let i = 0; i < list.length; i++) {
                    const l = list[i];
                    const nph = l.kind === 0 ? nextPhase(ph, l.e) : ph;
                    if (nph < 0) continue;
                    const nd = d + (isFinite(l.cost) ? l.cost : (relaxed ? RELAXED_CROSS_M : Infinity));
                    if (nd === Infinity) continue;
                    const y = l.to * 3 + nph;
                    if (nd < dist[y]) { dist[y] = nd; prev[y] = x; via[y] = l; push(nd, y); }
                }
            }
            if (!isFinite(dist[DST])) return null;

            // Moves from start to end, as sectors
            const items = [];
            for (let x = DST; x !== SRC; x = prev[x]) {
                const p = prev[x];
                items.push({ sec: x === DST ? -1 : (x / 3) | 0, prevSec: p === SRC ? -1 : (p / 3) | 0, v: via[x] });
            }
            items.reverse();
            return buildResult(ha, hb, items, dist[DST]);
        }

        // ── Geometry and steps ──
        const offsetPoint = (n, e, side) => {
            // Point beside node n, on the walker's side (+1 left / -1 right of u→v) of edge e
            const off = DRAW_OFFSET_M[ecls[e]];
            if (!off || !side) return [lat[n], lng[n]];
            const [ay, ax] = toM(lat[eu[e]], lng[eu[e]]), [by, bx] = toM(lat[ev[e]], lng[ev[e]]);
            const L = Math.hypot(bx - ax, by - ay) || 1;
            // left normal of u→v
            const nx = -(by - ay) / L, ny = (bx - ax) / L;
            const [py, px] = toM(lat[n], lng[n]);
            return [(py + ny * off * side) / M_LAT, (px + nx * off * side) / M_LNG];
        };
        const bearing = (p, q) => { const [ay, ax] = toM(p[0], p[1]), [by, bx] = toM(q[0], q[1]); return (Math.atan2(bx - ax, by - ay) * 180 / Math.PI + 360) % 360; };
        const turnModifier = (b1, b2) => {
            let d = ((b2 - b1 + 540) % 360) - 180;
            const a = Math.abs(d), dir = d > 0 ? 'right' : 'left';
            if (a < 25) return 'straight';
            if (a < 50) return `slight ${dir}`;
            if (a < 135) return dir;
            if (a < 170) return `sharp ${dir}`;
            return 'uturn';
        };

        function buildResult(ha, hb, items, cost) {
            const pts = [];
            const add = (p) => { const l = pts[pts.length - 1]; if (!l || Math.abs(l[0] - p[0]) > 2e-6 || Math.abs(l[1] - p[1]) > 2e-6) pts.push(p); };
            const pieces = []; // { e, side, metres, from:[lat,lng], to:[lat,lng] }
            const crossings = [];
            // A snapped end point, moved to the walker's side on the big roads
            const startPt = (h, side) => {
                const off = DRAW_OFFSET_M[ecls[h.e]];
                if (!off || !side) return [h.la, h.ln];
                const [ay, ax] = toM(lat[eu[h.e]], lng[eu[h.e]]), [by, bx] = toM(lat[ev[h.e]], lng[ev[h.e]]);
                const L = Math.hypot(bx - ax, by - ay) || 1;
                const nx = -(by - ay) / L, ny = (bx - ax) / L;
                const [py, px] = toM(h.la, h.ln);
                return [(py + ny * off * side) / M_LAT, (px + nx * off * side) / M_LNG];
            };

            let lastNode = null;
            for (let k = 0; k < items.length; k++) {
                const x = items[k].sec, v = items[k].v, px = items[k].prevSec;
                if (v.kind === 2) { // same edge
                    const side = ecls[ha.e] <= 1 ? ha.side : 0;
                    const p0 = startPt(ha, side), p1 = startPt(hb, side);
                    add(p0); add(p1);
                    pieces.push({ e: ha.e, metres: Math.abs(ha.t - hb.t) * len(ha.e), from: p0, to: p1 });
                } else if (v.kind === 3) { // start → first node
                    const n = sectorNode[x];
                    const side = ecls[ha.e] <= 1 ? v.side : 0;
                    const p0 = startPt(ha, side), p1 = offsetPoint(n, ha.e, side);
                    add(p0); add(p1);
                    pieces.push({ e: ha.e, metres: (n === eu[ha.e] ? ha.t : 1 - ha.t) * len(ha.e), from: p0, to: p1 });
                    lastNode = n;
                } else if (v.kind === 0) { // along an edge
                    const e = v.e, from = sectorNode[px], to = sectorNode[x];
                    const p0 = offsetPoint(from, e, v.side), p1 = offsetPoint(to, e, v.side);
                    add(p0); add(p1);
                    pieces.push({ e, metres: len(e), from: p0, to: p1 });
                    lastNode = to;
                } else if (v.kind === 1) { // crossing at a node
                    const n = sectorNode[x];
                    if (ecls[v.e] <= 1) {
                        crossings.push({ name: names[ename[v.e]] || '', code: code.get(n) || (inc[n].length >= 3 ? 'junction' : 'plain'), at: [lat[n], lng[n]], cls: ecls[v.e], pieceIndex: pieces.length });
                    }
                } else if (v.kind === 4) { // last node → end
                    const n = lastNode !== null ? lastNode : sectorNode[px];
                    const side = ecls[hb.e] <= 1 ? v.side : 0;
                    const p0 = offsetPoint(n, hb.e, side), p1 = startPt(hb, side);
                    add(p0); add(p1);
                    pieces.push({ e: hb.e, metres: (n === eu[hb.e] ? hb.t : 1 - hb.t) * len(hb.e), from: p0, to: p1 });
                }
            }
            if (pts.length === 1) pts.push(pts[0].slice());
            const distance = pieces.reduce((m, p) => m + p.metres, 0);
            const steps = buildSteps(pieces, crossings, pts);
            return {
                coordinates: pts,
                distance,
                duration: (distance / 1000 / WALK_SPEED_KPH) * 3600,
                steps,
                crossings: crossings.map(({ name, code: c, at, cls }) => ({ name, code: c, at, cls, highway: cls === 0 })),
                footbridges: steps.filter((s) => s.walk === 'footbridge').map((s) => s.name || 'footbridge'),
                cost,
                source: 'Calzada walk graph'
            };
        }

        function buildSteps(pieces, crossings, pts) {
            // Groups of pieces: footbridge (stairs + bridge), or one street name
            const groups = [];
            const crossAt = new Map(); // piece index → crossing just before it
            crossings.forEach((c) => { if (!crossAt.has(c.pieceIndex)) crossAt.set(c.pieceIndex, c); });
            pieces.forEach((p, i) => {
                const cls = ecls[p.e];
                const bridgeish = cls === 4 || cls === 5;
                const nm = bridgeish ? '' : (names[ename[p.e]] || '');
                const c = crossAt.get(i);
                if (c) groups.push({ kind: 'cross', name: c.name, code: c.code, metres: 0, from: p.from, to: p.from, dirFrom: p.from, dirTo: p.to });
                const cur = groups[groups.length - 1];
                if (bridgeish) {
                    if (cur && cur.kind === 'bridge') { cur.metres += p.metres; cur.to = p.to; if (cls === 5) { cur.hasBridge = true; cur.name = cur.name || names[ename[p.e]] || ''; } }
                    else groups.push({ kind: 'bridge', hasBridge: cls === 5, name: cls === 5 ? (names[ename[p.e]] || '') : '', metres: p.metres, from: p.from, to: p.to, dirFrom: p.from, dirTo: p.to });
                    return;
                }
                if (cur && cur.kind === 'street' && cur.name === nm) { cur.metres += p.metres; cur.to = p.to; cur.endDirFrom = p.from; cur.endDirTo = p.to; return; }
                groups.push({ kind: 'street', name: nm, metres: p.metres, from: p.from, to: p.to, dirFrom: p.from, dirTo: p.to, endDirFrom: p.from, endDirTo: p.to });
            });
            // Stairs without a bridge are just part of the walk; short unnamed bits join the street before
            const merged = [];
            groups.forEach((gr) => {
                if (gr.kind === 'bridge' && !gr.hasBridge) gr.kind = 'street';
                const prevG = merged[merged.length - 1];
                if (gr.kind === 'street' && prevG && prevG.kind === 'street' && (!gr.name || gr.name === prevG.name) && (gr.metres < 25 || gr.name === prevG.name)) {
                    prevG.metres += gr.metres; prevG.to = gr.to; prevG.endDirFrom = gr.endDirFrom || gr.dirFrom; prevG.endDirTo = gr.endDirTo || gr.dirTo; return;
                }
                if (gr.kind === 'street' && prevG && prevG.kind === 'street' && !prevG.name && prevG.metres < 25 && merged.length > 1) {
                    prevG.name = gr.name; prevG.metres += gr.metres; prevG.to = gr.to; prevG.endDirFrom = gr.endDirFrom; prevG.endDirTo = gr.endDirTo; return;
                }
                merged.push(gr);
            });

            const loc = (p) => [p[1], p[0]];
            const dur = (m) => (m / 1000 / WALK_SPEED_KPH) * 3600;
            const steps = [];
            let lastBearing = null;
            merged.forEach((gr, i) => {
                const b0 = bearing(gr.dirFrom, gr.dirTo);
                let type = i === 0 ? 'depart' : 'turn';
                let modifier = i === 0 ? '' : (lastBearing === null ? 'straight' : turnModifier(lastBearing, b0));
                if (type === 'turn' && modifier === 'straight') type = 'continue';
                const step = { name: gr.name, distance: gr.metres, duration: dur(gr.metres), maneuver: { type, modifier, location: loc(gr.from) }, mode: 'foot' };
                if (gr.kind === 'bridge') { step.walk = 'footbridge'; step.maneuver.type = i === 0 ? 'depart' : 'continue'; step.maneuver.modifier = 'straight'; }
                if (gr.kind === 'cross') { step.walk = 'cross'; step.crossing = gr.code; step.maneuver.type = i === 0 ? 'depart' : 'continue'; step.maneuver.modifier = 'straight'; }
                steps.push(step);
                // After a footbridge or a crossing the next street is "continue on", not a turn worked out
                // from the direction of the stairs
                lastBearing = gr.kind === 'street' ? bearing(gr.endDirFrom || gr.dirFrom, gr.endDirTo || gr.dirTo) : null;
            });
            const end = pts[pts.length - 1];
            steps.push({ name: merged.length ? (merged[merged.length - 1].kind === 'street' ? merged[merged.length - 1].name : '') : '', distance: 0, duration: 0, maneuver: { type: 'arrive', modifier: '', location: loc(end) }, mode: 'foot' });
            return steps;
        }

        return {
            version: VERSION,
            route,
            covers,
            stats: { nodes: nodeCount, edges: eu.length - removed.size, sectors: SN, attached, mainNodes: mainSize }
        };
    }

    // ── Loading (browser) ──
    // One router per page; the graph is fetched once, from the site root or relative to /pages/.
    let loadPromise = null;
    function load() {
        if (loadPromise) return loadPromise;
        if (typeof fetch !== 'function') { loadPromise = Promise.resolve(null); return loadPromise; }
        loadPromise = (async () => {
            for (const p of ['/data/walk-graph.json', '../data/walk-graph.json']) {
                try {
                    const res = await fetch(p, { cache: 'no-cache' });
                    if (res.ok) return createRouter(await res.json());
                } catch (_) { /* next path */ }
            }
            console.warn('[CalzadaWalk] walk-graph.json did not load: walks use the public foot router.');
            return null;
        })();
        return loadPromise;
    }

    return { VERSION, createRouter, load };
}));
