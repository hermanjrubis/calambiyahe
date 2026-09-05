const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const manifestPath = path.join(__dirname, '../public/assets/360/manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

async function analyzeAll() {
    console.log('Analyzing 19 photospheres for road vanishing points and asphalt angles...\n');

    for (let i = 0; i < manifest.nodes.length; i++) {
        const node = manifest.nodes[i];
        const imgPath = path.join(__dirname, '../public/assets/360', node.file);

        // Resize down to 720x360 for fast pixel analysis
        const { data, info } = await sharp(imgPath)
            .resize(720, 360)
            .raw()
            .toBuffer({ resolveWithObject: true });

        const W = info.width;
        const H = info.height;
        const channels = info.channels;

        // Sample horizontal profile in lower ground region (y = 0.55 to 0.75 of height)
        // Asphalt has low saturation (|R-G| + |G-B| + |B-R| is small) and medium luminance
        const colScores = new Float32Array(W);

        for (let y = Math.floor(H * 0.58); y < Math.floor(H * 0.82); y++) {
            for (let x = 0; x < W; x++) {
                const idx = (y * W + x) * channels;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];

                const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                const satDiff = Math.abs(r - g) + Math.abs(g - b) + Math.abs(b - r);

                // Asphalt score: high if greyish (satDiff < 25) and luminance between 50 and 160
                if (satDiff < 28 && lum > 45 && lum < 170) {
                    colScores[x] += (28 - satDiff) * (1 - Math.abs(lum - 100) / 100);
                }
            }
        }

        // Smooth column scores with 20px window
        const smoothed = new Float32Array(W);
        const win = 15;
        for (let x = 0; x < W; x++) {
            let sum = 0, count = 0;
            for (let dx = -win; dx <= win; dx++) {
                const nx = (x + dx + W) % W;
                sum += colScores[nx];
                count++;
            }
            smoothed[x] = sum / count;
        }

        // Find top 2 local peaks separated by at least 120° (~240px) representing the two road directions
        const peaks = [];
        for (let x = 0; x < W; x++) {
            const prev = (x - 1 + W) % W;
            const next = (x + 1) % W;
            if (smoothed[x] > smoothed[prev] && smoothed[x] > smoothed[next]) {
                peaks.push({ x, score: smoothed[x], yaw: (x / W) * 360 - 180 });
            }
        }
        peaks.sort((a, b) => b.score - a.score);

        // Filter peaks that are separated by roughly 140° - 200° (opposite directions of the road)
        const topPeaks = [];
        if (peaks.length > 0) topPeaks.push(peaks[0]);
        for (let p = 1; p < peaks.length; p++) {
            const diff = Math.abs(peaks[p].yaw - topPeaks[0].yaw);
            const angleDiff = diff > 180 ? 360 - diff : diff;
            if (angleDiff > 120 && angleDiff < 210) {
                topPeaks.push(peaks[p]);
                break;
            }
        }

        console.log(`[Node ${i + 1}/19] ${node.id} (${node.file}):`);
        console.log(`  Connections: ${node.connections.map(c => `Bearing ${c.bearing}° (${c.distance}m)`).join(', ')}`);
        if (topPeaks.length > 0) {
            console.log(`  Detected Road Asphalt Peaks: ${topPeaks.map(p => `Yaw ${p.yaw.toFixed(1)}° (score ${p.score.toFixed(0)})`).join(', ')}`);
            // Estimate northOffset: if a connection is bearing ~320° and a peak is at peakYaw,
            // then northOffset = (connBearing - peakYaw + 360) % 360
            const mainConn = node.connections.find(c => c.bearing >= 300 && c.bearing <= 350) || node.connections[0];
            if (mainConn && topPeaks[0]) {
                // Determine which peak is closer to bearing or opposite
                let bestPeak = topPeaks[0];
                let estOffset = (mainConn.bearing - bestPeak.yaw + 360) % 360;
                console.log(`  Suggested northOffset for bearing ${mainConn.bearing}° aligned with yaw ${bestPeak.yaw.toFixed(1)}°: ${estOffset.toFixed(1)}°`);
            }
        }
        console.log('');
    }
}

analyzeAll();
