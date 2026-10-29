/**
 * Calzada transit engine (v1.3.2)
 *
 * Plans jeepney trips on the curated routes in /data/transit-routes.json: direct rides and
 * rides with one transfer at a shared stop (or a short walk between stops, e.g. through SM).
 * Each trip option is a list of legs (walk / jeep) with distance, minutes and fare, plus the
 * tags Recommended (balanced), Pinakamura (cheapest) and Pinakamabilis (fastest).
 *
 * Distances here are estimates (straight line x 1.25 for walks, along the route path for rides);
 * the planner replaces the walks of the option it shows with real foot routes.
 *
 * Browser: window.CalzadaTransit. Node: require('.../public/js/transit-engine.js') (tests).
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.CalzadaTransit = api;
}(typeof self !== 'undefined' ? self : this, function (root) {
    'use strict';

    // Same speeds and buffer as the planner, so option cards and the itinerary agree
    const WALK_SPEED_KPH = 4.0;      // door to door in town, 15 min per km
    const JEEP_SPEED_KPH = 20;
    const BOARDING_BUFFER_MIN = 3;   // per jeep ride (waiting + boarding)
    const TRANSFER_EXTRA_MIN = 2;    // finding the next jeep
    const WALK_FACTOR = 1.25;        // straight line -> street walk
    const MAX_ACCESS_WALK_M = 1200;  // origin -> first jeep, last jeep -> destination
    const MAX_TRANSFER_WALK_M = 450;
    const MIN_RIDE_M = 400;          // shorter rides are not worth a jeep
    const STOP_SNAP_M = 250;         // board/get off at a listed stop when it is this close along the path
    const MAX_OPTIONS = 3;

    // Balanced score for "Recommended": fare first, but time and transfers count
    const COST_PER_MIN = 0.5;        // pesos per minute
    const COST_PER_TRANSFER = 10;    // pesos per transfer
    const COST_PER_WALK_MIN = 0.5;   // walking weighs a bit more than riding

    const toRad = (d) => d * Math.PI / 180;
    function haversineM(a, b) {
        const R = 6371000;
        const dLat = toRad(b[0] - a[0]);
        const dLng = toRad(b[1] - a[1]);
        const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
    }

    // Google encoded polyline -> [[lat, lng], ...] (precision 5 = 1e5, 6 = 1e6)
    function decodePolyline(str, precision) {
        const factor = Math.pow(10, precision || 5);
        const pts = [];
        let i = 0, lat = 0, lng = 0;
        while (i < str.length) {
            const vals = [0, 0];
            for (let k = 0; k < 2; k++) {
                let result = 0, shift = 0, b;
                do {
                    b = str.charCodeAt(i++) - 63;
                    result |= (b & 0x1f) << shift;
                    shift += 5;
                } while (b >= 0x20);
                vals[k] = (result & 1) ? ~(result >> 1) : (result >> 1);
            }
            lat += vals[0];
            lng += vals[1];
            pts.push([lat / factor, lng / factor]);
        }
        return pts;
    }

    // Local metric projection around a latitude (good to well under 1% across Laguna)
    function xy(p, lat0) {
        return [p[1] * 111320 * Math.cos(toRad(lat0)), p[0] * 110574];
    }

    // Prepared route: points, cumulative metres, stop positions along the path
    function prepareRoute(route, stops, precision) {
        const pts = decodePolyline(route.polyline || '', precision);
        if (pts.length < 2) return null;
        const lat0 = pts[0][0];
        const cum = [0];
        for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + haversineM(pts[i - 1], pts[i]));
        const r = { ...route, pts, cum, len: cum[cum.length - 1], lat0, stopPos: [], closedM: Array.isArray(route.closedM) ? route.closedM : [] };
        // Directions served: 1 = from -> to, -1 = back (a direction set to false is not served)
        r.dirs = [1, -1].filter((d) => (d === 1 ? route.forward : route.reverse) !== false);
        (route.stops || []).forEach((entry) => {
            // A plain id: passengers get on and off there both ways
            const e = typeof entry === 'string' ? { id: entry, forward: 'both', reverse: 'both' } : entry;
            const s = stops[e.id];
            if (!s) return;
            const pr = project(r, [s.lat, s.lng]);
            r.stopPos.push({
                id: e.id, name: s.name, name_tl: s.name_tl, pos: pr.pos, pt: pr.pt, offM: pr.off, stopPt: [s.lat, s.lng],
                roles: { 1: e.forward || null, '-1': e.reverse || null }
            });
        });
        return r;
    }

    // Parts of the path where the jeep takes no passengers except at listed stops (e.g. its loop
    // around SM before it reaches the highway): [[fromM, toM], ...] in metres from the start
    function isClosed(r, pos) {
        return (r.closedM || []).some(([a, b]) => pos >= a && pos <= b);
    }

    // Nearest point of the path to p: { pos (metres from the start), pt [lat,lng], off (metres) }.
    // openOnly skips the closed parts.
    function project(r, p, openOnly) {
        const P = xy(p, r.lat0);
        let best = { pos: 0, pt: r.pts[0], off: Infinity };
        for (let i = 1; i < r.pts.length; i++) {
            if (openOnly && r.cum && isClosed(r, (r.cum[i - 1] + r.cum[i]) / 2)) continue;
            const A = xy(r.pts[i - 1], r.lat0), B = xy(r.pts[i], r.lat0);
            const dx = B[0] - A[0], dy = B[1] - A[1];
            const L = dx * dx + dy * dy;
            let t = L ? ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / L : 0;
            t = Math.max(0, Math.min(1, t));
            const qx = A[0] + t * dx, qy = A[1] + t * dy;
            const d = Math.hypot(P[0] - qx, P[1] - qy);
            if (d < best.off) {
                const a = r.pts[i - 1], b = r.pts[i];
                best = {
                    pos: r.cum[i - 1] + t * (r.cum[i] - r.cum[i - 1]),
                    pt: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])],
                    off: d
                };
            }
        }
        return best;
    }

    // Point of the path at a position (metres from the start)
    function pointAt(r, pos) {
        pos = Math.max(0, Math.min(r.len, pos));
        for (let i = 1; i < r.cum.length; i++) {
            if (r.cum[i] >= pos) {
                const seg = r.cum[i] - r.cum[i - 1] || 1;
                const t = (pos - r.cum[i - 1]) / seg;
                const a = r.pts[i - 1], b = r.pts[i];
                return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
            }
        }
        return r.pts[r.pts.length - 1].slice();
    }

    // Path between two positions, in riding order
    function slicePath(r, fromPos, toPos) {
        const lo = Math.min(fromPos, toPos), hi = Math.max(fromPos, toPos);
        const out = [pointAt(r, lo)];
        for (let i = 0; i < r.pts.length; i++) {
            if (r.cum[i] > lo && r.cum[i] < hi) out.push(r.pts[i].slice());
        }
        out.push(pointAt(r, hi));
        return fromPos <= toPos ? out : out.reverse();
    }

    // Rounded to the nearest minute, like the planner (rounding every leg up overstated trips).
    // The jeep runs slower in rush hour; the planner's live-ETA module knows the hours.
    const jeepKphNow = () => {
        const L = root && root.CalzadaLiveEta;
        return L && typeof L.jeepDefaultMps === 'function' ? L.jeepDefaultMps(new Date(), JEEP_SPEED_KPH) * 3.6 : JEEP_SPEED_KPH;
    };
    const walkMin = (m) => Math.max(1, Math.round((m / 1000 / WALK_SPEED_KPH) * 60));
    const rideMin = (m) => Math.max(1, Math.round((m / 1000 / jeepKphNow()) * 60)) + BOARDING_BUFFER_MIN;

    function fareFor(m) {
        const F = root && root.CalzadaFare;
        const km = m / 1000;
        if (F) {
            const f = F.fares(km, F.current ? F.current() : undefined);
            return { regular: f.regular, discounted: f.discounted };
        }
        // fare-calc.js missing: LTFRB Region IV-A guide (Sep 28, 2026)
        const counted = Math.max(1, Math.ceil(Math.round(km * 1000) / 1000));
        const r4 = (v) => Math.round(v * 4) / 4;
        return { regular: r4(14 + Math.max(0, counted - 4) * 2), discounted: r4(11.2 + Math.max(0, counted - 4) * 1.6) };
    }

    // Whether a stop lets passengers 'board' or 'alight' in a direction
    function stopAllows(s, dir, need) {
        const role = s.roles[dir];
        return role === 'both' || role === need;
    }

    // A route stop within STOP_SNAP_M along the path of pos that allows `need` in `dir`, or null
    function nearStop(r, pos, dir, need) {
        let best = null;
        r.stopPos.forEach((s) => {
            if (!stopAllows(s, dir, need)) return;
            const d = Math.abs(s.pos - pos);
            if (d <= STOP_SNAP_M && (!best || d < best.d)) best = { ...s, d };
        });
        return best;
    }

    function dirInfo(r, dir) {
        const d = (dir === 1 ? r.forward : r.reverse) || {};
        return { headsign: d.headsign || (dir === 1 ? r.to : r.from), signboard: d.signboard || null };
    }

    // One jeep ride on route r in direction dir (1 = from->to, -1 = reverse) between two positions
    function jeepLeg(r, dir, boardPos, alightPos, board, alight) {
        const distM = Math.abs(alightPos - boardPos);
        const fare = fareFor(distM);
        const info = dirInfo(r, dir);
        return {
            type: 'jeep',
            routeId: r.id,
            routeName: r.name,
            dir,
            headsign: info.headsign,
            signboard: info.signboard,
            board,
            alight,
            coords: slicePath(r, boardPos, alightPos),
            distM,
            min: rideMin(distM),
            fare: fare.regular,
            fareDisc: fare.discounted
        };
    }

    // Walks under 30 m (the stop is right there) count as none
    const MIN_WALK_M = 30;
    function walkLeg(from, to, distM, extra) {
        const d = distM >= MIN_WALK_M ? distM : 0;
        return { type: 'walk', from, to, distM: d, min: d > 0 ? walkMin(d) : 0, ...(extra || {}) };
    }

    // Board point near the origin on r in direction dir: { pos, pt, walkM, stop? }
    function boardNear(r, p, dir) {
        const pr = project(r, p, true);
        let res = { pos: pr.pos, pt: pr.pt, walkM: pr.off * WALK_FACTOR, stop: null };
        const s = nearStop(r, pr.pos, dir, 'board');
        if (s) {
            const w = haversineM(p, s.stopPt) * WALK_FACTOR;
            if (w <= res.walkM + 150) res = { pos: s.pos, pt: s.stopPt, walkM: w, stop: s };
        }
        // A stop the jeep loads at can be the better walk even when it is farther along the path
        r.stopPos.forEach((st) => {
            if (!stopAllows(st, dir, 'board')) return;
            const w = haversineM(p, st.stopPt) * WALK_FACTOR;
            if (w < res.walkM) res = { pos: st.pos, pt: st.stopPt, walkM: w, stop: st };
        });
        return res;
    }

    function summarize(legs) {
        const jeeps = legs.filter((l) => l.type === 'jeep');
        const totalMin = legs.reduce((s, l) => s + l.min, 0) + Math.max(0, jeeps.length - 1) * TRANSFER_EXTRA_MIN;
        const fare = jeeps.reduce((s, l) => s + l.fare, 0);
        const fareDisc = jeeps.reduce((s, l) => s + l.fareDisc, 0);
        const walkM = legs.filter((l) => l.type === 'walk').reduce((s, l) => s + l.distM, 0);
        const transfers = Math.max(0, jeeps.length - 1);
        const walkTotalMin = legs.filter((l) => l.type === 'walk').reduce((s, l) => s + l.min, 0);
        const cost = fare + COST_PER_MIN * totalMin + COST_PER_TRANSFER * transfers + COST_PER_WALK_MIN * walkTotalMin;
        const key = jeeps.map((j) => `${j.routeId}:${j.dir}:${j.board.stopId || Math.round(j.board.pt[0] * 2000) + ',' + Math.round(j.board.pt[1] * 2000)}:${j.alight.stopId || ''}`).join('|');
        return { legs, totalMin, fare, fareDisc, walkM, transfers, cost, key, tags: [] };
    }

    const stopRef = (s, pt) => ({ pt: s ? s.stopPt : pt, stopId: s ? s.id : null, name: s ? s.name : null, name_tl: s ? s.name_tl || null : null });

    // ── Planner ─────────────────────────────────────────────────────────────────
    function createPlanner(data) {
        const stops = data.stops || {};
        const routes = (data.routes || []).map((r) => prepareRoute(r, stops, data.polylinePrecision || 5)).filter(Boolean);
        const transfers = data.transfers || [];

        // Stops reachable on foot from a stop: itself (0 m) and the transfer links
        function linkedStops(stopId) {
            const out = [{ id: stopId, walkM: 0, via: null, via_tl: null, path: null }];
            // path: the walking line from a to b; reversed when walking from b to a
            const pathOf = (t, fromA) => (Array.isArray(t.path) && t.path.length >= 2
                ? (fromA ? t.path.map((p) => p.slice()) : t.path.map((p) => p.slice()).reverse()) : null);
            transfers.forEach((t) => {
                if (t.a === stopId) out.push({ id: t.b, walkM: t.walkM, via: t.via || null, via_tl: t.via_tl || null, path: pathOf(t, true) });
                else if (t.b === stopId) out.push({ id: t.a, walkM: t.walkM, via: t.via || null, via_tl: t.via_tl || null, path: pathOf(t, false) });
            });
            return out.filter((x) => x.walkM <= MAX_TRANSFER_WALK_M);
        }

        function plan(origin, dest) {
            if (!origin || !dest) return [];
            const found = [];

            // Destination side of route r, dir: alight point after fromPos
            const alightFor = (r, dir, fromPos) => {
                const pr = project(r, dest, true);
                let pos = pr.pos, pt = pr.pt, walkM = pr.off * WALK_FACTOR, stop = null;
                const s = nearStop(r, pr.pos, dir, 'alight');
                if (s) {
                    const w = haversineM(s.stopPt, dest) * WALK_FACTOR;
                    if (w <= walkM + 150) { pos = s.pos; pt = s.stopPt; walkM = w; stop = s; }
                }
                r.stopPos.forEach((st) => {
                    if (!stopAllows(st, dir, 'alight')) return;
                    const w = haversineM(st.stopPt, dest) * WALK_FACTOR;
                    if (w < walkM) { pos = st.pos; pt = st.stopPt; walkM = w; stop = st; }
                });
                const ride = dir === 1 ? pos - fromPos : fromPos - pos;
                if (walkM > MAX_ACCESS_WALK_M || ride < MIN_RIDE_M) return null;
                return { pos, pt, walkM, stop };
            };

            routes.forEach((A) => {
                A.dirs.forEach((dirA) => {
                    const b = boardNear(A, origin, dirA);
                    if (b.walkM > MAX_ACCESS_WALK_M) return;
                    // Direct
                    const a = alightFor(A, dirA, b.pos);
                    if (a) {
                        found.push(summarize([
                            walkLeg(origin, b.pt, b.walkM),
                            jeepLeg(A, dirA, b.pos, a.pos, stopRef(b.stop, b.pt), stopRef(a.stop, a.pt)),
                            walkLeg(a.pt, dest, a.walkM)
                        ]));
                    }
                    // One transfer: get off A at a stop where it lets passengers off, take B where it loads
                    A.stopPos.forEach((sA) => {
                        if (!stopAllows(sA, dirA, 'alight')) return;
                        const rideA = dirA === 1 ? sA.pos - b.pos : b.pos - sA.pos;
                        if (rideA < MIN_RIDE_M) return;
                        linkedStops(sA.id).forEach((link) => {
                            routes.forEach((B) => {
                                if (B.id === A.id) return;
                                const sB = B.stopPos.find((s) => s.id === link.id);
                                if (!sB) return;
                                B.dirs.forEach((dirB) => {
                                    if (!stopAllows(sB, dirB, 'board')) return;
                                    const a2 = alightFor(B, dirB, sB.pos);
                                    if (!a2) return;
                                    const tw = link.walkM ? Math.max(link.walkM, haversineM(sA.stopPt, sB.stopPt) * WALK_FACTOR) : 0;
                                    found.push(summarize([
                                        walkLeg(origin, b.pt, b.walkM),
                                        jeepLeg(A, dirA, b.pos, sA.pos, stopRef(b.stop, b.pt), stopRef(sA)),
                                        walkLeg(sA.stopPt, sB.stopPt, tw, { transfer: true, via: link.via, via_tl: link.via_tl, path: link.path }),
                                        jeepLeg(B, dirB, sB.pos, a2.pos, stopRef(sB), stopRef(a2.stop, a2.pt)),
                                        walkLeg(a2.pt, dest, a2.walkM)
                                    ]));
                                });
                            });
                        });
                    });
                });
            });

            // A jeep option that still walks most of the way is not a real option (walking or the
            // planner's own highway route is better): total walk at most 60% of the straight distance
            const straight = haversineM(origin, dest);
            const maxWalk = Math.max(400, straight * 0.6);
            return rank(found.filter((o) => o.walkM <= maxWalk));
        }

        return { plan, routes, stops };
    }

    // Same trip on different routes (e.g. Tagaytay or Tanauan jeep from SM to Real): one card
    function mergeTwins(list) {
        const out = [];
        list.forEach((o) => {
            const sig = o.legs.map((l) => l.type === 'jeep'
                ? `J${Math.round(l.board.pt[0] * 5000)},${Math.round(l.board.pt[1] * 5000)}>${Math.round(l.alight.pt[0] * 5000)},${Math.round(l.alight.pt[1] * 5000)}`
                : `W${Math.round(l.distM / 50)}`).join('|');
            const twin = out.find((x) => x.sig === sig && Math.abs(x.fare - o.fare) < 0.01);
            if (twin) {
                o.legs.forEach((l, i) => {
                    if (l.type !== 'jeep') return;
                    const t = twin.legs[i];
                    t.alsoHeadsigns = t.alsoHeadsigns || [];
                    if (l.headsign !== t.headsign && !t.alsoHeadsigns.includes(l.headsign)) t.alsoHeadsigns.push(l.headsign);
                    t.alsoRoutes = t.alsoRoutes || [];
                    if (l.routeId !== t.routeId && !t.alsoRoutes.includes(l.routeId)) t.alsoRoutes.push(l.routeId);
                });
                return;
            }
            out.push({ ...o, sig });
        });
        return out;
    }

    function rank(found) {
        // Best of each route sequence
        const byKey = new Map();
        found.forEach((o) => {
            const prev = byKey.get(o.key);
            if (!prev || o.cost < prev.cost) byKey.set(o.key, o);
        });
        let list = [...byKey.values()].sort((a, b) => a.cost - b.cost || a.totalMin - b.totalMin);
        list = mergeTwins(list);

        // Drop options another option beats on fare, time and transfers at once
        list = list.filter((o) => !list.some((p) => p !== o
            && p.fare <= o.fare && p.totalMin <= o.totalMin && p.transfers <= o.transfers
            && (p.fare < o.fare || p.totalMin < o.totalMin || p.transfers < o.transfers)));
        if (!list.length) return [];

        const cheapest = list.slice().sort((a, b) => a.fare - b.fare || a.totalMin - b.totalMin)[0];
        const fastest = list.slice().sort((a, b) => a.totalMin - b.totalMin || a.fare - b.fare)[0];
        let shown = list.slice(0, MAX_OPTIONS);
        [cheapest, fastest].forEach((o) => {
            if (!shown.includes(o)) shown[shown.length - 1] = o;
        });
        shown = shown.sort((a, b) => a.cost - b.cost || a.totalMin - b.totalMin);
        if (shown.length > 1) {
            shown[0].tags.push('recommended');
            if (cheapest && shown.includes(cheapest)) cheapest.tags.push('cheapest');
            if (fastest && shown.includes(fastest) && fastest !== cheapest) fastest.tags.push('fastest');
        }
        return shown.map((o, i) => ({ ...o, index: i }));
    }

    // ── Loading ─────────────────────────────────────────────────────────────────
    let loadPromise = null;
    let planner = null;
    function load() {
        if (loadPromise) return loadPromise;
        if (typeof fetch !== 'function') { loadPromise = Promise.resolve(null); return loadPromise; }
        const paths = ['/data/transit-routes.json', '../data/transit-routes.json'];
        loadPromise = (async () => {
            for (const p of paths) {
                try {
                    const res = await fetch(p, { cache: 'no-cache' });
                    if (res.ok) {
                        planner = createPlanner(await res.json());
                        return planner;
                    }
                } catch (_) { /* next path */ }
            }
            return null;
        })();
        return loadPromise;
    }

    return {
        VERSION: '1.3.2',
        load,
        isReady: () => !!planner,
        plan: (o, d) => (planner ? planner.plan(o, d) : []),
        stops: () => (planner ? planner.stops : {}),
        createPlanner,
        decodePolyline,
        haversineM,
        walkMin,
        rideMin,
        constants: { WALK_SPEED_KPH, JEEP_SPEED_KPH, BOARDING_BUFFER_MIN, TRANSFER_EXTRA_MIN, MAX_ACCESS_WALK_M }
    };
}));
