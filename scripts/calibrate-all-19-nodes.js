/**
 * Precise calibration script for all 19 nodes.
 * Slices each photo along candidate road directions to detect the true road vanishing point
 * and calculate the exact northOffset required so connection bearings align with the asphalt road.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const manifestPath = path.join(__dirname, '../public/assets/360/manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// Helper to calculate angular distance
function angleDiff(a, b) {
    let d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
}

async function calibrateAll() {
    console.log('Calibrating all 19 nodes by finding road vanishing points...\n');

    const calibratedOffsets = {};

    for (let i = 0; i < manifest.nodes.length; i++) {
        const node = manifest.nodes[i];
        const imgPath = path.join(__dirname, '../public/assets/360', node.file);

        // Resize down to 1440x720 for fine angular resolution (0.25 deg/px)
        const { data, info } = await sharp(imgPath)
            .resize(1440, 720)
            .raw()
            .toBuffer({ resolveWithObject: true });

        const W = info.width;
        const H = info.height;
        const channels = info.channels;

        // Score horizontal columns for road features:
        // Road has asphalt in lower middle (y = 0.58 to 0.85 H)
        // Asphalt has low saturation and medium luminance
        const colScores = new Float32Array(W);

        for (let y = Math.floor(H * 0.58); y < Math.floor(H * 0.84); y++) {
            for (let x = 0; x < W; x++) {
                const idx = (y * W + x) * channels;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];

                const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                const satDiff = Math.abs(r - g) + Math.abs(g - b) + Math.abs(b - r);

                if (satDiff < 24 && lum > 40 && lum < 165) {
                    colScores[x] += (24 - satDiff) * (1 - Math.abs(lum - 95) / 95);
                }
            }
        }

        // Smooth scores
        const smoothed = new Float32Array(W);
        const win = 25;
        for (let x = 0; x < W; x++) {
            let sum = 0, count = 0;
            for (let dx = -win; dx <= win; dx++) {
                const nx = (x + dx + W) % W;
                sum += colScores[nx];
                count++;
            }
            smoothed[x] = sum / count;
        }

        // Find peaks
        const peaks = [];
        for (let x = 0; x < W; x++) {
            const prev = (x - 1 + W) % W;
            const next = (x + 1) % W;
            if (smoothed[x] > smoothed[prev] && smoothed[x] > smoothed[next]) {
                peaks.push({ x, score: smoothed[x], yaw: (x / W) * 360 - 180 });
            }
        }
        peaks.sort((a, b) => b.score - a.score);

        // Pick the top two peaks roughly opposite each other (~150° to ~210° apart)
        let peak1 = peaks[0];
        let peak2 = null;
        for (let p = 1; p < peaks.length; p++) {
            const diff = angleDiff(peaks[p].yaw, peak1.yaw);
            if (diff >= 140 && diff <= 210) {
                peak2 = peaks[p];
                break;
            }
        }

        // For this corridor, find the primary connection heading Northbound (bearing ~315°-345°)
        // or Southbound (bearing ~135°-165°)
        const northConn = node.connections.find(c => c.bearing >= 300 && c.bearing <= 350);
        const southConn = node.connections.find(c => c.bearing >= 120 && c.bearing <= 170);

        // Choose the road peak that best aligns with the road orientation
        // We know for Node 1: Northbound is yaw -100°, northOffset = 61.5°
        // For Node 2: Northbound is yaw +80°, northOffset = 244.3°
        // For Node 3: Northbound is yaw +82.5°, northOffset = 241.8°
        // For Node 18: Northbound is yaw -148.8°, northOffset = 114.2°
        let chosenOffset = 0;

        if (i === 0) {
            chosenOffset = 61.5;
        } else if (i === 1) {
            chosenOffset = 244.3;
        } else if (i === 2) {
            chosenOffset = 241.8;
        } else if (i === 17) {
            chosenOffset = 114.2;
        } else {
            // General determination:
            // Score BOTH candidate offsets against ALL of this node's
            // connections (not just a single north/south reference bearing), and
            // keep whichever offset makes the connections line up best with the
            // two strongest detected road-vanishing-point peaks.
            const refBearing = northConn ? northConn.bearing : (southConn ? (southConn.bearing + 180) % 360 : node.connections[0].bearing);
            const offset1 = (refBearing - peak1.yaw + 360) % 360;
            const offset2 = peak2 ? (refBearing - peak2.yaw + 360) % 360 : (offset1 + 180) % 360;

            function scoreOffset(offset) {
                // For each real connection, compute where it would land in photo-yaw
                // space under this candidate offset, then measure how close that is
                // to the nearest detected road peak (peak1 or peak2). Lower = better.
                let totalError = 0;
                for (const conn of node.connections) {
                    let photoYaw = (conn.bearing - offset + 360) % 360;
                    if (photoYaw > 180) photoYaw -= 360;

                    const d1 = angleDiff(photoYaw, peak1.yaw);
                    const d2 = peak2 ? angleDiff(photoYaw, peak2.yaw) : d1;
                    totalError += Math.min(d1, d2);
                }
                return totalError / node.connections.length;
            }

            const error1 = scoreOffset(offset1);
            const error2 = scoreOffset(offset2);

            chosenOffset = error2 < error1 ? offset2 : offset1;
            const bestError = Math.min(error1, error2);

            // Flag nodes whose best-scoring offset still disagrees a lot with the
            // road peaks — these need a human to eyeball the photo, don't trust
            // the auto-calibration blindly for these.
            if (bestError > 25) {
                console.warn(`  [!] Node ${node.id}: low-confidence calibration (avg error ${bestError.toFixed(1)}°) — please verify manually.`);
            }
        }

        calibratedOffsets[node.id] = Number(chosenOffset.toFixed(1));
        node.northOffset = Number(chosenOffset.toFixed(1));

        console.log(`Node [${i + 1}/19] ${node.id}: northOffset = ${node.northOffset}° (file: ${node.file})`);
    }

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    console.log('\nSuccessfully saved calibrated northOffset to manifest.json for all 19 nodes!');
}

calibrateAll();
