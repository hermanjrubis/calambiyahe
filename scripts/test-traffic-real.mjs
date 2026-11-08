// scripts/test-traffic-real.mjs
// Real upstream test against TomTom API (with real TOMTOM_API_KEY from .env)

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, '..');

// Load .env from project root
dotenv.config({ path: path.join(rootDir, '.env') });
delete process.env.TRAFFIC_MOCK;

const { createTrafficRouter } = await import('../server/traffic.js');

const app = express();
app.use('/api/traffic', createTrafficRouter());

const server = http.createServer(app);
server.listen(0, '127.0.0.1', async () => {
    const port = server.address().port;
    const base = `http://127.0.0.1:${port}/api/traffic`;

    console.log(`Server listening on ${base}`);
    console.log(`TOMTOM_API_KEY configured: ${Boolean(process.env.TOMTOM_API_KEY)}`);

    const callLeg = async (label, url) => {
        console.log(`\n========================================`);
        console.log(`Calling: ${label}`);
        console.log(`URL: ${url}`);
        const res = await fetch(`${base}${url}`);
        const json = await res.json();
        console.log(`Status: ${res.status}`);
        console.log(`Response:`, JSON.stringify(json, null, 2));
        return json;
    };

    // a) route that serves Halang from Crossing GT to Halang alight point (crossing-halang: 0 -> 1550)
    await callLeg('a) Crossing Grand Terminal -> Halang (crossing-halang)', '/leg?route=crossing-halang&from=0&to=1550');

    // b) calamba-tanauan from SM Calamba Inner Rd Terminal to Jollibee Real (0 -> 2150)
    await callLeg('b) SM Calamba Inner Rd Terminal -> Jollibee Real (calamba-tanauan)', '/leg?route=calamba-tanauan&from=0&to=2150');

    // c) starosa-calamba, ~5 km slice ending at SM Calamba (7450 -> 12450)
    await callLeg('c) Sta. Rosa - Calamba ~5km slice to SM Calamba (starosa-calamba)', '/leg?route=starosa-calamba&from=7450&to=12450');

    // 3. Tile at zoom 15 over Calamba Crossing
    console.log(`\n========================================`);
    console.log(`Fetching tile over Calamba Crossing: z=15, x=27411, y=15077`);
    const tileRes = await fetch(`${base}/tile/15/27411/15077.png`);
    console.log(`Tile Status: ${tileRes.status}`);
    console.log(`Tile Content-Type: ${tileRes.headers.get('content-type')}`);
    console.log(`Tile Cache-Control: ${tileRes.headers.get('cache-control')}`);

    const scratchDir = path.join(rootDir, 'scratch');
    if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
    const tileBuf = Buffer.from(await tileRes.arrayBuffer());
    const tilePath = path.join(scratchDir, 'tile-check.png');
    fs.writeFileSync(tilePath, tileBuf);
    console.log(`Saved tile (${tileBuf.length} bytes) to ${tilePath}`);

    server.close();
});

