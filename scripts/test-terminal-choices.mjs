// Terminal choice and no-jeepney barangays (transit-engine 1.5.0): node scripts/test-terminal-choices.mjs
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

// No jeepney leaves the poblacion (Barangay 2–7, San Jose, San Juan) toward Uno / Real / Halang
const BRGY3 = [14.2082, 121.1628], BRGY5 = [14.2096, 121.1665], SAN_JUAN = [14.2165, 121.1744];
check('noJeepAreaOf Barangay 3', P.noJeepAreaOf(BRGY3) === 'Barangay 3');
check('noJeepAreaOf Barangay 5', P.noJeepAreaOf(BRGY5) === 'Barangay 5');
check('noJeepAreaOf SM City Calamba (Uno) = null', P.noJeepAreaOf(SM) === null);
check('noJeepAreaOf Lecheria (jeeps on Chipeco Ave) = null', P.noJeepAreaOf([14.2018, 121.1707]) === null);
check('Barangay 3 -> SM City Calamba (Uno): no jeep option', P.plan(BRGY3, SM).length === 0 && P.terminalChoices(BRGY3, SM) === null);
check('Barangay 5 -> Jollibee Crossing (Uno): no jeep option', P.plan(BRGY5, JOLLIBEE_CROSSING).length === 0 && P.terminalChoices(BRGY5, JOLLIBEE_CROSSING) === null);
[[BRGY3, JOLLIBEE_REAL, 'Barangay 3 -> Jollibee Real'], [BRGY5, CHICKEN_JOO, 'Barangay 5 -> Chicken Joo'], [SAN_JUAN, JOLLIBEE_REAL, 'San Juan -> Jollibee Real']].forEach(([o, d, label]) => {
    const tcx = P.terminalChoices(o, d);
    const all = [...P.plan(o, d), ...(tcx ? tcx.choices.map((c) => c.option) : [])];
    check(`${label}: every jeep option starts with a walk to a terminal inside the area`, all.every((opt) => {
        const j = opt.legs.find((l) => l.type === 'jeep');
        return j && j.board.stopId && P.areaOf(j.board.pt) && opt.legs[0].type === 'walk';
    }), names(tcx));
});
// Not from there: unchanged
check('Cabuyao -> SM City Calamba still has jeep options', P.plan(cabuyao, SM).length > 0);

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
