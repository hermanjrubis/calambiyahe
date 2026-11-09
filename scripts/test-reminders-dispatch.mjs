// Test reminders dispatch engine, auth checks, and expiration logic
import dotenv from 'dotenv';
dotenv.config();

process.env.NODE_ENV = 'test';
process.env.DRY_RUN_EMAIL = 'true'; // For test safety

import '../server/auth.js';
import app from '../server/server.js';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import assert from 'assert';

console.log('--- Testing Reminders Dispatch Suite ---');

// Test 1: isCronAuthorized helper
console.log('Test 1: isCronAuthorized helper');
const secret = process.env.CRON_SECRET || 'calzada-travel-reminders-dispatch-cron-key-2026';

assert.strictEqual(
    app.isCronAuthorized({ headers: { 'x-cron-secret': secret } }),
    true,
    'Should authorize with X-Cron-Secret header'
);
assert.strictEqual(
    app.isCronAuthorized({ headers: { 'authorization': `Bearer ${secret}` } }),
    true,
    'Should authorize with Bearer token'
);
assert.strictEqual(
    app.isCronAuthorized({ headers: {}, query: { secret } }),
    true,
    'Should authorize with query param ?secret='
);
assert.strictEqual(
    app.isCronAuthorized({ headers: {}, query: { key: secret } }),
    true,
    'Should authorize with query param ?key='
);
assert.strictEqual(
    app.isCronAuthorized({ headers: { 'authorization': 'Bearer wrong-secret' }, query: {} }),
    false,
    'Should reject invalid secret'
);
console.log('✓ Test 1 Passed: Authorization validation works.');

// Test 2: Expired reminders handling
console.log('Test 2: Dispatching due reminders and handling expired ones');
const db = getFirestore();

// Run dispatchDueReminders
const result = await app.dispatchDueReminders();
console.log('Dispatch result:', result);

assert(result.success === true, 'Dispatch should return success: true');
console.log(`✓ Processed: ${result.processed}, Sent: ${result.sent}, Failed: ${result.failed}, Expired: ${result.expired}`);

// Check that yesterday's reminders for SM City Calamba were marked as expired
const docIds = ['qZIh89Z0SfVIxeT0p3k1', 'RFurKV991MaCWVZVnGlq'];
for (const id of docIds) {
    const snap1 = await db.doc(`users/XF8Y1T8sr7RTWgp5dEax5pLBmol2/reminders/${id}`).get();
    const snap2 = await db.doc(`users/pPwZ9CCFx2hyMb0XWqkE46IBL9F2/reminders/${id}`).get();
    const docSnap = snap1.exists ? snap1 : snap2;
    if (docSnap.exists) {
        const d = docSnap.data();
        assert.strictEqual(d.status, 'expired', `Reminder ${id} should be expired`);
        assert.strictEqual(d.lastError, 'Trip departure time has already passed');
        console.log(`✓ Verified reminder ${id} is marked expired`);
    }
}

// Test 3: Create a fresh due reminder and verify dispatch sends it
console.log('Test 3: Dispatching a fresh due reminder');
// Use the known test user UID
const testUid = 'pPwZ9CCFx2hyMb0XWqkE46IBL9F2'; // hermanjohnph@gmail.com
const testReminderRef = await db.collection(`users/${testUid}/reminders`).add({
    destName: 'Test SM City Calamba Dispatch',
    destLat: 14.2045,
    destLng: 121.1554,
    originLabel: 'Test Origin',
    mode: 'jeepney',
    leaveAt: Timestamp.fromDate(new Date(Date.now() + 5 * 60 * 1000)), // 5 mins from now
    arriveBy: Timestamp.fromDate(new Date(Date.now() + 30 * 60 * 1000)),
    remindAt: Timestamp.fromDate(new Date(Date.now() - 1000)), // 1 second in the past (due now!)
    channel: 'email',
    lang: 'en',
    status: 'scheduled',
    fareRegular: 15,
    fareDiscounted: 12,
    createdAt: Timestamp.now()
});

console.log('Created test reminder:', testReminderRef.id);

// Run dispatchDueReminders again
const freshResult = await app.dispatchDueReminders();
console.log('Fresh dispatch result:', freshResult);
assert(freshResult.sent >= 1, 'Fresh due reminder should be dispatched and sent');

// Verify status in Firestore
const updatedSnap = await testReminderRef.get();
const updatedData = updatedSnap.data();
assert.strictEqual(updatedData.status, 'sent', 'Status should be updated to sent');
assert(updatedData.sentAt != null, 'sentAt should be populated');
console.log('✓ Fresh reminder successfully transitioned to sent!');

// Clean up the test reminder doc
await testReminderRef.delete();
console.log('✓ Cleaned up test reminder doc.');

console.log('\nAll reminders dispatch tests passed successfully! 🎉');
process.exit(0);
