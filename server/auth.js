const { initializeApp, cert, getApps, getApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const path = require('path');
const fs = require('fs');

// Emulators only when asked for (CALZADA_EMULATORS=1), never on Vercel. A plain `npm start`
// talks to the real project, as before.
const USE_EMULATORS = process.env.CALZADA_EMULATORS === '1' && !process.env.VERCEL;
if (USE_EMULATORS) {
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
        process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
    }
    if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
        process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
    }
}

let firebaseApp = null;

function parseServiceAccountKey(keyInput) {
    if (!keyInput) return null;
    let parsed = null;
    if (typeof keyInput === 'object') {
        parsed = { ...keyInput };
    } else if (typeof keyInput === 'string') {
        const trimmed = keyInput.trim();
        try {
            parsed = JSON.parse(trimmed);
        } catch (e) {
            try {
                parsed = JSON.parse(Buffer.from(trimmed, 'base64').toString('utf8'));
            } catch (_) {
                console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY JSON:', e.message);
                return null;
            }
        }
    }
    if (parsed && typeof parsed.private_key === 'string') {
        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    }
    return parsed;
}

function initFirebaseAdmin() {
    if (getApps().length > 0) {
        return getApp();
    }

    try {
        if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
            const serviceAccount = parseServiceAccountKey(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
            if (serviceAccount) {
                firebaseApp = initializeApp({
                    credential: cert(serviceAccount)
                });
                console.log('Firebase Admin initialized with FIREBASE_SERVICE_ACCOUNT_KEY environment variable.');
                return firebaseApp;
            }
        }

        const localKeyPath = path.resolve(__dirname, 'serviceAccountKey.json');
        if (fs.existsSync(localKeyPath)) {
            const serviceAccount = parseServiceAccountKey(require(localKeyPath));
            firebaseApp = initializeApp({
                credential: cert(serviceAccount)
            });
            console.log('Firebase Admin initialized with local serviceAccountKey.json file.');
            return firebaseApp;
        }

        // Fallback to default
        firebaseApp = initializeApp();
        console.log('Firebase Admin initialized with application default credentials.');
        return firebaseApp;
    } catch (err) {
        console.error('Failed to initialize Firebase Admin SDK:', err.message);
        return null;
    }
}

initFirebaseAdmin();


/**
 * Reusable Express Auth Middleware (Firebase Admin Token Verification)
 */
function createAuthMiddleware() {
    return async function requireAuth(req, res, next) {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized: Missing or invalid Authorization header. Expected Bearer <token>.' });
        }

        const idToken = authHeader.split('Bearer ')[1].trim();
        if (!idToken) {
            return res.status(401).json({ error: 'Unauthorized: No token provided.' });
        }

        try {
            let decodedToken;
            try {
                decodedToken = await getAuth().verifyIdToken(idToken);
            } catch (err) {
                // Emulator only: its tokens are unsigned (alg "none") and carry the emulator's
                // project id, which the real service account rejects. Never outside emulator mode,
                // where an unverified token would let anyone claim admin.
                if (USE_EMULATORS && process.env.FIREBASE_AUTH_EMULATOR_HOST && idToken) {
                    try {
                        const parts = idToken.split('.');
                        const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
                        if (parts.length === 3 && header.alg === 'none') {
                            const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
                            if (typeof payload.iss === 'string' && payload.iss.startsWith('https://securetoken.google.com/')) {
                                decodedToken = {
                                    ...payload,
                                    uid: payload.sub || payload.user_id,
                                    email: payload.email || null,
                                    name: payload.name || null,
                                    admin: payload.admin === true
                                };
                            }
                        }
                    } catch (_) {}
                }
                if (!decodedToken) throw err;
            }

            req.user = {
                uid: decodedToken.uid,
                email: decodedToken.email || null,
                name: decodedToken.name || decodedToken.displayName || (decodedToken.email ? decodedToken.email.split('@')[0] : 'User'),
                admin: decodedToken.admin === true
            };

            next();
        } catch (error) {
            console.error('Firebase token verification error:', error.message);
            if (error.code === 'auth/id-token-expired') {
                return res.status(401).json({ error: 'Unauthorized: Token expired. Please log in again.' });
            }
            return res.status(401).json({ error: 'Unauthorized: Invalid token.' });
        }
    };
}

module.exports = {
    getAuth,
    getApps,
    getApp,
    createAuthMiddleware
};

