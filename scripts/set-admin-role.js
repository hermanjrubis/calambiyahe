/**
 * scripts/set-admin-role.js
 *
 * Sets the custom claim { admin: true } on a Firebase user account.
 * Usage: node scripts/set-admin-role.js <uid>
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

async function setAdminRole() {
    const uid = process.argv[2];

    if (!uid || uid.trim() === '') {
        console.error('\n❌ Error: Missing user UID argument.');
        console.error('Usage: node scripts/set-admin-role.js <uid>\n');
        process.exit(1);
    }

    const targetUid = uid.trim();

    // Initialize Firebase Admin SDK using the pattern from link-places-to-360.js
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

    const auth = getAuth(app);

    try {
        // Verify that the user exists in Firebase Auth
        const user = await auth.getUser(targetUid);
        console.log(`\nFound user in Firebase Auth:`);
        console.log(`- UID: ${user.uid}`);
        console.log(`- Email: ${user.email || 'N/A'}`);
        console.log(`- Display Name: ${user.displayName || 'N/A'}`);
        console.log(`- Current Claims:`, user.customClaims || {});

        // Merge existing claims and set admin: true
        const updatedClaims = {
            ...(user.customClaims || {}),
            admin: true
        };

        await auth.setCustomUserClaims(targetUid, updatedClaims);

        // Fetch updated user to verify
        const updatedUser = await auth.getUser(targetUid);

        console.log('\n======================================================');
        console.log('✅ SUCCESS: Admin role successfully assigned!');
        console.log(`   User: ${updatedUser.email || updatedUser.uid}`);
        console.log(`   UID:  ${updatedUser.uid}`);
        console.log(`   Custom Claims:`, updatedUser.customClaims);
        console.log('======================================================');
        console.log('\n⚠️  IMPORTANT REMINDER:');
        console.log('   Firebase ID tokens are cached client-side for up to 1 hour.');
        console.log('   The user MUST SIGN OUT and SIGN BACK IN (or force refresh their token)');
        console.log('   for the new admin claim to take effect client-side in the browser.\n');

    } catch (err) {
        if (err.code === 'auth/user-not-found') {
            console.error(`\n❌ Error: No user found with UID "${targetUid}".`);
        } else {
            console.error('\n❌ Failed to set admin claim:', err.message);
        }
        process.exit(1);
    }
}

setAdminRole();
