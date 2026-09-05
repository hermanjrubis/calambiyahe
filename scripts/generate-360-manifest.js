/**
 * scripts/generate-360-manifest.js
 *
 * Scans public/assets/360/ for 360 photosphere images named by GPS coordinates:
 *   {lat_int}_{lat_decimal}__{lng_int}_{lng_decimal}.jpg
 *   (e.g., 14_202352__121_158453.jpg or 14_204004302610047__121_15845391283.jpg)
 *
 * For each photo:
 *   1. Reconstructs coordinates (lat, lng).
 *   2. Calculates Haversine distances to other photos.
 *   3. Finds neighbors within 100 meters (capped at 4 nearest connections).
 *   4. Computes initial compass bearing (0-360°) to each connected neighbor.
 *   5. Outputs public/assets/360/manifest.json.
 *
 * Re-run this script whenever new 360 photos are added to public/assets/360/.
 * Usage: node scripts/generate-360-manifest.js
 */

const fs = require('fs');
const path = require('path');

// Configuration
const ASSETS_360_DIR = path.resolve(__dirname, '../public/assets/360');
const MANIFEST_PATH = path.join(ASSETS_360_DIR, 'manifest.json');
const MAX_DISTANCE_METERS = 100;
const MAX_CONNECTIONS_PER_NODE = 4;
const PHOTO_REGEX = /^(-?\d+\.\d+),\s*(-?\d+\.\d+)\.(jpg|jpeg|png)$/i;

/**
 * Calculates the great-circle distance between two points on the Earth
 * using the Haversine formula (returns distance in meters).
 */
function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Radius of the Earth in meters
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLon = (lon2 - lon1) * toRad;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Calculates the initial compass bearing from point 1 to point 2 (0-360°).
 */
function calculateBearing(lat1, lon1, lat2, lon2) {
    const toRad = Math.PI / 180;
    const toDeg = 180 / Math.PI;
    const φ1 = lat1 * toRad;
    const φ2 = lat2 * toRad;
    const Δλ = (lon2 - lon1) * toRad;

    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) -
              Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    const θ = Math.atan2(y, x);
    const bearing = (θ * toDeg + 360) % 360;
    return bearing;
}

function generateManifest(customDir, customOutputPath) {
    const targetDir = customDir ? path.resolve(customDir) : ASSETS_360_DIR;
    const outputPath = customOutputPath ? path.resolve(customOutputPath) : path.join(targetDir, 'manifest.json');

    console.log(`[360 Manifest] Scanning directory: ${targetDir}`);

    if (!fs.existsSync(targetDir)) {
        console.error(`[360 Manifest] Directory does not exist: ${targetDir}`);
        process.exit(1);
    }

    const files = fs.readdirSync(targetDir);
    const rawNodes = [];

    for (const file of files) {
        const match = file.match(PHOTO_REGEX);
        if (!match) {
            continue; // Skip non-matching files like sti-front.jpg or manifest.json
        }

        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);
        const id = `${lat}_${lng}`;

        rawNodes.push({
            id,
            lat,
            lng,
            file
        });
    }

    console.log(`[360 Manifest] Found ${rawNodes.length} coordinate-tagged photo(s).`);

    // Preserve existing northOffset values from existing manifest if present
    const existingNorthOffsets = {};
    if (fs.existsSync(outputPath)) {
        try {
            const existing = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
            (existing.nodes || []).forEach(n => {
                if (typeof n.northOffset === 'number') {
                    existingNorthOffsets[n.id] = n.northOffset;
                }
            });
        } catch (_) {}
    }

    const nodes = rawNodes.map((source) => {
        // Calculate distance and bearing to every other photo
        const candidateConnections = [];

        for (const target of rawNodes) {
            if (target.id === source.id) continue;

            const distance = haversineDistanceMeters(source.lat, source.lng, target.lat, target.lng);

            if (distance <= MAX_DISTANCE_METERS) {
                const bearing = calculateBearing(source.lat, source.lng, target.lat, target.lng);
                candidateConnections.push({
                    targetId: target.id,
                    bearing: Number(bearing.toFixed(1)),
                    distance: Number(distance.toFixed(1)),
                    _rawDistance: distance
                });
            }
        }

        // Sort by distance ascending (closest first) and cap at MAX_CONNECTIONS_PER_NODE
        candidateConnections.sort((a, b) => a._rawDistance - b._rawDistance);
        const connections = candidateConnections
            .slice(0, MAX_CONNECTIONS_PER_NODE)
            .map(({ _rawDistance, ...conn }) => conn);

        return {
            id: source.id,
            lat: source.lat,
            lng: source.lng,
            file: source.file,
            northOffset: existingNorthOffsets[source.id] || 0,
            connections
        };
    });

    const manifest = { nodes };

    fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2), 'utf-8');
    console.log(`[360 Manifest] Successfully generated manifest with ${nodes.length} node(s).`);
    console.log(`[360 Manifest] Output saved to: ${outputPath}`);

    // Audit Report
    const photoExtensions = ['.jpg', '.jpeg', '.png'];
    const photoFiles = files.filter(f => photoExtensions.includes(path.extname(f).toLowerCase()));
    const parsedFiles = new Set(nodes.map(n => n.file));
    const skippedFiles = photoFiles.filter(f => !parsedFiles.has(f));

    console.log('\n=============================================');
    console.log('         360 MANIFEST AUDIT REPORT           ');
    console.log('=============================================');
    console.log(`1. Total Nodes: ${nodes.length}`);
    console.log(`   - Photos found in directory: ${photoFiles.length}`);
    console.log(`   - Skipped / non-matching photos: ${skippedFiles.length}`);
    if (skippedFiles.length > 0) {
        skippedFiles.forEach(f => console.log(`     * Skipped: ${f} (does not match {lat}, {lng}.jpg)`));
    }

    // 2. Orphan Nodes
    const orphans = nodes.filter(n => n.connections.length === 0);
    console.log(`\n2. Orphan Nodes: ${orphans.length}`);
    if (orphans.length === 0) {
        if (nodes.length === 0) {
            console.log('   - No nodes in manifest (0 photo coordinates parsed).');
        } else {
            console.log('   - None! All nodes have at least 1 neighbor within 100m.');
        }
    } else {
        orphans.forEach(orphan => {
            let nearestId = null;
            let nearestDist = Infinity;
            for (const other of nodes) {
                if (other.id === orphan.id) continue;
                const d = haversineDistanceMeters(orphan.lat, orphan.lng, other.lat, other.lng);
                if (d < nearestDist) {
                    nearestDist = d;
                    nearestId = other.id;
                }
            }
            if (nearestId) {
                console.log(`   * Orphan [${orphan.id}]: Nearest photo is [${nearestId}] at ${nearestDist.toFixed(1)}m (exceeds ${MAX_DISTANCE_METERS}m threshold)`);
            } else {
                console.log(`   * Orphan [${orphan.id}]: No other photos exist to measure distance.`);
            }
        });
    }

    // 3. Connection Summary & Distribution
    const totalEdges = nodes.reduce((acc, n) => acc + n.connections.length, 0);
    const distribution = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    nodes.forEach(n => {
        const count = Math.min(n.connections.length, 4);
        distribution[count] = (distribution[count] || 0) + 1;
    });

    console.log(`\n3. Connection Summary:`);
    console.log(`   - Total directed edges: ${totalEdges}`);
    console.log(`   - Distribution:`);
    for (let i = 0; i <= 4; i++) {
        console.log(`     * ${i} connection(s): ${distribution[i] || 0} node(s)`);
    }

    // 4. Spot-Check Pairs (closest connections)
    console.log(`\n4. Spot-Check Node Pairs:`);
    const allEdges = [];
    nodes.forEach(n => {
        n.connections.forEach(c => {
            allEdges.push({
                from: n.id,
                to: c.targetId,
                distance: c.distance,
                bearing: c.bearing
            });
        });
    });

    if (allEdges.length === 0) {
        console.log('   - No connected pairs available to spot-check.');
    } else {
        allEdges.sort((a, b) => a.distance - b.distance);
        const topPairs = allEdges.slice(0, 2);
        topPairs.forEach((p, idx) => {
            console.log(`   * Pair ${idx + 1}: [${p.from}] -> [${p.to}]`);
            console.log(`     - Distance: ${p.distance}m`);
            console.log(`     - Bearing: ${p.bearing}°`);
        });
    }
    console.log('=============================================\n');

    return manifest;
}

if (require.main === module) {
    generateManifest();
}

module.exports = {
    generateManifest,
    haversineDistanceMeters,
    calculateBearing,
    PHOTO_REGEX
};
