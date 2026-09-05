/**
 * scripts/link-places-to-360.js
 *
 * Reads establishments from the places database (Firestore or PostgreSQL places table)
 * and matches each establishment to its nearest 360 photo node in public/assets/360/manifest.json.
 *
 * Criteria:
 *   - Uses Haversine distance formula from generate-360-manifest.js.
 *   - Matches if nearest node is within 30 meters.
 *   - Outputs public/assets/360/place-links.json.
 *
 * Usage: node scripts/link-places-to-360.js
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { haversineDistanceMeters } = require('./generate-360-manifest');

// File paths and constants
const MANIFEST_PATH = path.resolve(__dirname, '../public/assets/360/manifest.json');
const OUTPUT_PATH = path.resolve(__dirname, '../public/assets/360/place-links.json');
const MATCH_THRESHOLD_METERS = 30;

/**
 * Attempt to fetch places from Firestore first
 */
async function fetchFromFirestore() {
    try {
        const { initializeApp, cert, getApps } = require('firebase-admin/app');
        const { getFirestore } = require('firebase-admin/firestore');

        let app;
        if (getApps().length > 0) {
            app = getApps()[0];
        } else {
            const keyPath = path.resolve(__dirname, '../server/serviceAccountKey.json');
            if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
                app = initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)) });
            } else if (fs.existsSync(keyPath)) {
                app = initializeApp({ credential: cert(require(keyPath)) });
            } else {
                app = initializeApp();
            }
        }

        const db = getFirestore(app);
        const snapshot = await db.collection('places').get();

        if (snapshot.empty) {
            return null;
        }

        const places = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            let lat = null;
            let lng = null;

            if (data.location && typeof data.location.latitude === 'number') {
                lat = data.location.latitude;
                lng = data.location.longitude;
            } else if (data.lat !== undefined && data.lng !== undefined) {
                lat = parseFloat(data.lat);
                lng = parseFloat(data.lng);
            }

            if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
                places.push({
                    id: String(data.id || doc.id),
                    name: data.name || data.placeName || `Place ${doc.id}`,
                    lat,
                    lng
                });
            }
        });

        return places.length > 0 ? places : null;
    } catch (err) {
        // Firestore unavailable or not containing places
        return null;
    }
}

/**
 * Fetch places from PostgreSQL places table
 */
async function fetchFromPostgres() {
    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL is not set in environment.');
    }

    const isRemoteDb = process.env.DATABASE_URL.includes('supabase');
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: isRemoteDb ? { rejectUnauthorized: false } : false
    });

    try {
        const query = `
            SELECT 
                p.id, 
                p.name, 
                ST_Y(p.location::geometry) AS lat, 
                ST_X(p.location::geometry) AS lng
            FROM places p
            WHERE p.is_active = TRUE
            ORDER BY p.id ASC
        `;
        const result = await pool.query(query);
        return result.rows.map(row => ({
            id: String(row.id),
            name: row.name,
            lat: parseFloat(row.lat),
            lng: parseFloat(row.lng)
        }));
    } finally {
        await pool.end();
    }
}

/**
 * Main linking logic
 */
async function linkPlacesTo360() {
    console.log('[Place-360 Linker] Starting place-to-photosphere matching...');

    // 1. Read manifest.json
    if (!fs.existsSync(MANIFEST_PATH)) {
        console.error(`[Place-360 Linker] Manifest not found at: ${MANIFEST_PATH}`);
        process.exit(1);
    }

    const manifestData = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
    const nodes = manifestData.nodes || [];
    console.log(`[Place-360 Linker] Loaded ${nodes.length} 360 photosphere node(s) from manifest.`);

    if (nodes.length === 0) {
        console.warn('[Place-360 Linker] No nodes in manifest. Exiting.');
        const emptyOutput = { links: [] };
        fs.writeFileSync(OUTPUT_PATH, JSON.stringify(emptyOutput, null, 2), 'utf-8');
        return emptyOutput;
    }

    // 2. Fetch establishments
    let source = 'Firestore';
    let establishments = await fetchFromFirestore();

    if (!establishments || establishments.length === 0) {
        source = 'PostgreSQL database';
        establishments = await fetchFromPostgres();
    }

    console.log(`[Place-360 Linker] Loaded ${establishments.length} establishment(s) from ${source}.`);

    // 3. Match each establishment to its nearest node
    const links = [];
    const unmatched = [];

    for (const est of establishments) {
        let nearestNode = null;
        let minDistance = Infinity;

        for (const node of nodes) {
            const distance = haversineDistanceMeters(est.lat, est.lng, node.lat, node.lng);
            if (distance < minDistance) {
                minDistance = distance;
                nearestNode = node;
            }
        }

        if (nearestNode && minDistance <= MATCH_THRESHOLD_METERS) {
            links.push({
                placeId: est.id,
                placeName: est.name,
                nodeId: nearestNode.id,
                distance: Number(minDistance.toFixed(1))
            });
        } else {
            unmatched.push({
                placeId: est.id,
                placeName: est.name,
                nearestNodeId: nearestNode ? nearestNode.id : null,
                distance: nearestNode ? Number(minDistance.toFixed(1)) : null
            });
        }
    }

    // 4. Output place-links.json
    const outputData = { links };
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(outputData, null, 2), 'utf-8');
    console.log(`[Place-360 Linker] Saved results to: ${OUTPUT_PATH}`);

    // 5. Audit Report
    console.log('\n=============================================');
    console.log('       PLACE TO 360 LINK AUDIT REPORT        ');
    console.log('=============================================');
    console.log(`1. Total Establishments Checked: ${establishments.length}`);
    console.log(`   - Source: ${source}`);
    console.log(`2. Matching Summary (Threshold: <= ${MATCH_THRESHOLD_METERS}m):`);
    console.log(`   - Matched: ${links.length}`);
    console.log(`   - No nearby photo: ${unmatched.length}`);

    console.log(`\n3. Matched Establishments (within ${MATCH_THRESHOLD_METERS}m):`);
    if (links.length === 0) {
        console.log('   - None found within 30 meters.');
    } else {
        links.forEach((link, idx) => {
            console.log(`   * Match ${idx + 1}:`);
            console.log(`     - Place: [${link.placeId}] "${link.placeName}"`);
            console.log(`     - Linked Node: [${link.nodeId}]`);
            console.log(`     - Distance: ${link.distance}m`);
        });
    }

    console.log(`\n4. Closest Unmatched Establishments (> ${MATCH_THRESHOLD_METERS}m):`);
    const sortedUnmatched = [...unmatched].sort((a, b) => (a.distance || 0) - (b.distance || 0));
    sortedUnmatched.slice(0, 5).forEach((item, idx) => {
        console.log(`   * [${item.placeId}] "${item.placeName}": nearest node is [${item.nearestNodeId}] at ${item.distance}m`);
    });
    console.log('=============================================\n');

    return {
        totalChecked: establishments.length,
        matchedCount: links.length,
        unmatchedCount: unmatched.length,
        links,
        unmatched
    };
}

if (require.main === module) {
    linkPlacesTo360().catch(err => {
        console.error('[Place-360 Linker] Error:', err);
        process.exit(1);
    });
}

module.exports = {
    linkPlacesTo360
};
