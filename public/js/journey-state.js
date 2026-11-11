/**
 * Calzada journey state: on every GPS fix, which part of the trip the commuter is in.
 *
 *   walking     on the way to the jeep (the walk line)
 *   waiting     at the stop or terminal; the jeep has not moved yet
 *   riding      on the jeep: moving like a jeep along the jeep line. Stops in traffic, loading
 *               and red lights stay riding; being still never turns a ride back into a walk.
 *   final_walk  off the jeep, walking to the place (or to the next jeep's stop)
 *
 * Events on the way (result.events): boarded, got_off, missed_stop, wrong_jeep, left_stop.
 *
 * The speed of the jeep, not reaching an exact point, is what turns a trip into riding, so a jeep
 * flagged anywhere along its route is picked up. The numbers below are the starting points from the
 * plan ("Calzada: Live Journey Tracking Plan"); tune them from recorded trips
 * (scripts/test-journey-state.mjs replays them).
 *
 * Pure logic: no DOM, no map, no clock (every time comes from the fix). Coordinates are [lat, lng].
 */
(function (root) {
    'use strict';

    const DEFAULTS = {
        maxAccuracyM: 50,        // a fix less accurate than this never changes the state
        jumpMps: 35,             // a fix implying more than this (126 km/h) is a GPS jump: ignored
        // Walking -> waiting
        boardSnapM: 40,          // this close to the planned boarding point: waiting
        waitNearLineM: 30,       // or this close to the jeep line ...
        waitNearBoardM: 80,      // ... near the boarding point or where flagging is allowed ...
        waitStillSec: 30,        // ... and staying put (by position) for this long
        // Walking / waiting -> riding
        rideNearLineM: 35,       // on the jeep line
        rideFastMps: 4,          // faster than this (14 km/h; walking tops out near 2 m/s) ...
        rideFastFixes: 3,        // ... for this many fixes ...
        rideFastSec: 10,         // ... across this long
        rideProgressM: 150,      // or this far along the line ...
        rideProgressSec: 60,     // ... within this long ...
        rideBurstMps: 4.5,       // ... with at least one burst faster than this (a jog never has one)
        // Riding -> final walk
        alightNearM: 120,        // this close to the planned stop ...
        alightSlowMps: 2,        // ... slower than this ...
        alightSlowSec: 20,       // ... for this long
        onFinalWalkM: 25,        // or on the last walk line at walking speed
        walkMaxMps: 2.5,
        offEarlyM: 40,           // got off early: walking this far off the jeep line ...
        offEarlySec: 30,         // ... for this long
        // Riding, something is off
        missedPastM: 200,        // still riding this far past the planned stop
        wrongOffM: 80,           // at jeep speed this far off the jeep line ...
        wrongSec: 30,            // ... for this long: another jeep
        // Waiting -> walking
        leftStopM: 100,
        leftStopSec: 30
    };

    const STATES = ['walking', 'waiting', 'riding', 'final_walk'];
    const LEG_OF = { walking: 'walk', waiting: 'jeep', riding: 'jeep', final_walk: 'final_walk' };
    const LEG_INDEX = { walking: 0, waiting: 1, riding: 1, final_walk: 2 };

    const R = 6371000;
    const toRad = (d) => d * Math.PI / 180;
    function distM(a, b) {
        const dLat = toRad(b[0] - a[0]);
        const dLng = toRad(b[1] - a[1]);
        const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
    }

    function makeLeg(coords) {
        const pts = Array.isArray(coords)
            ? coords.filter((c) => Array.isArray(c) && c.length >= 2 && isFinite(c[0]) && isFinite(c[1])).map((c) => [+c[0], +c[1]])
            : [];
        const cum = [0];
        for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + distM(pts[i - 1], pts[i]));
        return { pts, cum, length: pts.length >= 2 ? cum[cum.length - 1] : 0, along: 0, idx: 0 };
    }

    // Closest point of the leg: { off (m away), along (m from its start), idx (segment), pt [lat, lng] }
    function project(leg, lat, lng, hintIdx) {
        const n = leg ? leg.pts.length : 0;
        if (n === 0) return null;
        if (n === 1) return { off: distM([lat, lng], leg.pts[0]), along: 0, idx: 0, pt: leg.pts[0].slice() };
        const mLat = 111195, mLng = 111195 * Math.cos(toRad(lat));
        let best = null;
        const evalSeg = (i) => {
            const a = leg.pts[i], b = leg.pts[i + 1];
            const ax = (a[1] - lng) * mLng, ay = (a[0] - lat) * mLat;
            const bx = (b[1] - lng) * mLng, by = (b[0] - lat) * mLat;
            const vx = bx - ax, vy = by - ay;
            const len2 = vx * vx + vy * vy;
            const t = len2 > 0 ? Math.max(0, Math.min(1, (-ax * vx - ay * vy) / len2)) : 0;
            const px = ax + t * vx, py = ay + t * vy;
            const off = Math.hypot(px, py);
            if (!best || off < best.off) {
                best = { off, along: leg.cum[i] + t * (leg.cum[i + 1] - leg.cum[i]), idx: i, pt: [lat + py / mLat, lng + px / mLng] };
            }
        };
        // Near where we were first (a route can pass the same street twice), then everywhere
        const h = hintIdx || 0;
        for (let i = Math.max(0, h - 25); i < Math.min(n - 1, h + 80); i++) evalSeg(i);
        if (!best || best.off > 60) for (let i = 0; i < n - 1; i++) evalSeg(i);
        return best;
    }

    const median = (arr) => {
        const a = arr.filter((v) => isFinite(v)).sort((x, y) => x - y);
        if (!a.length) return null;
        const m = Math.floor(a.length / 2);
        return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
    };

    function create(def, options) {
        const opt = Object.assign({}, DEFAULTS, options || {});
        const d = def || {};
        const walkOnly = !!d.walkOnly;
        const legs = {
            walk: makeLeg(d.walk),
            jeep: walkOnly ? makeLeg([]) : makeLeg(d.jeep),
            final_walk: walkOnly ? makeLeg([]) : makeLeg(d.finalWalk)
        };
        const hasJeep = legs.jeep.pts.length >= 2;
        // The jeep line can start before the planned boarding point (the jeep's own road behind it),
        // so a jeep flagged earlier is still on the line: jeepBoardM is where the planned point is on it
        const jeepBoardM = hasJeep ? Math.max(0, Math.min(legs.jeep.length, Number(d.jeepBoardM) || 0)) : 0;
        const boardPt = hasJeep ? pointAt(legs.jeep, jeepBoardM) : null;
        const alightPt = hasJeep ? legs.jeep.pts[legs.jeep.pts.length - 1] : null;
        const canBoardAt = typeof d.canBoardAt === 'function' ? d.canBoardAt : () => true;

        let state = STATES.includes(d.startState) ? d.startState : 'walking';
        if (walkOnly || !hasJeep) state = state === 'final_walk' ? 'final_walk' : 'walking';
        let since = null;            // time the state began (set by the first fix)
        let hist = [];               // recent good fixes (last 90 s)
        let lastGood = null;
        let lastAny = null;
        const held = {};             // condition -> time it has held since
        let fastCount = 0;
        let fastStartAlong = null;
        let boardedAt = null;        // { t, along } when riding began
        let notified = { missed: false, wrong: false };
        let finalWalkHits = 0;
        let jumps = 0;
        let waitPt = null;           // where the waiting began
        if (state === 'riding' || state === 'final_walk') legs.jeep.along = jeepBoardM;

        function pointAt(leg, m) {
            if (leg.pts.length < 2) return leg.pts[0] ? leg.pts[0].slice() : null;
            const target = Math.max(0, Math.min(leg.length, m));
            let i = 1;
            while (i < leg.cum.length - 1 && leg.cum[i] < target) i++;
            const a = leg.pts[i - 1], b = leg.pts[i];
            const span = leg.cum[i] - leg.cum[i - 1];
            const t = span > 0 ? (target - leg.cum[i - 1]) / span : 0;
            return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        }

        // How long `cond` has been true without a break (0 when false)
        function hold(name, cond, t) {
            if (!cond) { held[name] = null; return 0; }
            if (held[name] == null) held[name] = t;
            return (t - held[name]) / 1000;
        }

        function enter(next, t, events, extra) {
            const prev = state;
            if (next === prev) return;
            state = next;
            since = t;
            waitPt = next === 'waiting' && lastGood ? [lastGood.lat, lastGood.lng] : null;
            Object.keys(held).forEach((k) => { held[k] = null; });
            fastCount = 0;
            fastStartAlong = null;
            finalWalkHits = 0;
            events.push(Object.assign({ type: 'state', from: prev, to: next, t }, extra || {}));
        }

        // Stayed in one place for `sec`: nearly every fix since then (all but one in ten) within
        // 10 m, plus half the GPS accuracy, of their average position. Positions, not speeds, so a slow walk along the road
        // is not "still" (30 s at 1.3 m/s spreads 39 m) and one noisy speed is no reset.
        function stayedPut(f, sec) {
            const startT = f.t - sec * 1000;
            let from = -1;
            for (let i = hist.length - 1; i >= 0; i--) { if (hist[i].t <= startT) { from = i; break; } }
            if (from < 0) return false;
            const win = hist.slice(from);
            const mean = (a) => [a.reduce((s, h) => s + h.lat, 0) / a.length, a.reduce((s, h) => s + h.lng, 0) / a.length];
            const c = mean(win);
            const radius = 10 + Math.min(8, f.acc / 2);
            const inside = win.filter((h) => distM([h.lat, h.lng], c) <= radius).length;
            if (inside < Math.max(win.length - 1, Math.ceil(win.length * 0.9))) return false;
            // The first and the second half of the time in the same place: still all along, not a
            // walk that just stopped (that moves the first half's average by several metres)
            const mid = win.length >> 1;
            if (mid < 2) return true;
            return distM(mean(win.slice(0, mid)), mean(win.slice(mid))) <= 3 + Math.min(4, f.acc / 8);
        }

        // Riding, by speed and progress along the jeep line
        function looksLikeRiding(f) {
            if (!hasJeep || !f.pj || f.pj.off > opt.rideNearLineM) {
                fastCount = 0; fastStartAlong = null; held.fast = null;
                return null;
            }
            // A: fast for 3 fixes across 10 s, moving forward along the line
            if (f.fast !== null && f.fast > opt.rideFastMps) {
                if (fastCount === 0) fastStartAlong = f.pj.along;
                fastCount++;
            } else { fastCount = 0; fastStartAlong = null; }
            const fastSec = hold('fast', fastCount > 0, f.t);
            if (fastCount >= opt.rideFastFixes && fastSec >= opt.rideFastSec && f.pj.along - fastStartAlong >= 20) return 'speed';
            // B: 150 m further along the line within 60 s, all on the line, with a jeep-like burst
            const win = hist.filter((h) => f.t - h.t <= opt.rideProgressSec * 1000 && h.pj && h.pj.off <= opt.rideNearLineM * 1.5);
            if (win.length >= 3) {
                const first = win[0];
                const progress = f.pj.along - first.pj.along;
                const burst = Math.max(...win.map((h) => (h.fast === null ? 0 : h.fast)));
                if (progress >= opt.rideProgressM && burst >= opt.rideBurstMps) return 'progress';
            }
            return null;
        }

        function result(events, f) {
            const legName = LEG_OF[state];
            const leg = legs[legName];
            const p = f ? (legName === 'walk' ? f.pw : legName === 'jeep' ? f.pj : f.pf) : null;
            return {
                state,
                legName,
                legIndex: LEG_INDEX[state],
                changed: events.some((e) => e.type === 'state'),
                events,
                along: leg.along,
                legLength: leg.length,
                remainingM: Math.max(0, leg.length - leg.along),
                off: p ? p.off : null,
                point: p ? p.pt : null,
                jeepOff: f && f.pj ? f.pj.off : null,
                speed: f ? f.speed : null,
                good: f ? f.good : false,
                since,
                boardedAt
            };
        }

        function advance(leg, p) {
            if (!p) return;
            // Never jump backwards by GPS noise; a real wrong turn is the planner's reroute
            if (p.along >= leg.along - 25 || p.off > 80) {
                leg.along = Math.max(0, Math.min(leg.length, p.along));
                leg.idx = p.idx;
            }
        }

        function evaluate(f, events) {
            if (since === null) since = f.t;
            const pj = f.pj;
            const distBoard = boardPt ? distM([f.lat, f.lng], boardPt) : Infinity;

            if (state === 'walking') {
                if (!hasJeep) return;
                const how = looksLikeRiding(f);
                if (how) {
                    legs.jeep.along = Math.max(0, Math.min(legs.jeep.length, pj.along));
                    legs.jeep.idx = pj.idx;
                    boardedAt = { t: f.t, along: pj.along };
                    enter('riding', f.t, events, { reason: how });
                    events.push({ type: 'boarded', t: f.t, alongM: Math.round(pj.along), early: pj.along < jeepBoardM - 30, waitedSec: 0 });
                    return;
                }
                if (distBoard <= opt.boardSnapM) { enter('waiting', f.t, events, { reason: 'at_stop' }); return; }
                const nearLine = pj && pj.off <= opt.waitNearLineM && (distBoard <= opt.waitNearBoardM || canBoardAt([f.lat, f.lng]));
                if (nearLine && stayedPut(f, opt.waitStillSec)) enter('waiting', f.t, events, { reason: 'still_on_line' });
                return;
            }

            if (state === 'waiting') {
                const how = looksLikeRiding(f);
                if (how) {
                    const waitedSec = Math.max(0, Math.round((f.t - since) / 1000));
                    legs.jeep.along = Math.max(0, Math.min(legs.jeep.length, pj.along));
                    legs.jeep.idx = pj.idx;
                    boardedAt = { t: f.t, along: pj.along };
                    enter('riding', f.t, events, { reason: how });
                    events.push({ type: 'boarded', t: f.t, alongM: Math.round(pj.along), early: pj.along < jeepBoardM - 30, waitedSec });
                    return;
                }
                // Walking off again: away from the jeep line, or along it away from where you waited
                const away = (!pj || pj.off > opt.leftStopM || distM([f.lat, f.lng], waitPt || [f.lat, f.lng]) > opt.leftStopM) && distBoard > opt.leftStopM;
                const awaySec = hold('away', away && f.speed !== null && f.speed >= 0.4 && f.speed <= opt.walkMaxMps, f.t);
                if (awaySec >= opt.leftStopSec) {
                    enter('walking', f.t, events, { reason: 'left_stop' });
                    events.push({ type: 'left_stop', t: f.t });
                }
                return;
            }

            if (state === 'riding') {
                if (pj) advance(legs.jeep, pj);
                const remaining = Math.max(0, legs.jeep.length - legs.jeep.along);
                const distAlight = alightPt ? distM([f.lat, f.lng], alightPt) : Infinity;
                const fast = f.speed !== null && f.speed > opt.walkMaxMps;

                if (!notified.missed && remaining < 40 && distAlight > opt.missedPastM && fast) {
                    notified.missed = true;
                    events.push({ type: 'missed_stop', t: f.t, pastM: Math.round(distAlight) });
                }
                // Off the jeep near the planned stop (or after passing it)
                const slowSec = hold('slow_near_stop', (remaining <= opt.alightNearM || notified.missed) && f.speed !== null && f.speed < opt.alightSlowMps, f.t);
                if (slowSec >= opt.alightSlowSec) {
                    legs.jeep.along = legs.jeep.length;
                    enter('final_walk', f.t, events, { reason: 'slow_near_stop' });
                    events.push({ type: 'got_off', t: f.t, early: false });
                    return;
                }
                // On the last walk line at walking speed, near the end of the ride
                const pf = f.pf;
                const onFw = legs.final_walk.pts.length >= 2 && pf && pf.off <= opt.onFinalWalkM && (!pj || pf.off + 10 < pj.off)
                    && f.speed !== null && f.speed <= opt.walkMaxMps && remaining <= 250;
                finalWalkHits = onFw ? finalWalkHits + 1 : 0;
                if (finalWalkHits >= 2) {
                    legs.jeep.along = legs.jeep.length;
                    enter('final_walk', f.t, events, { reason: 'on_final_walk' });
                    events.push({ type: 'got_off', t: f.t, early: false });
                    return;
                }
                const offLine = !pj || pj.off > opt.wrongOffM;
                const wrongSec = hold('wrong', offLine && fast && remaining > 150 && !notified.missed, f.t);
                if (!notified.wrong && wrongSec >= opt.wrongSec) {
                    notified.wrong = true;
                    events.push({ type: 'wrong_jeep', t: f.t, offM: pj ? Math.round(pj.off) : null });
                }
                // Walking away from the jeep's road before the stop: got off early
                // (once started it holds down to 15 m closer, so GPS noise around 40 m is no reset)
                const offLimit = held.off_early != null ? opt.offEarlyM - 15 : opt.offEarlyM;
                const walkingOff = (!pj || pj.off > offLimit) && f.speed !== null && f.speed >= 0.4 && f.speed <= opt.walkMaxMps;
                const earlySec = hold('off_early', walkingOff, f.t);
                if (earlySec >= opt.offEarlySec) {
                    enter('final_walk', f.t, events, { reason: 'got_off_early' });
                    events.push({ type: 'got_off', t: f.t, early: true, remainingM: Math.round(remaining) });
                }
                return;
            }

            if (state === 'final_walk') {
                if (f.pf) advance(legs.final_walk, f.pf);
            }
        }

        // fix: { t (ms), lat, lng, accuracy (m, optional), speed (m/s, optional) }
        function onFix(fix) {
            const events = [];
            if (!fix || !isFinite(fix.lat) || !isFinite(fix.lng)) return result(events, null);
            const t = isFinite(fix.t) ? +fix.t : (lastAny ? lastAny.t + 1000 : 0);
            const acc = isFinite(fix.accuracy) && fix.accuracy > 0 ? +fix.accuracy : 25;
            const gps = (typeof fix.speed === 'number' && isFinite(fix.speed) && fix.speed >= 0) ? fix.speed : null;
            const f = { t, lat: +fix.lat, lng: +fix.lng, acc, gps, synthetic: !!fix.synthetic };
            f.pw = project(legs.walk, f.lat, f.lng, legs.walk.idx);
            f.pj = hasJeep ? project(legs.jeep, f.lat, f.lng, legs.jeep.idx) : null;
            f.pf = legs.final_walk.pts.length ? project(legs.final_walk, f.lat, f.lng, legs.final_walk.idx) : null;
            lastAny = f;

            // A jump: farther from the last good fix than anyone travels in that time. Three in a row
            // mean the last good fix was the wrong one, so the new position is taken.
            let seg = null;
            if (lastGood && t - lastGood.t >= 500) seg = distM([lastGood.lat, lastGood.lng], [f.lat, f.lng]) / ((t - lastGood.t) / 1000);
            const jump = seg !== null && seg > opt.jumpMps;
            jumps = jump ? jumps + 1 : 0;
            if (jumps >= 3) { jumps = 0; hist = []; }
            f.good = acc <= opt.maxAccuracyM && (!jump || hist.length === 0) && t >= (lastGood ? lastGood.t : -Infinity);
            if (!f.good) return result(events, f);

            // Speed: the phone's own (Doppler: not fooled by position noise), else the distance covered
            // over the last 10 s or more (a few metres of noise per fix would make 1 s speeds useless)
            let derived = null;
            let base = null;
            for (let i = hist.length - 1; i >= 0; i--) { if (t - hist[i].t >= 10000) { base = hist[i]; break; } }
            if (!base && hist.length && t - hist[0].t >= 4000) base = hist[0];
            if (base) derived = distM([base.lat, base.lng], [f.lat, f.lng]) / ((t - base.t) / 1000);
            f.speed = f.synthetic ? 0 : (gps !== null ? gps : derived);
            // For "moving like a jeep": the median of the last few speeds, so one noisy reading of a
            // jog never looks like a jeep (with the phone's speed, the last 3; else the last 5)
            const recent = hist.slice(gps !== null ? -2 : -4).map((h) => h.speed).concat([f.speed]);
            f.fast = f.synthetic ? 0 : median(recent);

            hist.push(f);
            hist = hist.filter((h) => t - h.t <= 90000);
            lastGood = f;

            // Progress along the current leg (before transitions, so a new state starts from here)
            if (state === 'walking' && f.pw) advance(legs.walk, f.pw);
            evaluate(f, events);
            return result(events, f);
        }

        // Once a second without a fix: a phone that stands still often sends none, so time still passes
        function tick(tNow) {
            if (!lastGood || !isFinite(tNow) || tNow - lastGood.t < 5000) return result([], null);
            if (lastAny && lastAny.t > lastGood.t && !lastAny.good) return result([], null);
            return onFix({ t: tNow, lat: lastGood.lat, lng: lastGood.lng, accuracy: lastGood.acc, speed: 0, synthetic: true });
        }

        // Set by the planner (a mode switch, a reload, a terminal switch)
        function setState(next, t) {
            if (!STATES.includes(next)) return;
            const events = [];
            if (next === 'riding' && state !== 'riding') boardedAt = { t: t || 0, along: legs.jeep.along };
            enter(next, t || (lastAny ? lastAny.t : 0), events, { reason: 'set' });
            return events;
        }

        function snapshot() {
            return {
                state,
                since,
                boardedAt,
                notified: Object.assign({}, notified),
                along: { walk: legs.walk.along, jeep: legs.jeep.along, final_walk: legs.final_walk.along }
            };
        }

        function restore(s) {
            if (!s || !STATES.includes(s.state)) return;
            if ((walkOnly || !hasJeep) && s.state !== 'walking' && s.state !== 'final_walk') return;
            state = s.state;
            since = isFinite(s.since) ? s.since : null;
            boardedAt = s.boardedAt && isFinite(s.boardedAt.t) ? s.boardedAt : null;
            notified = { missed: !!(s.notified && s.notified.missed), wrong: !!(s.notified && s.notified.wrong) };
            if (s.along) {
                ['walk', 'jeep', 'final_walk'].forEach((k) => {
                    if (isFinite(s.along[k])) legs[k].along = Math.max(0, Math.min(legs[k].length, s.along[k]));
                });
            }
        }

        return {
            onFix,
            tick,
            setState,
            snapshot,
            restore,
            get state() { return state; },
            get legIndex() { return LEG_INDEX[state]; },
            get since() { return since; },
            legLength: (name) => (legs[name] ? legs[name].length : 0),
            alongOf: (name) => (legs[name] ? legs[name].along : 0),
            // Metres along a leg of a point (e.g. a step's maneuver), for steps by distance
            projectOn: (name, lat, lng) => {
                const p = legs[name] ? project(legs[name], lat, lng, 0) : null;
                return p ? { along: p.along, off: p.off } : null;
            },
            boardPoint: () => (boardPt ? boardPt.slice() : null),
            jeepBoardM
        };
    }

    const api = { create, DEFAULTS, STATES, LEG_INDEX, distM, VERSION: '1.0.0' };
    root.CalzadaJourneyState = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
