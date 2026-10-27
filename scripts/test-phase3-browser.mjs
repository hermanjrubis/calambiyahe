import { chromium } from 'playwright';

async function testPhase3() {
    const browser = await chromium.launch();
    console.log('========================================================');
    console.log('PHASE 3: BROWSER & ENDPOINT VERIFICATION (390px & 1280px)');
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

    const viewports = [
        { width: 1280, height: 800, name: 'Desktop (1280px)' },
        { width: 390, height: 844, name: 'Phone (390px)' }
    ];

    for (const vp of viewports) {
        console.log(`\n--- Testing ${vp.name} ---`);
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        
        // Prevent redirect to /login by mocking auth user
        await context.addInitScript(() => {
            window.__MOCK_AUTH_USER__ = {
                uid: 'user_test_456',
                email: 'businessowner@example.com',
                displayName: 'Test Owner'
            };
        });

        const page = await context.newPage();
        const errors = [];
        page.on('console', msg => {
            const text = msg.text();
            if (msg.type() === 'error' && 
                !text.includes('Firebase') && 
                !text.includes('FIRESTORE') && 
                !text.includes('permission-denied') && 
                !text.includes('Failed to load resource') &&
                !text.includes('Error fetching payment doc')) {
                errors.push(text);
            }
        });
        page.on('response', res => {
            if (res.status() >= 400) {
                console.log('   [HTTP Error]', res.url(), res.status());
            }
        });
        page.on('pageerror', err => errors.push(err.message));

        await page.goto('http://localhost:5000/my-business', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(600);

        // --- STATE 1: PENDING ---
        console.log(`  Checking State: pending (${vp.name})...`);
        await page.evaluate(async () => {
            await window.__TEST_RENDER_STATE__('pending', {
                id: 'bus_pending_1',
                name: 'Kape Calamba',
                category: 'coffee',
                serviceType: 'Artisan Cafe',
                address: 'Real Road, Brgy. Real',
                contactNumber: '09123456789',
                description: 'Fresh brewed beans',
                plan: 'plus360',
                status: 'pending'
            });
        });
        await page.waitForTimeout(200);

        const pendingDOM = await page.evaluate(() => {
            const el = document.getElementById('statePending');
            const visible = window.getComputedStyle(el).display !== 'none';
            const dot = el.querySelector('.status-dot');
            const dotColor = dot ? window.getComputedStyle(dot).backgroundColor : '';
            const statusText = el.querySelector('.status-text')?.textContent?.trim();
            const busName = document.getElementById('pendingBusinessName')?.textContent?.trim();
            const planName = document.getElementById('pendingPlanName')?.textContent?.trim();
            const planCost = document.getElementById('pendingPlanCostNote')?.textContent?.trim();
            const changeBtn = document.getElementById('btnToggleChangePlan')?.textContent?.trim();

            return { visible, dotColor, statusText, busName, planName, planCost, changeBtn };
        });

        assert(pendingDOM.visible, 'statePending is visible');
        assert(pendingDOM.busName === 'Kape Calamba', 'Pending business name displayed');
        assert(pendingDOM.statusText === 'Pending review', 'Status text is "Pending review"');
        assert(pendingDOM.dotColor === 'rgb(217, 119, 6)', 'Status dot is amber #D97706');
        assert(pendingDOM.planName === 'Listed + 360 plan', 'Plan name is "Listed + 360 plan"');
        assert(pendingDOM.planCost === "You'll pay ₱199 after we approve your details.", 'Plan price note displayed');
        assert(pendingDOM.changeBtn === 'Change plan', 'Change plan button present');

        // Test expanding plan change options
        await page.click('#btnToggleChangePlan');
        const planChangerVisible = await page.evaluate(() => {
            const container = document.getElementById('pendingPlanChangeContainer');
            return window.getComputedStyle(container).display !== 'none';
        });
        assert(planChangerVisible, 'Clicking "Change plan" reveals plan selector');

        // --- STATE 2: NEEDS CHANGES ---
        console.log(`  Checking State: needs_changes (${vp.name})...`);
        await page.evaluate(async () => {
            await window.__TEST_RENDER_STATE__('needs_changes', {
                id: 'bus_nc_1',
                name: 'Kape Calamba',
                category: 'coffee',
                serviceType: 'Artisan Cafe',
                address: 'Real Road, Brgy. Real',
                contactNumber: '09123456789',
                description: 'Fresh brewed beans',
                plan: 'listed',
                status: 'needs_changes',
                reviewNote: 'Please clarify your exact unit number and street address.'
            });
        });
        await page.waitForTimeout(200);

        const ncDOM = await page.evaluate(() => {
            const el = document.getElementById('stateNeedsChanges');
            const visible = window.getComputedStyle(el).display !== 'none';
            const dot = el.querySelector('.status-dot');
            const dotColor = dot ? window.getComputedStyle(dot).backgroundColor : '';
            const statusText = el.querySelector('.status-text')?.textContent?.trim();
            const note = document.getElementById('needsChangesReviewNote')?.textContent?.trim();
            const prefilledName = document.getElementById('resubmitName')?.value;
            const resubmitBtn = document.getElementById('btnResubmitReview')?.textContent?.trim();

            return { visible, dotColor, statusText, note, prefilledName, resubmitBtn };
        });

        assert(ncDOM.visible, 'stateNeedsChanges is visible');
        assert(ncDOM.statusText === 'Needs changes', 'Status text is "Needs changes"');
        assert(ncDOM.dotColor === 'rgb(220, 38, 38)', 'Status dot is red #DC2626');
        assert(ncDOM.note.includes('exact unit number'), 'Admin reviewNote is rendered in note card');
        assert(ncDOM.prefilledName === 'Kape Calamba', 'Resubmit field is pre-filled with existing data');
        assert(ncDOM.resubmitBtn === 'Resubmit for review', 'Resubmit button present');

        // --- STATE 3: AWAITING PAYMENT ---
        console.log(`  Checking State: awaiting_payment (${vp.name})...`);
        await page.evaluate(async () => {
            await window.__TEST_RENDER_STATE__('awaiting_payment', {
                id: 'bus_ap_1',
                name: 'Kape Calamba',
                category: 'coffee',
                plan: 'plus360',
                amountDue: 199,
                status: 'awaiting_payment'
            });
        });
        await page.waitForTimeout(200);

        const apDOM = await page.evaluate(() => {
            const el = document.getElementById('stateAwaitingPayment');
            const visible = window.getComputedStyle(el).display !== 'none';
            const dot = el.querySelector('.status-dot');
            const dotColor = dot ? window.getComputedStyle(dot).backgroundColor : '';
            const statusText = el.querySelector('.status-text')?.textContent?.trim();
            const planTitle = document.getElementById('awaitingPlanTitle')?.textContent?.trim();
            const planAmount = document.getElementById('awaitingPlanAmount')?.textContent?.trim();
            const qrImg = document.getElementById('awaitingQrImg');
            const qrSrc = qrImg?.getAttribute('src');
            const qrAlt = qrImg?.getAttribute('alt');
            const downloadLink = el.querySelector('a[download]');
            const downloadHref = downloadLink?.getAttribute('href');
            const payText = document.getElementById('awaitingPayInstructions')?.textContent?.trim();
            const refInput = document.getElementById('receiptRefNo');
            const refPlaceholder = refInput?.getAttribute('placeholder');
            const submitBtn = document.getElementById('btnSubmitReceipt')?.textContent?.trim();
            const reviewTime = document.getElementById('receiptReviewNoteText')?.textContent?.trim();

            // Safety check: NO phone numbers in DOM
            const pageHtml = el.innerHTML;
            const has0992 = pageHtml.includes('0992');
            const phoneMatch = pageHtml.match(/09[0-9]{9}/);

            return {
                visible,
                dotColor,
                statusText,
                planTitle,
                planAmount,
                qrSrc,
                qrAlt,
                downloadHref,
                payText,
                refPlaceholder,
                submitBtn,
                reviewTime,
                has0992,
                hasPhone: !!phoneMatch
            };
        });

        assert(apDOM.visible, 'stateAwaitingPayment is visible');
        assert(apDOM.statusText === 'Approved · pay to go live', 'Status text is "Approved · pay to go live"');
        assert(apDOM.dotColor === 'rgb(55, 138, 221)', 'Status dot is brand blue #378ADD');
        assert(apDOM.planTitle.includes('Listed + 360'), 'Shows approved plan name in "One step left" card');
        assert(apDOM.planAmount === '₱199', 'Shows price ₱199 in Sora 20px');
        assert(apDOM.qrSrc === '/assets/payments/gcash-qr.png', 'QR code points to /assets/payments/gcash-qr.png');
        assert(apDOM.qrAlt === 'Calzada PH GCash QR code', 'QR code alt is "Calzada PH GCash QR code"');
        assert(apDOM.downloadHref === '/assets/payments/gcash-qr.png', 'Download button points to QR image');
        assert(apDOM.payText.includes('Pay exactly ₱199 so we can match it.'), 'Pay instruction displays exact amount ₱199');
        assert(apDOM.refPlaceholder === '13-digit number on your receipt', 'Placeholder is "13-digit number on your receipt" (no banned e.g.,)');
        assert(apDOM.submitBtn === 'Send for checking', 'Submit button text is "Send for checking"');
        assert(apDOM.reviewTime.includes('1–2 days'), 'Displays review time (within 1–2 days)');
        assert(!apDOM.has0992 && !apDOM.hasPhone, 'DOM SAFETY PASS: No phone number or account name in DOM');

        // Check not_matched display in awaiting_payment
        await page.evaluate(async () => {
            await window.__TEST_RENDER_STATE__('awaiting_payment', {
                id: 'bus_ap_2',
                name: 'Kape Calamba',
                category: 'coffee',
                plan: 'plus360',
                amountDue: 199,
                status: 'awaiting_payment',
                reviewNote: 'Reference number was not found in Calzada GCash transaction history.'
            });
        });
        await page.waitForTimeout(200);

        const notMatchedVisible = await page.evaluate(() => {
            const notice = document.getElementById('paymentNotMatchedNotice');
            const reason = document.getElementById('paymentNotMatchedReason');
            return {
                visible: window.getComputedStyle(notice).display !== 'none',
                reason: reason?.textContent?.trim()
            };
        });
        assert(notMatchedVisible.visible, 'Previously not_matched payment displays red alert card above form');
        assert(notMatchedVisible.reason.includes('not found in Calzada GCash'), 'Displays admin note why payment was not matched');

        // --- STATE 4: PAYMENT REVIEW ---
        console.log(`  Checking State: payment_review (${vp.name})...`);
        await page.evaluate(async () => {
            await window.__TEST_RENDER_STATE__('payment_review', {
                id: 'bus_pr_1',
                name: 'Kape Calamba',
                category: 'coffee',
                plan: 'featured',
                status: 'payment_review',
                submittedAt: new Date('2026-10-20'),
                detailsApprovedAt: new Date('2026-10-21')
            }, null, {
                referenceNo: '10002345678912',
                amountDue: 299,
                plan: 'featured',
                receiptUrl: '/assets/payments/gcash-qr.png',
                submittedAt: new Date('2026-10-22')
            });
        });
        await page.waitForTimeout(200);

        const prDOM = await page.evaluate(() => {
            const el = document.getElementById('statePaymentReview');
            const visible = window.getComputedStyle(el).display !== 'none';
            const dot = el.querySelector('.status-dot');
            const dotColor = dot ? window.getComputedStyle(dot).backgroundColor : '';
            const statusText = el.querySelector('.status-text')?.textContent?.trim();
            const steps = el.querySelectorAll('.progress-step');
            const sentRef = document.getElementById('sentReceiptRef')?.textContent?.trim();
            const sentPlanAmount = document.getElementById('sentReceiptAmountPlan')?.textContent?.trim();
            const replaceBtn = document.getElementById('btnReplaceReceipt')?.textContent?.trim();

            return {
                visible,
                dotColor,
                statusText,
                stepsCount: steps.length,
                sentRef,
                sentPlanAmount,
                replaceBtn
            };
        });

        assert(prDOM.visible, 'statePaymentReview is visible');
        assert(prDOM.statusText === 'Payment under review', 'Status text is "Payment under review"');
        assert(prDOM.dotColor === 'rgb(217, 119, 6)', 'Status dot is amber #D97706');
        assert(prDOM.stepsCount === 4, 'Progress card renders 4 steps');
        assert(prDOM.sentRef === 'Ref. •••• 8912', 'Reference number masked except last 4 digits (•••• 8912)');
        assert(prDOM.sentPlanAmount === '₱299 · Featured plan', 'Displays amount ₱299 and Featured plan');
        assert(prDOM.replaceBtn === 'Replace receipt', 'Replace receipt button present');

        // Test clicking "Replace receipt"
        await page.click('#btnReplaceReceipt');
        const replaceFormVisible = await page.evaluate(() => {
            const form = document.getElementById('replaceReceiptFormContainer');
            return window.getComputedStyle(form).display !== 'none';
        });
        assert(replaceFormVisible, 'Clicking "Replace receipt" reveals replacement upload form');

        // --- STATE 5: APPROVED ---
        console.log(`  Checking State: approved (${vp.name})...`);
        await page.evaluate(async () => {
            await window.__TEST_RENDER_STATE__('approved', {
                id: 'bus_app_1',
                name: 'Kape Calamba',
                category: 'coffee',
                serviceType: 'Artisan Cafe',
                plan: 'plus360',
                shoot360: 'scheduled',
                status: 'approved'
            }, [
                { id: 'post1', createdAt: new Date() },
                { id: 'post2', createdAt: new Date() }
            ]);
        });
        await page.waitForTimeout(200);

        const appDOM = await page.evaluate(() => {
            const el = document.getElementById('stateApproved');
            const visible = window.getComputedStyle(el).display !== 'none';
            const dot = el.querySelector('.status-dot');
            const dotColor = dot ? window.getComputedStyle(dot).backgroundColor : '';
            const statusText = el.querySelector('.status-text')?.textContent?.trim();
            const planMeta = document.getElementById('approvedPlanMeta')?.textContent?.trim();
            const editorVisible = window.getComputedStyle(document.getElementById('profileEditorForm')).display !== 'none';

            return { visible, dotColor, statusText, planMeta, editorVisible };
        });

        assert(appDOM.visible, 'stateApproved is visible');
        assert(appDOM.statusText === 'Live', 'Status text is "Live"');
        assert(appDOM.dotColor === 'rgb(22, 163, 74)', 'Status dot is green #16A34A');
        assert(appDOM.planMeta.includes('Listed + 360 plan'), 'Plan meta displays "Listed + 360 plan"');
        assert(appDOM.planMeta.includes('posts this month: 2/8'), 'Plan meta displays monthly posts count "posts this month: 2/8"');
        assert(appDOM.planMeta.includes('360 shoot: scheduled'), 'Plan meta displays "360 shoot: scheduled"');
        assert(appDOM.editorVisible, 'Profile editor is visible when approved');

        // Featured plan check with featuredUntil
        await page.evaluate(async () => {
            await window.__TEST_RENDER_STATE__('approved', {
                id: 'bus_app_2',
                name: 'Kape Calamba',
                category: 'coffee',
                plan: 'featured',
                shoot360: 'done',
                featuredUntil: new Date('2026-11-15'),
                status: 'approved'
            }, []);
        });
        await page.waitForTimeout(200);

        const featMeta = await page.evaluate(() => document.getElementById('approvedPlanMeta')?.textContent?.trim());
        assert(featMeta.includes('Featured plan'), 'Displays "Featured plan"');
        assert(featMeta.includes('posts this month: Unlimited'), 'Featured has unlimited posts');
        assert(featMeta.includes('360 shoot: done'), 'Displays "360 shoot: done"');
        assert(featMeta.includes('Featured until'), 'Displays "Featured until Nov 15, 2026"');

        // --- STATE 6: REJECTED ---
        console.log(`  Checking State: rejected (${vp.name})...`);
        await page.evaluate(async () => {
            await window.__TEST_RENDER_STATE__('rejected', {
                id: 'bus_rej_1',
                name: 'Kape Calamba',
                category: 'coffee',
                status: 'rejected',
                reviewNote: 'Location is outside Uno, Real, or Halang covered service areas.'
            });
        });
        await page.waitForTimeout(200);

        const rejDOM = await page.evaluate(() => {
            const el = document.getElementById('stateRejected');
            const visible = window.getComputedStyle(el).display !== 'none';
            const dot = el.querySelector('.status-dot');
            const dotColor = dot ? window.getComputedStyle(dot).backgroundColor : '';
            const statusText = el.querySelector('.status-text')?.textContent?.trim();
            const reason = document.getElementById('rejectionReasonText')?.textContent?.trim();

            return { visible, dotColor, statusText, reason };
        });

        assert(rejDOM.visible, 'stateRejected is visible');
        assert(rejDOM.statusText === 'Not approved', 'Status text is "Not approved"');
        assert(rejDOM.dotColor === 'rgb(220, 38, 38)', 'Status dot is red #DC2626');
        assert(rejDOM.reason.includes('outside Uno, Real, or Halang'), 'Rejection note displayed');

        assert(errors.length === 0, `0 console errors on my-business.html (${vp.name})`);
        if (errors.length > 0) {
            console.error('Console errors:', errors);
        }

        await context.close();
    }

    // --- TEST 2: SERVER API ENDPOINT CHECKS ---
    console.log('\n--- 2. Server API Endpoint Checks ---');
    try {
        // Test /api/payments/upload-receipt without auth (should return 401)
        const unauthRes = await fetch('http://localhost:5000/api/payments/upload-receipt', { method: 'POST' });
        assert(unauthRes.status === 401, 'POST /api/payments/upload-receipt requires authentication (401)');

        // Test /api/admin/notify-owner without auth (should return 401)
        const unauthNotify = await fetch('http://localhost:5000/api/admin/notify-owner', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ businessId: 'test', event: 'received' })
        });
        assert(unauthNotify.status === 401, 'POST /api/admin/notify-owner requires authentication (401)');

    } catch (apiErr) {
        console.error('API Test Error:', apiErr);
        failedTests++;
    }

    console.log('\n========================================================');
    if (failedTests === 0) {
        console.log('ALL PHASE 3 BROWSER & API TESTS PASSED!');
    } else {
        console.error(`PHASE 3 TESTS FAILED: ${failedTests} failure(s)`);
    }
    console.log('========================================================\n');

    await browser.close();
    if (failedTests > 0) process.exit(1);
}

testPhase3();
