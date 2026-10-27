/**
 * scripts/test-p3-visibility.mjs
 * Unit tests for Calzada Business Visibility & Ranking Algorithm
 */

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import visibility module
const visibilityPath = path.resolve(__dirname, '../public/js/visibility.js');
const visibilityMod = await import(`file://${visibilityPath}`);
const { isNew, isBoosted, rank, rankSearchResults, getManilaDateString } = visibilityMod.default || visibilityMod;

async function runVisibilityTests() {
    console.log('========================================================');
    console.log('PHASE 3: VISIBILITY UNIT TESTS (FIXED CLOCK)');
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

    const DAY_MS = 86400000;
    const basePaidAt = new Date('2026-10-01T00:00:00.000Z').getTime();

    const listedBiz = { id: 'biz_listed', plan: 'listed', paidAt: basePaidAt };
    const plus360Biz = { id: 'biz_plus', plan: 'plus360', paidAt: basePaidAt };
    const featuredBiz = { id: 'biz_feat', plan: 'featured', paidAt: basePaidAt };

    // -----------------------------------------------------------------
    // TEST 1: New ends exactly at 7 / 14 / 30 days
    // -----------------------------------------------------------------
    console.log('--- Test 1: New Tag Expiration ---');
    // listed: 7 days
    const listedBefore = basePaidAt + (7 * DAY_MS) - 1000;
    const listedExact = basePaidAt + (7 * DAY_MS);
    const listedAfter = basePaidAt + (7 * DAY_MS) + 1000;
    report(isNew(listedBiz, listedBefore) === true, 'Listed plan: isNew is true before 7 days.');
    report(isNew(listedBiz, listedExact) === false, 'Listed plan: isNew ends at exactly 7 days.');
    report(isNew(listedBiz, listedAfter) === false, 'Listed plan: isNew is false after 7 days.');

    // plus360: 14 days
    const plusBefore = basePaidAt + (14 * DAY_MS) - 1000;
    const plusExact = basePaidAt + (14 * DAY_MS);
    report(isNew(plus360Biz, plusBefore) === true, 'Plus360 plan: isNew is true before 14 days.');
    report(isNew(plus360Biz, plusExact) === false, 'Plus360 plan: isNew ends at exactly 14 days.');

    // featured: 30 days
    const featBefore = basePaidAt + (30 * DAY_MS) - 1000;
    const featExact = basePaidAt + (30 * DAY_MS);
    report(isNew(featuredBiz, featBefore) === true, 'Featured plan: isNew is true before 30 days.');
    report(isNew(featuredBiz, featExact) === false, 'Featured plan: isNew ends at exactly 30 days.');

    // -----------------------------------------------------------------
    // TEST 2: Boost ends at 0 / 7 / 30 days
    // -----------------------------------------------------------------
    console.log('\n--- Test 2: Boost Expiration ---');
    // listed: 0 days (never boosted)
    report(isBoosted(listedBiz, basePaidAt + 1000) === false, 'Listed plan: boost is 0 days (never boosted).');

    // plus360: 7 days
    const boostPlusBefore = basePaidAt + (7 * DAY_MS) - 1000;
    const boostPlusExact = basePaidAt + (7 * DAY_MS);
    report(isBoosted(plus360Biz, boostPlusBefore) === true, 'Plus360 plan: boosted before 7 days.');
    report(isBoosted(plus360Biz, boostPlusExact) === false, 'Plus360 plan: boost ends at exactly 7 days.');

    // featured: 30 days
    const boostFeatBefore = basePaidAt + (30 * DAY_MS) - 1000;
    const boostFeatExact = basePaidAt + (30 * DAY_MS);
    report(isBoosted(featuredBiz, boostFeatBefore) === true, 'Featured plan: boosted before 30 days.');
    report(isBoosted(featuredBiz, boostFeatExact) === false, 'Featured plan: boost ends at exactly 30 days.');

    // -----------------------------------------------------------------
    // TEST 3: Rotation is identical within a day and different on the next day
    // -----------------------------------------------------------------
    console.log('\n--- Test 3: Daily Fair Rotation ---');
    const day1TimeA = new Date('2026-10-02T08:00:00+08:00'); // 8:00 AM Manila
    const day1TimeB = new Date('2026-10-02T19:00:00+08:00'); // 7:00 PM Manila
    const day2Time = new Date('2026-10-03T08:00:00+08:00');  // Next day Manila

    // Create a pool of 6 boosted businesses with identical plan & tier
    const sameTierBusinesses = [
        { id: 'biz_alpha', plan: 'plus360', paidAt: basePaidAt },
        { id: 'biz_bravo', plan: 'plus360', paidAt: basePaidAt },
        { id: 'biz_charlie', plan: 'plus360', paidAt: basePaidAt },
        { id: 'biz_delta', plan: 'plus360', paidAt: basePaidAt },
        { id: 'biz_echo', plan: 'plus360', paidAt: basePaidAt },
        { id: 'biz_foxtrot', plan: 'plus360', paidAt: basePaidAt }
    ];

    const orderDay1A = rank(sameTierBusinesses, day1TimeA).map(b => b.id);
    const orderDay1B = rank(sameTierBusinesses, day1TimeB).map(b => b.id);
    const orderDay2 = rank(sameTierBusinesses, day2Time).map(b => b.id);

    report(
        JSON.stringify(orderDay1A) === JSON.stringify(orderDay1B),
        'Within the same day, ranking rotation is 100% identical.'
    );
    report(
        JSON.stringify(orderDay1A) !== JSON.stringify(orderDay2),
        'On the next day, ranking rotation rotates fairly to a different order.'
    );

    // -----------------------------------------------------------------
    // TEST 4: Search lift is at most 3
    // -----------------------------------------------------------------
    console.log('\n--- Test 4: Search Lift Limits ---');
    // Set up a search match list of 10 items
    // Item at index 7 is boosted
    const searchMatches = [
        { id: 'p0', plan: 'listed', paidAt: basePaidAt },
        { id: 'p1', plan: 'listed', paidAt: basePaidAt },
        { id: 'p2', plan: 'listed', paidAt: basePaidAt },
        { id: 'p3', plan: 'listed', paidAt: basePaidAt },
        { id: 'p4', plan: 'listed', paidAt: basePaidAt },
        { id: 'p5', plan: 'listed', paidAt: basePaidAt },
        { id: 'p6', plan: 'listed', paidAt: basePaidAt },
        { id: 'boosted_7', plan: 'featured', paidAt: basePaidAt },
        { id: 'p8', plan: 'listed', paidAt: basePaidAt },
        { id: 'p9', plan: 'listed', paidAt: basePaidAt }
    ];

    const rankedSearch = rankSearchResults(searchMatches, basePaidAt + 1000, 3);
    const originalPos = 7;
    const newPos = rankedSearch.findIndex(x => x.id === 'boosted_7');
    const lift = originalPos - newPos;

    report(lift <= 3, `Boosted item at pos 7 lifted by ${lift} positions (<= 3 max lift).`);
    report(lift === 3, `Boosted item reached maximum allowed lift (pos ${newPos} from ${originalPos}).`);

    // Verify across all items that no item was lifted more than 3 positions
    let allLiftsValid = true;
    searchMatches.forEach((item, oldIdx) => {
        const currIdx = rankedSearch.findIndex(x => x.id === item.id);
        const actualLift = oldIdx - currIdx;
        if (actualLift > 3) allLiftsValid = false;
    });
    report(allLiftsValid, 'Every item satisfies the max-3 search lift invariant.');

    console.log('\n========================================================');
    console.log(`P3 VISIBILITY RESULTS: ${passedCount} passed, ${failedCount} failed`);
    console.log('========================================================');
    if (failedCount > 0) {
        process.exit(1);
    }
}

runVisibilityTests().catch(err => {
    console.error('Visibility test error:', err);
    process.exit(1);
});
