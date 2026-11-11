// scripts/test-journey-state.mjs
// Replays trips through public/js/journey-state.js and checks when each state starts.
//   node scripts/test-journey-state.mjs                 made-up trips on the real jeep routes
//   node scripts/test-journey-state.mjs trace.json ...  also replays trips recorded with /planner?trace=1
// A recorded trace that carries "expect" (e.g. { "riding": [120, 180] }: riding must start between
// 120 s and 180 s after the first fix) is checked against it; without one its states are only listed.

import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.resolve(here, '../public');
const require = createRequire(import.meta.url);
const J = require(path.join(pub, 'js', 'journey-state.js'));
const T = require(path.join(pub, 'js', 'transit-engine.js'));
const data = JSON.parse(readFileSync(path.join(pub, 'data', 'transit-routes.json'), 'utf8'));

let passed = 0, failed = 0;
const check = (name, ok, detail) => {
    if (ok) { passed++; console.log(`PASS  ${name}`); }
    else { failed++; console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ''}`); }
};

// ── Geometry helpers ([lat, lng], metres) ─────────────────────────────────────────
const distM = J.distM;
const mPerLat = 111195;
const offsetPt = (p, northM, eastM) => [p[0] + northM / mPerLat, p[1] + eastM / (mPerLat * Math.cos(p[0] * Math.PI / 180))];
function lineOf(pts) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + distM(pts[i - 1], pts[i]));
    return { pts, cum, len: cum[cum.length - 1] };
}
function at(line, m) {
    const x = Math.max(0, Math.min(line.len, m));
    let i = 1;
    while (i < line.cum.length - 1 && line.cum[i] < x) i++;
    const a = line.pts[i - 1], b = line.pts[i], span = line.cum[i] - line.cum[i - 1];
    const t = span > 0 ? (x - line.cum[i - 1]) / span : 0;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
function slice(line, fromM, toM) {
    const out = [at(line, fromM)];
    for (let i = 0; i < line.pts.length; i++) if (line.cum[i] > fromM && line.cum[i] < toM) out.push(line.pts[i]);
    out.push(at(line, toM));
    return out;
}
// Unit vector (north, east) of the line at m, and its left normal
function dirAt(line, m) {
    const a = at(line, Math.max(0, m - 5)), b = at(line, Math.min(line.len, m + 5));
    const n = (b[0] - a[0]) * mPerLat, e = (b[1] - a[1]) * mPerLat * Math.cos(a[0] * Math.PI / 180);
    const L = Math.hypot(n, e) || 1;
    return { n: n / L, e: e / L, ln: -e / L, le: n / L };
}

// Seeded noise, so every run is the same
let seed = Number(process.env.SEED) || 7;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const gauss = () => { let u = 0, v = 0; while (!u) u = rand(); while (!v) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// ── Trip builder: segments of movement, sampled once a second ────────────────────────
// seg: { kind, line, fromM, toM, mps } moves along a line; { kind: 'still', pt, sec } stands;
// { kind: 'toward', from, to, mps } goes straight. mark: name a moment for the checks.
function buildTrace(segs, o = {}) {
    const fixes = [];
    const marks = {};
    let t = 0;
    const noiseM = o.noiseM ?? 4;
    const push = (p, v) => {
        const q = offsetPt(p, gauss() * noiseM, gauss() * noiseM);
        const speed = o.noSpeed ? null : Math.max(0, v + gauss() * 0.3);
        fixes.push({ t: t * 1000, lat: q[0], lng: q[1], accuracy: o.accuracy ?? 8, speed });
    };
    for (const s of segs) {
        if (s.mark) marks[s.mark] = t;
        if (s.kind === 'still') {
            for (let i = 0; i < s.sec; i++) { t += 1; if (!s.silent) push(s.pt, 0); }
        } else if (s.kind === 'line') {
            const dist = s.toM - s.fromM;
            const steps = Math.max(1, Math.round(Math.abs(dist) / s.mps));
            for (let i = 1; i <= steps; i++) { t += 1; push(at(s.line, s.fromM + dist * i / steps), s.mps); }
        } else if (s.kind === 'toward') {
            const d = distM(s.from, s.to);
            const steps = Math.max(1, Math.round(d / s.mps));
            for (let i = 1; i <= steps; i++) {
                t += 1;
                const k = i / steps;
                push([s.from[0] + (s.to[0] - s.from[0]) * k, s.from[1] + (s.to[1] - s.from[1]) * k], s.mps);
            }
        } else if (s.kind === 'raw') {
            t += 1;
            fixes.push({ t: t * 1000, lat: s.pt[0], lng: s.pt[1], accuracy: s.accuracy ?? 8, speed: s.speed ?? null });
        }
    }
    return { fixes, marks, end: t };
}

// Runs a trace; returns when each state began (s) and the events
function replay(def, fixes, opts) {
    const js = J.create(def, opts);
    const firstAt = {};
    const lastAt = {};
    const events = [];
    let lastT = 0;
    const take = (r, t) => {
        for (const e of r.events) {
            events.push({ ...e, at: Math.round(t / 1000) });
            if (e.type === 'state' && firstAt[e.to] === undefined) firstAt[e.to] = Math.round(t / 1000);
            if (e.type === 'state') lastAt[e.to] = Math.round(t / 1000);
        }
    };
    for (const f of fixes) {
        // The planner's once-a-second refresh between fixes
        for (let tt = lastT + 1000; tt < f.t; tt += 1000) take(js.tick(tt), tt);
        take(js.onFix(f), f.t);
        lastT = f.t;
    }
    return { js, firstAt, lastAt, events, final: js.state };
}

// ── The jeep routes ──────────────────────────────────────────────────────────────────
const planner = T.createPlanner(data, null);
const route = (id) => planner.routes.find((r) => r.id === id);
const lineFromRoute = (id) => lineOf(route(id).pts.map((p) => [p[0], p[1]]));

// Trip 1 (Drei, Nov 11): walk to the National Highway, flag a jeep to SM City Calamba
// Sta. Rosa – Calamba forward runs the highway into Calamba; board 3 km before its end
const sr = lineFromRoute('starosa-calamba');
const boardM = sr.len - 3000, alightM = sr.len - 300;
const jeepLine = lineOf(slice(sr, boardM, alightM));
const boardPt = jeepLine.pts[0], alightPt = jeepLine.pts[jeepLine.pts.length - 1];
const dB = dirAt(sr, boardM);
const homePt = offsetPt(boardPt, dB.ln * 300, dB.le * 300);          // 300 m off the highway
const walkLine = lineOf([homePt, offsetPt(boardPt, dB.ln * 150, dB.le * 150), boardPt]);
const dA = dirAt(sr, alightM);
const destPt = offsetPt(alightPt, -dA.ln * 150, -dA.le * 150);        // 150 m off the other side
const fwLine = lineOf([alightPt, destPt]);
const trip1Def = { walk: walkLine.pts, jeep: jeepLine.pts, finalWalk: fwLine.pts };

// A ride with traffic: moving 5–8 m/s, red lights, a loading stop
function rideSegs(line, fromM, toM, stops = []) {
    const segs = [];
    let m = fromM;
    const stopAt = stops.slice().sort((a, b) => a.m - b.m);
    for (const s of stopAt) {
        if (s.m <= m || s.m >= toM) continue;
        segs.push({ kind: 'line', line, fromM: m, toM: s.m, mps: s.mps || 6.5 });
        segs.push({ kind: 'still', pt: at(line, s.m), sec: s.sec });
        m = s.m;
    }
    segs.push({ kind: 'line', line, fromM: m, toM, mps: 6.5 });
    return segs;
}

function trip1Segs(o = {}) {
    return [
        { kind: 'line', line: walkLine, fromM: 0, toM: walkLine.len, mps: 1.3, mark: 'walk' },
        { kind: 'still', pt: boardPt, sec: o.waitSec ?? 240, mark: 'atStop', silent: !!o.silentWait },
        ...rideSegs(jeepLine, 0, jeepLine.len, [{ m: 900, sec: 45 }, { m: 1800, sec: o.longStop ?? 30 }]).map((s, i) => (i === 0 ? { ...s, mark: 'jeepMoves' } : s)),
        { kind: 'still', pt: alightPt, sec: 6, mark: 'stepOff' },
        { kind: 'line', line: fwLine, fromM: 0, toM: fwLine.len, mps: 1.3 }
    ];
}

const within = (v, lo, hi) => v !== undefined && v >= lo && v <= hi;
const fmt = (r, m) => `${m ? `marks ${JSON.stringify(m)} ` : ''}states ${JSON.stringify(r.events.filter((e) => e.type === 'state').map((e) => `${e.to}@${e.at}(${e.reason})`))} events ${JSON.stringify(r.events.filter((e) => e.type !== 'state').map((e) => `${e.type}@${e.at}`))} final ${r.final}`;

// 1. Flag a jeep on the highway (with the phone's speed)
{
    const tr = buildTrace(trip1Segs());
    const r = replay(trip1Def, tr.fixes);
    const m = tr.marks;
    check('Highway flag: waiting starts on reaching the stop (40 m before it at most)', within(r.firstAt.waiting, m.atStop - 42, m.atStop + 35), fmt(r, tr.marks));
    check('Highway flag: riding within 30 s of the jeep moving', within(r.firstAt.riding, m.jeepMoves, m.jeepMoves + 30), fmt(r, tr.marks));
    check('Highway flag: never riding while walking or waiting', r.firstAt.riding >= m.jeepMoves, fmt(r, tr.marks));
    check('Highway flag: red lights and loading stay riding', r.firstAt.final_walk >= m.stepOff - 25, fmt(r, tr.marks));
    check('Highway flag: last walk within 30 s of stepping off', within(r.firstAt.final_walk, m.stepOff - 25, m.stepOff + 30) && r.final === 'final_walk', fmt(r, tr.marks));
    const boarded = r.events.find((e) => e.type === 'boarded');
    check('Highway flag: boarded event counts the wait', boarded && boarded.waitedSec >= 200, JSON.stringify(boarded));
}

// 2. Same trip, the phone gives no speed (speed from positions)
{
    const tr = buildTrace(trip1Segs(), { noSpeed: true });
    const r = replay(trip1Def, tr.fixes);
    const m = tr.marks;
    check('No GPS speed: riding within 30 s of the jeep moving', within(r.firstAt.riding, m.jeepMoves, m.jeepMoves + 30), fmt(r, tr.marks));
    check('No GPS speed: last walk within 30 s of stepping off', within(r.firstAt.final_walk, m.stepOff - 25, m.stepOff + 30), fmt(r, tr.marks));
}

// 3. Waiting at the terminal until the jeep fills (12 min), phone still and silent
{
    const tr = buildTrace(trip1Segs({ waitSec: 720, silentWait: true }));
    const r = replay(trip1Def, tr.fixes);
    const m = tr.marks;
    check('Terminal wait, silent phone: waiting through 12 min, then riding', r.firstAt.waiting <= m.atStop + 35 && within(r.firstAt.riding, m.jeepMoves, m.jeepMoves + 30), fmt(r, tr.marks));
}

// 4. Flagging somewhere else on the highway (not the planned point): still, on the line, 30 s
{
    const flagM = 400;  // 400 m past the planned point, after walking along the highway
    const tr = buildTrace([
        { kind: 'line', line: walkLine, fromM: 0, toM: walkLine.len, mps: 1.3 },
        { kind: 'line', line: jeepLine, fromM: 0, toM: flagM, mps: 1.3 },
        { kind: 'still', pt: at(jeepLine, flagM), sec: 120, mark: 'flag' },
        ...rideSegs(jeepLine, flagM, jeepLine.len).map((s, i) => (i === 0 ? { ...s, mark: 'jeepMoves' } : s))
    ]);
    const r = replay(trip1Def, tr.fixes);
    check('Flag elsewhere: walking along the highway is not riding', r.firstAt.riding >= tr.marks.jeepMoves, fmt(r, tr.marks));
    check('Flag elsewhere: waiting after standing on the line (15–45 s)', within(r.lastAt.waiting, tr.marks.flag + 15, tr.marks.flag + 45), fmt(r, tr.marks));
    check('Flag elsewhere: riding within 30 s', within(r.firstAt.riding, tr.marks.jeepMoves, tr.marks.jeepMoves + 30), fmt(r, tr.marks));
}

// 5. Walk-only along the jeep's road, then a 2-minute jog: never riding (with and without speed)
for (const noSpeed of [false, true]) {
    const tr = buildTrace([
        { kind: 'line', line: walkLine, fromM: 0, toM: walkLine.len, mps: 1.4 },
        { kind: 'line', line: jeepLine, fromM: 0, toM: 300, mps: 1.4 },
        { kind: 'line', line: jeepLine, fromM: 300, toM: 300 + 3.2 * 120, mps: 3.2 },
        { kind: 'line', line: jeepLine, fromM: 300 + 3.2 * 120, toM: 1200, mps: 1.4 }
    ], { noSpeed });
    const r = replay(trip1Def, tr.fixes);
    check(`Walk and jog on the jeep's road${noSpeed ? ' (no GPS speed)' : ''}: never riding`, r.firstAt.riding === undefined, fmt(r, tr.marks));
}

// 6. GPS trouble while walking: an 80 m jump and fixes worse than 100 m
{
    const segs = [
        { kind: 'line', line: walkLine, fromM: 0, toM: 120, mps: 1.3 },
        { kind: 'raw', pt: offsetPt(at(walkLine, 121), 80 * dB.n, 80 * dB.e), accuracy: 15 },
        { kind: 'line', line: walkLine, fromM: 123, toM: 200, mps: 1.3 },
        ...Array.from({ length: 20 }, (_, i) => ({ kind: 'raw', pt: offsetPt(at(walkLine, 200 + i), 60 * Math.sin(i), 90 * Math.cos(i)), accuracy: 120, speed: 9 })),
        { kind: 'line', line: walkLine, fromM: 220, toM: walkLine.len, mps: 1.3 },
        { kind: 'still', pt: boardPt, sec: 60 }
    ];
    for (const noSpeed of [false, true]) {
        const tr = buildTrace(segs, { noSpeed });
        const r = replay(trip1Def, tr.fixes);
        check(`GPS jump and 120 m fixes${noSpeed ? ' (no GPS speed)' : ''}: no false riding`, r.firstAt.riding === undefined && r.final === 'waiting', fmt(r, tr.marks));
    }
}

// 7. Rush hour: a 4-minute standstill in the middle of the ride stays riding
{
    const tr = buildTrace(trip1Segs({ longStop: 240 }));
    const r = replay(trip1Def, tr.fixes);
    check('Rush hour: 4 min stopped in traffic stays riding', within(r.firstAt.final_walk, tr.marks.stepOff - 25, tr.marks.stepOff + 30), fmt(r, tr.marks));
}

// 8. Getting off one stop early, walking away from the road
{
    const offM = jeepLine.len - 500;
    const dO = dirAt(jeepLine, offM);
    const offPt = at(jeepLine, offM);
    const tr = buildTrace([
        { kind: 'line', line: walkLine, fromM: 0, toM: walkLine.len, mps: 1.3 },
        { kind: 'still', pt: boardPt, sec: 60 },
        ...rideSegs(jeepLine, 0, offM),
        { kind: 'still', pt: offPt, sec: 8, mark: 'stepOff' },
        { kind: 'toward', from: offPt, to: offsetPt(offPt, -dO.ln * 200, -dO.le * 200), mps: 1.3 }
    ]);
    const r = replay(trip1Def, tr.fixes);
    const got = r.events.find((e) => e.type === 'got_off');
    check('Off one stop early: last walk once 40 m off the road for 30 s (within 110 s)', within(r.firstAt.final_walk, tr.marks.stepOff, tr.marks.stepOff + 110) && got && got.early, fmt(r, tr.marks));
}

// 9. Wrong jeep: it turns off the planned road
{
    const turnM = 1200;
    const dT = dirAt(jeepLine, turnM);
    const turnPt = at(jeepLine, turnM);
    const tr = buildTrace([
        { kind: 'line', line: walkLine, fromM: 0, toM: walkLine.len, mps: 1.3 },
        { kind: 'still', pt: boardPt, sec: 60 },
        ...rideSegs(jeepLine, 0, turnM),
        { kind: 'toward', from: turnPt, to: offsetPt(turnPt, dT.ln * 900, dT.le * 900), mps: 7, mark: 'turn' }
    ]);
    const r = replay(trip1Def, tr.fixes);
    const w = r.events.find((e) => e.type === 'wrong_jeep');
    check('Wrong jeep: noticed within 50 s of leaving the road (80 m + 30 s)', w && within(w.at, tr.marks.turn, tr.marks.turn + 50) && r.final === 'riding', fmt(r, tr.marks));
}

// 10. Missed stop: the jeep goes on past the planned stop
{
    const past = lineOf(slice(sr, boardM, Math.min(sr.len, alightM + 290)));
    const tr = buildTrace([
        { kind: 'line', line: walkLine, fromM: 0, toM: walkLine.len, mps: 1.3 },
        { kind: 'still', pt: boardPt, sec: 60 },
        { kind: 'line', line: past, fromM: 0, toM: past.len, mps: 7 },
        { kind: 'still', pt: past.pts[past.pts.length - 1], sec: 30, mark: 'stop' }
    ]);
    // The made-up road past the stop is the route's own; pretend the stop is 300 m before its end
    const r = replay(trip1Def, tr.fixes);
    const miss = r.events.find((e) => e.type === 'missed_stop');
    check('Missed stop: prompt once past 200 m, then the last walk when the jeep stops', !!miss && r.events.filter((e) => e.type === 'missed_stop').length === 1 && r.final === 'final_walk', fmt(r, tr.marks));
}

// 11. Boarding before the planned point: the jeep line starts 800 m behind it (jeepBoardM)
{
    const approachM = 800;
    const ext = lineOf(slice(sr, boardM - approachM, alightM));
    const flagPt = at(ext, 200);
    const d11 = { walk: walkLine.pts, jeep: ext.pts, finalWalk: fwLine.pts, jeepBoardM: approachM };
    const dF = dirAt(ext, 200);
    const start = offsetPt(flagPt, dF.ln * 120, dF.le * 120);
    const tr = buildTrace([
        { kind: 'toward', from: start, to: flagPt, mps: 1.3 },
        { kind: 'still', pt: flagPt, sec: 90, mark: 'flag' },
        ...rideSegs(ext, 200, ext.len).map((s, i) => (i === 0 ? { ...s, mark: 'jeepMoves' } : s))
    ]);
    const r = replay(d11, tr.fixes);
    const b = r.events.find((e) => e.type === 'boarded');
    check('Boarded before the planned point: riding within 30 s, flagged early', within(r.firstAt.riding, tr.marks.jeepMoves, tr.marks.jeepMoves + 30) && b && b.early, fmt(r, tr.marks));
}

// 12. Walk-only trip: stays walking whatever the speed
{
    const tr = buildTrace([{ kind: 'line', line: jeepLine, fromM: 0, toM: 1500, mps: 7 }]);
    const r = replay({ walkOnly: true, walk: jeepLine.pts }, tr.fixes);
    check('Walk-only trip: never anything but walking', Object.keys(r.firstAt).length === 0 && r.final === 'walking', fmt(r, tr.marks));
}

// 13. Snapshot and restore: a reload in the middle of a ride comes back riding, past the board
{
    const tr = buildTrace(trip1Segs());
    const js = J.create(trip1Def);
    const half = tr.fixes.filter((f) => f.t / 1000 < tr.marks.jeepMoves + 200);
    half.forEach((f) => js.onFix(f));
    const snap = JSON.parse(JSON.stringify(js.snapshot()));
    const js2 = J.create(trip1Def);
    js2.restore(snap);
    check('Reload mid-ride: restored as riding with the distance along', js2.state === 'riding' && Math.abs(js2.alongOf('jeep') - js.alongOf('jeep')) < 1 && js2.alongOf('jeep') > 500,
        `state ${js2.state} along ${Math.round(js2.alongOf('jeep'))}`);
}

// ── Recorded trips (from /planner?trace=1) ───────────────────────────────────────
for (const file of process.argv.slice(2)) {
    const rec = JSON.parse(readFileSync(file, 'utf8'));
    const def = rec.legs || {};
    const fixes = (rec.fixes || []).map((f) => ({ t: f.t, lat: f.lat, lng: f.lng, accuracy: f.acc ?? f.accuracy, speed: f.speed }));
    const t0 = fixes.length ? fixes[0].t : 0;
    const r = replay(def, fixes.map((f) => ({ ...f, t: f.t - t0 })));
    console.log(`\n${path.basename(file)}: ${fixes.length} fixes, ${fmt(r)}`);
    if (rec.expect) {
        for (const [st, range] of Object.entries(rec.expect)) {
            check(`${path.basename(file)}: ${st} starts ${range[0]}–${range[1]} s`, within(r.firstAt[st], range[0], range[1]), fmt(r, tr.marks));
        }
    }
    // What the app chose during the real trip, for comparison
    const chosen = (rec.fixes || []).reduce((acc, f) => { if (f.state && acc.last !== f.state) { acc.list.push(`${f.state}@${Math.round((f.t - t0) / 1000)}`); acc.last = f.state; } return acc; }, { list: [], last: null }).list;
    if (chosen.length) console.log(`  app during the trip: ${chosen.join(' ')}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
