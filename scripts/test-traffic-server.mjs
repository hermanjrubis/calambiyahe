// scripts/test-traffic-server.mjs
// Test suite for traffic server endpoints with TRAFFIC_MOCK=1

import http from 'http';
import express from 'express';
import fs from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { createTrafficRouter, trimPrivateRanges, TRANSPARENT_TILE_PNG, haversineM, decodePolyline } = require(path.join(here, '..', 'server', 'traffic.js'));

process.env.TRAFFIC_MOCK = '1';

const app = express();
// Simulate server.js middleware
app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
});
app.use('/api/traffic', createTrafficRouter());

const server = http.createServer(app);

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`PASS  ${message}`);
        passed++;
    } else {
        console.error(`FAIL  ${message}`);
        failed++;
    }
}

function req(path) {
    return new Promise((resolve, reject) => {
        const addr = server.address();
        const url = `http://127.0.0.1:${addr.port}${path}`;
        http.get(url, (res) => {
            let data = [];
            res.on('data', chunk => data.push(chunk));
            res.on('end', () => {
                const body = Buffer.concat(data);
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: body.toString('utf8'),
                    buffer: body
                });
            });
        }).on('error', reject);
    });
}

server.listen(0, '127.0.0.1', async () => {
    try {
        console.log('--- Endpoint Tests with TRAFFIC_MOCK=1 ---');

        // 1. Valid Tile
        // Coverage bbox center: lng ~121.155, lat ~14.195. At z=14: x=13705, y=7539
        const validTile = await req('/api/traffic/tile/14/13705/7539.png');
        assert(validTile.status === 200, `Valid tile returns 200 (got ${validTile.status})`);
        assert(validTile.headers['content-type'] === 'image/png', `Tile content-type is image/png (got ${validTile.headers['content-type']})`);
        assert(validTile.headers['cache-control'] === 'public, s-maxage=120, max-age=60', `Tile Cache-Control header matches spec (got ${validTile.headers['cache-control']})`);
        assert(validTile.buffer.length > 50, `Tile payload has valid byte length (${validTile.buffer.length} bytes)`);

        // 1b. Corridor tile: z15 tile over starosa-calamba near Banlic/Cabuyao (14.237683, 121.133406) -> allowed (mock tile, 200)
        // lon2tile(121.133406, 15) = 27409, lat2tile(14.237683, 15) = 15074
        const banlicTile = await req('/api/traffic/tile/15/27409/15074.png');
        assert(banlicTile.status === 200, `Banlic corridor tile returns 200 (got ${banlicTile.status})`);
        assert(banlicTile.headers['content-type'] === 'image/png', `Banlic tile is image/png (got ${banlicTile.headers['content-type']})`);
        assert(banlicTile.headers['cache-control'] === 'public, s-maxage=120, max-age=60', `Banlic tile Cache-Control is s-maxage=120 (got ${banlicTile.headers['cache-control']})`);
        assert(banlicTile.buffer.length > 50, `Banlic tile payload is non-empty (${banlicTile.buffer.length} bytes)`);

        // 1c. Lake tile: z15 tile over Laguna de Bay at about 14.25, 121.21 -> transparent placeholder (200, s-maxage=86400, no upstream call)
        // First confirm it is more than 1.5 km from every route path:
        const routesData = JSON.parse(fs.readFileSync(path.join(here, '..', 'public', 'data', 'transit-routes.json'), 'utf8'));
        const lakeCoord = [14.25, 121.21];
        let minLakeDistM = Infinity;
        routesData.routes.forEach((r) => {
            const precision = r.precision || routesData.polylinePrecision || 5;
            const pts = decodePolyline(r.polyline || '', precision);
            pts.forEach((pt) => {
                const d = haversineM(lakeCoord, pt);
                if (d < minLakeDistM) minLakeDistM = d;
            });
        });
        assert(minLakeDistM > 1500, `Laguna de Bay point is > 1.5 km from every route (${Math.round(minLakeDistM)}m)`);

        // lon2tile(121.21, 15) = 27416, lat2tile(14.25, 15) = 15073
        const lakeTile = await req('/api/traffic/tile/15/27416/15073.png');
        assert(lakeTile.status === 200, `Lake tile returns 200 transparent placeholder (got ${lakeTile.status})`);
        assert(lakeTile.headers['content-type'] === 'image/png', `Lake tile is image/png (got ${lakeTile.headers['content-type']})`);
        assert(lakeTile.headers['cache-control'] === 'public, s-maxage=86400', `Lake tile Cache-Control is s-maxage=86400 (got ${lakeTile.headers['cache-control']})`);
        assert(lakeTile.buffer.equals(TRANSPARENT_TILE_PNG), 'Lake tile matches transparent PNG placeholder buffer');

        // 1d. Tile far outside: Manila (14.5995, 120.9842) at z15 -> 404
        // lon2tile(120.9842, 15) = 27396, lat2tile(14.5995, 15) = 15040
        const manilaTile = await req('/api/traffic/tile/15/27396/15040.png');
        assert(manilaTile.status === 404, `Manila tile outside routes' overall bbox returns 404 (got ${manilaTile.status})`);

        // 2. Out-of-bounds tile (zoom < 12)
        const lowZoom = await req('/api/traffic/tile/11/1000/1000.png');
        assert(lowZoom.status === 404, `Low zoom (< 12) returns 404 (got ${lowZoom.status})`);

        // 3. Out-of-bounds tile (outside Calzada coverage bbox)
        const outBbox = await req('/api/traffic/tile/14/100/100.png');
        assert(outBbox.status === 404, `Out-of-bounds bbox tile returns 404 (got ${outBbox.status})`);

        // 4. Valid leg endpoint
        const validLeg = await req('/api/traffic/leg?route=calamba-tanauan&from=0&to=2150');
        assert(validLeg.status === 200, `Valid leg returns 200 (got ${validLeg.status})`);
        assert(validLeg.headers['cache-control'] === 'public, s-maxage=300', `Leg Cache-Control header matches spec (got ${validLeg.headers['cache-control']})`);
        const legJson = JSON.parse(validLeg.body);
        assert(legJson.live === true, 'Leg json has live: true');
        assert(legJson.routeId === 'calamba-tanauan', `Leg routeId matches (got ${legJson.routeId})`);
        assert(legJson.fromM === 0 && legJson.toM === 2150, `Leg fromM/toM rounded properly (${legJson.fromM} -> ${legJson.toM})`);

        // 5. Unknown routeId -> 400
        const unknownRoute = await req('/api/traffic/leg?route=fake-route-id&from=0&to=1000');
        assert(unknownRoute.status === 400, `Unknown routeId returns 400 (got ${unknownRoute.status})`);

        // 6. Bad from/to (to <= from) -> 400
        const badRange = await req('/api/traffic/leg?route=calamba-tanauan&from=1000&to=500');
        assert(badRange.status === 400, `Reversed from/to returns 400 (got ${badRange.status})`);

        // 7. Bad from/to (ride < 300m) -> 400
        const tooShort = await req('/api/traffic/leg?route=calamba-tanauan&from=0&to=150');
        assert(tooShort.status === 400, `Ride < 300m returns 400 (got ${tooShort.status})`);

        // 8. Missing route -> 400
        const missingRoute = await req('/api/traffic/leg?from=0&to=1000');
        assert(missingRoute.status === 400, `Missing routeId returns 400 (got ${missingRoute.status})`);

        // 9. Path mismatch mock fixture
        const mismatchLeg = await req('/api/traffic/leg?route=starosa-calamba&from=0&to=1000');
        const mismatchJson = JSON.parse(mismatchLeg.body);
        assert(mismatchJson.live === false && mismatchJson.reason === 'path_mismatch', `path_mismatch fixture returned live: false, reason: path_mismatch`);

        // 10. Budget mock fixture
        const budgetLeg = await req('/api/traffic/leg?route=newtranspo-real&from=0&to=1900');
        const budgetJson = JSON.parse(budgetLeg.body);
        assert(budgetJson.live === false && budgetJson.reason === 'budget', `budget fixture returned live: false, reason: budget`);

        // 11. trimPrivateRanges Unit Tests
        console.log('\n--- PrivateM Trim Tests ---');
        const trimStart = trimPrivateRanges([[0, 625]], 0, 2150);
        assert(trimStart.effFrom === 625 && trimStart.effTo === 2150 && trimStart.publicLenM === 1525 && trimStart.trimmedM === 625, 'trimPrivateRanges trims start touching privateM');

        const trimEnd = trimPrivateRanges([[1000, 1500]], 0, 1400);
        assert(trimEnd.effFrom === 0 && trimEnd.effTo === 1000 && trimEnd.publicLenM === 1000 && trimEnd.trimmedM === 400, 'trimPrivateRanges trims end touching privateM');

        const trimMiddle = trimPrivateRanges([[500, 800]], 0, 1500);
        assert(trimMiddle.effFrom === 0 && trimMiddle.effTo === 1500 && trimMiddle.publicLenM === 1500 && trimMiddle.trimmedM === 0, 'trimPrivateRanges does NOT trim private range in the middle');

        const trimTooShortRange = trimPrivateRanges([[0, 625]], 0, 800);
        assert(trimTooShortRange.publicLenM === 175 && trimTooShortRange.publicLenM < 300, 'trimPrivateRanges detects public part < 300m');

        // 12. Server endpoint with trimmed start (calamba-tanauan 0 -> 2150)
        const trimmedLeg = await req('/api/traffic/leg?route=calamba-tanauan&from=0&to=2150');
        const trimmedJson = JSON.parse(trimmedLeg.body);
        assert(trimmedJson.live === true && trimmedJson.privateM === 625 && trimmedJson.lengthM === 1525, 'Server returns privateM: 625 and public lengthM: 1525 for calamba-tanauan');

        // 13. Server endpoint with public part < 300m -> live: false, reason: 'too_short'
        const shortPublicLeg = await req('/api/traffic/leg?route=calamba-tanauan&from=0&to=800');
        const shortPublicJson = JSON.parse(shortPublicLeg.body);
        assert(shortPublicJson.live === false && shortPublicJson.reason === 'too_short', "Server returns live: false, reason: 'too_short' when public part < 300m");

        // 14. Riding direction: dir=r is its own leg (other side of the road)
        console.log('\n--- Direction (dir=r) ---');
        const revLeg = JSON.parse((await req('/api/traffic/leg?route=calamba-tanauan&from=0&to=2150&dir=r')).body);
        assert(revLeg.live === true && revLeg.dir === -1 && revLeg.privateM === 625, `dir=r leg answers with dir -1 and the same private trim (dir ${revLeg.dir}, privateM ${revLeg.privateM})`);
        assert(revLeg.travelSec !== 900, `dir=r does not reuse the forward fixture (travelSec ${revLeg.travelSec})`);
        const fwdLeg = JSON.parse((await req('/api/traffic/leg?route=calamba-tanauan&from=0&to=2150')).body);
        assert(fwdLeg.dir === 1, 'forward leg answers with dir 1');

        // 15. /leg-colors
        console.log('\n--- Leg colours ---');
        const lc = await req('/api/traffic/leg-colors?route=calamba-tanauan&from=0&to=2150');
        const lcJson = JSON.parse(lc.body);
        assert(lc.status === 200 && lcJson.live === true, 'leg-colors returns live: true in mock mode');
        assert((lc.headers['cache-control'] || '').includes('s-maxage=120'), `leg-colors Cache-Control s-maxage=120 (got ${lc.headers['cache-control']})`);
        const st = lcJson.stretches || [];
        assert(st.length > 2 && st[0].fromM === 0 && st[0].toM === 625 && st[0].cls === 'unknown', 'leg-colors: SM driveway (privateM 0-625) is unknown');
        const tiles = st.every((s, i) => i === 0 || Math.abs(s.fromM - st[i - 1].toM) <= 1);
        assert(tiles && st[st.length - 1].toM === 2150, 'leg-colors: stretches tile 0..2150 without gaps');
        assert(st.some((s) => s.cls === 'heavy') && st.some((s) => s.cls === 'stopped'), 'leg-colors: mock has heavy and stopped stretches');
        const lcRev = JSON.parse((await req('/api/traffic/leg-colors?route=calamba-tanauan&from=0&to=2150&dir=r')).body);
        const rs = lcRev.stretches || [];
        assert(lcRev.dir === -1 && rs[rs.length - 1].cls === 'normal' && rs[rs.length - 2].cls === 'slow', 'leg-colors dir=r: travel order runs from the high-position end');
        const fix = JSON.parse((await req('/api/traffic/leg-colors?route=crossing-halang&from=0&to=1550')).body);
        assert(fix.live === true && fix.stretches.some((s) => s.closed === true), 'leg-colors fixture with a closed stretch');
        const low = JSON.parse((await req('/api/traffic/leg-colors?route=crossing-real&from=0&to=1750')).body);
        assert(low.live === false && low.reason === 'low_match', 'leg-colors low_match fixture -> live: false');
        const bud = JSON.parse((await req('/api/traffic/leg-colors?route=newtranspo-real&from=0&to=1900')).body);
        assert(bud.live === false && bud.reason === 'budget', 'leg-colors budget fixture -> live: false');
        const lcShort = JSON.parse((await req('/api/traffic/leg-colors?route=calamba-tanauan&from=0&to=700')).body);
        assert(lcShort.live === false && lcShort.reason === 'too_short', 'leg-colors public part < 100 m -> too_short');
        assert((await req('/api/traffic/leg-colors?route=nope&from=0&to=1000')).status === 400, 'leg-colors unknown route -> 400');
        assert((await req('/api/traffic/leg-colors?route=calamba-tanauan&from=0')).status === 400, 'leg-colors missing to -> 400');
        assert((await req('/api/traffic/leg-colors?route=calamba-tanauan&from=1000&to=500')).status === 400, 'leg-colors reversed from/to -> 400');

        console.log(`\n========================================`);
        console.log(`Server Tests Summary: ${passed} passed, ${failed} failed`);
        console.log(`========================================`);

        server.close();
        if (failed > 0) process.exit(1);
    } catch (e) {
        console.error('Test execution failed:', e);
        server.close();
        process.exit(1);
    }
});
