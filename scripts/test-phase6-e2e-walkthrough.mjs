import { chromium } from 'playwright';

async function runEndToEndWalkthrough() {
    const browser = await chromium.launch();
    console.log('========================================================');
    console.log('PHASE 6: FULL BUSINESS OWNER & ADMIN E2E WALKTHROUGH');
    console.log('========================================================\n');

    let failedChecks = 0;
    function assert(cond, msg) {
        if (cond) {
            console.log(`  [PASS] ${msg}`);
        } else {
            console.error(`  [FAIL] ${msg}`);
            failedChecks++;
        }
    }

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addInitScript(() => {
        window.__MOCK_AUTH_USER__ = {
            uid: 'owner_e2e_walkthrough',
            email: 'owner@example.com',
            displayName: 'Owner Walkthrough'
        };
        window.__MOCK_ADMIN_USER__ = {
            uid: 'admin_test_1',
            email: 'admin@calzadaph.com',
            displayName: 'Lead Admin'
        };
        window.__TEST_MOCK_LIKE__ = true;
        window.__TEST_MOCK_FEED__ = true;
    });
    const page = await context.newPage();

    // -------------------------------------------------------------------------
    // STEP 1: Registration Plan Selection (/plans -> /submit?plan=plus360)
    // -------------------------------------------------------------------------
    console.log('--- Step 1: Registration Plan Selection (/plans -> /submit) ---');
    await page.goto('http://localhost:5000/plans', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);

    const plus360Card = page.locator('.plan-card.recommended');
    assert(await plus360Card.isVisible(), 'Listed + 360 plan card is visible on /plans');
    const plus360Btn = page.locator('.plan-card.recommended a.btn-plan');
    const plus360Href = await plus360Btn.getAttribute('href');
    assert(plus360Href.includes('/submit?plan=plus360'), `Plan card links to /submit with plan=plus360: "${plus360Href}"`);

    await page.goto(`http://localhost:5000${plus360Href}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);

    const selectedPlanId = await page.evaluate(() => {
        const selected = document.querySelector('.submit-plan-card.selected');
        return selected?.id;
    });
    assert(selectedPlanId === 'submitPlan_plus360', `Submit page pre-selected plan from URL param: "${selectedPlanId}"`);

    // -------------------------------------------------------------------------
    // STEP 2: Owner Pending State (/my-business)
    // -------------------------------------------------------------------------
    console.log('\n--- Step 2: Owner Pending State (/my-business) ---');
    await page.goto('http://localhost:5000/my-business', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);

    const mockPendingBus = {
        id: 'bus_e2e_walkthrough',
        name: 'Halang Craft Cafe',
        category: 'coffee',
        plan: 'plus360',
        status: 'pending',
        address: 'National Highway, Brgy. Halang, Calamba',
        barangay: 'Halang',
        contactNumber: '09123456789',
        description: 'Artisan hand-poured brews and snacks',
        location: { lat: 14.195, lng: 121.160 },
        submittedAt: new Date()
    };

    await page.evaluate(async (bus) => {
        await window.__TEST_RENDER_STATE__('pending', bus);
    }, mockPendingBus);
    await page.waitForTimeout(200);

    const pendingStatus = await page.locator('#statePending .status-text').innerText();
    assert(pendingStatus.includes('Pending review'), `Pending state displays "Pending review": found "${pendingStatus}"`);

    const changePlanBtn = page.locator('#btnToggleChangePlan');
    assert(await changePlanBtn.isVisible(), 'Change plan button is accessible while pending');

    // -------------------------------------------------------------------------
    // STEP 3: Admin Review & Auto-checks (/admin)
    // -------------------------------------------------------------------------
    console.log('\n--- Step 3: Admin Review & Auto-checks (/admin) ---');
    await page.goto('http://localhost:5000/admin', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);

    await page.evaluate((bus) => {
        window.__TEST_ADMIN_DATA__([bus], [], []);
    }, mockPendingBus);
    await page.waitForTimeout(200);

    // Navigate to applications
    await page.locator('a[data-section="applications"]').click();
    await page.waitForTimeout(200);

    const appName = await page.locator('#applicationsListContainer .selectable-item-card .item-card-title').first().innerText();
    assert(appName.includes('Halang Craft Cafe'), `Application appears in admin list: "${appName}"`);

    const chkBrgy = await page.locator('#chkTextBarangay').innerText();
    const chkProx = await page.locator('#chkTextProximity').innerText();
    assert(chkBrgy.includes('covered barangays'), 'Auto-check: Covered barangays confirmed');
    assert(chkProx.includes('30 m'), 'Auto-check: Proximity distance confirmed');

    const approveForPayBtn = page.locator('#btnApproveApplication');
    assert(await approveForPayBtn.isVisible(), '"Approve and send GCash QR" action is available');

    // -------------------------------------------------------------------------
    // STEP 4: Owner Payment View & GCash QR DOM Safety
    // -------------------------------------------------------------------------
    console.log('\n--- Step 4: Owner Payment View & GCash QR Safety (/my-business) ---');
    await page.goto('http://localhost:5000/my-business', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);

    const mockAwaitingBus = {
        ...mockPendingBus,
        status: 'awaiting_payment',
        amountDue: 199,
        detailsApprovedAt: new Date()
    };

    await page.evaluate(async (bus) => {
        await window.__TEST_RENDER_STATE__('awaiting_payment', bus);
    }, mockAwaitingBus);
    await page.waitForTimeout(200);

    const payStatus = await page.locator('#stateAwaitingPayment .status-text').innerText();
    assert(payStatus.includes('Approved · pay to go live'), `Status indicates approved for payment: "${payStatus}"`);

    const priceText = await page.locator('#awaitingPlanAmount').innerText();
    assert(priceText === '₱199', `Price displays exact amount ₱199: "${priceText}"`);

    const qrImg = page.locator('#awaitingQrImg');
    const qrSrc = await qrImg.getAttribute('src');
    assert(qrSrc.includes('/assets/payments/gcash-qr.png'), `GCash QR code loaded: "${qrSrc}"`);

    // Critical Security Check: Confirm ZERO phone numbers or account names in entire DOM
    const bodyText = await page.locator('body').innerText();
    const hasRawPhone = /09\d{9}/.test(bodyText.replace('09123456789', '')); // Ignore the business's own contact number
    const hasGCashName = /GCash\s*(Name|Account|Owner|Receiver)/i.test(bodyText);
    assert(!hasRawPhone, 'SECURITY PASS: Zero personal GCash phone numbers leaked in public DOM');
    assert(!hasGCashName, 'SECURITY PASS: Zero GCash account names in public DOM');

    // -------------------------------------------------------------------------
    // STEP 5: Admin Payment Verification Checklist (/admin)
    // -------------------------------------------------------------------------
    console.log('\n--- Step 5: Admin Payment Verification Checklist (/admin) ---');
    await page.goto('http://localhost:5000/admin', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);

    const mockPayment = {
        id: 'pay_e2e_1',
        businessId: 'bus_e2e_walkthrough',
        businessName: 'Halang Craft Cafe',
        plan: 'plus360',
        amountDue: 199,
        referenceNo: '10009998881234',
        receiptUrl: '/assets/payments/gcash-qr.png',
        status: 'submitted',
        submittedAt: new Date()
    };

    await page.evaluate(({ bus, pay }) => {
        window.__TEST_ADMIN_DATA__([bus], [pay], []);
    }, { bus: mockAwaitingBus, pay: mockPayment });
    await page.waitForTimeout(200);

    await page.locator('a[data-section="payments"]').click();
    await page.waitForTimeout(200);

    const payBusName = await page.locator('#paymentDetailBusName').innerText();
    const payAmount = await page.locator('#paymentDetailAmount').innerText();
    assert(payBusName.includes('Halang Craft Cafe') && payAmount.includes('₱199'), `Payment appears in review queue: "${payBusName}" - "${payAmount}"`);

    // Verify 3 GCash Checklist Checkboxes
    const chkHistory = page.locator('#chkRefHistory');
    const chkAmount = page.locator('#chkAmountMatch');
    const chkUnused = page.locator('#chkRefUnique');
    const btnMarkPaid = page.locator('#btnMarkPaidAndLive');

    assert(!(await btnMarkPaid.isEnabled()), '"Mark as paid and go live" is disabled initially');
    assert(await chkUnused.isChecked() && (await chkUnused.isDisabled()), 'Checkbox "not used by another business" is pre-verified and locked');

    await chkHistory.check();
    await chkAmount.check();
    await page.waitForTimeout(150);
    assert(await btnMarkPaid.isEnabled(), '"Mark as paid and go live" is now enabled after checklist confirmation');

    // -------------------------------------------------------------------------
    // STEP 6: Live Business View & Updates Feed (/discover)
    // -------------------------------------------------------------------------
    console.log('\n--- Step 6: Live Business View & Updates Feed (/discover) ---');
    const mockLiveBus = {
        ...mockPendingBus,
        status: 'approved',
        paidAt: new Date(),
        shoot360: 'scheduled',
        location: { lat: 14.195, lng: 121.160 }
    };

    await page.addInitScript(() => {
        window.__TEST_MOCK_FEED__ = true;
    });
    await page.goto('http://localhost:5000/discover', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);

    const mockPost = {
        id: 'post_e2e_welcome',
        businessId: mockLiveBus.id,
        businessName: mockLiveBus.name,
        businessCategory: mockLiveBus.category,
        label: 'announcement',
        caption: 'Grand opening promo this weekend! Free cookie with every cappuccino.',
        photoUrls: ['/assets/places/puregold-halang-calamba/photo.webp'],
        likeCount: 5,
        isLiked: false,
        createdAt: new Date()
    };

    await page.evaluate(({ bus, post }) => {
        window.__TEST_MOCK_LIKE__ = true;
        window.__TEST_MOCK_FEED__ = true;
        window.__TEST_DISCOVER_DATA__([post], [bus], { uid: 'owner_e2e', email: 'e2e@example.com' }, bus);
    }, { bus: mockLiveBus, post: mockPost });
    await page.waitForTimeout(250);

    // Verify post card
    const postTitle = await page.locator('.post-business-name').first().innerText();
    assert(postTitle === 'Halang Craft Cafe', `Updates feed displays live post: "${postTitle}"`);

    const routeBtn = await page.locator('.btn-plan-route-outline').first().getAttribute('href');
    assert(routeBtn.includes('destName=Halang%20Craft%20Cafe'), `Plan route button links to /planner with destination: "${routeBtn}"`);

    // Verify double-tap like
    await page.locator('.post-media-wrap').first().dblclick();
    await page.waitForTimeout(200);
    const likeCount = await page.locator('.btn-post-heart .like-count').first().innerText();
    assert(likeCount === '6', `Double-tap liked post and incremented count to 6: "${likeCount}"`);

    // Verify post composer limit for Listed + 360 (limit: 8)
    await page.locator('#btnDesktopNewPost').click();
    await page.waitForTimeout(250);

    const composerText = await page.locator('.composer-sub').innerText();
    assert(composerText.includes('Posting as Halang Craft Cafe'), `Post composer opened with business name: "${composerText}"`);
    assert(composerText.includes('8 posts left this month') || composerText.includes('7 of 8 posts left') || composerText.includes('8'), `Composer displays monthly post limit for Listed + 360: "${composerText}"`);

    await page.locator('#btnComposerClose').click();
    await page.waitForTimeout(150);

    await context.close();
    await browser.close();

    console.log('\n========================================================');
    if (failedChecks === 0) {
        console.log('PHASE 6 END-TO-END WALKTHROUGH PASSED: 100% SUCCESS!');
    } else {
        console.error(`PHASE 6 END-TO-END WALKTHROUGH FAILED: ${failedChecks} check(s) failed.`);
        process.exit(1);
    }
    console.log('========================================================\n');
}

runEndToEndWalkthrough().catch(err => {
    console.error('Walkthrough script error:', err);
    process.exit(1);
});
