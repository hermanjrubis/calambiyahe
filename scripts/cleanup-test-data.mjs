/**
 * scripts/cleanup-test-data.mjs
 *
 * Scans Firebase Auth and Firestore for test data created during verification runs.
 *
 * Usage:
 *   node scripts/cleanup-test-data.mjs          (DRY RUN - default, no deletions)
 *   node scripts/cleanup-test-data.mjs --apply  (Apply deletions for Auth users and orphaned posts)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const isApply = process.argv.includes('--apply');

// Initialize Firebase Admin
let app;
if (getApps().length > 0) {
    app = getApps()[0];
} else {
    const keyPath = path.resolve(__dirname, '../server/serviceAccountKey.json');
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        let key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
        if (typeof key === 'string') {
            try { key = JSON.parse(key); } catch (_) {}
        }
        if (key && typeof key.private_key === 'string') {
            key.private_key = key.private_key.replace(/\\n/g, '\n');
        }
        app = initializeApp({ credential: cert(key) });
    } else if (fs.existsSync(keyPath)) {
        const raw = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
        if (raw && typeof raw.private_key === 'string') {
            raw.private_key = raw.private_key.replace(/\\n/g, '\n');
        }
        app = initializeApp({ credential: cert(raw) });
    } else {
        throw new Error('No Firebase Admin credentials found in FIREBASE_SERVICE_ACCOUNT_KEY or server/serviceAccountKey.json');
    }
}

const auth = getAuth(app);
const db = getFirestore(app);

async function listAllUsers() {
    const users = [];
    let nextPageToken = undefined;
    do {
        const result = await auth.listUsers(1000, nextPageToken);
        users.push(...result.users);
        nextPageToken = result.pageToken;
    } while (nextPageToken);
    return users;
}

async function main() {
    console.log('='.repeat(70));
    console.log(` CALZADA TEST DATA CLEANUP`);
    console.log(` Mode: ${isApply ? '*** APPLY (REAL DELETION) ***' : '[DRY RUN - NO WRITES OR DELETIONS WILL BE PERFORMED]'}`);
    console.log('='.repeat(70));

    // -------------------------------------------------------------------------
    // 1. AUTH USERS
    // -------------------------------------------------------------------------
    console.log('\n[1/3] SCANNING FIREBASE AUTH USERS...');
    const allUsers = await listAllUsers();

    const keptUsers = [];
    const testUsersToDelete = [];

    const TEST_UID_PREFIXES = ['test-', 'test_', 'admin_tester', 'banner'];

    for (const u of allUsers) {
        const providers = (u.providerData || []).map(p => p.providerId);
        const hasProtectedProvider = providers.includes('google.com') || providers.includes('password');
        const isNonExampleEmail = u.email && !u.email.toLowerCase().endsWith('@example.com');
        const isAdmin = u.customClaims && (u.customClaims.admin === true || u.customClaims.role === 'admin');

        // Never include a user that has a google.com or password provider with a non-example.com email
        if (hasProtectedProvider && isNonExampleEmail) {
            keptUsers.push(u);
            continue;
        }

        // Never delete an admin account
        if (isAdmin) {
            keptUsers.push(u);
            continue;
        }

        // Check rules:
        // a) providerData is empty AND there is no email (created by custom token only)
        const isRuleA = (!u.providerData || u.providerData.length === 0) && (!u.email || u.email.trim() === '');
        // b) email ends with "@example.com"
        const isRuleB = !!(u.email && u.email.toLowerCase().endsWith('@example.com'));
        // c) uid starts with "test-", "test_", "admin_tester", or "banner"
        const isRuleC = TEST_UID_PREFIXES.some(prefix => u.uid.startsWith(prefix));

        const matchedRules = [];
        if (isRuleA) matchedRules.push('a (custom token only: empty providerData & no email)');
        if (isRuleB) matchedRules.push('b (email ends with @example.com)');
        if (isRuleC) matchedRules.push('c (uid starts with test-, test_, admin_tester, or banner)');

        if (matchedRules.length > 0) {
            testUsersToDelete.push({
                user: u,
                matchedRules,
                ruleLabels: [isRuleA && 'Rule a', isRuleB && 'Rule b', isRuleC && 'Rule c'].filter(Boolean).join(', ')
            });
        } else {
            keptUsers.push(u);
        }
    }

    console.log(`\n  Total users in Firebase Auth:      ${allUsers.length}`);
    console.log(`  Users kept (preserved):            ${keptUsers.length}`);
    console.log(`  Users marked for deletion:         ${testUsersToDelete.length}`);

    console.log(`\n--- USERS MARKED FOR DELETION (${testUsersToDelete.length}) ---`);
    if (testUsersToDelete.length === 0) {
        console.log('  No users matched test deletion rules.');
    } else {
        testUsersToDelete.forEach(({ user: u, ruleLabels, matchedRules }, i) => {
            const providers = (u.providerData || []).map(p => p.providerId).join(', ') || 'none (empty)';
            console.log(`  [${i + 1}] UID:           ${u.uid}`);
            console.log(`      Email:         ${u.email || '(no email)'}`);
            console.log(`      Providers:     ${providers}`);
            console.log(`      Created:       ${u.metadata.creationTime}`);
            console.log(`      Custom Claims: ${JSON.stringify(u.customClaims || {})}`);
            console.log(`      Matched:       ${ruleLabels} [${matchedRules.join('; ')}]`);
        });

        if (isApply) {
            console.log(`\n  Applying deletion of ${testUsersToDelete.length} test user(s)...`);
            for (const { user: u } of testUsersToDelete) {
                await auth.deleteUser(u.uid);
                console.log(`  ✓ Deleted Auth user ${u.uid} (${u.email || 'no email'})`);
            }
        } else {
            console.log(`\n  [DRY RUN] Would delete ${testUsersToDelete.length} test user(s). Pass --apply to delete.`);
        }
    }

    console.log(`\n--- FULL LIST OF KEPT USERS (${keptUsers.length}) ---`);
    if (keptUsers.length === 0) {
        console.log('  (None)');
    } else {
        keptUsers.forEach((u, i) => {
            const providers = (u.providerData || []).map(p => p.providerId).join(', ') || 'none (empty)';
            const isAdmin = u.customClaims && (u.customClaims.admin === true || u.customClaims.role === 'admin');
            console.log(`  [${i + 1}] UID:           ${u.uid}`);
            console.log(`      Email:         ${u.email || '(no email)'}`);
            console.log(`      Providers:     ${providers}`);
            console.log(`      Admin:         ${isAdmin ? 'YES (admin custom claim)' : 'no'}`);
            console.log(`      Created:       ${u.metadata.creationTime}`);
            console.log(`      Custom Claims: ${JSON.stringify(u.customClaims || {})}`);
        });
    }

    // -------------------------------------------------------------------------
    // 2. ORPHANED POSTS (posts starting with "test_" and their likes)
    // -------------------------------------------------------------------------
    console.log('\n[2/3] SCANNING POSTS COLLECTION FOR "test_" DOCUMENTS & LIKES...');
    const postsCol = db.collection('posts');
    const postDocRefs = await postsCol.listDocuments();

    // Map to collect all post IDs starting with test_
    const orphanedPosts = new Map(); // postId -> { ref, exists, likesRefs: [] }

    for (const ref of postDocRefs) {
        if (ref.id.startsWith('test_')) {
            const snap = await ref.get();
            orphanedPosts.set(ref.id, {
                ref,
                exists: snap.exists,
                likesRefs: []
            });
        }
    }

    // Also scan collectionGroup('likes') to catch any phantom post parents starting with test_
    try {
        const allLikesSnaps = await db.collectionGroup('likes').get();
        for (const likeDoc of allLikesSnaps.docs) {
            // Path is posts/{postId}/likes/{likeId}
            const pathParts = likeDoc.ref.path.split('/');
            if (pathParts.length >= 4 && pathParts[0] === 'posts') {
                const postId = pathParts[1];
                if (postId.startsWith('test_')) {
                    if (!orphanedPosts.has(postId)) {
                        const parentRef = postsCol.doc(postId);
                        const parentSnap = await parentRef.get();
                        orphanedPosts.set(postId, {
                            ref: parentRef,
                            exists: parentSnap.exists,
                            likesRefs: []
                        });
                    }
                    orphanedPosts.get(postId).likesRefs.push(likeDoc.ref);
                }
            }
        }
    } catch (err) {
        console.warn('  Note on collectionGroup likes scan:', err.message);
    }

    // Also check subcollections directly on each orphaned post ref
    for (const [postId, info] of orphanedPosts.entries()) {
        try {
            const likesCol = info.ref.collection('likes');
            const likeDocRefs = await likesCol.listDocuments();
            for (const lRef of likeDocRefs) {
                if (!info.likesRefs.some(existing => existing.path === lRef.path)) {
                    info.likesRefs.push(lRef);
                }
            }
        } catch (_) {}
    }

    let totalOrphanedLikesCount = 0;
    if (orphanedPosts.size === 0) {
        console.log('  No posts found starting with "test_".');
    } else {
        console.log(`  Found ${orphanedPosts.size} post document(s) starting with "test_":`);
        for (const [postId, info] of orphanedPosts.entries()) {
            totalOrphanedLikesCount += info.likesRefs.length;
            console.log(`  - Post ID: ${postId} (exists in doc store: ${info.exists ? 'YES' : 'PHANTOM/NO'}, likes count: ${info.likesRefs.length})`);
            if (info.likesRefs.length > 0) {
                info.likesRefs.forEach(l => console.log(`      └─ Like doc: ${l.path}`));
            }
        }

        if (isApply) {
            console.log(`\n  Applying deletion of ${orphanedPosts.size} post(s) and ${totalOrphanedLikesCount} like(s)...`);
            for (const [postId, info] of orphanedPosts.entries()) {
                // Delete likes
                if (info.likesRefs.length > 0) {
                    const batch = db.batch();
                    info.likesRefs.forEach(lRef => batch.delete(lRef));
                    await batch.commit();
                }
                // Delete post document
                await info.ref.delete();
                console.log(`  ✓ Deleted post ${postId} and its likes`);
            }
        } else {
            console.log(`\n  [DRY RUN] Would delete ${orphanedPosts.size} post document(s) and ${totalOrphanedLikesCount} like(s). Pass --apply to delete.`);
        }
    }

    // -------------------------------------------------------------------------
    // 3. OTHER COLLECTIONS OR DOCUMENTS STARTING WITH "test"
    // -------------------------------------------------------------------------
    console.log('\n[3/3] SCANNING ALL OTHER FIRESTORE COLLECTIONS & DOCUMENTS FOR "test"...');
    console.log('      (Report only - will NOT delete)');

    const rootCollections = await db.listCollections();
    const otherTestItems = [];

    for (const col of rootCollections) {
        const colId = col.id;
        const colIdMatches = colId.toLowerCase().startsWith('test');
        if (colIdMatches) {
            otherTestItems.push({
                type: 'collection',
                path: colId,
                reason: `Collection ID starts with "test"`
            });
        }

        // List documents in this collection
        const docRefs = await col.listDocuments();
        for (const docRef of docRefs) {
            // Skip the orphaned posts we already handled in step 2
            if (colId === 'posts' && docRef.id.startsWith('test_')) {
                continue;
            }

            const docId = docRef.id;
            const docIdMatches = docId.toLowerCase().startsWith('test');

            let docData = null;
            let nameMatches = false;
            let matchedNameValue = null;

            try {
                const snap = await docRef.get();
                if (snap.exists) {
                    docData = snap.data();
                    const nameField = docData.name || docData.businessName || docData.title;
                    if (typeof nameField === 'string' && nameField.trim().toLowerCase().startsWith('test')) {
                        nameMatches = true;
                        matchedNameValue = nameField;
                    }
                }
            } catch (_) {}

            if (docIdMatches || nameMatches) {
                const reasons = [];
                if (docIdMatches) reasons.push(`Document ID starts with "test" (${docId})`);
                if (nameMatches) reasons.push(`Document name field starts with "test" ("${matchedNameValue}")`);

                otherTestItems.push({
                    type: 'document',
                    path: docRef.path,
                    docId,
                    name: matchedNameValue,
                    status: docData ? docData.status : null,
                    reason: reasons.join(', ')
                });
            }

            // Check subcollections of this document (e.g., businesses/{id}/private/owner or reviews)
            try {
                const subCols = await docRef.listCollections();
                for (const subCol of subCols) {
                    if (subCol.id.toLowerCase().startsWith('test')) {
                        otherTestItems.push({
                            type: 'subcollection',
                            path: `${docRef.path}/${subCol.id}`,
                            reason: `Subcollection ID starts with "test"`
                        });
                    }
                    const subDocRefs = await subCol.listDocuments();
                    for (const sDocRef of subDocRefs) {
                        const sDocId = sDocRef.id;
                        const sIdMatches = sDocId.toLowerCase().startsWith('test');
                        let sDocData = null;
                        let sNameMatches = false;
                        let sMatchedName = null;
                        try {
                            const sSnap = await sDocRef.get();
                            if (sSnap.exists) {
                                sDocData = sSnap.data();
                                const sNameField = sDocData.name || sDocData.title;
                                if (typeof sNameField === 'string' && sNameField.trim().toLowerCase().startsWith('test')) {
                                    sNameMatches = true;
                                    sMatchedName = sNameField;
                                }
                            }
                        } catch (_) {}

                        if (sIdMatches || sNameMatches) {
                            const reasons = [];
                            if (sIdMatches) reasons.push(`Doc ID starts with "test" (${sDocId})`);
                            if (sNameMatches) reasons.push(`Name field starts with "test" ("${sMatchedName}")`);
                            otherTestItems.push({
                                type: 'document',
                                path: sDocRef.path,
                                docId: sDocId,
                                name: sMatchedName,
                                reason: reasons.join(', ')
                            });
                        }
                    }
                }
            } catch (_) {}
        }
    }

    if (otherTestItems.length === 0) {
        console.log('  No other collections or documents found matching "test".');
    } else {
        console.log(`  Found ${otherTestItems.length} other item(s) matching "test":`);
        otherTestItems.forEach((item, i) => {
            console.log(`  [${i + 1}] Type:   ${item.type.toUpperCase()}`);
            console.log(`      Path:   ${item.path}`);
            if (item.name) console.log(`      Name:   "${item.name}"`);
            if (item.status) console.log(`      Status: ${item.status}`);
            console.log(`      Reason: ${item.reason}`);
        });
    }

    // -------------------------------------------------------------------------
    // 4. SUMMARY COUNTS
    // -------------------------------------------------------------------------
    console.log('\n' + '='.repeat(70));
    console.log(' CLEANUP AUDIT SUMMARY COUNTS');
    console.log('='.repeat(70));
    console.log(`  1. Total Firebase Auth Users:                  ${allUsers.length}`);
    console.log(`     Auth Users kept (preserved):                ${keptUsers.length}`);
    console.log(`     Test Auth Users to delete:                  ${testUsersToDelete.length}`);
    console.log(`  2. Orphaned "test_" Post documents:            ${orphanedPosts.size}`);
    console.log(`     Orphaned Post Likes subcollection docs:     ${totalOrphanedLikesCount}`);
    console.log(`  3. Other Firestore items with "test" ID/name:  ${otherTestItems.length}`);
    console.log('='.repeat(70));

    if (!isApply) {
        console.log('\n[NOTICE] This was a DRY RUN. Zero deletions were performed.');
        console.log('To execute real deletions for Auth test users and orphaned posts, run:');
        console.log('  node scripts/cleanup-test-data.mjs --apply\n');
    } else {
        console.log('\n[NOTICE] Real deletions completed for authorized categories.\n');
    }
}

main().catch(err => {
    console.error('\n[FATAL ERROR]', err);
    process.exit(1);
});
