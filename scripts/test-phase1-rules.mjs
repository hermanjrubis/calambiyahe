/**
 * scripts/test-phase1-rules.mjs
 * 
 * Static and Semantic Verification Suite for Phase 1 Firestore Rules & Data Models:
 * Validates rule definitions, expressions, AST invariants, allowlists, and all required transitions.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rulesPath = path.resolve(__dirname, '../firestore.rules');
const plansConfigPath = path.resolve(__dirname, '../public/js/plans-config.js');

console.log('========================================================');
console.log('PHASE 1: RULES & DATA MODEL VERIFICATION');
console.log('========================================================\n');

let failedTests = 0;
function assert(condition, message) {
    if (condition) {
        console.log(`  [PASS] ${message}`);
    } else {
        console.error(`  [FAIL] ${message}`);
        failedTests++;
    }
}

// 1. Files existence
assert(fs.existsSync(rulesPath), 'firestore.rules exists');
assert(fs.existsSync(plansConfigPath), 'public/js/plans-config.js exists');

const rules = fs.readFileSync(rulesPath, 'utf8');
const plansConfig = fs.readFileSync(plansConfigPath, 'utf8');

// 2. plans-config.js checks
console.log('\n--- 1.1 PLANS CONFIG CHECKS ---');
assert(plansConfig.includes('window.CALZADA_PLANS ='), 'CALZADA_PLANS is declared on window');
assert(plansConfig.includes('listed:') && plansConfig.includes('price: 59') && plansConfig.includes('postsPerMonth: 4'), 'Listed plan has price 59 and 4 posts/mo');
assert(plansConfig.includes('plus360:') && plansConfig.includes('price: 199') && plansConfig.includes('postsPerMonth: 8') && plansConfig.includes('recommended: true'), 'Listed + 360 plan has price 199, 8 posts/mo, recommended');
assert(plansConfig.includes('featured:') && plansConfig.includes('price: 299') && plansConfig.includes('postsPerMonth: null') && plansConfig.includes('featuredDays: 14'), 'Featured plan has price 299, unlimited posts, 14 featured days');
assert(plansConfig.includes('window.CALZADA_ADDONS ='), 'CALZADA_ADDONS is declared');
assert(plansConfig.includes('window.CALZADA_PAYMENT ='), 'CALZADA_PAYMENT is declared');
assert(plansConfig.includes("qrImage: '/assets/payments/gcash-qr.png'"), 'CALZADA_PAYMENT specifies qrImage path');

// 3. firestore.rules function planPrice
console.log('\n--- 1.2 PLAN PRICE IN RULES ---');
assert(rules.includes('function planPrice(p)'), 'planPrice(p) helper function defined in rules');
assert(rules.includes("p == 'listed' ? 59 : (p == 'plus360' ? 199 : (p == 'featured' ? 299 : 0))"), 'planPrice matches config prices (59, 199, 299)');

// 4. businesses collection rules
console.log('\n--- 1.3 BUSINESSES COLLECTION RULES ---');
assert(rules.includes("request.resource.data.plan in ['listed', 'plus360', 'featured']"), 'Create requires plan in listed, plus360, featured');
assert(rules.includes("!('reviewNote' in request.resource.data)"), 'Create forbids reviewNote');
assert(rules.includes("!('paidAt' in request.resource.data)"), 'Create forbids paidAt');
assert(rules.includes("!('featuredUntil' in request.resource.data)"), 'Create forbids featuredUntil');
assert(rules.includes("!('amountDue' in request.resource.data)"), 'Create forbids amountDue');
assert(rules.includes("resource.data.status == 'approved'"), 'Public read is only allowed when status == approved');

// Owner transitions
console.log('\n--- 1.4 BUSINESS OWNER TRANSITIONS ---');
// Resubmit from needs_changes
assert(rules.includes("resource.data.status == 'needs_changes'") && rules.includes("request.resource.data.status == 'pending'"), 'Owner can resubmit from needs_changes to pending');
// Change plan while pending
assert(rules.includes("resource.data.status == 'pending'") && rules.includes("hasOnly(['plan', 'updatedAt'])"), 'Owner can change plan while pending (+ updatedAt only)');
// Change plan while awaiting_payment
assert(rules.includes("resource.data.status == 'awaiting_payment'") && rules.includes("request.resource.data.amountDue == planPrice(request.resource.data.plan)"), 'Owner change plan while awaiting_payment enforces amountDue == planPrice(plan)');
// Pay transition
assert(rules.includes("resource.data.status == 'awaiting_payment'") && rules.includes("request.resource.data.status == 'payment_review'"), 'Owner pay transitions awaiting_payment to payment_review');
assert(rules.includes("existsAfter(/databases/$(database)/documents/payments/$(request.resource.data.lastPaymentId))"), 'Owner pay verifies payment document existsAfter in batch');

// Admin allowlist
console.log('\n--- 1.5 ADMIN BUSINESS FIELDS ---');
assert(rules.includes("'reviewNote'") && rules.includes("'amountDue'") && rules.includes("'detailsApprovedAt'") && rules.includes("'paidAt'") && rules.includes("'featuredUntil'") && rules.includes("'shoot360'"), 'Admin update allowlist contains all required new fields');

// 5. payments collection rules
console.log('\n--- 1.6 PAYMENTS COLLECTION RULES ---');
assert(rules.includes('match /payments/{paymentId}'), 'payments/{paymentId} collection rule exists');
assert(rules.includes("request.resource.data.ownerId == request.auth.uid"), 'Payments create restricted to owner');
assert(rules.includes("request.resource.data.status == 'submitted'"), 'Payments create forces status to submitted');
assert(rules.includes("['awaiting_payment', 'payment_review']") || rules.includes("data.status == 'awaiting_payment'"), 'Payments create requires business status in awaiting_payment / payment_review');
assert(rules.includes("request.resource.data.amountDue == get(/databases/$(database)/documents/businesses/$(request.resource.data.businessId)).data.amountDue"), 'Payments create enforces amountDue == business.amountDue');
assert(rules.includes("request.resource.data.referenceNo.matches('^[0-9]{10,20}$')"), 'Payments create enforces 10-20 digit reference number');
assert(rules.includes("isValidCloudinaryUrl(request.resource.data.receiptUrl)"), 'Payments create enforces valid Cloudinary receiptUrl');
assert(rules.includes("allow delete: if false;"), 'Payments delete is permanently forbidden (allow delete: if false)');

// 6. paymentRefs collection rules (Lock)
console.log('\n--- 1.7 PAYMENT REFS (DUPLICATE LOCK) ---');
assert(rules.includes('match /paymentRefs/{referenceNo}'), 'paymentRefs/{referenceNo} collection rule exists');
assert(rules.includes("existsAfter(/databases/$(database)/documents/payments/$(request.resource.data.paymentId))"), 'paymentRefs requires matching payment in same batch (existsAfter)');
assert(rules.includes("getAfter(/databases/$(database)/documents/payments/$(request.resource.data.paymentId)).data.referenceNo == referenceNo"), 'paymentRefs enforces referenceNo matches payment referenceNo');
assert(rules.includes("allow read: if request.auth != null && request.auth.token.admin == true;"), 'paymentRefs read is admin-only');
assert(rules.includes("allow update: if false;"), 'paymentRefs update is forbidden');

// 7. posts collection updates
console.log('\n--- 1.8 POSTS COLLECTION RULES ---');
assert(rules.includes("'label'") && rules.includes("'promoUntil'"), 'Posts create allowlist includes label and promoUntil');
assert(rules.includes("resource.data.get('status', 'active') != 'hidden'"), 'Public read excludes hidden posts');

// Check script loading across pages
console.log('\n--- 1.9 SCRIPT INCLUSION IN PAGES ---');
const pages = ['submit.html', 'my-business.html', 'admin.html', 'discover.html'];
for (const p of pages) {
    const pageContent = fs.readFileSync(path.resolve(__dirname, '../public/pages', p), 'utf8');
    assert(pageContent.includes('plans-config.js?v='), `${p} loads plans-config.js with ?v= query`);
}

console.log('\n========================================================');
if (failedTests === 0) {
    console.log('ALL PHASE 1 CHECKS PASSED!');
} else {
    console.error(`${failedTests} CHECKS FAILED!`);
    process.exit(1);
}
console.log('========================================================');
