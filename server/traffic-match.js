/**
 * server/traffic-match.js
 *
 * Map-matches a jeep path slice to TomTom vector flow tile road shapes and turns the result into
 * coloured stretches for the traffic-coloured jeep line (GET /api/traffic/leg-colors).
 *
 * Pure functions, no network: server/traffic.js fetches and decodes the tiles, this file does the
 * geometry. Tested by scripts/test-traffic-colors.mjs.
 *
 * Positions are metres along the route's own path (the same fromM/toM as /api/traffic/leg).
 * Points are [lat, lng].
 */

'use strict';

// Speed vs free-flow (TomTom relative traffic_level, 0..1). Confirm with scripts/spike-vector-flow.mjs.
const THRESHOLDS = { normal: 0.75, slow: 0.40, heavy: 0.20 };
const SAMPLE_STEP_M = 10;        // one matched point every 10 m of jeep path
const MAX_MATCH_M = 25;          // a road shape farther than this from the jeep path is not its road
const MAX_BEARING_DIFF = 45;     // one_side shapes must run within 45° of the jeep's direction
const MIN_STRETCH_M = 40;        // shorter stretches merge into a neighbour (no confetti)
const MIN_MATCHED_PCT = 60;      // under this the result is not shown (live:false, low_match)

// one_side shapes carry one direction of a two-way road. true: the shape's drawing order is its
// direction of travel (bearing must agree). Flip to false if the spike shows otherwise; then the
// nearer of the two parallel shapes wins.
const ONE_SIDE_IS_DIRECTIONAL = true;

const M_PER_DEG_LAT = 110574;
const mPerDegLng = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

function haversineM(a, b) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b[0] - a[0]);
    const dLng = toRad(b[1] - a[1]);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Compass bearing a -> b in degrees (0 = north, 90 = east)
function bearingDeg(a, b) {
    const dy = (b[0] - a[0]) * M_PER_DEG_LAT;
    const dx = (b[1] - a[1]) * mPerDegLng((a[0] + b[0]) / 2);
    return (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
}

function angleDiff(a, b) {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
}

/**
 * Points every stepM metres along a path, in travel order.
 * @param {Array<[number,number]>} pts  path in travel order
 * @returns {Array<{pt:[number,number], s:number, bearing:number}>} s = metres from the path start
 */
function samplePath(pts, stepM = SAMPLE_STEP_M) {
    const out = [];
    if (!Array.isArray(pts) || pts.length < 2) return out;
    let acc = 0;
    let next = 0;
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const seg = haversineM(a, b);
        if (seg <= 0) continue;
        const brg = bearingDeg(a, b);
        while (next <= acc + seg) {
            const t = (next - acc) / seg;
            out.push({ pt: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], s: next, bearing: brg });
            next += stepM;
        }
        acc += seg;
    }
    // Always end on the last point
    const last = pts[pts.length - 1];
    if (!out.length || acc - out[out.length - 1].s > 1) {
        out.push({ pt: last.slice(), s: acc, bearing: bearingDeg(pts[pts.length - 2], last) });
    }
    return out;
}

// Slippy tile numbers of a point
function tileOf(lat, lng, z) {
    const n = Math.pow(2, z);
    const x = Math.floor(((lng + 180) / 360) * n);
    const latRad = (lat * Math.PI) / 180;
    const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
    return { x, y };
}

// Tiles under the samples, plus neighbours when a sample is near a tile edge (shapes are clipped there)
function tilesForSamples(samples, z) {
    const keys = new Map();
    const add = (x, y) => { keys.set(`${x}/${y}`, { z, x, y }); };
    const padDeg = MAX_MATCH_M / M_PER_DEG_LAT;
    samples.forEach(({ pt }) => {
        const [lat, lng] = pt;
        const padLng = MAX_MATCH_M / mPerDegLng(lat);
        [[0, 0], [padDeg, 0], [-padDeg, 0], [0, padLng], [0, -padLng]].forEach(([dLat, dLng]) => {
            const t = tileOf(lat + dLat, lng + dLng, z);
            add(t.x, t.y);
        });
    });
    return Array.from(keys.values());
}

/**
 * Road shapes from decoded tile features.
 * @param {Array<{lines: Array<Array<[number,number]>>, props: object}>} features  lines as [lat,lng]
 * @returns {Array<{a,b,bearing,level,closed,coverage,ax,ay,bx,by}>} segments, local metres
 */
function prepareSegments(features, lat0) {
    const kx = mPerDegLng(lat0);
    const segs = [];
    (features || []).forEach((f) => {
        const p = f.props || {};
        const level = Number(p.traffic_level);
        const closed = p.road_closure === true || p.road_closure === 'true';
        if (!Number.isFinite(level) && !closed) return;
        const coverage = p.traffic_road_coverage === 'one_side' ? 'one_side' : 'full';
        (f.lines || []).forEach((line) => {
            for (let i = 1; i < line.length; i++) {
                const a = line[i - 1], b = line[i];
                if (a[0] === b[0] && a[1] === b[1]) continue;
                segs.push({
                    a, b,
                    bearing: bearingDeg(a, b),
                    level: Number.isFinite(level) ? level : 0,
                    closed,
                    coverage,
                    ax: a[1] * kx, ay: a[0] * M_PER_DEG_LAT,
                    bx: b[1] * kx, by: b[0] * M_PER_DEG_LAT
                });
            }
        });
    });
    return { segs, kx };
}

function distToSeg(px, py, s) {
    const dx = s.bx - s.ax, dy = s.by - s.ay;
    const L = dx * dx + dy * dy;
    let t = L ? ((px - s.ax) * dx + (py - s.ay) * dy) / L : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (s.ax + t * dx), py - (s.ay + t * dy));
}

/**
 * Best road shape for each sample, respecting the direction of travel.
 * @returns {Array<{s:number, level:number|null, closed:boolean}>}
 */
function matchSamples(samples, features) {
    if (!samples.length) return [];
    const { segs, kx } = prepareSegments(features, samples[0].pt[0]);
    return samples.map((smp) => {
        const px = smp.pt[1] * kx, py = smp.pt[0] * M_PER_DEG_LAT;
        let best = null, bestD = Infinity;
        for (let i = 0; i < segs.length; i++) {
            const sg = segs[i];
            // quick box reject
            if (Math.min(sg.ax, sg.bx) - MAX_MATCH_M > px || Math.max(sg.ax, sg.bx) + MAX_MATCH_M < px) continue;
            if (Math.min(sg.ay, sg.by) - MAX_MATCH_M > py || Math.max(sg.ay, sg.by) + MAX_MATCH_M < py) continue;
            const d = distToSeg(px, py, sg);
            if (d > MAX_MATCH_M || d >= bestD) continue;
            const diff = angleDiff(sg.bearing, smp.bearing);
            if (sg.coverage === 'one_side' && ONE_SIDE_IS_DIRECTIONAL) {
                if (diff > MAX_BEARING_DIFF) continue;
            } else if (diff > MAX_BEARING_DIFF && diff < 180 - MAX_BEARING_DIFF) {
                // a crossing street, not the road the jeep is on
                continue;
            }
            best = sg; bestD = d;
        }
        return { s: smp.s, level: best ? best.level : null, closed: best ? best.closed : false };
    });
}

function classify(level, closed) {
    if (closed) return 'stopped';
    if (level == null || !Number.isFinite(level)) return 'unknown';
    if (level >= THRESHOLDS.normal) return 'normal';
    if (level >= THRESHOLDS.slow) return 'slow';
    if (level >= THRESHOLDS.heavy) return 'heavy';
    return 'stopped';
}

/**
 * Matched samples -> stretches [{s0, s1, cls, closed}] covering 0..totalM, short ones merged.
 */
function buildStretches(matched, totalM, minM = MIN_STRETCH_M) {
    if (!matched.length || !(totalM > 0)) return [];
    const runs = [];
    matched.forEach((m, i) => {
        const cls = classify(m.level, m.closed);
        const s0 = i === 0 ? 0 : (matched[i - 1].s + m.s) / 2;
        const s1 = i === matched.length - 1 ? totalM : (m.s + matched[i + 1].s) / 2;
        const last = runs[runs.length - 1];
        if (last && last.cls === cls && last.closed === m.closed) last.s1 = s1;
        else runs.push({ s0, s1, cls, closed: !!m.closed });
    });
    // Merge short runs into the longer neighbour, shortest first, until none are short
    let changed = true;
    while (changed && runs.length > 1) {
        changed = false;
        let idx = -1, len = Infinity;
        runs.forEach((r, i) => { const l = r.s1 - r.s0; if (l < minM && l < len) { len = l; idx = i; } });
        if (idx >= 0) {
            const prev = runs[idx - 1], next = runs[idx + 1];
            const into = !prev ? next : !next ? prev : ((prev.s1 - prev.s0) >= (next.s1 - next.s0) ? prev : next);
            if (into === prev) prev.s1 = runs[idx].s1; else next.s0 = runs[idx].s0;
            runs.splice(idx, 1);
            changed = true;
        }
        // Join neighbours that now share a class
        for (let i = runs.length - 1; i > 0; i--) {
            if (runs[i].cls === runs[i - 1].cls && runs[i].closed === runs[i - 1].closed) {
                runs[i - 1].s1 = runs[i].s1;
                runs.splice(i, 1);
                changed = true;
            }
        }
    }
    return runs.map((r) => ({ s0: Math.round(r.s0), s1: Math.round(r.s1), cls: r.cls, closed: r.closed }));
}

/**
 * Whole pipeline for one public slice.
 * @param {Array<[number,number]>} travelPts  slice in travel order
 * @param {Array} features  decoded tile features ({lines, props})
 * @returns {{matchedPct:number, stretches:Array<{s0,s1,cls,closed}>, lengthM:number}}
 */
function matchSlice(travelPts, features) {
    const samples = samplePath(travelPts);
    if (!samples.length) return { matchedPct: 0, stretches: [], lengthM: 0 };
    const lengthM = samples[samples.length - 1].s;
    const matched = matchSamples(samples, features);
    const hit = matched.filter((m) => m.level != null || m.closed).length;
    const matchedPct = Math.round((hit / matched.length) * 100);
    return { matchedPct, stretches: buildStretches(matched, lengthM), lengthM };
}

/**
 * Travel-order stretches of a public slice -> route positions (fromM < toM), plus the trimmed
 * private parts as 'unknown'. dir 1: travel runs with increasing position, -1: decreasing.
 */
function toRouteStretches(stretches, pubStartPos, dir, privateParts) {
    const out = stretches.map((st) => {
        const a = pubStartPos + dir * st.s0;
        const b = pubStartPos + dir * st.s1;
        return { fromM: Math.round(Math.min(a, b)), toM: Math.round(Math.max(a, b)), cls: st.cls, closed: !!st.closed };
    });
    (privateParts || []).forEach(([a, b]) => {
        if (b - a > 0) out.push({ fromM: Math.round(a), toM: Math.round(b), cls: 'unknown', closed: false });
    });
    return out.sort((x, y) => x.fromM - y.fromM);
}

module.exports = {
    THRESHOLDS,
    SAMPLE_STEP_M,
    MAX_MATCH_M,
    MAX_BEARING_DIFF,
    MIN_STRETCH_M,
    MIN_MATCHED_PCT,
    ONE_SIDE_IS_DIRECTIONAL,
    haversineM,
    bearingDeg,
    angleDiff,
    samplePath,
    tileOf,
    tilesForSamples,
    prepareSegments,
    matchSamples,
    classify,
    buildStretches,
    matchSlice,
    toRouteStretches
};
