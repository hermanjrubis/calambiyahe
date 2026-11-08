// Terminal choice, no-jeepney barangays, no road boarding at Crossing / SM (transit-engine 1.5.1): node scripts/test-terminal-choices.mjs
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(here, '..', 'public');
const require = createRequire(import.meta.url);
const T = require(path.join(pub, 'js', 'transit-engine.js'));
const data = JSON.parse(readFileSync(path.join(pub, 'data', 'transit-routes.json'), 'utf8'));
const areas = JSON.parse(readFileSync(path.join(pub, 'data', 'barangays.json'), 'utf8'));
const P = T.createPlanner(data, areas);

let fails = 0;
const check = (name, ok, extra) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
    if (!ok) fails++;
};
const names = (tc) => (tc ? tc.choices.map((c) => `${c.stopId}${c.recommended ? '*' : ''} ${c.option.totalMin}min ${Math.round(c.walkM)}m`).join(' | ') : 'null');

const SM = [14.2036, 121.1560];               // SM City Calamba (main entrance)
const JOLLIBEE_REAL = [14.195495, 121.143531]; // Jollibee – Real
const CHICKEN_JOO = [14.197064, 121.162786];   // Chicken Joo – Halang
const JOLLIBEE_CROSSING = [14.206306, 121.155194]; // Uno

check('areaOf Jollibee Real = Real', P.areaOf(JOLLIBEE_REAL) === 'Real');
check('areaOf Chicken Joo = Halang', P.areaOf(CHICKEN_JOO) === 'Halang');
check('areaOf Jollibee Crossing = Uno', P.areaOf(JOLLIBEE_CROSSING) === 'Uno');
check('areaOf Manila = null', P.areaOf([14.5995, 120.9842]) === null);

const real = P.terminalChoices(SM, JOLLIBEE_REAL);
check('SM -> Jollibee Real: 3 terminals', real && real.choices.length === 3, names(real));
check('SM -> Jollibee Real: area Real', real && real.area === 'Real');
check('SM -> Jollibee Real: exactly one recommended, first', real && real.choices[0].recommended && real.choices.filter((c) => c.recommended).length === 1);
check('SM -> Jollibee Real: every option boards at its terminal', real && real.choices.every((c) => {
    const j = c.option.legs.find((l) => l.type === 'jeep');
    return j && j.board.stopId === c.stopId;
}));
check('SM -> Jollibee Real: recommended has the lowest cost', real && real.choices.every((c) => c.option.cost >= real.choices[0].option.cost));

const hal = P.terminalChoices(SM, CHICKEN_JOO);
check('SM -> Chicken Joo Halang: 2 terminals', hal && hal.choices.length === 2, names(hal));
check('SM -> Chicken Joo Halang: SM Transport Terminal recommended', hal && hal.choices[0].stopId === 'sm-transport-terminal');

check('Destination in Uno: no choice', P.terminalChoices(SM, JOLLIBEE_CROSSING) === null);
check('Origin next to Jollibee Real: no choice', P.terminalChoices([14.1957, 121.1442], JOLLIBEE_REAL) === null);

// At a terminal pin: that terminal; 61+ m away: none
const stops = data.stops;
['calamba-tagaytay-terminal', 'crossing-grand-terminal', 'new-calamba-transport-terminal'].forEach((id) => {
    const s = [stops[id].lat, stops[id].lng];
    check(`terminalAt ${id}`, P.terminalAt(s, 'Real') === id);
});
const cgt = [stops['crossing-grand-terminal'].lat, stops['crossing-grand-terminal'].lng];
check('terminalAt 70 m west of Crossing GT = null', P.terminalAt([cgt[0], cgt[1] - 70 / 107900], 'Real') === null);

// Crossing Grand Terminal stays a drop-off, not a transfer point, for jeeps coming into Calamba
// (in the usual options; only a terminal the user picks makes it the place to change jeeps)
const cabuyao = [14.2765, 121.1250];
const fromNorth = P.plan(cabuyao, JOLLIBEE_REAL);
check('Cabuyao -> Real: usual options have no transfer at Crossing Grand Terminal', fromNorth.every((o) => {
    const j = o.legs.filter((l) => l.type === 'jeep');
    return j.length < 2 || j[1].board.stopId !== 'crossing-grand-terminal';
}), fromNorth.map((o) => o.legs.filter((l) => l.type === 'jeep').map((l) => `${l.routeId}@${l.board.stopId || 'road'}`).join('>')).join(' | '));

// Coming from farther away (Cabuyao): the terminal is where the user changes jeeps
const far = P.terminalChoices(cabuyao, JOLLIBEE_REAL);
check('Cabuyao -> Jollibee Real: 3 terminals to change at', far && far.choices.length === 3, names(far));
check('Cabuyao -> Jollibee Real: each option changes to a jeep loading at its terminal', far && far.choices.every((c) => {
    const j = c.option.legs.filter((l) => l.type === 'jeep');
    return j.length === 2 && j[1].board.stopId === c.stopId;
}), far && far.choices.map((c) => c.option.legs.filter((l) => l.type === 'jeep').map((l) => `${l.routeId}@${l.board.stopId || 'road'}`).join('>')).join(' | '));
const farH = P.terminalChoices(cabuyao, CHICKEN_JOO);
check('Cabuyao -> Chicken Joo: 2 terminals to change at', farH && farH.choices.length === 2, names(farH));
// One jeep straight there, cheaper and about as fast: no terminal choice
check('Cabuyao -> Lynville (Sta. Rosa jeep passes it): no choice', P.terminalChoices(cabuyao, [14.1997, 121.1492]) === null);

// routeNear: a point on the new Crossing -> Real path finds it
const rn = P.routeNear([14.20207, 121.15222], 40).map((r) => r.routeId);
check('routeNear on Real Road finds crossing-real', rn.includes('crossing-real'), rn.join(','));

// No jeepney passes through the poblacion (Barangay 2–7, San Jose, San Juan); to Uno it stays a walk
const BRGY3 = [14.2082, 121.1628], BRGY5 = [14.2096, 121.1665], SAN_JUAN = [14.2165, 121.1744];
check('noJeepAreaOf Barangay 3', P.noJeepAreaOf(BRGY3) === 'Barangay 3');
check('noJeepAreaOf Barangay 5', P.noJeepAreaOf(BRGY5) === 'Barangay 5');
check('noJeepAreaOf SM City Calamba (Uno) = null', P.noJeepAreaOf(SM) === null);
check('noJeepAreaOf Lecheria (jeeps on Chipeco Ave) = null', P.noJeepAreaOf([14.2018, 121.1707]) === null);
check('Barangay 3 -> SM City Calamba (Uno): no jeep option', P.plan(BRGY3, SM).length === 0 && P.terminalChoices(BRGY3, SM) === null);
check('Barangay 5 -> Jollibee Crossing (Uno): no jeep option', P.plan(BRGY5, JOLLIBEE_CROSSING).length === 0 && P.terminalChoices(BRGY5, JOLLIBEE_CROSSING) === null);
// Engine 1.7.0: from the poblacion the user walks to a terminal and rides from there (Real / Halang: the picker)
const firstJeep = (opt) => opt.legs.find((l) => l.type === 'jeep');
const walksToTerminal = (tcx) => !!tcx && tcx.choices.every((c) => c.option.legs[0].type === 'walk'
    && firstJeep(c.option).board.stopId === c.stopId && c.option.legs.filter((l) => l.type === 'jeep').length === 1);
const b3Real = P.terminalChoices(BRGY3, JOLLIBEE_REAL);
check('Barangay 3 -> Jollibee Real: 3 terminals to walk to', b3Real && b3Real.choices.length === 3 && b3Real.area === 'Real', names(b3Real));
check('Barangay 3 -> Jollibee Real: walk, then one jeep from the picked terminal', walksToTerminal(b3Real));
const b5Halang = P.terminalChoices(BRGY5, CHICKEN_JOO);
check('Barangay 5 -> Chicken Joo Halang: 2 terminals, SM Transport Terminal recommended', b5Halang && b5Halang.choices.length === 2 && b5Halang.choices[0].stopId === 'sm-transport-terminal', names(b5Halang));
check('Barangay 5 -> Chicken Joo Halang: walk, then one jeep from the picked terminal', walksToTerminal(b5Halang));
check('San Juan -> Jollibee Real: terminals over 2.5 km away, walk', P.plan(SAN_JUAN, JOLLIBEE_REAL).length === 0 && P.terminalChoices(SAN_JUAN, JOLLIBEE_REAL) === null);
// Other places a terminal's jeep reaches (no picker): plan() boards at that terminal
const b3Uplb = P.plan(BRGY3, [14.1675, 121.2433]);
check('Barangay 3 -> UPLB: walk to SM Transport Terminal, then the UPLB jeep', b3Uplb.length > 0 && b3Uplb.every((o) => firstJeep(o).board.stopId === 'sm-transport-terminal'),
    b3Uplb.map((o) => `${firstJeep(o).routeId}@${firstJeep(o).board.stopId}`).join(' | '));
// Every poblacion -> anywhere option: boards at a listed stop, the terminal is nearer than the destination,
// and the trip beats walking all the way by MUCH_FASTER_MIN (5 min)
{
    const rings = areas.noJeepFrom.map((f) => f.geometry.coordinates[0]);
    const inside = (p, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > p[0]) !== (yj > p[0]) && p[1] < ((xj - xi) * (p[0] - yi)) / (yj - yi) + xi) c = !c; } return c; };
    const origins = [];
    for (let la = 14.200; la <= 14.225; la += 0.0015) for (let lo = 121.155; lo <= 121.185; lo += 0.0015) if (rings.some((r) => inside([la, lo], r))) origins.push([la, lo]);
    const dests = [];
    for (let la = 14.120; la <= 14.235; la += 0.006) for (let lo = 121.120; lo <= 121.250; lo += 0.006) dests.push([la, lo]);
    let n = 0, jeep = 0, picker = 0, bad = [];
    origins.forEach((o) => dests.forEach((d) => {
        n++;
        const tcx = P.terminalChoices(o, d);
        const opts = P.plan(o, d);
        if (tcx) picker++;
        if (opts.length) jeep++;
        const walkAll = T.walkMin(T.haversineM(o, d) * 1.25);
        // The picker lists every terminal of the area; only its recommended one must be nearer than the destination
        [...opts, ...(tcx ? tcx.choices.map((c) => c.option) : [])].forEach((opt) => {
            if (!firstJeep(opt).board.stopId) bad.push('road boarding');
        });
        [...opts, ...(tcx ? [tcx.choices[0].option] : [])].forEach((opt) => {
            const j = firstJeep(opt);
            if (j.board.stopId && T.haversineM(o, j.board.pt) >= T.haversineM(o, d)) bad.push('terminal past the destination');
        });
        opts.forEach((opt) => { if (opt.totalMin + 5 > walkAll) bad.push(`not faster than walking (${opt.totalMin} vs ${walkAll} min)`); });
        if (P.areaOf(d) === 'Uno' && (opts.length || tcx)) bad.push('jeep to Uno');
    }));
    check('poblacion grid: every jeep boards at a terminal (the recommended one nearer than the destination), saves 5+ min, none to Uno', bad.length === 0,
        `${origins.length} origins x ${dests.length} destinations = ${n}; picker ${picker}, jeep options ${jeep}${bad.length ? '; ' + [...new Set(bad)].join(', ') : ''}`);
}
// Calamba Crossing / SM (Uno): jeeps are boarded only at terminals, never on the road there
const JP_RIZAL_PAST_JUNCTION = [14.2066, 121.1562], NH_AT_SAMPAGUITA = [14.2039194, 121.1572045];
check('no road boarding on J.P. Rizal past the Crossing junction', P.roadBoardingOk(JP_RIZAL_PAST_JUNCTION) === false);
check('no road boarding on the National Highway at Sampaguita St', P.roadBoardingOk(NH_AT_SAMPAGUITA) === false);
check('road boarding still fine on Real Road', P.roadBoardingOk([14.20207, 121.15222]) === true);
check('boarding stops are the terminals', P.boardingStops().length >= 4 && P.boardingStops().every((s) => stops[s.id]));
{
    let bad = 0, n = 0;
    for (let la = 14.2025; la <= 14.2075; la += 0.0005) for (let lo = 121.1530; lo <= 121.1600; lo += 0.0005) {
        const o = [la, lo];
        [SM, JOLLIBEE_CROSSING, JOLLIBEE_REAL, CHICKEN_JOO].forEach((d) => {
            const tcx = P.terminalChoices(o, d);
            [...P.plan(o, d), ...(tcx ? tcx.choices.map((c) => c.option) : [])].forEach((opt) => opt.legs.forEach((l) => {
                if (l.type !== 'jeep') return;
                n++;
                if (!l.board.stopId && P.areaOf(l.board.pt) === 'Uno') bad++;
            }));
        });
    }
    check('no jeep option boards on the road in Uno (grid around Crossing / SM)', bad === 0, `${n} jeep rides checked`);
}

// Not from there: unchanged
check('Cabuyao -> SM City Calamba still has jeep options', P.plan(cabuyao, SM).length > 0);

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
