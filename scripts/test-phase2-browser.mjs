import { chromium } from 'playwright';

async function testPhase2() {
    const browser = await chromium.launch();
    console.log('========================================================');
    console.log('PHASE 2: BROWSER VERIFICATION (390px & 1280px)');
    console.log('========================================================\n');

    let failedTests = 0;
    function assert(cond, msg) {
        if (cond) {
            console.log(`  [PASS] ${msg}`);
        } else {
            console.error(`  [FAIL] ${msg}`);
            failedTests++;
        }
    }

    // --- TEST 1: /plans at 1280px (Desktop) ---
    console.log('\n--- 1. /plans at 1280px (Desktop) ---');
    {
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const page = await context.newPage();
        const errors = [];
        page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
        page.on('pageerror', err => errors.push(err.message));

        const res = await page.goto('http://localhost:5000/plans', { waitUntil: 'domcontentloaded' });
        assert(res.status() === 200, 'HTTP status is 200');
        await page.waitForTimeout(600);

        const state = await page.evaluate(() => {
            const cards = document.querySelectorAll('.plan-card');
            const recCard = document.querySelector('.plan-card.recommended');
            const recLabel = recCard?.querySelector('.plan-recommended-label');
            const recBtn = recCard?.querySelector('.btn-plan.solid');
            const compareRows = document.querySelectorAll('#compareTableBody tr');
            const addons = document.querySelectorAll('.addon-card');
            const sticky = document.querySelector('.sticky-bottom-bar');
            const stickyVisible = sticky ? window.getComputedStyle(sticky).display !== 'none' : false;

            return {
                cardsCount: cards.length,
                hasRecCard: !!recCard,
                recLabelText: recLabel?.textContent?.trim(),
                hasRecBtn: !!recBtn,
                compareRowsCount: compareRows.length,
                addonsCount: addons.length,
                stickyVisible,
                prices: Array.from(cards).map(c => c.querySelector('.plan-price-amount')?.textContent?.trim())
            };
        });

        assert(state.cardsCount === 3, 'Rendered 3 plan cards in grid');
        assert(state.hasRecCard, 'Listed + 360 card has .recommended class');
        assert(state.recLabelText === 'RECOMMENDED', 'Recommended label text is RECOMMENDED');
        assert(state.hasRecBtn, 'Recommended card has solid blue button');
        assert(state.prices.includes('₱59') && state.prices.includes('₱199') && state.prices.includes('₱299'), 'Cards display dynamic prices ₱59, ₱199, ₱299');
        assert(state.compareRowsCount === 9, 'Compare table rendered 9 feature rows');
        assert(state.addonsCount === 3, 'Add-ons grid rendered 3 cards');
        assert(!state.stickyVisible, 'Sticky bottom bar is hidden on desktop');
        assert(errors.length === 0, `No console errors (got ${errors.length})`);
        await context.close();
    }

    // --- TEST 2: /plans at 390px (Mobile) ---
    console.log('\n--- 2. /plans at 390px (Mobile) ---');
    {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const page = await context.newPage();
        const errors = [];
        page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
        page.on('pageerror', err => errors.push(err.message));

        await page.goto('http://localhost:5000/plans', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(600);

        const mobileState = await page.evaluate(() => {
            const cards = document.querySelectorAll('.plan-card');
            const selected = document.querySelector('.plan-card.selected');
            const sticky = document.querySelector('.sticky-bottom-bar');
            const stickyBtn = document.querySelector('#btnStickyContinue');
            const stickyVisible = sticky ? window.getComputedStyle(sticky).display !== 'none' : false;

            return {
                cardsCount: cards.length,
                selectedId: selected?.id,
                stickyVisible,
                stickyText: stickyBtn?.textContent?.trim(),
                stickyHref: stickyBtn?.getAttribute('href')
            };
        });

        assert(mobileState.cardsCount === 3, '3 mobile stacked cards rendered');
        assert(mobileState.selectedId === 'planCard_plus360', 'Listed + 360 is selected by default');
        assert(mobileState.stickyVisible, 'Sticky bottom bar is visible on mobile');
        assert(mobileState.stickyText === 'Continue with Listed + 360', 'Sticky button text is Continue with Listed + 360');
        assert(mobileState.stickyHref === '/submit?plan=plus360', 'Sticky button links to /submit?plan=plus360');

        // Click Listed card to verify interaction
        await page.click('#planCard_listed');
        await page.waitForTimeout(200);

        const switchedState = await page.evaluate(() => {
            const selected = document.querySelector('.plan-card.selected');
            const stickyBtn = document.querySelector('#btnStickyContinue');
            return {
                selectedId: selected?.id,
                stickyText: stickyBtn?.textContent?.trim(),
                stickyHref: stickyBtn?.getAttribute('href')
            };
        });

        assert(switchedState.selectedId === 'planCard_listed', 'Clicking Listed card selects it');
        assert(switchedState.stickyText === 'Continue with Listed', 'Sticky button updates to Continue with Listed');
        assert(switchedState.stickyHref === '/submit?plan=listed', 'Sticky button href updates to /submit?plan=listed');
        assert(errors.length === 0, `No console errors (got ${errors.length})`);
        await context.close();
    }

    // --- TEST 3: /submit at 1280px & with ?plan=featured ---
    console.log('\n--- 3. /submit Plan Step & Query Param Pre-selection ---');
    {
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        await context.addInitScript(() => {
            window.__MOCK_AUTH_USER__ = { uid: 'test-user-submit', email: 'user@example.com' };
        });
        const page = await context.newPage();
        const errors = [];
        page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
        page.on('pageerror', err => errors.push(err.message));

        // Test default (no ?plan=) -> plus360
        await page.goto('http://localhost:5000/submit', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(600);

        const submitStateDefault = await page.evaluate(() => {
            const group = document.querySelector('#submitPlansGroup');
            const cards = document.querySelectorAll('.submit-plan-card');
            const selected = document.querySelector('.submit-plan-card.selected');
            const compareLink = document.querySelector('a[href="/plans"]');
            return {
                hasGroup: !!group,
                cardsCount: cards.length,
                selectedId: selected?.id,
                hasCompareLink: !!compareLink
            };
        });

        assert(submitStateDefault.hasGroup, 'Choose a plan group exists in form');
        assert(submitStateDefault.cardsCount === 3, '3 compact selectable plan cards rendered');
        assert(submitStateDefault.selectedId === 'submitPlan_plus360', 'Default plan is plus360');
        assert(submitStateDefault.hasCompareLink, 'Compare plans link to /plans exists');

        // Test with ?plan=featured -> featured
        await page.goto('http://localhost:5000/submit?plan=featured', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(600);

        const submitStateFeatured = await page.evaluate(() => {
            const selected = document.querySelector('.submit-plan-card.selected');
            return { selectedId: selected?.id };
        });

        assert(submitStateFeatured.selectedId === 'submitPlan_featured', '?plan=featured pre-selects featured plan');
        assert(errors.length === 0, `No console errors (got ${errors.length})`);
        await context.close();
    }

    console.log('\n========================================================');
    if (failedTests === 0) {
        console.log('ALL PHASE 2 VERIFICATIONS PASSED!');
    } else {
        console.error(`${failedTests} VERIFICATIONS FAILED!`);
        process.exit(1);
    }
    console.log('========================================================');
    await browser.close();
}

testPhase2().catch(e => {
    console.error('Test execution error:', e);
    process.exit(1);
});
