/**
 * scripts/make-fog-texture.mjs
 *
 * Generates a 256x256 seamless texture of soft white clouds on transparent.
 * Written to public/assets/map/fog-clouds.png. Must be under 40 KB.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WIDTH = 256;
const HEIGHT = 256;

// Pseudo-random deterministic noise table
function makeNoiseGrid(w, h, seed = 42) {
    let s = seed;
    function rand() {
        s = (s * 16807 + 12345) % 2147483647;
        return (s - 1) / 2147483646;
    }
    const grid = [];
    for (let y = 0; y < h; y++) {
        const row = [];
        for (let x = 0; x < w; x++) {
            row.push(rand());
        }
        grid.push(row);
    }
    return grid;
}

// Cosine smooth interpolation
function smoothStep(t) {
    return t * t * (3 - 2 * t);
}

// Seamless toroidal value noise
function sampleToroidalNoise(grid, gw, gh, x, y, periodX, periodY) {
    const gx = (x / periodX) % gw;
    const gy = (y / periodY) % gh;

    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const x1 = (x0 + 1) % gw;
    const y1 = (y0 + 1) % gh;

    const tx = smoothStep(gx - x0);
    const ty = smoothStep(gy - y0);

    const v00 = grid[y0][x0];
    const v10 = grid[y0][x1];
    const v01 = grid[y1][x0];
    const v11 = grid[y1][x1];

    const top = v00 * (1 - tx) + v10 * tx;
    const bot = v01 * (1 - tx) + v11 * tx;

    return top * (1 - ty) + bot * ty;
}

async function generateFogTexture() {
    const octaves = [
        { grid: makeNoiseGrid(4, 4, 101), gw: 4, gh: 4, period: 64, weight: 0.5 },
        { grid: makeNoiseGrid(8, 8, 202), gw: 8, gh: 8, period: 32, weight: 0.28 },
        { grid: makeNoiseGrid(16, 16, 303), gw: 16, gh: 16, period: 16, weight: 0.15 },
        { grid: makeNoiseGrid(32, 32, 404), gw: 32, gh: 32, period: 8, weight: 0.07 }
    ];

    const buf = Buffer.alloc(WIDTH * HEIGHT * 4);

    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            let n = 0;
            for (const oct of octaves) {
                n += sampleToroidalNoise(oct.grid, oct.gw, oct.gh, x, y, oct.period, oct.period) * oct.weight;
            }

            // Soft cloud threshold and smooth falloff
            // Value ranges around 0..1; clouds appear when n > 0.35
            const threshold = 0.34;
            let alpha = 0;
            if (n > threshold) {
                const norm = (n - threshold) / (1 - threshold);
                const soft = Math.pow(norm, 1.4);
                alpha = Math.max(0, Math.min(255, Math.round(soft * 190)));
            }

            const idx = (y * WIDTH + x) * 4;
            buf[idx] = 255;     // R
            buf[idx + 1] = 255; // G
            buf[idx + 2] = 255; // B
            buf[idx + 3] = alpha; // A (soft transparent)
        }
    }

    const outDir = path.resolve(__dirname, '../public/assets/map');
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    const outFile = path.join(outDir, 'fog-clouds.png');
    await sharp(buf, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
        .png({ compressionLevel: 9 })
        .toFile(outFile);

    const stats = fs.statSync(outFile);
    console.log(`[make-fog-texture] Written ${outFile} (${stats.size} bytes)`);
    if (stats.size > 40 * 1024) {
        throw new Error(`Fog texture exceeds 40 KB: ${stats.size} bytes`);
    }
}

generateFogTexture().catch(err => {
    console.error('[make-fog-texture] Error:', err);
    process.exit(1);
});
