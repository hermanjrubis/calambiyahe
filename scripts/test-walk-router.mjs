// Walk router on the real walk graph: node scripts/test-walk-router.mjs
// The checks follow what people who walk there say (Nov 2026): footbridge only at Calamba Crossing / SM,
// New Calamba Transport and Crossing Grand on the same side of NH1, pedestrian lane by the traffic
// light in Real, Saint Francis footbridge not usable.
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(here, '..', 'public');
const require = createRequire(import.meta.url);
const Walk = require(path.join(pub, 'js', 'walk-router.js'));
const graph = JSON.parse(readFileSync(path.join(pub, 'data', 'walk-graph.json'), 'utf8'));
const stops = JSON.parse(readFileSync(path.join(pub, 'data', 'transit-routes.json'), 'utf8')).stops;
const R = Walk.createRouter(graph);

let fails = 0;
const check = (name, ok, extra) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
    if (!ok) fails++;
};
const at = (id) => [stops[id].lat, stops[id].lng];
const m = (a, b) => Math.hypot((a[0] - b[0]) * 110574, (a[1] - b[1]) * 107550);
const desc = (r) => (r ? `${Math.round(r.distance)} m; crossings: ${r.crossings.map((c) => `${c.name || '?'}:${c.code}`).join(', ') || 'none'}; footbridges: ${r.footbridges.join(', ') || 'none'}` : 'no route');
const ML = 110574, MG = 107550;
// A point beside a road: centre, road bearing (deg), metres along it, metres to its left (+) / right (-)
const beside = (c, brg, along, left) => {
    const b = brg * Math.PI / 180;
    const dx = Math.sin(b) * along - Math.cos(b) * left, dy = Math.cos(b) * along + Math.sin(b) * left;
    return [c[0] + dy / ML, c[1] + dx / MG];
};

const SM = [14.2036, 121.1560];
const CGT = at('crossing-grand-terminal'), NCT = at('new-calamba-transport-terminal');
const CTT = at('calamba-tagaytay-terminal'), SMTT = at('sm-transport-terminal');
const JOLLIBEE_CROSSING = [14.206306, 121.155194];
const CROSSING_LIGHT = [14.205976, 121.1556989];

check('graph built', R.stats.nodes > 3000 && R.stats.edges > 3000, JSON.stringify(R.stats));
check('Saint Francis of Assisi footbridge left out', !graph.names.includes('Saint Francis of Assisi'));

const noStreetCrossingNearCrossing = (r) => r.crossings.every((c) => c.cls > 1 || m(c.at, CROSSING_LIGHT) > 120);

let r = R.route(SM, CGT);
check('SM -> Crossing Grand: uses the Calamba Crossing footbridge', r && r.footbridges.some((f) => /Calamba Crossing/.test(f)), desc(r));
check('SM -> Crossing Grand: no street crossing of a big road', r && r.crossings.length === 0, desc(r));
check('SM -> Crossing Grand: has a footbridge step', r && r.steps.some((s) => s.walk === 'footbridge'));
check('SM -> Crossing Grand: starts with depart, ends with arrive', r && r.steps[0].maneuver.type === 'depart' && r.steps[r.steps.length - 1].maneuver.type === 'arrive');
check('SM -> Crossing Grand: under 600 m', r && r.distance < 600, desc(r));

r = R.route(NCT, CGT);
check('New Calamba Transport -> Crossing Grand: same side, no crossing, no footbridge', r && r.crossings.length === 0 && r.footbridges.length === 0 && r.distance < 220, desc(r));

r = R.route(SM, CTT);
check('SM -> Calamba-Tagaytay Terminal: same side, no crossing', r && r.crossings.length === 0 && r.footbridges.length === 0, desc(r));

r = R.route(SMTT, JOLLIBEE_CROSSING);
check('SM Transport Terminal -> Jollibee Crossing: footbridge at the junction', r && r.footbridges.length > 0 && noStreetCrossingNearCrossing(r), desc(r));

// Corners of the Calamba Crossing junction: footbridge only
[[[14.20640, 121.15540], [14.20560, 121.15600]], [[14.20650, 121.15600], [14.20545, 121.15540]], [[14.20545, 121.15540], [14.20640, 121.15540]]].forEach(([a, b], i) => {
    const x = R.route(a, b);
    check(`Crossing junction corners #${i + 1}: footbridge, no street crossing there`, x && x.footbridges.length > 0 && noStreetCrossingNearCrossing(x), desc(x));
});

// Real, NH1 by Jollibee: cross at the pedestrian lane by the traffic light
const REAL_LIGHT = [14.1954768, 121.1439104], NH1_BEARING = 234.7;
[-80, 0, 80].forEach((along) => {
    const x = R.route(beside(REAL_LIGHT, NH1_BEARING, along, 35), beside(REAL_LIGHT, NH1_BEARING, along, -35));
    const c = x && x.crossings.find((k) => /National Highway 1/.test(k.name));
    check(`Real: across NH1 ${along} m from the light crosses at the light / lane`, c && /^[sz]$/.test(c.code) && m(c.at, REAL_LIGHT) < 60, desc(x));
});
r = R.route([14.195495, 121.143531], beside(REAL_LIGHT, NH1_BEARING, 60, 35));
check('Real: Jollibee -> across NH1 uses the light / lane', r && r.crossings.every((k) => !k.highway || /^[sz]$/.test(k.code)), desc(r));

// Halang, National Highway near Chicken Joo: mapped crossings only
const HALANG_ZEBRA = [14.1951927, 121.1640762];
[-120, 0, 120].forEach((along) => {
    const x = R.route(beside(HALANG_ZEBRA, 140.3, along, 30), beside(HALANG_ZEBRA, 140.3, along, -30));
    check(`Halang: across National Highway (${along} m) at a light or lane`, x && x.crossings.filter((k) => k.highway).every((k) => /^[sz]$/.test(k.code)) && x.crossings.some((k) => k.highway), desc(x));
});

// Every route above: never a street-level crossing at a no-crossing node
check('no route crosses where street crossing is not allowed', [R.route(SM, CGT), R.route(SMTT, JOLLIBEE_CROSSING)].every((x) => x.crossings.every((c) => c.code !== 'x')));

// Outside the coverage area: no route (the planner uses the public foot router there)
check('Manila: not covered', !R.covers([14.5995, 120.9842]) && R.route([14.5995, 120.9842], SM) === null);
check('Calamba Crossing: covered', R.covers(CGT) && R.covers(SM));

// Line drawn on the walker's side of a big road (offset from the centre line)
r = R.route(NCT, CGT);
check('NCT -> CGT line has points', r && r.coordinates.length >= 2);

// Inside STI College Calamba (Drei, Nov 19 2026): the way out is the front, on the National Highway.
// The roads behind the campus (and the cemetery paths beyond them) cannot be reached from STI; the
// router used to snap a GPS fix deep inside the campus to them and walk a 1.7-2 km loop through
// Elepaño and back. Points across the campus, from the highway to ~25 m from the back roads:
const STI = [14.2025089, 121.1583962];
const SM_CITY = [14.203928, 121.154516];
const BACK_ROADS = ['Elepaño II', 'Chipeco Avenue', 'Larino Street'];
const viaBack = (x) => x.steps.some((s) => BACK_ROADS.includes(s.name)) || x.crossings.some((c) => BACK_ROADS.includes(c.name));
const stiPoints = [STI, [14.20317, 121.15827], [14.2031, 121.1592], [14.2033, 121.1593], [14.2026, 121.1592],
    [14.2028, 121.1594], [14.2026, 121.1596], [14.2032, 121.1596], [14.2020, 121.1588]];
stiPoints.forEach((p) => {
    const toTerminal = R.route(p, SMTT), toMall = R.route(p, SM_CITY);
    check(`STI ${p.join(',')} -> SM Transport Terminal: out the front, across at the lane (under 600 m)`,
        toTerminal && !viaBack(toTerminal) && toTerminal.distance < 600 && toTerminal.crossings.some((c) => /National Highway/.test(c.name) && c.code === 'z'), desc(toTerminal));
    check(`STI ${p.join(',')} -> SM City Calamba: not through the back roads (under 900 m)`, toMall && !viaBack(toMall) && toMall.distance < 900, desc(toMall));
});
// A point on (or right by) a road keeps that road: someone on the back road really walks out that way
r = R.route([14.20318, 121.15986], SMTT);
check('on the road behind STI: walks that road (no cutting through the campus)', r && viaBack(r), desc(r));
// A farther road is never reached across a highway: the other side of the National Highway is reached
// by crossing it on the network (lane, light, footbridge)
r = R.route([14.20317, 121.15827], SMTT);
check('east of the National Highway by STI: the walk crosses it (not snapped to the far side)', r && r.crossings.some((c) => /National Highway/.test(c.name)), desc(r));
r = R.route(SMTT, [14.2031, 121.1592]);
check('SM Transport Terminal -> inside STI: arrives from the front (same as the other way)', r && !viaBack(r) && r.distance < 600, desc(r));

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
