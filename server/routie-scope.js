// server/routie-scope.js — Calzada's area for Routie, the same rule as the Planner:
//   • a trip must END in Brgy. Uno, Real or Halang (public/data/coverage.json, the polygon the Planner uses);
//   • it may START outside, within about 25 km of the area (0.25° from its bounding box, the Planner's limit).
// Also recognizes places outside the area (server/data/outside-places.json) so Routie can say "not applicable"
// instead of "not in our data", and give a starting point outside the area its coordinates.
const ORIGIN_MAX_DEG = 0.25; // the Planner's USER_MAX_DIST (scope.js)

// require (not fs): Vercel bundles required files into the function (transit-routes.json is loaded the same way)
let coverage = null;
try {
    coverage = require('../public/data/coverage.json');
} catch (err) {
    console.error('[routie-scope] coverage.json not loaded; every point counts as inside:', err.message);
}

let outsideDoc = { places: [] };
try {
    outsideDoc = require('./data/outside-places.json');
} catch (err) {
    console.error('[routie-scope] outside-places.json not loaded:', err.message);
}

const norm = (s) => String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

function inRing(pt, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
}

/** [lat, lng] inside Brgy. Uno, Real or Halang (the Planner's coverage polygon). */
function inScope(coords) {
    if (!Array.isArray(coords) || coords.length < 2) return false;
    const lat = Number(coords[0]);
    const lng = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    if (!coverage || !coverage.area) return true;
    const b = coverage.bbox;
    if (b && (lng < b[0] || lat < b[1] || lng > b[2] || lat > b[3])) return false;
    const pt = [lng, lat];
    for (const f of coverage.area.features || [coverage.area]) {
        const g = f.geometry || f;
        const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
        for (const rings of polys) {
            if (inRing(pt, rings[0]) && !rings.slice(1).some((h) => inRing(pt, h))) return true;
        }
    }
    return false;
}

/** A starting point the Planner would plan from: within about 25 km of the area. */
function originReachable(coords) {
    if (!Array.isArray(coords) || coords.length < 2) return false;
    const b = (coverage && coverage.bbox) || [121.140, 14.186, 121.183, 14.210];
    const lat = Number(coords[0]);
    const lng = Number(coords[1]);
    const dLng = Math.max(b[0] - lng, 0, lng - b[2]);
    const dLat = Math.max(b[1] - lat, 0, lat - b[3]);
    return Math.hypot(dLng, dLat) <= ORIGIN_MAX_DEG;
}

// Alias index, longest first
const outsideIndex = [];
for (const p of outsideDoc.places || []) {
    for (const a of p.aliases || []) outsideIndex.push({ alias: norm(a), place: p });
}
outsideIndex.sort((x, y) => y.alias.length - x.alias.length);

function lev(a, b) {
    if (a === b) return 0;
    const m = [];
    for (let i = 0; i <= b.length; i++) m[i] = [i];
    for (let j = 0; j <= a.length; j++) m[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            m[i][j] = b[i - 1] === a[j - 1] ? m[i - 1][j - 1] : Math.min(m[i - 1][j - 1], m[i][j - 1], m[i - 1][j]) + 1;
        }
    }
    return m[b.length][a.length];
}

function asResolved(p, alias) {
    return {
        name: p.name,
        coords: p.coords ? [p.coords[0], p.coords[1]] : null,
        barangay: p.kind === 'barangay' ? p.name.replace(/^Brgy\. /, '').replace(/, Calamba$/, '') : p.name,
        outsideScope: true,
        outsideCalamba: p.municipality !== 'Calamba',
        outsideKind: p.kind,
        far: p.kind === 'far',
        noCoords: !p.coords,
        alias
    };
}

/**
 * A place outside the area named by the whole query ("Pansol", "brgy Lecheria", "Sta. Rosa", "Makati"), or null.
 * Small typos are forgiven on longer names ("canlubng", "los banyos").
 */
function findOutside(query) {
    const raw = norm(query);
    const q = raw.replace(/\b(?:laguna|city of)\b/g, ' ').replace(/\s+/g, ' ').trim();
    if (!q) return null;
    const exact = outsideIndex.find((e) => e.alias === raw || e.alias === q || `${e.alias} calamba` === q || `${e.alias} city` === q);
    if (exact) return asResolved(exact.place, exact.alias);
    if (q.length >= 6) {
        const near = outsideIndex.find((e) => e.alias.length >= 6 && !/\d/.test(e.alias) && lev(q, e.alias) <= 1);
        if (near) return asResolved(near.place, near.alias);
    }
    return null;
}

// Words before a place name that make it a place, for names that are also everyday words ("punta", "lawa")
const CUE_BEFORE = /(?:^|\s)(?:brgy|barangay|bgy|from|galing|mula|to|papunta|papuntang|patungo|patungong|hanggang|going to|go to|pupunta|pumunta|punta|sa|nasa|at|in)\s*$/;

/** The first place outside the area mentioned in free text, or null. */
function findOutsideInText(text) {
    const t = ` ${norm(text)} `;
    for (const e of outsideIndex) {
        const i = t.indexOf(` ${e.alias} `);
        if (i < 0) continue;
        if (e.place.needsCue && !CUE_BEFORE.test(t.slice(0, i))) continue;
        return asResolved(e.place, e.alias);
    }
    return null;
}

module.exports = { inScope, originReachable, findOutside, findOutsideInText, ORIGIN_MAX_DEG, norm };
