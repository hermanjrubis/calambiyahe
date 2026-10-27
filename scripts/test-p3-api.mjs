/**
 * scripts/test-p3-api.mjs
 *
 * API Tests for Phase 3 (Cloudinary stubbed):
 * - cloudinary-sign -> 403 for a non-admin.
 * - tour360 with a URL from another cloud or folder -> 400.
 * - A valid publish -> tour360.version == 1 and one tour360_published emailLog entry.
 * - GET /api/places merges approved business with correct mapping.
 */

import http from 'http';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.DRY_RUN_EMAIL = 'true';
process.env.CLOUDINARY_CLOUD_NAME = 'calzada';
process.env.CLOUDINARY_API_KEY = 'test_api_key';
process.env.CLOUDINARY_API_SECRET = 'test_api_secret';

let app;
if (getApps().length > 0) {
    app = getApps()[0];
} else {
    app = initializeApp({ projectId: 'calzada-web' });
}

const adminDb = getFirestore(app);
const API_BASE = 'http://127.0.0.1:5000';

let serverProcess = null;
let authServerInstance = null;

function checkPortFree(port) {
    return new Promise((resolve) => {
        const tester = http.createServer()
            .once('error', () => resolve(false))
            .once('listening', () => tester.close(() => resolve(true)))
            .listen(port, '127.0.0.1');
    });
}

async function startAuthEmulator() {
    const isFree = await checkPortFree(9099);
    if (!isFree) {
        console.log('[Auth Emulator] Port 9099 already in use, assuming auth emulator active');
        return;
    }
    return new Promise((resolve) => {
        const authServer = http.createServer((req, res) => {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                let uid = 'test_user';
                let customClaims = {};
                let email = 'user@test.calzadaph.com';

                try {
                    const parsed = body ? JSON.parse(body) : {};
                    const idToken = parsed.idToken;
                    if (idToken) {
                        const parts = idToken.split('.');
                        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
                        uid = payload.sub || uid;
                        email = payload.email || `${uid}@test.calzadaph.com`;
                        if (payload.admin === true) {
                            customClaims.admin = true;
                        }
                    }
                } catch (_) {}

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    kind: 'identitytoolkit#GetAccountInfoResponse',
                    users: [{
                        localId: uid,
                        email: email,
                        displayName: `User ${uid}`,
                        emailVerified: true,
                        customAttributes: JSON.stringify(customClaims)
                    }]
                }));
            });
        });

        authServer.listen(9099, '127.0.0.1', () => {
            console.log('Local Auth Emulator listening on 127.0.0.1:9099');
            authServerInstance = authServer;
            resolve();
        });
    });
}

function startAppServer() {
    return new Promise((resolve) => {
        const req = http.get(API_BASE, () => {
            console.log('[App Server] already running on port 5000');
            resolve();
        });
        req.on('error', () => {
            console.log('[App Server] Starting node server.js on port 5000 (CALZADA_EMULATORS=1)...');
            serverProcess = spawn('node', ['server/server.js'], {
                env: {
                    ...process.env,
                    PORT: '5000',
                    CALZADA_EMULATORS: '1',
                    DRY_RUN_EMAIL: 'true',
                    CLOUDINARY_CLOUD_NAME: 'calzada',
                    CLOUDINARY_API_KEY: 'test_api_key',
                    CLOUDINARY_API_SECRET: 'test_api_secret'
                },
                stdio: 'pipe'
            });
            setTimeout(resolve, 3000);
        });
    });
}

function createEmulatorToken(uid, claims = {}) {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
        sub: uid,
        user_id: uid,
        aud: "calzada-web",
        iss: "https://securetoken.google.com/calzada-web",
        email: `${uid}@test.calzadaph.com`,
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        auth_time: Math.floor(Date.now() / 1000),
        firebase: { sign_in_provider: "password" },
        ...claims
    })).toString('base64url');
    return `${header}.${payload}.signature`;
}

async function apiRequest(pathName, method = 'GET', body = null, token = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(pathName, API_BASE);
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        const dataStr = body ? JSON.stringify(body) : null;
        if (dataStr) {
            headers['Content-Length'] = Buffer.byteLength(dataStr);
        }

        const req = http.request(url, { method, headers }, (res) => {
            let resBody = '';
            res.on('data', chunk => { resBody += chunk; });
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = JSON.parse(resBody);
                } catch (_) {
                    parsed = resBody;
                }
                resolve({ status: res.statusCode, headers: res.headers, body: parsed });
            });
        });

        req.on('error', reject);
        if (dataStr) req.write(dataStr);
        req.end();
    });
}

async function runApiTests() {
    console.log('========================================================');
    console.log('PHASE 3: API & 360 TOUR VERIFICATION TESTS');
    console.log('========================================================\n');

    let passedCount = 0;
    let failedCount = 0;

    function report(success, message) {
        if (success) {
            console.log(`  [PASS] ${message}`);
            passedCount++;
        } else {
            console.error(`  [FAIL] ${message}`);
            failedCount++;
        }
    }

    try {
        await startAuthEmulator();
        await startAppServer();

        const adminToken = createEmulatorToken('admin_user_p3_api', { admin: true });
        const regularToken = createEmulatorToken('regular_user_p3_api', { admin: false });

        const testBizId = 'bus_p3_api_test';

        // Pre-create business in Firestore
        await adminDb.collection('businesses').doc(testBizId).set({
            name: 'Kape Laguna',
            category: 'coffee',
            status: 'approved',
            plan: 'plus360',
            shoot360: 'scheduled',
            ownerId: 'owner_user_p3_api',
            contactNumber: '09123456789',
            paidAt: new Date(),
            thumbnailUrl: 'https://res.cloudinary.com/calzada/image/upload/v123/store.jpg',
            offerings: ['Barako', 'Latte'],
            openHours: { mon: [{ open: '08:00', close: '18:00' }] },
            barangay: 'Real',
            location: { lat: 14.21, lng: 121.16 }
        });

        // Also clean up any existing emailLog for this entity
        const logSnaps = await adminDb.collection('emailLog')
            .where('entityId', '==', testBizId)
            .get();
        for (const doc of logSnaps.docs) {
            await doc.ref.delete();
        }

        // Test 1: POST /api/admin/cloudinary-sign -> 403 for a non-admin
        console.log('--- Test 1: cloudinary-sign -> 403 for a non-admin ---');
        const signResNonAdmin = await apiRequest('/api/admin/cloudinary-sign', 'POST', {
            businessId: testBizId
        }, regularToken);
        report(signResNonAdmin.status === 403, `Non-admin receives 403 (actual: ${signResNonAdmin.status})`);

        // Admin signing succeeds
        const signResAdmin = await apiRequest('/api/admin/cloudinary-sign', 'POST', {
            businessId: testBizId
        }, adminToken);
        report(
            signResAdmin.status === 200 &&
            signResAdmin.body &&
            signResAdmin.body.folder === `calzada/tours/${testBizId}` &&
            typeof signResAdmin.body.signature === 'string',
            'Admin receives 200 with folder and signature'
        );

        // Test 2: tour360 with a URL from another cloud or folder -> 400
        console.log('\n--- Test 2: tour360 with URL from another cloud or folder -> 400 ---');
        const badCloudRes = await apiRequest(`/api/admin/businesses/${testBizId}/tour360`, 'POST', {
            photos: [{
                url: `https://res.cloudinary.com/aliencloud/image/upload/calzada/tours/${testBizId}/photo1.jpg`,
                thumbUrl: `https://res.cloudinary.com/aliencloud/image/upload/calzada/tours/${testBizId}/thumb1.jpg`,
                label: 'Entrance'
            }]
        }, adminToken);
        report(badCloudRes.status === 400, `Another cloud URL returns 400 (actual: ${badCloudRes.status})`);

        const badFolderRes = await apiRequest(`/api/admin/businesses/${testBizId}/tour360`, 'POST', {
            photos: [{
                url: `https://res.cloudinary.com/calzada/image/upload/otherfolder/${testBizId}/photo1.jpg`,
                thumbUrl: `https://res.cloudinary.com/calzada/image/upload/otherfolder/${testBizId}/thumb1.jpg`,
                label: 'Entrance'
            }]
        }, adminToken);
        report(badFolderRes.status === 400, `Another folder URL returns 400 (actual: ${badFolderRes.status})`);

        // Test 3: A valid publish -> tour360.version == 1 and one tour360_published emailLog entry
        console.log('\n--- Test 3: Valid publish -> tour360.version == 1 and emailLog entry ---');
        const validPublishRes = await apiRequest(`/api/admin/businesses/${testBizId}/tour360`, 'POST', {
            photos: [{
                url: `https://res.cloudinary.com/calzada/image/upload/v100/calzada/tours/${testBizId}/photo1.jpg`,
                thumbUrl: `https://res.cloudinary.com/calzada/image/upload/v100/calzada/tours/${testBizId}/thumb1.jpg`,
                label: 'Entrance'
            }]
        }, adminToken);
        report(
            validPublishRes.status === 200 &&
            validPublishRes.body &&
            validPublishRes.body.version === 1,
            `Valid publish returns 200 with version 1 (actual: ${validPublishRes.status}, v${validPublishRes.body?.version})`
        );

        // Check Firestore doc
        const updatedBizSnap = await adminDb.collection('businesses').doc(testBizId).get();
        const updatedBizData = updatedBizSnap.data();
        report(
            updatedBizData &&
            updatedBizData.tour360 &&
            updatedBizData.tour360.version === 1 &&
            updatedBizData.shoot360 === 'done',
            'Firestore business doc has tour360.version == 1 and shoot360: done'
        );

        // Check emailLog
        const publishedLogs = await adminDb.collection('emailLog')
            .where('entityId', '==', testBizId)
            .where('event', '==', 'tour360_published')
            .get();
        report(
            publishedLogs.size === 1,
            `Exactly one tour360_published emailLog entry found (actual: ${publishedLogs.size})`
        );

        // Test 4: GET /api/places merges approved business without sensitive fields
        console.log('\n--- Test 4: GET /api/places merges approved business ---');
        const placesRes = await apiRequest('/api/places');
        report(placesRes.status === 200, `GET /api/places returns 200 (actual: ${placesRes.status})`);
        const foundBiz = Array.isArray(placesRes.body) && placesRes.body.find(p => p.businessId === testBizId);
        report(
            !!foundBiz &&
            foundBiz.id === `biz_${testBizId}` &&
            foundBiz.source === 'business' &&
            foundBiz.name === 'Kape Laguna' &&
            foundBiz.has360 === true &&
            foundBiz.tour360 &&
            foundBiz.tour360.version === 1 &&
            foundBiz.contactNumber === undefined,
            'GET /api/places contains mapped business without contactNumber leak'
        );

    } finally {
        if (serverProcess) {
            serverProcess.kill();
        }
        if (authServerInstance) {
            authServerInstance.close();
        }
    }

    console.log('\n========================================================');
    console.log(`P3 API RESULTS: ${passedCount} passed, ${failedCount} failed`);
    console.log('========================================================');
    if (failedCount > 0) {
        process.exit(1);
    }
}

runApiTests().catch(err => {
    console.error('P3 API test error:', err);
    process.exit(1);
});
