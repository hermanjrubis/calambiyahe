/**
 * Calzada live ETA during a journey.
 *
 * Remaining time is rebuilt from where the commuter actually is on each leg, not from fixed totals:
 *   walk        remaining metres / walking pace learned from GPS (starts at 4 km/h)
 *   wait        expected jeep wait at the boarding point; counts down while you wait, and once the
 *               expected wait has passed it keeps one minute in reserve, so the arrival time slides
 *               later in real time instead of freezing
 *   jeep        remaining metres / jeep speed; the speed is a blend of the normal speed for the time
 *               of day and the progress you really made over the last 3 minutes (stop-and-go, traffic)
 *   final walk  remaining metres / walking pace
 *   extra       fixed seconds for anything after (a second jeep), from the planner
 *
 * Pure logic: no DOM, no map. Coordinates are [lat, lng].
 */
(function (root) {
    'use strict';

    const R = 6371000;
    const toRad = d => d * Math.PI / 180;

    function distM(a, b) {
        const dLat = toRad(b[0] - a[0]);
        const dLng = toRad(b[1] - a[1]);
        const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
    }

    function makeLeg(type, coords, fallbackM) {
        const pts = Array.isArray(coords) ? coords.filter(c => Array.isArray(c) && c.length >= 2 && isFinite(c[0]) && isFinite(c[1])) : [];
        const cum = [0];
        for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + distM(pts[i - 1], pts[i]));
        const length = pts.length >= 2 ? cum[cum.length - 1] : Math.max(0, Number(fallbackM) || 0);
        return { type, pts, cum, length, along: 0, idx: 0 };
    }

    // Closest point on the leg: metres along it, metres away from it, segment index
    function project(leg, lat, lng, hintIdx) {
        const n = leg.pts.length;
        if (n < 2) return null;
        const cosLat = Math.cos(toRad(lat));
        const mLat = 111195, mLng = 111195 * cosLat;
        const evalSeg = (i) => {
            const a = leg.pts[i], b = leg.pts[i + 1];
            const ax = (a[1] - lng) * mLng, ay = (a[0] - lat) * mLat;
            const bx = (b[1] - lng) * mLng, by = (b[0] - lat) * mLat;
            const vx = bx - ax, vy = by - ay;
            const len2 = vx * vx + vy * vy;
            const t = len2 > 0 ? Math.max(0, Math.min(1, (-ax * vx - ay * vy) / len2)) : 0;
            const px = ax + t * vx, py = ay + t * vy;
            return { off: Math.hypot(px, py), along: leg.cum[i] + t * (leg.cum[i + 1] - leg.cum[i]), idx: i };
        };
        let best = null;
        const scan = (from, to) => {
            for (let i = Math.max(0, from); i < Math.min(n - 1, to); i++) {
                const r = evalSeg(i);
                if (!best || r.off < best.off) best = r;
            }
        };
        // Look near where we were first (routes can pass the same street twice), then everywhere
        scan((hintIdx || 0) - 25, (hintIdx || 0) + 80);
        if (!best || best.off > 60) scan(0, n - 1);
        return best;
    }

    function jeepDefaultMps(date, normalKph) {
        const h = date.getHours() + date.getMinutes() / 60;
        const rush = (h >= 6.5 && h < 9) || (h >= 16.5 && h < 19.5);
        return (rush ? Math.min(normalKph, 14) : normalKph) / 3.6;
    }

    function createTracker(options) {
        const opt = Object.assign({
            walkKph: 4.0,          // starting walking pace (door to door in town)
            jeepKph: 20,           // normal jeep speed outside rush hour
            boardingWaitSec: 180,  // expected wait for a jeep at the stop
            minWaitReserveSec: 60, // once the expected wait is used up, still count 1 min
            jeepWindowSec: 180     // look back this far to measure real jeep progress
        }, options || {});

        let legs = [];
        let extraSec = 0;
        let cur = 0;                 // index into legs
        let walkMps = opt.walkKph / 3.6;
        let samples = [];            // jeep progress samples {t, along}
        let walkSamples = [];        // walking progress samples {t, along, leg}
        let waitStart = null;
        let boarded = false;
        let lastFix = null;          // {t, lat, lng, along, leg}

        function setLegs(def) {
            const d = def || {};
            legs = [makeLeg('walk', d.walk || [], d.walkFallbackM)];
            if (!d.walkOnly) {
                const jeep = makeLeg('jeep', d.jeep || [], d.jeepFallbackM);
                if (jeep.length > 0) legs.push(jeep);
                const fw = makeLeg('final_walk', d.finalWalk || [], d.finalWalkFallbackM);
                if (fw.length > 0) legs.push(fw);
            }
            legs = legs.filter((l, i) => i === 0 || l.length > 0);
            extraSec = Math.max(0, Number(d.extraSec) || 0);
            cur = Math.max(0, Math.min(legs.length - 1, d.startLeg | 0));
            samples = [];
            walkSamples = [];
            waitStart = null;
            boarded = false;
            lastFix = null;
        }

        function legOf(type) { return legs.findIndex(l => l.type === type); }

        // legHint: the planner's own leg (0 = first walk, 1 = jeep). We never go backwards.
        function onFix(fix) {
            if (!legs.length || !fix || !isFinite(fix.lat) || !isFinite(fix.lng)) return;
            const t = fix.t || Date.now();
            const speed = (typeof fix.speed === 'number' && isFinite(fix.speed) && fix.speed >= 0) ? fix.speed : null;

            const jeepIdx = legOf('jeep');
            const fwIdx = legOf('final_walk');
            if (fix.legHint === 1 && jeepIdx > cur) cur = jeepIdx;

            // Off the bus and onto the last walk: closer to the final-walk path near the end of the ride
            if (legs[cur] && legs[cur].type === 'jeep' && fwIdx > cur) {
                const pj = project(legs[cur], fix.lat, fix.lng, legs[cur].idx);
                const pf = project(legs[fwIdx], fix.lat, fix.lng, 0);
                const nearEnd = pj && (legs[cur].length - pj.along) < 120;
                if (pf && pj && nearEnd && pf.off + 5 < pj.off && (speed === null || speed < 2.5)) cur = fwIdx;
            }
            // Walk-only legs pass to the next one when we are at their end
            const leg = legs[cur];
            const p = project(leg, fix.lat, fix.lng, leg.idx);
            if (p) {
                // Never jump backwards by GPS noise; a real wrong turn is handled by the planner's reroute
                if (p.along >= leg.along - 25 || p.off > 80) {
                    leg.along = Math.max(0, Math.min(leg.length, p.along));
                    leg.idx = p.idx;
                }
                if (leg.type !== 'jeep' && leg.length - leg.along < 15 && cur < legs.length - 1) cur++;
            }

            // Learn walking pace (only plausible walking speeds). Without a GPS speed, measure progress
            // along the path over at least 20 s, so a few metres of GPS jitter don't count as walking.
            const onFoot = legs[cur].type !== 'jeep';
            let observed = speed;
            if (onFoot) {
                walkSamples.push({ t, along: legs[cur].along, leg: cur });
                walkSamples = walkSamples.filter(s => s.leg === cur && t - s.t <= 60000);
                if (observed === null) {
                    const first = walkSamples[0];
                    const span = (t - first.t) / 1000;
                    observed = span >= 20 ? Math.max(0, legs[cur].along - first.along) / span : null;
                }
            }
            if (onFoot && observed !== null && observed >= 0.4 && observed <= 2.4) {
                walkMps = Math.max(0.8, Math.min(1.9, walkMps * 0.85 + observed * 0.15));
            }

            // Jeep leg: waiting at the stop until we are clearly riding
            if (legs[cur].type === 'jeep') {
                samples.push({ t, along: legs[cur].along });
                samples = samples.filter(s => t - s.t <= opt.jeepWindowSec * 1000);
                const moved60 = samples.length > 1 ? legs[cur].along - (samples.find(s => t - s.t <= 60000) || samples[0]).along : 0;
                if (!boarded && ((speed !== null && speed >= 3) || moved60 > 150)) {
                    boarded = true;
                    // Measure the ride from here on, not the minutes spent waiting at the stop
                    samples = samples.filter(s => t - s.t <= 30000);
                }
                if (!boarded && waitStart === null) waitStart = t;
            }

            lastFix = { t, lat: fix.lat, lng: fix.lng, along: legs[cur].along, leg: cur };
        }

        function jeepMps(t) {
            const base = jeepDefaultMps(new Date(t), opt.jeepKph);
            if (!boarded || samples.length < 2) return base;
            const first = samples[0], last = samples[samples.length - 1];
            const span = (last.t - first.t) / 1000;
            // Include time since the last fix, so a long stop in traffic slows the estimate down
            const sinceLast = Math.max(0, (t - last.t) / 1000);
            const totalSpan = span + Math.min(sinceLast, opt.jeepWindowSec);
            if (totalSpan < 45) return base;
            const rate = Math.max(1.5, Math.min(12, (last.along - first.along) / totalSpan));
            const w = Math.min(1, totalSpan / opt.jeepWindowSec) * 0.7;
            return w * rate + (1 - w) * base;
        }

        function remaining(tNow) {
            const t = tNow || Date.now();
            if (!legs.length) return { seconds: 0, meters: 0, phase: 'done', walkKph: walkMps * 3.6, jeepKph: 0 };
            let sec = 0, meters = 0;
            let phase = legs[cur].type === 'jeep' ? (boarded ? 'riding' : 'waiting') : (legs[cur].type === 'final_walk' ? 'final_walk' : 'walking');
            for (let i = cur; i < legs.length; i++) {
                const leg = legs[i];
                const left = Math.max(0, leg.length - (i === cur ? leg.along : 0));
                meters += left;
                if (leg.type === 'jeep') {
                    if (i > cur) {
                        sec += opt.boardingWaitSec + left / jeepDefaultMps(new Date(t), opt.jeepKph);
                    } else {
                        if (!boarded) {
                            const waited = waitStart ? (t - waitStart) / 1000 : 0;
                            sec += Math.max(opt.minWaitReserveSec, opt.boardingWaitSec - waited);
                        }
                        sec += left / jeepMps(t);
                    }
                } else {
                    sec += left / walkMps;
                }
            }
            sec += extraSec;
            return { seconds: sec, meters, phase, walkKph: walkMps * 3.6, jeepKph: jeepMps(t) * 3.6 };
        }

        return { setLegs, onFix, remaining, get leg() { return legs[cur] ? legs[cur].type : null; } };
    }

    // Smooth what we show so the minutes don't jump around on every GPS fix:
    // move the previous value forward in time, then ease 35% toward the new estimate.
    function createSmoother() {
        let shown = null, at = 0;
        return {
            next(target, tNow) {
                const t = tNow || Date.now();
                if (shown === null || !isFinite(shown)) { shown = target; at = t; return shown; }
                const predicted = Math.max(0, shown - (t - at) / 1000);
                // Big changes (reroute, boarding) apply at once
                shown = Math.abs(target - predicted) > 300 ? target : predicted + (target - predicted) * 0.35;
                at = t;
                return Math.max(0, shown);
            },
            reset() { shown = null; at = 0; }
        };
    }

    const api = { createTracker, createSmoother, jeepDefaultMps, distM };
    root.CalzadaLiveEta = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
