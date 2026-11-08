/**
 * server/traffic.js
 *
 * Traffic API proxy & traffic-aware jeep leg estimator for Calzada.
 * Keeps TomTom API key strictly on the server (never exposed to client).
 *
 * Endpoints:
 *   GET /api/traffic/tile/:z/:x/:y.png - Proxies TomTom Traffic Flow raster tiles
 *   GET /api/traffic/leg?route=<routeId>&from=<m>&to=<m> - Evaluates traffic along jeep path
 */

const https = require('https');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

// Load transit routes and coverage data
const routesPath = path.resolve(__dirname, '../public/data/transit-routes.json');
const coveragePath = path.resolve(__dirname, '../public/data/coverage.json');

let transitRoutesData = { routes: [] };
let coverageData = { bbox: [121.140022, 14.186224, 121.183498, 14.209970] };

try {
    if (fs.existsSync(routesPath)) {
        transitRoutesData = JSON.parse(fs.readFileSync(routesPath, 'utf8'));
    }
    if (fs.existsSync(coveragePath)) {
        coverageData = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
    }
} catch (err) {
    console.error('[traffic] Failed to load initial data:', err.message);
}

// Coverage Bounding Box padded by 2 km
// At ~14.2° N: 2 km ≈ 0.018087° lat, ~0.018525° lng
const baseBbox = coverageData.bbox || [121.140022, 14.186224, 121.183498, 14.209970];
const PADDED_BBOX = [
    baseBbox[0] - 0.018525, // minLng
    baseBbox[1] - 0.018087, // minLat
    baseBbox[2] + 0.018525, // maxLng
    baseBbox[3] + 0.018087  // maxLat
];

// Helper: Haversine distance in metres
const toRad = (d) => (d * Math.PI) / 180;
function haversineM(a, b) {
    const R = 6371000;
    const dLat = toRad(b[0] - a[0]);
    const dLng = toRad(b[1] - a[1]);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Google encoded polyline decoder
function decodePolyline(str, precision = 5) {
    const factor = Math.pow(10, precision);
    const pts = [];
    let i = 0, lat = 0, lng = 0;
    while (i < str.length) {
        const vals = [0, 0];
        for (let k = 0; k < 2; k++) {
            let result = 0, shift = 0, b;
            do {
                b = str.charCodeAt(i++) - 63;
                result |= (b & 0x1f) << shift;
                shift += 5;
            } while (b >= 0x20);
            vals[k] = (result & 1) ? ~(result >> 1) : (result >> 1);
        }
        lat += vals[0];
        lng += vals[1];
        pts.push([lat / factor, lng / factor]);
    }
    return pts;
}

// Pre-process routes: compute cumulative metre positions along the route polyline
const routeCache = new Map();
function getPreparedRoute(routeId) {
    if (!routeId) return null;
    if (routeCache.has(routeId)) return routeCache.get(routeId);
    const raw = (transitRoutesData.routes || []).find((r) => r.id === routeId);
    if (!raw) return null;
    const precision = raw.precision || transitRoutesData.polylinePrecision || 5;
    const pts = decodePolyline(raw.polyline || '', precision);
    if (pts.length < 2) return null;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
        cum.push(cum[i - 1] + haversineM(pts[i - 1], pts[i]));
    }
    const prepared = {
        ...raw,
        pts,
        cum,
        len: cum[cum.length - 1]
    };
    routeCache.set(routeId, prepared);
    return prepared;
}

// Interpolate a [lat, lng] point along the route at distance posM
function pointAtDistance(route, posM) {
    const { pts, cum, len } = route;
    if (posM <= 0) return pts[0].slice();
    if (posM >= len) return pts[pts.length - 1].slice();
    for (let i = 1; i < cum.length; i++) {
        if (cum[i] >= posM) {
            const seg = cum[i] - cum[i - 1] || 1;
            const t = Math.max(0, Math.min(1, (posM - cum[i - 1]) / seg));
            const a = pts[i - 1], b = pts[i];
            return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
        }
    }
    return pts[pts.length - 1].slice();
}

// Slice path of a route between fromM and toM (toM > fromM)
function sliceRoutePath(route, fromM, toM) {
    const lo = Math.max(0, fromM);
    const hi = Math.min(route.len, toM);
    const out = [pointAtDistance(route, lo)];
    for (let i = 0; i < route.pts.length; i++) {
        if (route.cum[i] > lo && route.cum[i] < hi) {
            out.push(route.pts[i].slice());
        }
    }
    out.push(pointAtDistance(route, hi));
    return out;
}

// Simplify path points to fit TomTom supporting points limits (max ~50 points)
function simplifySupportingPoints(pts, maxPoints = 50) {
    if (pts.length <= maxPoints) return pts;
    const step = (pts.length - 1) / (maxPoints - 1);
    const out = [];
    for (let i = 0; i < maxPoints; i++) {
        const idx = Math.min(pts.length - 1, Math.round(i * step));
        out.push(pts[idx]);
    }
    // Guarantee start and end match exactly
    out[0] = pts[0];
    out[out.length - 1] = pts[pts.length - 1];
    return out;
}

// Trim private ranges (e.g. mall driveways) touching the START or END of the slice
function trimPrivateRanges(privateRanges, fromM, toM) {
    let effFrom = fromM;
    let effTo = toM;
    let trimmedM = 0;

    if (Array.isArray(privateRanges)) {
        for (const [pStart, pEnd] of privateRanges) {
            // Range touches the START of the requested slice
            if (fromM >= pStart && fromM < pEnd) {
                const trimTarget = Math.min(toM, pEnd);
                trimmedM += (trimTarget - effFrom);
                effFrom = trimTarget;
            }
            // Range touches the END of the requested slice
            if (toM > pStart && toM <= pEnd) {
                const trimTarget = Math.max(fromM, pStart);
                trimmedM += (effTo - trimTarget);
                effTo = trimTarget;
            }
        }
    }

    const publicLenM = Math.max(0, effTo - effFrom);
    return { effFrom, effTo, publicLenM, trimmedM };
}

// Web Mercator tile conversion & bounding box
function tileToLon(x, z) {
    return (x / Math.pow(2, z)) * 360 - 180;
}
function tileToLat(y, z) {
    const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}
function tileIntersectsBbox(z, x, y, bbox) {
    const tileMinLng = tileToLon(x, z);
    const tileMaxLng = tileToLon(x + 1, z);
    const tileMinLat = tileToLat(y + 1, z);
    const tileMaxLat = tileToLat(y, z);

    // bbox: [minLng, minLat, maxLng, maxLat]
    return !(tileMaxLng < bbox[0] || tileMinLng > bbox[2] || tileMaxLat < bbox[1] || tileMinLat > bbox[3]);
}

// Plain coloured test tile (256x256 PNG) for TRAFFIC_MOCK=1
function createMockTileBuffer() {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    function chunk(type, data) {
        const len = Buffer.alloc(4);
        len.writeUInt32BE(data.length);
        const t = Buffer.from(type, 'ascii');
        const body = Buffer.concat([t, data]);
        const crc = Buffer.alloc(4);
        const crcVal = typeof zlib.crc32 === 'function' ? zlib.crc32(body) : 0;
        crc.writeUInt32BE(crcVal);
        return Buffer.concat([len, body, crc]);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(256, 0);
    ihdr.writeUInt32BE(256, 4);
    ihdr.writeUInt8(8, 8);
    ihdr.writeUInt8(6, 9); // RGBA
    ihdr.writeUInt8(0, 10);
    ihdr.writeUInt8(0, 11);
    ihdr.writeUInt8(0, 12);
    // Greenish transparent traffic flow test tile: #2EAB30 with alpha ~120
    const rawRow = Buffer.alloc(1 + 256 * 4);
    for (let x = 0; x < 256; x++) {
        rawRow[1 + x * 4] = 46;
        rawRow[1 + x * 4 + 1] = 171;
        rawRow[1 + x * 4 + 2] = 48;
        rawRow[1 + x * 4 + 3] = 120;
    }
    const rawData = Buffer.concat(Array(256).fill(rawRow));
    const compressed = zlib.deflateSync(rawData);
    return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}
const MOCK_TILE_PNG = createMockTileBuffer();

// Transparent 256x256 PNG for unserved areas inside the overall route bbox (no upstream call, no 404 console flood)
function createTransparentTileBuffer() {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    function chunk(type, data) {
        const len = Buffer.alloc(4);
        len.writeUInt32BE(data.length);
        const t = Buffer.from(type, 'ascii');
        const body = Buffer.concat([t, data]);
        const crc = Buffer.alloc(4);
        const crcVal = typeof zlib.crc32 === 'function' ? zlib.crc32(body) : 0;
        crc.writeUInt32BE(crcVal);
        return Buffer.concat([len, body, crc]);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(256, 0);
    ihdr.writeUInt32BE(256, 4);
    ihdr.writeUInt8(8, 8);
    ihdr.writeUInt8(6, 9); // RGBA
    ihdr.writeUInt8(0, 10);
    ihdr.writeUInt8(0, 11);
    ihdr.writeUInt8(0, 12);
    const rawRow = Buffer.alloc(1 + 256 * 4); // all zeroes = 100% transparent RGBA
    const rawData = Buffer.concat(Array(256).fill(rawRow));
    const compressed = zlib.deflateSync(rawData);
    return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}
const TRANSPARENT_TILE_PNG = createTransparentTileBuffer();

// Memory cache for route corridor & allowed tile calculations
let allowedAreaCache = null;

function getAllowedAreaData() {
    if (allowedAreaCache) return allowedAreaCache;

    const baseBbox = coverageData.bbox || [121.140022, 14.186224, 121.183498, 14.209970];
    const coveragePaddedBbox = [
        baseBbox[0] - 0.018525, // minLng
        baseBbox[1] - 0.018087, // minLat
        baseBbox[2] + 0.018525, // maxLng
        baseBbox[3] + 0.018087  // maxLat
    ];

    let minLat = baseBbox[1], maxLat = baseBbox[3], minLng = baseBbox[0], maxLng = baseBbox[2];
    const sampledPoints = [];

    (transitRoutesData.routes || []).forEach((r) => {
        const precision = r.precision || transitRoutesData.polylinePrecision || 5;
        const pts = decodePolyline(r.polyline || '', precision);
        if (pts.length < 2) return;
        const cum = [0];
        for (let i = 1; i < pts.length; i++) {
            cum.push(cum[i - 1] + haversineM(pts[i - 1], pts[i]));
        }
        const len = cum[cum.length - 1];

        // Sample every ~200 m along route
        for (let d = 0; d < len; d += 200) {
            for (let i = 1; i < cum.length; i++) {
                if (cum[i] >= d) {
                    const seg = cum[i] - cum[i - 1] || 1;
                    const t = Math.max(0, Math.min(1, (d - cum[i - 1]) / seg));
                    const a = pts[i - 1], b = pts[i];
                    sampledPoints.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
                    break;
                }
            }
        }
        sampledPoints.push(pts[pts.length - 1].slice());

        pts.forEach(([lat, lng]) => {
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
        });
    });

    const midLat = (minLat + maxLat) / 2;
    const latPad = 1500 / (6371000 * Math.PI / 180);
    const lngPad = 1500 / (6371000 * Math.PI / 180 * Math.cos((midLat * Math.PI) / 180));
    const routesOverallPaddedBbox = [
        minLng - lngPad,
        minLat - latPad,
        maxLng + lngPad,
        maxLat + latPad
    ];

    allowedAreaCache = {
        coveragePaddedBbox,
        sampledPoints,
        routesOverallPaddedBbox,
        tileAllowedCache: new Map()
    };

    return allowedAreaCache;
}

function isTileAllowed(z, x, y) {
    const area = getAllowedAreaData();
    const key = `${z}:${x}:${y}`;
    if (area.tileAllowedCache.has(key)) {
        return area.tileAllowedCache.get(key);
    }

    if (tileIntersectsBbox(z, x, y, area.coveragePaddedBbox)) {
        area.tileAllowedCache.set(key, true);
        return true;
    }

    const tileMinLng = tileToLon(x, z);
    const tileMaxLng = tileToLon(x + 1, z);
    const tileMinLat = tileToLat(y + 1, z);
    const tileMaxLat = tileToLat(y, z);

    for (let i = 0; i < area.sampledPoints.length; i++) {
        const pt = area.sampledPoints[i];
        const clampLat = Math.max(tileMinLat, Math.min(tileMaxLat, pt[0]));
        const clampLng = Math.max(tileMinLng, Math.min(tileMaxLng, pt[1]));
        if (haversineM(pt, [clampLat, clampLng]) <= 1500) {
            area.tileAllowedCache.set(key, true);
            return true;
        }
    }

    area.tileAllowedCache.set(key, false);
    return false;
}

// Mock fixtures loaded lazily only when TRAFFIC_MOCK=1 (never in production/Vercel)
let mockFixtures = null;
function getMockFixtures() {
    if (mockFixtures !== null) return mockFixtures;
    mockFixtures = {};
    try {
        const fixPath = path.resolve(__dirname, '../scripts/fixtures/traffic-mock.json');
        if (fs.existsSync(fixPath)) {
            mockFixtures = JSON.parse(fs.readFileSync(fixPath, 'utf8'));
        }
    } catch (_) {}
    return mockFixtures;
}

// Date in Asia/Manila for daily budget tracking
function getManilaDateKey() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
}

/**
 * Check and increment daily TomTom routing budget in Firestore.
 * Returns true if call is permitted under budget, false if budget exceeded.
 */
async function checkAndIncrementBudget(adminDb) {
    const db = typeof adminDb === 'function' ? adminDb() : adminDb;
    if (!db) return true;
    const dateKey = getManilaDateKey();
    const budget = parseInt(process.env.TRAFFIC_DAILY_BUDGET || '600', 10);
    const docRef = db.collection('trafficUsage').doc(dateKey);
    try {
        const allowed = await db.runTransaction(async (t) => {
            const doc = await t.get(docRef);
            const count = (doc.exists && doc.data() && doc.data().count) || 0;
            if (count >= budget) {
                return false;
            }
            t.set(docRef, { count: count + 1, updatedAt: new Date().toISOString() }, { merge: true });
            return true;
        });
        return allowed;
    } catch (err) {
        console.error('[traffic] Firestore budget tracking error:', err.message);
        return true;
    }
}

/**
 * Express router factory for traffic endpoints
 */
function createTrafficRouter({ adminDb } = {}) {
    const express = require('express');
    const router = express.Router();

    // 1. GET /api/traffic/tile/:z/:x/:y.png
    router.get('/tile/:z/:x/:y.png', (req, res) => {
        const z = parseInt(req.params.z, 10);
        const x = parseInt(req.params.x, 10);
        const y = parseInt(req.params.y, 10);

        // Zoom constraint: 12-18
        if (isNaN(z) || isNaN(x) || isNaN(y) || z < 12 || z > 18) {
            return res.status(404).send('Tile zoom out of range (12-18)');
        }
        const maxTile = Math.pow(2, z);
        if (x < 0 || x >= maxTile || y < 0 || y >= maxTile) {
            return res.status(404).send('Invalid tile coordinates');
        }

        const area = getAllowedAreaData();

        // Outside the routes' overall bbox (+1.5 km): 404
        if (!tileIntersectsBbox(z, x, y, area.routesOverallPaddedBbox)) {
            return res.status(404).send('Tile outside coverage bounding box');
        }

        // Inside the routes' overall bbox, but not allowed (e.g. over the lake, far from any route):
        // return transparent 256x256 PNG with s-maxage=86400, no TomTom call
        if (!isTileAllowed(z, x, y)) {
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'public, s-maxage=86400');
            return res.send(TRANSPARENT_TILE_PNG);
        }

        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, s-maxage=120, max-age=60');

        const isMock = process.env.TRAFFIC_MOCK === '1' || !process.env.TOMTOM_API_KEY;
        if (isMock) {
            return res.send(MOCK_TILE_PNG);
        }

        // Upstream call to TomTom Traffic Flow Raster tile
        const apiKey = process.env.TOMTOM_API_KEY;
        const upstreamUrl = `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/${z}/${x}/${y}.png?key=${encodeURIComponent(apiKey)}&tileSize=256`;

        const request = https.get(upstreamUrl, (upRes) => {
            if (upRes.statusCode !== 200) {
                console.warn(`[traffic] TomTom tile status ${upRes.statusCode} for ${z}/${x}/${y}`);
                upRes.resume();
                return res.status(upRes.statusCode === 404 ? 404 : 502).send('Upstream tile error');
            }
            upRes.pipe(res);
        });

        request.on('error', (err) => {
            console.error('[traffic] TomTom tile proxy error:', err.message);
            if (!res.headersSent) {
                res.status(502).send('Upstream error');
            }
        });

        request.setTimeout(4000, () => {
            request.destroy();
            if (!res.headersSent) {
                res.status(504).send('Tile request timeout');
            }
        });
    });

    // 2. GET /api/traffic/leg?route=<routeId>&from=<m>&to=<m>
    router.get('/leg', async (req, res) => {
        const { route: routeId, from, to } = req.query;

        if (!routeId) {
            return res.status(400).json({ error: 'missing_route_id' });
        }

        const preparedRoute = getPreparedRoute(routeId);
        if (!preparedRoute) {
            return res.status(400).json({ error: 'unknown_route' });
        }

        const fromNum = Number(from);
        const toNum = Number(to);

        if (!Number.isFinite(fromNum) || !Number.isFinite(toNum)) {
            return res.status(400).json({ error: 'invalid_from_to_numbers' });
        }

        // Round both to nearest 50 m on the server
        const fromRounded = Math.round(fromNum / 50) * 50;
        const toRounded = Math.round(toNum / 50) * 50;

        if (toRounded <= fromRounded || (toRounded - fromRounded) < 300) {
            return res.status(400).json({ error: 'invalid_range_or_too_short' });
        }

        if (fromRounded < 0 || toRounded > (preparedRoute.len + 50)) {
            return res.status(400).json({ error: 'out_of_path_bounds' });
        }

        res.setHeader('Cache-Control', 'public, s-maxage=300');

        const legKey = `${routeId}:${fromRounded}:${toRounded}`;
        const isMock = process.env.TRAFFIC_MOCK === '1';

        // Check for private ranges touching the START or END of the slice
        const { effFrom, effTo, publicLenM, trimmedM } = trimPrivateRanges(preparedRoute.privateM, fromRounded, toRounded);

        if (publicLenM < 300) {
            return res.json({ live: false, reason: 'too_short' });
        }

        if (isMock) {
            const fixtures = getMockFixtures();
            if (fixtures[legKey]) {
                const fix = fixtures[legKey];
                return res.json({
                    ...fix,
                    fromM: fromRounded,
                    toM: toRounded,
                    privateM: fix.privateM !== undefined ? fix.privateM : trimmedM,
                    updated: fix.updated || new Date().toISOString()
                });
            }
            // Deterministic default mock for any other leg in mock mode
            const lengthM = publicLenM;
            const noTrafficSec = Math.round(lengthM / (40 / 3.6)); // 40 km/h car free flow
            const travelSec = Math.round(lengthM / (28 / 3.6));   // 28 km/h typical
            const delaySec = Math.max(0, travelSec - noTrafficSec);
            return res.json({
                live: true,
                routeId,
                fromM: fromRounded,
                toM: toRounded,
                lengthM,
                travelSec,
                noTrafficSec,
                historicSec: travelSec,
                liveSec: travelSec,
                delaySec,
                privateM: trimmedM,
                updated: new Date().toISOString()
            });
        }

        const apiKey = process.env.TOMTOM_API_KEY;
        if (!apiKey) {
            console.warn('[traffic] TOMTOM_API_KEY not configured');
            return res.json({ live: false, reason: 'api_key_missing' });
        }

        // Budget guard check
        const underBudget = await checkAndIncrementBudget(adminDb);
        if (!underBudget) {
            console.warn(`[traffic] Daily budget limit reached for ${getManilaDateKey()}`);
            return res.json({ live: false, reason: 'budget' });
        }

        // Cut public slice of route
        const slicePoints = sliceRoutePath(preparedRoute, effFrom, effTo);
        if (slicePoints.length < 2) {
            return res.json({ live: false, reason: 'insufficient_slice_points' });
        }

        const simplified = simplifySupportingPoints(slicePoints, 50);
        const startPt = simplified[0];
        const endPt = simplified[simplified.length - 1];

        const postBody = JSON.stringify({
            supportingPoints: simplified.map((p) => ({
                latitude: Number(p[0].toFixed(6)),
                longitude: Number(p[1].toFixed(6))
            }))
        });

        const startParam = `${startPt[0].toFixed(6)},${startPt[1].toFixed(6)}`;
        const endParam = `${endPt[0].toFixed(6)},${endPt[1].toFixed(6)}`;
        const routingUrl = `https://api.tomtom.com/routing/1/calculateRoute/${startParam}:${endParam}/json?key=${encodeURIComponent(apiKey)}&traffic=true&travelMode=car&routeType=fastest&computeTravelTimeFor=all`;

        try {
            const result = await new Promise((resolve) => {
                const reqUpstream = https.request(
                    routingUrl,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Content-Length': Buffer.byteLength(postBody)
                        },
                        timeout: 4000
                    },
                    (resUpstream) => {
                        let data = '';
                        resUpstream.on('data', (c) => (data += c));
                        resUpstream.on('end', () => {
                            if (resUpstream.statusCode !== 200) {
                                console.error(`[traffic] TomTom calculateRoute error status ${resUpstream.statusCode}:`, data.slice(0, 200));
                                return resolve({ live: false, reason: `upstream_${resUpstream.statusCode}` });
                            }
                            try {
                                const parsed = JSON.parse(data);
                                resolve({ live: true, data: parsed });
                            } catch (e) {
                                resolve({ live: false, reason: 'json_parse_error' });
                            }
                        });
                    }
                );

                reqUpstream.on('error', (err) => {
                    console.error('[traffic] TomTom routing request error:', err.message);
                    resolve({ live: false, reason: 'upstream_error' });
                });

                reqUpstream.on('timeout', () => {
                    reqUpstream.destroy();
                    console.warn('[traffic] TomTom routing request timed out (4s)');
                    resolve({ live: false, reason: 'timeout' });
                });

                reqUpstream.write(postBody);
                reqUpstream.end();
            });

            if (!result.live || !result.data || !result.data.routes || !result.data.routes[0]) {
                return res.json({ live: false, reason: result.reason || 'no_route_found' });
            }

            const summary = result.data.routes[0].summary;
            const lengthM = summary.lengthInMeters || publicLenM;

            // Path check: length difference > 15% against the public part only
            const lenDiff = Math.abs(lengthM - publicLenM);
            if (publicLenM > 0 && lenDiff / publicLenM > 0.15) {
                console.warn(`[traffic] Path mismatch for ${routeId} (${effFrom}m -> ${effTo}m): TomTom ${lengthM}m vs slice ${publicLenM}m (${Math.round((lenDiff / publicLenM) * 100)}% diff)`);
                return res.json({ live: false, reason: 'path_mismatch' });
            }

            const travelSec = summary.travelTimeInSeconds || 0;
            const noTrafficSec = summary.noTrafficTravelTimeInSeconds || travelSec;
            const historicSec = summary.historicTrafficTravelTimeInSeconds || travelSec;
            const liveSec = summary.liveTrafficIncidentsTravelTimeInSeconds || travelSec;
            const delaySec = summary.trafficDelayInSeconds || Math.max(0, travelSec - noTrafficSec);

            return res.json({
                live: true,
                routeId,
                fromM: fromRounded,
                toM: toRounded,
                lengthM,
                travelSec,
                noTrafficSec,
                historicSec,
                liveSec,
                delaySec,
                privateM: trimmedM,
                updated: new Date().toISOString()
            });
        } catch (err) {
            console.error('[traffic] Unexpected routing handler error:', err.message);
            return res.json({ live: false, reason: 'server_error' });
        }
    });

    return router;
}

module.exports = {
    createTrafficRouter,
    PADDED_BBOX,
    getAllowedAreaData,
    isTileAllowed,
    tileIntersectsBbox,
    tileToLon,
    tileToLat,
    decodePolyline,
    haversineM,
    getPreparedRoute,
    sliceRoutePath,
    simplifySupportingPoints,
    trimPrivateRanges,
    createMockTileBuffer,
    createTransparentTileBuffer,
    TRANSPARENT_TILE_PNG
};
