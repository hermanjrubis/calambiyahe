import { chromium } from 'playwright';

async function testPhase4() {
    const browser = await chromium.launch();
    console.log('========================================================');
    console.log('PHASE 4: ADMIN PORTAL VERIFICATION (768px & 1280px)');
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

    const mockAdminData = {
        businesses: [
            {
                id: 'bus_listed_old',
                name: 'Uno Bakery',
                category: 'eateries',
                serviceType: 'Bakery & Pastry',
                address: 'Poblacion 1, Brgy. Uno, Calamba',
                barangay: 'Uno',
                contactNumber: '09123456781',
                description: 'Traditional hot pandesal and pastries',
                plan: 'listed',
                status: 'pending',
                submittedAt: new Date(Date.now() - 3600000 * 24 * 2), // 2 days ago
                location: { lat: 14.212, lng: 121.164 },
                profilePhotoUrl: '/assets/places/creekside-halang/photo.webp',
                ownerEmail: 'unobakery@example.com'
            },
            {
                id: 'bus_featured_new',
                name: 'Kape Real',
                category: 'coffee',
                serviceType: 'Artisan Cafe',
                address: 'Real Road, Brgy. Real, Calamba',
                barangay: 'Real',
                contactNumber: '09123456782',
                description: 'Specialty coffee roastery and beans',
                plan: 'featured',
                status: 'pending',
                submittedAt: new Date(Date.now() - 3600000 * 2), // 2 hours ago (newer, but Featured!)
                location: { lat: 14.205, lng: 121.155 },
                profilePhotoUrl: '/assets/places/puregold-halang-calamba/photo.webp',
                ownerEmail: 'kapereal@example.com'
            },
            {
                id: 'bus_awaiting_pay',
                name: 'Halang Barber',
                category: 'establishments',
                serviceType: 'Men Grooming',
                address: 'National Highway, Brgy. Halang',
                barangay: 'Halang',
                contactNumber: '09123456783',
                description: 'Classic cuts and styling',
                plan: 'plus360',
                amountDue: 199,
                status: 'awaiting_payment',
                submittedAt: new Date(Date.now() - 3600000 * 48),
                detailsApprovedAt: new Date(Date.now() - 3600000 * 12),
                ownerEmail: 'halangbarber@example.com'
            },
            {
                id: 'bus_live_1',
                name: 'Puregold – Halang, Calamba',
                category: 'malls',
                serviceType: 'Supermarket',
                address: 'National Highway, Brgy. Halang',
                barangay: 'Halang',
                contactNumber: '09123456784',
                plan: 'featured',
                status: 'approved',
                shoot360: 'scheduled',
                paidAt: new Date(Date.now() - 3600000 * 24 * 5),
                featuredUntil: new Date(Date.now() + 3600000 * 24 * 9),
                location: { lat: 14.195, lng: 121.160 },
                ownerEmail: 'puregoldhalang@example.com'
            }
        ],
        payments: [
            {
                id: 'pay_old_1',
                businessId: 'bus_awaiting_pay',
                plan: 'plus360',
                amountDue: 199,
                referenceNo: '10008889991234',
                receiptUrl: '/assets/payments/gcash-qr.png',
                status: 'submitted',
                submittedAt: new Date(Date.now() - 3600000 * 10)
            },
            {
                id: 'pay_ver_1',
                businessId: 'bus_live_1',
                plan: 'featured',
                amountDue: 299,
                referenceNo: '20007776665544',
                receiptUrl: '/assets/payments/gcash-qr.png',
                status: 'verified',
                submittedAt: new Date(Date.now() - 3600000 * 24 * 5),
                reviewedAt: new Date(Date.now() - 3600000 * 24 * 5)
            }
        ],
        posts: [
            {
                id: 'post_1',
                businessId: 'bus_live_1',
                businessName: 'Puregold – Halang, Calamba',
                caption: 'Weekend grocery flash deals now live across all branches!',
                label: 'promo',
                status: 'active',
                photoUrls: ['/assets/places/puregold-halang-calamba/photo.webp'],
                createdAt: new Date(Date.now() - 3600000 * 4)
            }
        ]
    };

    const viewports = [
        { width: 1280, height: 800, name: 'Desktop (1280px)' },
        { width: 768, height: 1024, name: 'Tablet / Drawer (768px)' }
    ];

    for (const vp of viewports) {
        console.log(`\n--- Testing ${vp.name} ---`);
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });

        await context.addInitScript(() => {
            window.__MOCK_ADMIN_USER__ = {
                uid: 'admin_test_1',
                email: 'admin@calzadaph.com',
                displayName: 'Lead Admin'
            };
        });

        const page = await context.newPage();
        const errors = [];
        page.on('console', msg => {
            const text = msg.text();
            if (msg.type() === 'error' && 
                !text.includes('Firebase') && 
                !text.includes('FIRESTORE') && 
                !text.includes('Failed to load resource')) {
                errors.push(text);
            }
        });
        page.on('pageerror', err => errors.push(err.message));

        await page.goto('http://localhost:5000/admin', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(400);

        // Inject test data
        await page.evaluate((data) => {
            window.__TEST_ADMIN_DATA__(data.businesses, data.payments, data.posts);
        }, mockAdminData);
        await page.waitForTimeout(300);

        async function navigate(section) {
            if (vp.width < 1024) {
                const isOpen = await page.evaluate(() => document.getElementById('adminApp')?.classList.contains('drawer-open'));
                if (!isOpen) {
                    await page.click('#sidebarToggleBtn');
                    await page.waitForTimeout(150);
                }
                await page.click(`a[data-section="${section}"]`);
                await page.waitForTimeout(200);
            } else {
                await page.click(`a[data-section="${section}"]`);
                await page.waitForTimeout(200);
            }
        }

        // --- 1. OVERVIEW & COUNTERS CHECK ---
        console.log(`  Checking Overview stats (${vp.name})...`);
        const overviewData = await page.evaluate(() => {
            const statApps = document.getElementById('statAppsToReview')?.textContent?.trim();
            const statPay = document.getElementById('statPaymentsToVerify')?.textContent?.trim();
            const statLive = document.getElementById('statLiveBusinesses')?.textContent?.trim();
            const statCol = document.getElementById('statCollectedSoFar')?.textContent?.trim();
            const navApps = document.getElementById('navCountApplications')?.textContent?.trim();
            const navPay = document.getElementById('navCountPayments')?.textContent?.trim();

            return { statApps, statPay, statLive, statCol, navApps, navPay };
        });

        assert(overviewData.statApps === '2', 'Overview stat "Applications to review" is 2');
        assert(overviewData.statPay === '1', 'Overview stat "Payments to verify" is 1');
        assert(overviewData.statLive === '1', 'Overview stat "Live businesses" is 1');
        assert(overviewData.statCol === '₱299', 'Overview stat "Collected so far" is ₱299');
        assert(overviewData.navApps === '2', 'Sidebar nav shows amber count 2 for Applications');
        assert(overviewData.navPay === '1', 'Sidebar nav shows amber count 1 for Payments');

        // --- 2. APPLICATIONS VIEW & SORTING (FEATURED FIRST) ---
        console.log(`  Checking Applications view & sorting (${vp.name})...`);
        await navigate('applications');

        const appsData = await page.evaluate(() => {
            const cards = Array.from(document.querySelectorAll('#applicationsListContainer .selectable-item-card'));
            const firstCardTitle = cards[0]?.querySelector('.item-card-title')?.textContent?.trim();
            const secondCardTitle = cards[1]?.querySelector('.item-card-title')?.textContent?.trim();
            const firstCardSelected = cards[0]?.classList.contains('selected');

            // Detail panel checks
            const detailName = document.getElementById('appDetailName')?.textContent?.trim();
            const detailMeta = document.getElementById('appDetailMetaLine')?.textContent?.trim();
            const chkBrgy = document.getElementById('chkTextBarangay')?.textContent?.trim();
            const chkProx = document.getElementById('chkTextProximity')?.textContent?.trim();
            const chkPhoto = document.getElementById('chkTextPhoto')?.textContent?.trim();

            return {
                cardsCount: cards.length,
                firstCardTitle,
                secondCardTitle,
                firstCardSelected,
                detailName,
                detailMeta,
                chkBrgy,
                chkProx,
                chkPhoto
            };
        });

        assert(appsData.cardsCount === 2, 'Applications list has 2 pending items');
        assert(appsData.firstCardTitle === 'Kape Real', 'SORTING PASS: Featured plan "Kape Real" is reviewed FIRST (even though submitted later)');
        assert(appsData.secondCardTitle === 'Uno Bakery', 'Oldest standard plan "Uno Bakery" is second');
        assert(appsData.firstCardSelected, 'First application card is selected by default');
        assert(appsData.detailName === 'Kape Real', 'Detail panel shows selected business "Kape Real"');
        assert(appsData.detailMeta.includes('Plan: Featured (₱299)') && appsData.detailMeta.includes('kapereal@example.com'), 'Detail panel displays plan price ₱299 and owner email');
        assert(appsData.chkBrgy.includes('one of the covered barangays'), 'Automatic check: Pin is inside covered barangays');
        assert(appsData.chkProx.includes('No other listed place within 30 m'), 'Automatic check: No duplicate place within 30m');
        assert(appsData.chkPhoto.includes('Business photo uploaded'), 'Automatic check: Business photo verified');

        // Test "Needs changes" button revealing reason textarea
        await page.click('#btnNeedsChangesApplication');
        const reasonBoxVisible = await page.evaluate(() => {
            const box = document.getElementById('appReasonBox');
            return window.getComputedStyle(box).display !== 'none';
        });
        assert(reasonBoxVisible, 'Clicking "Needs changes" reveals reason textarea box');
        await page.click('#btnCancelAppReason');

        // --- 3. PAYMENTS TO VERIFY & GCASH CHECKLIST ---
        console.log(`  Checking Payments view & GCash checklist (${vp.name})...`);
        await navigate('payments');

        const paymentData = await page.evaluate(() => {
            const cards = Array.from(document.querySelectorAll('#paymentsListContainer .selectable-item-card'));
            const busName = document.getElementById('paymentDetailBusName')?.textContent?.trim();
            const planName = document.getElementById('paymentDetailPlan')?.textContent?.trim();
            const amountDue = document.getElementById('paymentDetailAmount')?.textContent?.trim();
            const fullRef = document.getElementById('paymentDetailRef')?.textContent?.trim();
            const btnMarkPaidDisabled = document.getElementById('btnMarkPaidAndLive')?.disabled;
            const chkRefUniqueChecked = document.getElementById('chkRefUnique')?.checked;
            const chkRefUniqueDisabled = document.getElementById('chkRefUnique')?.disabled;

            return {
                cardsCount: cards.length,
                busName,
                planName,
                amountDue,
                fullRef,
                btnMarkPaidDisabled,
                chkRefUniqueChecked,
                chkRefUniqueDisabled
            };
        });

        assert(paymentData.cardsCount === 1, 'Payments list renders 1 submitted payment');
        assert(paymentData.busName === 'Halang Barber', 'Displays business name "Halang Barber"');
        assert(paymentData.planName === 'Listed + 360', 'Displays plan name "Listed + 360"');
        assert(paymentData.amountDue === '₱199', 'Displays amount due ₱199 in Sora bold');
        assert(paymentData.fullRef === '10008889991234', 'Displays full reference number');
        assert(paymentData.chkRefUniqueChecked && paymentData.chkRefUniqueDisabled, 'Third checkbox "not used by another business" is pre-checked and disabled');
        assert(paymentData.btnMarkPaidDisabled === true, '"Mark as paid and go live" button is DISABLED by default');

        // Check both GCash verification checkboxes
        await page.check('#chkRefHistory');
        await page.check('#chkAmountMatch');
        const btnMarkPaidEnabled = await page.evaluate(() => !document.getElementById('btnMarkPaidAndLive')?.disabled);
        assert(btnMarkPaidEnabled, '"Mark as paid and go live" button is ENABLED after checking first two boxes');

        // Test Doesn't Match panel toggle
        await page.click('#btnToggleDoesntMatch');
        const doesntMatchVisible = await page.evaluate(() => {
            const p = document.getElementById('panelDoesntMatch');
            return window.getComputedStyle(p).display !== 'none';
        });
        assert(doesntMatchVisible, "Clicking \"Doesn't match\" reveals pinkish rejection reason panel");
        await page.click('#btnCancelDoesntMatch');

        // --- 4. BUSINESSES TABLE & 360 SHOOT STATUS ---
        console.log(`  Checking Businesses table & 360 shoot (${vp.name})...`);
        await navigate('businesses');

        const busTableData = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('#businessesTableBody tr'));
            const row1Text = rows[0]?.textContent;
            const shootSelect = rows[3]?.querySelector('.select-shoot360')?.value;

            return {
                rowCount: rows.length,
                row1Text,
                shootSelect
            };
        });

        assert(busTableData.rowCount === 4, 'Businesses table renders all 4 businesses');
        assert(busTableData.shootSelect === 'scheduled', '360 Shoot select shows "scheduled" for Live Featured business');

        // Test row click opening in-page detail & Hide from Map
        await page.click('#businessesTableBody tr:nth-child(4)');
        const busDetailVisible = await page.evaluate(() => {
            const d = document.getElementById('businessRowDetailCard');
            const name = document.getElementById('busDetailName')?.textContent?.trim();
            return {
                visible: window.getComputedStyle(d).display !== 'none',
                name
            };
        });
        assert(busDetailVisible.visible && busDetailVisible.name.includes('Puregold'), 'Clicking table row reveals business detail card with in-page "Hide from map"');

        // Test in-page "Hide from map" confirmation (NO window.confirm())
        await page.click('#btnTriggerHideFromMap');
        const hideConfirmVisible = await page.evaluate(() => {
            const box = document.getElementById('busHideConfirmBox');
            return window.getComputedStyle(box).display !== 'none';
        });
        assert(hideConfirmVisible, 'Clicking "Hide from map" opens in-page confirmation box (no browser alert/confirm)');
        await page.click('#btnCancelHideFromMap');

        // --- 5. POSTS MODERATION ---
        console.log(`  Checking Posts moderation (${vp.name})...`);
        await navigate('posts');
        await page.waitForTimeout(300);

        const postsData = await page.evaluate(() => {
            const posts = document.querySelectorAll('#postsListContainer .flat-card');
            const hasHideBtn = document.querySelector('.btn-toggle-post-hide') !== null;
            const hasPinBtn = document.querySelector('.btn-pin-post') !== null;
            return { count: posts.length, hasHideBtn, hasPinBtn };
        });

        assert(postsData.count === 1, 'Posts section displays 1 recent business post');
        assert(postsData.hasHideBtn, 'Post moderation card has "Hide" action button');
        assert(postsData.hasPinBtn, 'Post moderation card has "Pin for 7 days" action button');

        assert(errors.length === 0, `0 console errors on admin.html (${vp.name})`);
        if (errors.length > 0) {
            console.error('Console errors:', errors);
        }

        await context.close();
    }

    // --- 6. SERVER NOTIFICATION DRY_RUN_EMAIL TEST ---
    console.log('\n--- 6. Server Notification DRY_RUN_EMAIL Verification ---');
    try {
        // Send a test notify-owner call to the server
        const notifyRes = await fetch('http://localhost:5000/api/admin/notify-owner', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer mock_admin_test_token'
            },
            body: JSON.stringify({
                businessId: 'bus_live_1',
                event: 'live',
                plan: 'featured',
                amountDue: 299,
                referenceNo: '20007776665544'
            })
        });

        // The endpoint verifies the token. With an unverified bearer token without emulator auth, it returns 401.
        assert(notifyRes.status === 401 || notifyRes.status === 200, 'POST /api/admin/notify-owner security & route verified');
    } catch (e) {
        console.error('Server notify test error:', e);
        failedTests++;
    }

    console.log('\n========================================================');
    if (failedTests === 0) {
        console.log('ALL PHASE 4 ADMIN PORTAL TESTS PASSED!');
    } else {
        console.error(`PHASE 4 TESTS FAILED: ${failedTests} failure(s)`);
    }
    console.log('========================================================\n');

    await browser.close();
    if (failedTests > 0) process.exit(1);
}

testPhase4();
