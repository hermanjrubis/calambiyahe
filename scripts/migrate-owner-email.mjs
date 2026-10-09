/**
 * scripts/migrate-owner-email.mjs
 *
 * Migrates ownerEmail from the public businesses document to the private subcollection:
 * businesses/{businessId}/private/owner: { ownerEmail: string | null }
 *
 * Removes ownerEmail and adminNotes from the business document, and removes
 * rejectionReason where status is 'approved'.
 *
 * Usage:
 *   node scripts/migrate-owner-email.mjs          (DRY RUN - default, no writes)
 *   node scripts/migrate-owner-email.mjs --apply  (Apply changes to Firestore)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const isApply = process.argv.includes('--apply');

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
        app = initializeApp();
    }
}

const db = getFirestore(app);

async function runMigration() {
    console.log('='.repeat(70));
    console.log(`Calzada - Migration: Move ownerEmail to private/owner`);
    console.log(`Mode: ${isApply ? 'APPLY (WRITES ENABLED)' : 'DRY RUN (NO WRITES)'}`);
    console.log('='.repeat(70));

    const snap = await db.collection('businesses').get();
    console.log(`Scanned ${snap.size} total business document(s).\n`);

    let candidateCount = 0;
    const operations = [];

    for (const docSnap of snap.docs) {
        const data = docSnap.data();
        const hasOwnerEmail = data.ownerEmail !== undefined;
        const hasAdminNotes = data.adminNotes !== undefined;
        const hasRejectionReasonOnApproved = data.status === 'approved' && data.rejectionReason !== undefined;

        if (hasOwnerEmail || hasAdminNotes || hasRejectionReasonOnApproved) {
            candidateCount++;
            const changes = [];
            const fieldsToDelete = [];

            if (hasOwnerEmail) {
                changes.push(`Copy ownerEmail ("${data.ownerEmail}") -> private/owner`);
                fieldsToDelete.push('ownerEmail');
            }
            if (hasAdminNotes) {
                fieldsToDelete.push('adminNotes');
            }
            if (hasRejectionReasonOnApproved) {
                fieldsToDelete.push('rejectionReason (status is approved)');
            }

            operations.push({
                id: docSnap.id,
                name: data.name || 'Unnamed',
                status: data.status,
                ownerEmail: data.ownerEmail || null,
                changes,
                fieldsToDelete,
                ref: docSnap.ref,
                hasOwnerEmail,
                hasAdminNotes,
                hasRejectionReasonOnApproved
            });
        }
    }

    if (candidateCount === 0) {
        console.log('No businesses found with ownerEmail, adminNotes, or stale rejectionReason.');
        console.log('Database is already clean!\n');
        return;
    }

    console.log(`Found ${candidateCount} business(es) requiring updates:\n`);

    for (const op of operations) {
        console.log(`[${op.id}] "${op.name}" (status: ${op.status})`);
        op.changes.forEach(c => console.log(`  -> ${c}`));
        if (op.fieldsToDelete.length > 0) {
            console.log(`  -> Remove fields from main doc: ${op.fieldsToDelete.join(', ')}`);
        }
        console.log('');
    }

    if (!isApply) {
        console.log('='.repeat(70));
        console.log('[DRY RUN COMPLETE] 0 documents modified.');
        console.log('To apply these changes, rerun with --apply:');
        console.log('  node scripts/migrate-owner-email.mjs --apply');
        console.log('='.repeat(70));
        return;
    }

    // Apply mode
    console.log('Applying changes via Firestore batch...');
    const batch = db.batch();
    for (const op of operations) {
        if (op.hasOwnerEmail) {
            const privateRef = op.ref.collection('private').doc('owner');
            batch.set(privateRef, { ownerEmail: op.ownerEmail }, { merge: true });
        }
        const updates = {};
        if (op.hasOwnerEmail) updates.ownerEmail = FieldValue.delete();
        if (op.hasAdminNotes) updates.adminNotes = FieldValue.delete();
        if (op.hasRejectionReasonOnApproved) updates.rejectionReason = FieldValue.delete();
        batch.update(op.ref, updates);
    }
    await batch.commit();
    console.log(`Successfully migrated ${candidateCount} business document(s).`);
}

runMigration().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
