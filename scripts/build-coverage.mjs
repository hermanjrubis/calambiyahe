/**
 * scripts/build-coverage.mjs
 *
 * Official Calzada Coverage Area Builder:
 * Queries OpenStreetMap via Overpass for official admin_level=10 barangay boundaries
 * inside Calamba City (admin_level=6).
 *
 * Targets:
 * - Uno: "Barangay 1" (OSM relation 7841160)
 * - Real: "Real" (OSM relation 7599136)
 * - Halang: "Halang" (OSM relation 7599175)
 *
 * Unions the 3 polygons, simplifies to ~5m tolerance, checks against places.json,
 * and saves to public/data/coverage.json.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as turf from '@turf/turf';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const OVERPASS_ENDPOINTS = [
    'https://overpass.openstreetmap.fr/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
];

async function queryOverpass(ql) {
    for (const ep of OVERPASS_ENDPOINTS) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 20000);
            const res = await fetch(ep, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'CalzadaCoverageBuilder/2.0 (contact: admin@calzada.ph)'
                },
                body: 'data=' + encodeURIComponent(ql),
                signal: controller.signal
            });
            clearTimeout(timeout);
            if (res.ok) {
                const data = await res.json();
                if (data && Array.isArray(data.elements)) {
                    return data.elements;
                }
            } else {
                console.log(`      Endpoint ${ep} returned ${res.status}`);
            }
        } catch (err) {
            console.log(`      Endpoint ${ep} failed:`, err.message);
        }
    }
    throw new Error('All Overpass API endpoints failed or timed out.');
}

async function buildCoverage() {
    console.log('=== Calzada Coverage Builder (Official OSM Barangay Boundaries) ===\n');

    // 1. Query Overpass for admin_level=10 relations inside Calamba City bbox
    const overpassQuery = `[out:json][timeout:30];
(
  relation["boundary"="administrative"]["admin_level"="10"](14.1377, 121.0198, 14.2662, 121.2214);
);
out tags;
`;

    console.log('[1/5] Querying Overpass for Calamba City barangay administrative relations...');
    const elements = await queryOverpass(overpassQuery);
    console.log(`      Received ${elements.length} administrative relations in Calamba bbox.`);

    // 2. Identify the 3 target barangays: Uno, Real, Halang
    const matchUno = elements.filter(e => /^(barangay\s*1\b|uno\b)/i.test(e.tags?.name || ''));
    const matchReal = elements.filter(e => /^real$/i.test(e.tags?.name || ''));
    const matchHalang = elements.filter(e => /^halang$/i.test(e.tags?.name || ''));

    if (matchUno.length !== 1) {
        console.error(`[ERROR] Match for Uno is ambiguous or missing (found ${matchUno.length}). Ask Drei which relation is right.`);
        console.error('Matches:', matchUno);
        process.exit(1);
    }
    if (matchReal.length !== 1) {
        console.error(`[ERROR] Match for Real is ambiguous or missing (found ${matchReal.length}). Ask Drei which relation is right.`);
        console.error('Matches:', matchReal);
        process.exit(1);
    }
    if (matchHalang.length !== 1) {
        console.error(`[ERROR] Match for Halang is ambiguous or missing (found ${matchHalang.length}). Ask Drei which relation is right.`);
        console.error('Matches:', matchHalang);
        process.exit(1);
    }

    const relUno = matchUno[0];
    const relReal = matchReal[0];
    const relHalang = matchHalang[0];

    const targets = [
        { key: 'Uno', rel: relUno },
        { key: 'Real', rel: relReal },
        { key: 'Halang', rel: relHalang }
    ];

    // 3. Fetch official Polygon geometry via Nominatim lookup
    console.log('\n[2/5] Fetching official boundary geometries from OpenStreetMap...');
    const osmIdsParam = targets.map(t => `R${t.rel.id}`).join(',');
    const nominatimUrl = `https://nominatim.openstreetmap.org/lookup?osm_ids=${osmIdsParam}&format=json&polygon_geojson=1`;
    const nomRes = await fetch(nominatimUrl, {
        headers: { 'User-Agent': 'CalzadaCoverageBuilder/2.0 (contact: admin@calzada.ph)' }
    });
    if (!nomRes.ok) {
        throw new Error(`Failed to fetch OSM geometry: HTTP ${nomRes.status}`);
    }
    const geomItems = await nomRes.json();
    const geomMap = new Map(geomItems.map(g => [Number(g.osm_id), g]));

    console.log('\nMatched Relations:');
    targets.forEach(t => {
        const item = geomMap.get(t.rel.id);
        if (!item || !item.geojson) {
            console.error(`[ERROR] Geometry missing for relation ${t.rel.id} (${t.rel.tags?.name})`);
            process.exit(1);
        }
        const areaKm2 = turf.area(item.geojson) / 1e6;
        t.geojson = item.geojson;
        t.areaKm2 = areaKm2;
        console.log(`  - OSM ID: ${t.rel.id}, Name: "${item.name || t.rel.tags?.name}", Area: ${areaKm2.toFixed(3)} km²`);
    });

    // 4. Union the 3 polygons and simplify to ~5m
    console.log('\n[3/5] Unioning and simplifying polygons to ~5 m tolerance...');
    let unionFeature = turf.feature(targets[0].geojson, { name: targets[0].key });
    for (let i = 1; i < targets.length; i++) {
        unionFeature = turf.union(turf.featureCollection([
            unionFeature,
            turf.feature(targets[i].geojson, { name: targets[i].key })
        ]));
    }

    // Simplify tolerance: 0.00005 degrees latitude is ~5.5 meters
    const simplifiedFeature = turf.simplify(unionFeature, { tolerance: 0.00005, highQuality: true });
    const totalAreaKm2 = turf.area(simplifiedFeature) / 1e6;
    const unionBbox = turf.bbox(simplifiedFeature);
    const polyCount = simplifiedFeature.geometry.type === 'Polygon'
        ? 1
        : (simplifiedFeature.geometry.coordinates || []).length;

    console.log(`  - Total Area: ${totalAreaKm2.toFixed(3)} km²`);
    console.log(`  - Polygon Count: ${polyCount}`);
    console.log(`  - BBox: [${unionBbox.map(n => n.toFixed(6)).join(', ')}]`);

    // 5. Check places from server/data/places.json
    console.log('\n[4/5] Checking places in server/data/places.json...');
    const placesPath = path.join(ROOT_DIR, 'server', 'data', 'places.json');
    const places = JSON.parse(fs.readFileSync(placesPath, 'utf8'));

    const primaryBarangays = ['Uno', 'Real', 'Halang'];
    const placesInTarget = places.filter(p => primaryBarangays.includes(p.barangay));
    const placesOutside = [];

    for (const p of placesInTarget) {
        const pt = turf.point([p.lng, p.lat]);
        if (!turf.booleanPointInPolygon(pt, simplifiedFeature)) {
            placesOutside.push({
                name: p.name,
                barangay: p.barangay,
                lat: p.lat,
                lng: p.lng
            });
        }
    }

    console.log(`  - Places tagged in Uno/Real/Halang: ${placesInTarget.length}`);
    console.log(`  - Places falling outside the official boundary: ${placesOutside.length}`);
    if (placesOutside.length > 0) {
        console.log('    List of outside places (added to the area, see below):');
        placesOutside.forEach((po, idx) => {
            const d = turf.pointToLineDistance(turf.point([po.lng, po.lat]), turf.polygonToLine(simplifiedFeature).features?.[0] || turf.polygonToLine(simplifiedFeature), { units: 'meters' });
            console.log(`      ${idx + 1}. "${po.name}" (Tagged: ${po.barangay}) ${Math.round(d)} m outside`);
        });
    }

    // Drei's decision: a place we list as Uno/Real/Halang is inside Calzada's area even where the OSM
    // line runs a little short of it (the OSM barangay lines are approximate). Each such place adds a
    // 120 m circle, joined to the area and smoothed (close by 60 m) so no thin necks or dents remain.
    let coverageFeature = simplifiedFeature;
    if (placesOutside.length > 0) {
        const circles = placesOutside.map(po => turf.buffer(turf.point([po.lng, po.lat]), 0.12, { units: 'kilometers', steps: 16 }));
        let joined = turf.union(turf.featureCollection([simplifiedFeature, ...circles]));
        joined = turf.buffer(joined, 0.06, { units: 'kilometers', steps: 8 });
        joined = turf.buffer(joined, -0.06, { units: 'kilometers', steps: 8 });
        coverageFeature = turf.simplify(joined, { tolerance: 0.00005, highQuality: true });
        const stillOut = placesInTarget.filter(p => !turf.booleanPointInPolygon(turf.point([p.lng, p.lat]), coverageFeature));
        console.log(`  - After adding them: ${(turf.area(coverageFeature) / 1e6).toFixed(3)} km², places still outside: ${stillOut.length}`);
        if (stillOut.length) {
            console.error('[ERROR] Some listed places are still outside the area:', stillOut.map(p => p.name).join(', '));
            process.exit(1);
        }
    }
    const coverageBbox = turf.bbox(coverageFeature);

    // Keep outliers (places in other barangays, e.g. Lecheria, Bucal)
    const outliers = places
        .filter(p => p.barangay && !primaryBarangays.includes(p.barangay))
        .map(p => ({ name: p.name, barangay: p.barangay }));

    console.log(`  - Outliers in other barangays (kept as outside our area): ${outliers.length}`);

    // 6. Write public/data/coverage.json
    console.log('\n[5/5] Saving public/data/coverage.json...');
    const coverageJson = {
        version: '1.0',
        barangays: primaryBarangays,
        outliers,
        area: {
            type: 'FeatureCollection',
            features: [
                {
                    type: 'Feature',
                    properties: {
                        name: 'Calzada Coverage Area',
                        barangays: primaryBarangays
                    },
                    geometry: coverageFeature.geometry
                }
            ]
        },
        bbox: coverageBbox
    };

    const outPath = path.join(ROOT_DIR, 'public', 'data', 'coverage.json');
    fs.writeFileSync(outPath, JSON.stringify(coverageJson, null, 2), 'utf8');
    const stat = fs.statSync(outPath);
    console.log(`  - Saved ${outPath} (${(stat.size / 1024).toFixed(1)} KB)`);
    console.log('\n=== Build Complete ===');
}

buildCoverage().catch(err => {
    console.error('Coverage build error:', err);
    process.exit(1);
});
