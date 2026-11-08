/**
 * Calzada traffic line helpers (v1.0.0)
 *
 * Pure helpers for the traffic-coloured jeep line, the ride strip and the "walk is faster" hint.
 * The planner (js/planner.js, js/planner-transit.js) draws; this file only computes.
 *
 * Stretches come from GET /api/traffic/leg-colors as route positions
 * ({ fromM, toM, cls, closed }); here they become "travel" metres s from the boarding point
 * (0 .. leg length), the same direction the jeep line is drawn.
 *
 * Browser: window.CalzadaTrafficLine. Node: require('.../public/js/traffic-colors.js') (tests).
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.CalzadaTrafficLine = api;
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const VERSION = '1.0.0';

    // Line colours. 'normal' and 'unknown' use the jeep line's own colour (blue, or light blue for
    // the next jeep of a transfer), so a road without data looks like any jeep line.
    const COLORS = {
        slow: '#F0A81F',
        heavy: '#E8590C',
        stopped: '#B42318',
        passed: '#9AA5B4',
        normal: '#378ADD',
        next: '#8DB8E8'
    };
    const BLEND_M = 40;            // colour fade where the class changes
    const JAM_LABEL_MIN_M = 200;   // jam label + "Heavy on about … m" line
    const HINT = { JAM_AHEAD_M: 300, MAX_WALK_M: 1200, MIN_SAVING_MIN: 3 };

    const isJam = (cls) => cls === 'heavy' || cls === 'stopped';
    const colorOf = (cls, normalColor) => COLORS[cls] && cls !== 'normal' ? COLORS[cls] : (normalColor || COLORS.normal);

    /**
     * Route-position stretches -> travel stretches [{ s0, s1, cls, closed }] from the boarding point,
     * sorted, clipped to 0..L. Gaps are filled with 'unknown'.
     */
    function toTravel(stretches, boardPos, alightPos) {
        const L = Math.abs(alightPos - boardPos);
        if (!(L > 0) || !Array.isArray(stretches)) return [];
        const dir = alightPos < boardPos ? -1 : 1;
        const out = [];
        stretches.forEach((st) => {
            if (!st || !Number.isFinite(st.fromM) || !Number.isFinite(st.toM)) return;
            const a = dir === 1 ? st.fromM - boardPos : boardPos - st.toM;
            const b = dir === 1 ? st.toM - boardPos : boardPos - st.fromM;
            const s0 = Math.max(0, Math.min(L, a));
            const s1 = Math.max(0, Math.min(L, b));
            if (s1 - s0 > 0.5) out.push({ s0, s1, cls: st.cls || 'unknown', closed: !!st.closed });
        });
        out.sort((x, y) => x.s0 - y.s0);
        // Fill gaps and overlaps so the stretches tile 0..L exactly
        const tiled = [];
        let at = 0;
        out.forEach((st) => {
            if (st.s1 <= at) return;
            if (st.s0 > at + 0.5) tiled.push({ s0: at, s1: st.s0, cls: 'unknown', closed: false });
            tiled.push({ s0: Math.max(at, st.s0), s1: st.s1, cls: st.cls, closed: st.closed });
            at = st.s1;
        });
        if (at < L - 0.5) tiled.push({ s0: at, s1: L, cls: 'unknown', closed: false });
        return tiled;
    }

    // Stretches inside the window w0..w1, as runs of one colour
    function colourRuns(travel, w0, w1, normalColor) {
        const runs = [];
        travel.forEach((st) => {
            const a = Math.max(w0, st.s0), b = Math.min(w1, st.s1);
            if (b - a <= 0) return;
            const color = colorOf(st.cls, normalColor);
            const last = runs[runs.length - 1];
            if (last && last.color === color) last.b = b;
            else runs.push({ a, b, color });
        });
        return runs;
    }

    /**
     * MapLibre `line-gradient` for the part of the leg drawn from travel metre w0 to w1
     * (w1 = leg end). null when that part has no traffic colour (draw the plain line).
     */
    function gradientExpr(travel, w0, w1, normalColor, blendM = BLEND_M) {
        const span = w1 - w0;
        if (!(span > 0)) return null;
        const runs = colourRuns(travel, w0, w1, normalColor);
        if (!runs.some((r) => r.color !== (normalColor || COLORS.normal))) return null;
        const stops = [];
        const push = (p, color) => {
            p = Math.max(0, Math.min(1, p));
            const prev = stops.length ? stops[stops.length - 2] : -1;
            if (p <= prev) p = Math.min(1, prev + 1e-6);
            if (p <= prev) return; // no room left at the very end
            stops.push(p, color);
        };
        push(0, runs[0].color);
        for (let i = 1; i < runs.length; i++) {
            const b = runs[i].a;
            const half = Math.min(blendM / 2, (runs[i - 1].b - runs[i - 1].a) / 2, (runs[i].b - runs[i].a) / 2);
            push((b - half - w0) / span, runs[i - 1].color);
            push((b + half - w0) / span, runs[i].color);
        }
        if (stops[stops.length - 2] < 1) push(1, runs[runs.length - 1].color);
        return ['interpolate', ['linear'], ['line-progress']].concat(stops);
    }

    // Ride strip: [{ pct, cls, color }] across the whole leg (0..L)
    function stripSegments(travel, L, normalColor) {
        if (!(L > 0) || !travel.length) return [];
        const segs = [];
        travel.forEach((st) => {
            const cls = st.cls === 'unknown' ? 'normal' : st.cls;
            const pct = ((st.s1 - st.s0) / L) * 100;
            const last = segs[segs.length - 1];
            if (last && last.cls === cls) last.pct += pct;
            else segs.push({ pct, cls, color: colorOf(cls, normalColor) });
        });
        return segs.map((s) => ({ ...s, pct: Math.round(s.pct * 10) / 10 }));
    }

    /**
     * Heavy + stopped inside w0..w1: { totalM, longest: { s0, s1, lengthM, cls } | null, closed }.
     * Neighbouring heavy and stopped stretches count as one run; its cls is the worse one.
     */
    function jamInfo(travel, w0 = 0, w1 = Infinity) {
        let totalM = 0, closed = false, longest = null, cur = null;
        const close = () => {
            if (cur && (!longest || cur.lengthM > longest.lengthM)) longest = cur;
            cur = null;
        };
        travel.forEach((st) => {
            const a = Math.max(w0, st.s0), b = Math.min(w1, st.s1);
            if (b - a <= 0) return;
            if (st.closed) closed = true;
            if (isJam(st.cls)) {
                totalM += b - a;
                if (cur && Math.abs(cur.s1 - a) < 1) {
                    cur.s1 = b; cur.lengthM = cur.s1 - cur.s0;
                    if (st.cls === 'stopped') cur.cls = 'stopped';
                } else {
                    close();
                    cur = { s0: a, s1: b, lengthM: b - a, cls: st.cls };
                }
            } else {
                close();
            }
        });
        close();
        return { totalM: Math.round(totalM), longest: longest && longest.lengthM >= JAM_LABEL_MIN_M ? longest : null, closed };
    }

    // Round metres for display: 650, 1.2 km style is left to the caller; this keeps 50 m steps
    const roundM = (m) => Math.max(50, Math.round(m / 50) * 50);

    /**
     * Where the rider may get off from travel metre s on: inside a closedM range (no alighting)
     * the first point after it. Route positions; dir 1 forward, -1 backwards. null past alightPos.
     */
    function allowedAlightPos(pos, closedM, dir, alightPos) {
        let p = pos;
        (closedM || []).forEach(([a, b]) => {
            if (p >= a && p <= b) p = dir === 1 ? b : a;
        });
        if (dir === 1 ? p >= alightPos : p <= alightPos) return null;
        return p;
    }

    /**
     * "Mas mabilis maglakad": all must hold.
     * { isLastJeep, aheadJamM, walkM, walkMin, rideRemainingMin }
     */
    function walkHintOk(c) {
        if (!c || !c.isLastJeep) return false;
        if (!(c.aheadJamM >= HINT.JAM_AHEAD_M)) return false;
        if (!(c.walkM > 0) || c.walkM > HINT.MAX_WALK_M) return false;
        if (!Number.isFinite(c.walkMin) || !Number.isFinite(c.rideRemainingMin)) return false;
        return c.walkMin <= c.rideRemainingMin - HINT.MIN_SAVING_MIN;
    }

    // Point at travel metre s along coords ([[lng,lat],...] drawn from travel metre w0)
    function pointAlong(coordsLngLat, w0, s, distFn) {
        if (!Array.isArray(coordsLngLat) || coordsLngLat.length < 2) return null;
        let acc = w0;
        for (let i = 1; i < coordsLngLat.length; i++) {
            const a = coordsLngLat[i - 1], b = coordsLngLat[i];
            const d = distFn(a, b);
            if (acc + d >= s) {
                const t = d > 0 ? (s - acc) / d : 0;
                return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
            }
            acc += d;
        }
        return coordsLngLat[coordsLngLat.length - 1].slice();
    }

    function minutesAgo(iso, now) {
        const t = Date.parse(iso);
        if (!Number.isFinite(t)) return null;
        return Math.max(0, Math.round(((now || Date.now()) - t) / 60000));
    }

    return {
        VERSION, COLORS, BLEND_M, JAM_LABEL_MIN_M, HINT,
        isJam, colorOf, toTravel, gradientExpr, stripSegments, jamInfo, roundM,
        allowedAlightPos, walkHintOk, pointAlong, minutesAgo
    };
}));
