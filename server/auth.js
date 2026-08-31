const { initializeApp, cert, getApps, getApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const path = require('path');
const fs = require('fs');

let firebaseApp = null;

function initFirebaseAdmin() {
    if (getApps().length > 0) {
        return getApp();
    }

    try {
        if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
            firebaseApp = initializeApp({
                credential: cert(serviceAccount)
            });
            console.log('Firebase Admin initialized with FIREBASE_SERVICE_ACCOUNT_KEY environment variable.');
            return firebaseApp;
        }

        const localKeyPath = path.resolve(__dirname, 'serviceAccountKey.json');
        if (fs.existsSync(localKeyPath)) {
            const serviceAccount = require(localKeyPath);
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
 * Helper to upsert user into PostgreSQL users table on request
 */
async function syncUserToDb(pool, user) {
    if (!pool || !user || !user.uid) return;
    try {
        const query = `
            INSERT INTO users (id, email, display_name)
            VALUES ($1, $2, $3)
            ON CONFLICT (id) DO UPDATE 
            SET email = EXCLUDED.email,
                display_name = COALESCE(EXCLUDED.display_name, users.display_name);
        `;
        await pool.query(query, [
            user.uid,
            user.email || null,
            user.name || null
        ]);
    } catch (err) {
        console.error('Error syncing user to database:', err);
    }
}

/**
 * Reusable Express Auth Middleware
 */
function createAuthMiddleware(pool) {
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
            const decodedToken = await getAuth().verifyIdToken(idToken);
            req.user = {
                uid: decodedToken.uid,
                email: decodedToken.email || null,
                name: decodedToken.name || decodedToken.displayName || (decodedToken.email ? decodedToken.email.split('@')[0] : 'User')
            };

            // Sync user to PostgreSQL users table
            if (pool) {
                await syncUserToDb(pool, req.user);
            }

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
    createAuthMiddleware,
    syncUserToDb
};
