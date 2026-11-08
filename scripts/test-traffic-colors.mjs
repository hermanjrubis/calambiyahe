// Unit tests for the traffic-coloured jeep line:
//   server/traffic-match.js (map matching, stretches)
//   public/js/traffic-colors.js (gradient, strip, jam info, walk hint)
// Run: node scripts/test-traffic-colors.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const TM = require('../server/traffic-match.js');
const TL = require('../public/js/traffic-colors.js');

let pass = 0, fail = 0;
const check = (name, ok, extra) => {
    if (ok) { pass++; console.log('PASS ', name); }
    else { fail++; console.log('FAIL ', name, extra !== undefined ? JSON.stringify(extra) : ''); }
};

// Metres -> degrees near Calamba
const LAT0 = 14.2, LNG0 = 121.15;
const dLat = (m) => m / 110574;
const dLng = (m) => m / (111320 * Math.cos(LAT0 * Math.PI / 180));
const pt = (eastM, northM) => [LAT0 + dLat(northM), LNG0 + dLng(eastM)];

// Jeep path: 1000 m due east
const path = [pt(0, 0), pt(500, 0), pt(1000, 0)];

// 1. Two one_side shapes on the same road, opposite directions, different traffic
{
    const eastbound = { lines: [[pt(-50, -3), pt(1050, -3)]], props: { traffic_level: 0.3, traffic_road_coverage: 'one_side' } };
    const westbound = { lines: [[pt(1050, 3), pt(-50, 3)]], props: { traffic_level: 0.9, traffic_road_coverage: 'one_side' } };
    const r = TM.matchSlice(path, [westbound, eastbound]);
    check('one_side: picks the shape running the jeep direction (heavy)', r.stretches.length === 1 && r.stretches[0].cls === 'heavy', r.stretches);
    check('one_side: 100% matched', r.matchedPct === 100, r.matchedPct);
    const back = TM.matchSlice(path.slice().reverse(), [westbound, eastbound]);
    check('one_side: riding backwards picks the other side (normal)', back.stretches.length === 1 && back.stretches[0].cls === 'normal', back.stretches);
}

// 2. A side street 15 m away, crossing at right angles, is not the jeep's road
{
    const side = { lines: [[pt(400, -200), pt(400, 200)]], props: { traffic_level: 0.05, traffic_road_coverage: 'full' } };
    const main = { lines: [[pt(-50, 0), pt(1050, 0)]], props: { traffic_level: 0.8, traffic_road_coverage: 'full' } };
    const r = TM.matchSlice(path, [side, main]);
    check('crossing street ignored: whole path normal', r.stretches.length === 1 && r.stretches[0].cls === 'normal', r.stretches);
    const parallel = { lines: [[pt(-50, 15), pt(1050, 15)]], props: { traffic_level: 0.05, traffic_road_coverage: 'full' } };
    const r2 = TM.matchSlice(path, [main, parallel]);
    check('nearer of two parallel full roads wins', r2.stretches.length === 1 && r2.stretches[0].cls === 'normal', r2.stretches);
}

// 3. Gap in TomTom coverage -> unknown; matchedPct reflects it
{
    const a = { lines: [[pt(-50, 0), pt(400, 0)]], props: { traffic_level: 0.5, traffic_road_coverage: 'full' } };
    const b = { lines: [[pt(700, 0), pt(1050, 0)]], props: { traffic_level: 0.5, traffic_road_coverage: 'full' } };
    const r = TM.matchSlice(path, [a, b]);
    const unk = r.stretches.find((s) => s.cls === 'unknown');
    check('gap becomes unknown', !!unk && Math.abs(unk.s0 - 400) <= 30 && Math.abs(unk.s1 - 700) <= 30, r.stretches);
    check('gap lowers matchedPct (~70%)', r.matchedPct >= 65 && r.matchedPct <= 75, r.matchedPct);
}

// 4. Road closure -> stopped + closed
{
    const open = { lines: [[pt(-50, 0), pt(600, 0)]], props: { traffic_level: 0.9, traffic_road_coverage: 'full' } };
    const shut = { lines: [[pt(600, 0), pt(1050, 0)]], props: { traffic_level: 0, road_closure: true, traffic_road_coverage: 'full' } };
    const r = TM.matchSlice(path, [open, shut]);
    const last = r.stretches[r.stretches.length - 1];
    check('closure: last stretch stopped and closed', last.cls === 'stopped' && last.closed === true, r.stretches);
}

// 5. Stretches under 40 m merge into the longer neighbour
{
    const matched = [];
    for (let s = 0; s <= 300; s += 10) matched.push({ s, level: s >= 140 && s <= 160 ? 0.1 : 0.9, closed: false });
    const st = TM.buildStretches(matched, 300);
    check('30 m blip merged away', st.length === 1 && st[0].cls === 'normal', st);
    const m2 = [];
    for (let s = 0; s <= 300; s += 10) m2.push({ s, level: s >= 100 && s <= 200 ? 0.1 : 0.9, closed: false });
    const st2 = TM.buildStretches(m2, 300);
    check('110 m jam kept', st2.length === 3 && st2[1].cls === 'stopped', st2);
}

// 6. Travel stretches -> route positions (dir and private parts)
{
    const st = [{ s0: 0, s1: 600, cls: 'slow', closed: false }, { s0: 600, s1: 1525, cls: 'heavy', closed: false }];
    const fwd = TM.toRouteStretches(st, 625, 1, [[0, 625]]);
    check('forward: private part first as unknown', fwd[0].cls === 'unknown' && fwd[0].fromM === 0 && fwd[0].toM === 625, fwd);
    check('forward: slow 625-1225', fwd[1].cls === 'slow' && fwd[1].fromM === 625 && fwd[1].toM === 1225, fwd);
    const back = TM.toRouteStretches(st, 1525, -1, []);
    check('backward: slow is the high-position end', back[1].cls === 'slow' && back[1].fromM === 925 && back[1].toM === 1525, back);
}

// 7. classify thresholds
check('classify 0.75 normal / 0.5 slow / 0.3 heavy / 0.1 stopped',
    TM.classify(0.75) === 'normal' && TM.classify(0.5) === 'slow' && TM.classify(0.3) === 'heavy' && TM.classify(0.1) === 'stopped');
check('classify null = unknown, closure = stopped', TM.classify(null) === 'unknown' && TM.classify(0.9, true) === 'stopped');

// 8. Client: toTravel both directions
{
    const st = [{ fromM: 0, toM: 625, cls: 'unknown' }, { fromM: 625, toM: 1000, cls: 'heavy' }, { fromM: 1000, toM: 2150, cls: 'normal' }];
    const f = TL.toTravel(st, 0, 2150);
    check('toTravel forward tiles 0..2150', f.length === 3 && f[0].s0 === 0 && f[2].s1 === 2150 && f[1].cls === 'heavy', f);
    const b = TL.toTravel(st, 2150, 0);
    check('toTravel backward: heavy at travel 1150..1525', b[1].cls === 'heavy' && b[1].s0 === 1150 && b[1].s1 === 1525, b);
    const gap = TL.toTravel([{ fromM: 500, toM: 800, cls: 'slow' }], 0, 1000);
    check('toTravel fills gaps with unknown', gap.length === 3 && gap[0].cls === 'unknown' && gap[2].cls === 'unknown', gap);
}

// 9. Client: gradient
{
    const travel = [{ s0: 0, s1: 625, cls: 'unknown' }, { s0: 625, s1: 850, cls: 'slow' }, { s0: 850, s1: 1200, cls: 'heavy' }, { s0: 1200, s1: 1500, cls: 'stopped' }, { s0: 1500, s1: 2150, cls: 'normal' }];
    const g = TL.gradientExpr(travel, 0, 2150, '#378ADD');
    const stops = g.slice(3);
    const ps = stops.filter((_, i) => i % 2 === 0);
    check('gradient starts at 0 and ends at 1', ps[0] === 0 && ps[ps.length - 1] === 1, ps);
    check('gradient stops strictly ascending', ps.every((p, i) => i === 0 || p > ps[i - 1]), ps);
    const blend = (ps[2] - ps[1]) * 2150;
    check('blend is 40 m', Math.abs(blend - 40) < 0.5, blend);
    check('unknown and normal draw the line colour', stops[1] === '#378ADD' && stops[stops.length - 1] === '#378ADD', stops);
    check('all-normal leg -> null (plain line)', TL.gradientExpr([{ s0: 0, s1: 1000, cls: 'normal' }], 0, 1000, '#378ADD') === null);
    const tail = TL.gradientExpr(travel, 1300, 2150, '#378ADD');
    check('window from the rider on: starts stopped', tail && tail[4] === TL.COLORS.stopped, tail);
    const tiny = TL.gradientExpr([{ s0: 0, s1: 500, cls: 'slow' }, { s0: 500, s1: 510, cls: 'heavy' }, { s0: 510, s1: 1000, cls: 'slow' }], 0, 1000, '#378ADD');
    const tps = tiny.slice(3).filter((_, i) => i % 2 === 0);
    check('very short run: stops still ascending', tps.every((p, i) => i === 0 || p > tps[i - 1]), tps);
}

// 10. Client: strip and jam info
{
    const travel = [{ s0: 0, s1: 625, cls: 'unknown' }, { s0: 625, s1: 850, cls: 'slow' }, { s0: 850, s1: 1200, cls: 'heavy' }, { s0: 1200, s1: 1500, cls: 'stopped' }, { s0: 1500, s1: 2150, cls: 'normal' }];
    const strip = TL.stripSegments(travel, 2150, '#378ADD');
    const sum = strip.reduce((s, x) => s + x.pct, 0);
    check('strip sums to 100%', Math.abs(sum - 100) < 0.5, sum);
    check('strip: first segment is the line colour', strip[0].color === '#378ADD' && strip[0].cls === 'normal', strip[0]);
    const jam = TL.jamInfo(travel);
    check('jam: heavy+stopped joined, 650 m, worst = stopped', jam.longest && Math.round(jam.longest.lengthM) === 650 && jam.longest.cls === 'stopped' && jam.totalM === 650, jam);
    const small = TL.jamInfo([{ s0: 0, s1: 150, cls: 'heavy' }, { s0: 150, s1: 1000, cls: 'normal' }]);
    check('jam under 200 m: no label', small.longest === null && small.totalM === 150, small);
    const ahead = TL.jamInfo(travel, 1300, 2150);
    check('jam ahead of the rider only', ahead.totalM === 200, ahead);
}

// 11. Walk hint rules
{
    const ok = { isLastJeep: true, aheadJamM: 650, walkM: 650, walkMin: 9, rideRemainingMin: 15 };
    check('hint: shows when all rules pass', TL.walkHintOk(ok) === true);
    check('hint: not on the first jeep of a transfer', TL.walkHintOk({ ...ok, isLastJeep: false }) === false);
    check('hint: jam ahead under 300 m', TL.walkHintOk({ ...ok, aheadJamM: 250 }) === false);
    check('hint: walk over 1.2 km', TL.walkHintOk({ ...ok, walkM: 1300 }) === false);
    check('hint: saves under 3 min', TL.walkHintOk({ ...ok, walkMin: 13 }) === false);
    check('hint: exactly 3 min saving shows', TL.walkHintOk({ ...ok, walkMin: 12 }) === true);
    check('alight inside closedM moves to its end (forward)', TL.allowedAlightPos(300, [[0, 625]], 1, 2150) === 625);
    check('alight inside closedM moves to its start (backwards)', TL.allowedAlightPos(300, [[0, 625]], -1, -100) === 0);
    check('alight outside closedM unchanged', TL.allowedAlightPos(900, [[0, 625]], 1, 2150) === 900);
    check('closed range reaching the stop: no hint point', TL.allowedAlightPos(1900, [[1800, 2200]], 1, 2150) === null);
}

// 12. Vector tile decode (server/traffic.js): encode a tiny MVT, decode, check lat/lng order and tags
{
    const Pbf = require('pbf');
    const { decodeVectorTile } = require('../server/traffic.js');
    const z = 15;
    const a = pt(100, 0), b = pt(900, 0);
    const t = TM.tileOf(a[0], a[1], z);
    const n = Math.pow(2, z);
    const toPx = ([lat, lng]) => {
        const x = ((lng + 180) / 360) * n;
        const latRad = lat * Math.PI / 180;
        const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
        return [Math.round((x - t.x) * 4096), Math.round((y - t.y) * 4096)];
    };
    const zz = (v) => (v << 1) ^ (v >> 31);
    const pa = toPx(a), pb = toPx(b);
    const geometry = [9, zz(pa[0]), zz(pa[1]), 2 | (1 << 3), zz(pb[0] - pa[0]), zz(pb[1] - pa[1])];
    const keys = ['traffic_level', 'traffic_road_coverage', 'road_type'];
    const values = [0.42, 'one_side', 'Major road'];
    const pbf = new Pbf();
    pbf.writeMessage(3, (_, p) => {
        p.writeVarintField(15, 2);
        p.writeStringField(1, 'Traffic flow');
        p.writeMessage(2, (__, q) => {
            q.writePackedVarint(2, [0, 0, 1, 1, 2, 2]);
            q.writeVarintField(3, 2);
            q.writePackedVarint(4, geometry);
        });
        keys.forEach((k) => p.writeStringField(3, k));
        values.forEach((v) => p.writeMessage(4, (___, q) => {
            if (typeof v === 'string') q.writeStringField(1, v); else q.writeDoubleField(3, v);
        }));
        p.writeVarintField(5, 4096);
    });
    const buf = Buffer.from(pbf.finish());
    const feats = decodeVectorTile(buf, z, t.x, t.y);
    const p0 = feats[0] && feats[0].lines[0][0];
    check('decode: one feature with props', feats.length === 1 && feats[0].props.traffic_level === 0.42 && feats[0].props.traffic_road_coverage === 'one_side', feats[0] && feats[0].props);
    check('decode: [lat, lng] order, within 1 m', p0 && TM.haversineM(p0, a) < 1.5, p0);
    const gz = require('zlib').gzipSync(buf);
    check('decode: gzipped tile too', decodeVectorTile(gz, z, t.x, t.y).length === 1);
    const r = TM.matchSlice([pt(150, 0), pt(850, 0)], feats);
    check('decoded shape matches the path as slow', r.matchedPct === 100 && r.stretches.length === 1 && r.stretches[0].cls === 'slow', r);
}

console.log('\n========================================');
console.log(`Summary: ${pass} passed, ${fail} failed`);
console.log('========================================');
process.exit(fail ? 1 : 0);
