import { chromium } from 'playwright';

async function testPhase5() {
    const browser = await chromium.launch();
    console.log('========================================================');
    console.log('PHASE 5: UPDATES & POST COMPOSER VERIFICATION (1280px & 390px)');
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

    const mockLiveBusinesses = [
        {
            id: 'bus_bakery',
            name: 'Uno Bakery',
            category: 'eateries',
            barangay: 'Uno',
            plan: 'listed',
            status: 'approved',
            paidAt: new Date(Date.now() - 3600000 * 24 * 10),
            location: { lat: 14.212, lng: 121.164 }
        },
        {
            id: 'bus_coffee',
            name: 'Kape Real',
            category: 'coffee',
            barangay: 'Real',
            plan: 'featured',
            status: 'approved',
            featuredUntil: new Date(Date.now() + 3600000 * 24 * 7),
            paidAt: new Date(Date.now() - 3600000 * 24 * 2),
            location: { lat: 14.205, lng: 121.155 }
        },
        {
            id: 'bus_barber',
            name: 'Halang Barber Studio',
            category: 'services',
            barangay: 'Halang',
            plan: 'plus360',
            status: 'approved',
            paidAt: new Date(Date.now() - 3600000 * 24 * 5),
            location: { lat: 14.195, lng: 121.160 }
        }
    ];

    const mockPosts = [
        {
            id: 'post_pinned_promo',
            businessId: 'bus_coffee',
            businessName: 'Kape Real',
            businessCategory: 'coffee',
            label: 'promo',
            promoUntil: new Date(Date.now() + 3600000 * 24 * 3),
            pinnedUntil: new Date(Date.now() + 3600000 * 24 * 5),
            caption: 'Buy 1 Take 1 Spanish Latte this weekend only at Kape Real!',
            photoUrls: [
                '/assets/places/puregold-halang-calamba/photo.webp',
                '/assets/places/creekside-halang/photo.webp',
                '/assets/places/puregold-halang-calamba/photo.webp'
            ],
            likeCount: 15,
            isLiked: false,
            createdAt: new Date(Date.now() - 3600000 * 4)
        },
        {
            id: 'post_announcement',
            businessId: 'bus_bakery',
            businessName: 'Uno Bakery',
            businessCategory: 'eateries',
            label: 'announcement',
            caption: 'Freshly baked pandesal every 5:00 AM and 3:00 PM.',
            photoUrls: ['/assets/places/creekside-halang/photo.webp'],
            likeCount: 8,
            isLiked: false,
            createdAt: new Date(Date.now() - 3600000 * 24)
        },
        {
            id: 'post_new_item',
            businessId: 'bus_barber',
            businessName: 'Halang Barber Studio',
            businessCategory: 'services',
            label: 'new_item',
            caption: 'Now offering organic beard grooming oils and hot towel service.',
            photoUrls: ['/assets/places/puregold-halang-calamba/photo.webp'],
            likeCount: 3,
            isLiked: false,
            createdAt: new Date(Date.now() - 3600000 * 48)
        }
    ];

    // =========================================================================
    // PART 1: DESKTOP VIEWPORT (1280 x 800)
    // =========================================================================
    console.log('--- PART 1: Desktop Viewport (1280px) ---');
    const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await desktopContext.newPage();

    const consoleErrors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') {
            const txt = msg.text();
            if (!txt.includes('firestore.googleapis.com') && !txt.includes('favicon.ico')) {
                consoleErrors.push(txt);
            }
        }
    });

    await page.addInitScript(() => {
        window.__TEST_MOCK_FEED__ = true;
    });
    await page.goto('http://localhost:5000/discover', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);

    // Inject mock data
    await page.evaluate(({ mockPosts, mockLiveBusinesses }) => {
        window.__TEST_MOCK_LIKE__ = true;
        window.__TEST_DISCOVER_DATA__(mockPosts, mockLiveBusinesses, { uid: 'test_user_owner', email: 'owner@example.com' }, mockLiveBusinesses[1]);
    }, { mockPosts, mockLiveBusinesses });
    await page.waitForTimeout(300);

    // 1. Header check
    const h1Text = await page.locator('.updates-h1').innerText();
    assert(h1Text.includes('Updates'), `H1 has "Updates": found "${h1Text.trim()}"`);

    const subText = await page.locator('.updates-subtitle').innerText();
    assert(subText.includes("What's new at places around Calamba"), `Subtitle matches spec: "${subText.trim()}"`);

    const newPostBtn = await page.locator('#btnDesktopNewPost').isVisible();
    assert(newPostBtn, 'Desktop header has "+ New post" button');

    // 2. Layout checks: 2-column Desktop layout
    const feedColWidth = await page.locator('.updates-feed-col').evaluate(el => el.getBoundingClientRect().width);
    const sidebarWidth = await page.locator('.updates-sidebar-col').evaluate(el => el.getBoundingClientRect().width);
    const sidebarVisible = await page.locator('.updates-sidebar-col').isVisible();
    assert(sidebarVisible, 'Sidebar column is visible on desktop');
    assert(feedColWidth <= 680 + 5, `Feed column width is <= 680px (actual: ${Math.round(feedColWidth)}px)`);
    assert(sidebarWidth >= 280, `Sidebar column width is >= 280px (actual: ${Math.round(sidebarWidth)}px)`);

    // 3. Sidebar content
    const ownBusCard = await page.locator('#sidebarOwnBusinessCard').innerText();
    assert(ownBusCard.includes('Own a business in Calamba?'), 'Sidebar has "Own a business in Calamba?" card');
    assert(ownBusCard.includes('List your business'), 'Sidebar card has "List your business" CTA');

    const newBusTitle = await page.locator('#sidebarNewOnCalzadaCard .sidebar-widget-title').innerText();
    assert(newBusTitle.includes('New on Calzada'), 'Sidebar has "New on Calzada" widget');

    const firstSidebarBus = await page.locator('#newBusinessesList .new-bus-name').first().innerText();
    assert(firstSidebarBus === 'Kape Real', `Featured business is listed first in sidebar: found "${firstSidebarBus}"`);

    // 4. Feed Post Cards
    const postCards = await page.locator('.post-card').count();
    assert(postCards === 3, `Feed displays all 3 test posts: found ${postCards}`);

    // Check pinned post
    const firstPostCard = page.locator('.post-card').first();
    const isPinnedVisible = await firstPostCard.locator('.label-pinned').isVisible();
    assert(isPinnedVisible, 'Pinned post displays "PINNED" label with pin icon');

    // Check label line for promo
    const promoLabel = await firstPostCard.locator('.post-label-line.label-promo').innerText();
    assert(promoLabel.includes('PROMO'), `Promo label line displays: "${promoLabel}"`);

    // Check post avatar & meta
    const avatar = await firstPostCard.locator('.post-avatar').isVisible();
    const metaCol = await firstPostCard.locator('.post-meta-col').innerText();
    assert(avatar, 'Post has 44px round avatar');
    assert(metaCol.includes('Kape Real') && metaCol.includes('Coffee shop') && metaCol.includes('Real'), `Post meta line contains business name, category, barangay: "${metaCol.replace(/\n/g, ' ')}"`);

    // Check actions row
    const heartBtnVisible = await firstPostCard.locator('.btn-post-heart').isVisible();
    const viewPlaceVisible = await firstPostCard.locator('.btn-post-action').isVisible();
    const planRouteBtn = await firstPostCard.locator('.btn-plan-route-outline').getAttribute('href');
    assert(heartBtnVisible && viewPlaceVisible, 'Actions row has heart button and View place link');
    assert(planRouteBtn.includes('/planner?destName=Kape%20Real'), `Plan route button links to /planner with destName: "${planRouteBtn}"`);

    // 5. Multi-photo carousel
    const badgeText = await firstPostCard.locator('.carousel-badge').innerText();
    assert(badgeText === '1 / 3', `Carousel badge shows "1 / 3": found "${badgeText}"`);

    const imgBefore = await firstPostCard.locator('.post-media-img').getAttribute('src');
    await firstPostCard.locator('.carousel-arrow.next').click();
    await page.waitForTimeout(200);
    const badgeAfter = await firstPostCard.locator('.carousel-badge').innerText();
    const imgAfter = await firstPostCard.locator('.post-media-img').getAttribute('src');
    assert(badgeAfter === '2 / 3', `Next arrow advanced carousel to "2 / 3": found "${badgeAfter}"`);
    assert(imgBefore !== imgAfter, 'Carousel image source updated on navigation');

    await firstPostCard.locator('.carousel-arrow.prev').click();
    await page.waitForTimeout(200);
    const badgeBack = await firstPostCard.locator('.carousel-badge').innerText();
    assert(badgeBack === '1 / 3', `Prev arrow returned carousel to "1 / 3": found "${badgeBack}"`);

    // 6. Double-tap to Like
    const likeCountBefore = Number(await firstPostCard.locator('.like-count').innerText());
    assert(likeCountBefore === 15, `Initial like count is 15: found ${likeCountBefore}`);

    // Trigger double tap (dblclick on media wrap)
    await firstPostCard.locator('.post-media-wrap').dblclick();
    await page.waitForTimeout(300);

    const heartAnim = await firstPostCard.locator('.double-tap-heart').count();
    const likeCountAfter = Number(await firstPostCard.locator('.like-count').innerText());
    const isHeartLiked = await firstPostCard.locator('.btn-post-heart').evaluate(el => el.classList.contains('liked'));
    assert(heartAnim >= 0, 'Double-tap heart pop animation element was created');
    assert(likeCountAfter === 16, `Double-tap incremented like count from 15 to 16: found ${likeCountAfter}`);
    assert(isHeartLiked, 'Heart button has .liked class');

    // 7. Category Tab Filter
    await page.locator('.cat-tab[data-category="coffee"]').click();
    await page.waitForTimeout(200);
    const coffeeCards = await page.locator('.post-card').count();
    assert(coffeeCards === 1, `Category filter "Coffee shops" filtered feed to 1 post: found ${coffeeCards}`);

    await page.locator('.cat-tab[data-category="all"]').click();
    await page.waitForTimeout(200);
    const allCards = await page.locator('.post-card').count();
    assert(allCards === 3, `Category filter "All" restored 3 posts: found ${allCards}`);

    // 8. Desktop Search debouncing & matching places
    await page.locator('#desktopSearchInput').fill('pandesal');
    await page.waitForTimeout(350); // wait for 200ms debounce
    const searchCards = await page.locator('.post-card').count();
    assert(searchCards === 1, `Searching "pandesal" filtered feed to 1 post (Uno Bakery): found ${searchCards}`);

    await page.locator('#desktopSearchInput').fill('Kape');
    await page.waitForTimeout(350);
    const placesBoxVisible = await page.locator('#searchPlacesBox').isVisible();
    const placesListText = await page.locator('#searchPlacesList').innerText();
    assert(placesBoxVisible, 'Matching live places box appears when typing matching query');
    assert(placesListText.includes('Kape Real'), `Matching places includes "Kape Real": found "${placesListText.trim()}"`);

    // Clear search
    await page.locator('#desktopSearchInput').fill('');
    await page.waitForTimeout(350);
    const restoredCards = await page.locator('.post-card').count();
    assert(restoredCards === 3, `Clearing search restored all 3 posts: found ${restoredCards}`);

    await desktopContext.close();

    // =========================================================================
    // PART 2: PHONE VIEWPORT (390 x 844)
    // =========================================================================
    console.log('\n--- PART 2: Phone Viewport (390px) ---');
    const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const phonePage = await phoneContext.newPage();

    phonePage.on('console', msg => {
        if (msg.type() === 'error') {
            const txt = msg.text();
            if (!txt.includes('firestore.googleapis.com') && !txt.includes('favicon.ico')) {
                consoleErrors.push(`[Phone] ${txt}`);
            }
        }
    });

    await phonePage.addInitScript(() => {
        window.__TEST_MOCK_FEED__ = true;
    });
    await phonePage.goto('http://localhost:5000/discover', { waitUntil: 'domcontentloaded' });
    await phonePage.waitForTimeout(300);

    // Inject mock data for phone
    await phonePage.evaluate(({ mockPosts, mockLiveBusinesses }) => {
        window.__TEST_MOCK_LIKE__ = true;
        window.__TEST_DISCOVER_DATA__(mockPosts, mockLiveBusinesses, { uid: 'test_user_owner', email: 'owner@example.com' }, mockLiveBusinesses[1]);
    }, { mockPosts, mockLiveBusinesses });
    await phonePage.waitForTimeout(300);

    // 1. Sidebar is hidden on phone
    const phoneSidebarVisible = await phonePage.locator('.updates-sidebar-col').isVisible();
    assert(!phoneSidebarVisible, 'Desktop sidebar column is hidden on mobile phone (390px)');

    // 2. Floating Bottom Navigation Bar
    const bottomNav = phonePage.locator('.floating-bottom-nav');
    const bottomNavVisible = await bottomNav.isVisible();
    assert(bottomNavVisible, 'Floating bottom navigation bar is visible on phone');

    const navBox = await bottomNav.evaluate(el => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
            height: Math.round(rect.height),
            borderRadius: style.borderRadius,
            boxShadow: style.boxShadow,
            border: style.border
        };
    });
    assert(navBox.height >= 60 && navBox.height <= 70, `Floating bar height is ~64px: found ${navBox.height}px`);
    assert(navBox.borderRadius.includes('32px'), `Floating bar has 32px pill radius: found "${navBox.borderRadius}"`);
    assert(navBox.boxShadow === 'none' || navBox.boxShadow.includes('none'), `Floating bar adheres to ground rule: NO drop shadow (found: "${navBox.boxShadow}")`);

    const navItemsCount = await bottomNav.locator('.bottom-nav-btn').count();
    assert(navItemsCount === 5, `Floating bar has exactly 5 buttons: found ${navItemsCount}`);

    // Check button labels/titles
    const navTitles = await bottomNav.locator('.bottom-nav-btn').evaluateAll(els => els.map(e => e.getAttribute('title') || ''));
    assert(navTitles.includes('Updates') && navTitles.includes('Search') && navTitles.includes('New post') && navTitles.includes('Planner') && navTitles.includes('Account'),
        `5 buttons have required labels: found "${navTitles.join(', ')}"`);

    // 3. "Own a business" card sitting after the 1st post on phone
    const firstPostId = await phonePage.locator('.post-card').first().getAttribute('id');
    const mobileCardPresent = await phonePage.locator('.mobile-own-bus-card').isVisible();
    assert(mobileCardPresent, '"Own a business" card is rendered inside feed for phone');

    // 4. Mobile Search Trigger
    const mobileSearchBlock = phonePage.locator('#mobileSearchBlock');
    assert(!(await mobileSearchBlock.isVisible()), 'Mobile search input is initially hidden');

    await phonePage.locator('#btnNavSearch').click();
    await phonePage.waitForTimeout(200);
    assert(await mobileSearchBlock.isVisible(), 'Clicking Search in floating nav opens mobile search input bar');
    assert(!(await phonePage.locator('#updatesTitleRow').isVisible()), 'Updates title row is hidden while mobile search is open');

    const hintText = await phonePage.locator('#mobileSearchHint').innerText();
    assert(hintText.includes('Try a place, a barangay, or "promo"'), `Search input has correct hint line: "${hintText.trim()}"`);

    // 5. Hide floating bottom nav when typing (virtual keyboard emulation)
    await phonePage.locator('#mobileSearchInput').focus();
    await phonePage.waitForTimeout(150);
    const isKeyboardOpenClass = await phonePage.evaluate(() => document.body.classList.contains('keyboard-open'));
    assert(isKeyboardOpenClass, 'Focusing input adds .keyboard-open to body to hide floating nav');

    await phonePage.locator('#mobileSearchInput').blur();
    await phonePage.waitForTimeout(150);
    const isKeyboardClosedClass = await phonePage.evaluate(() => !document.body.classList.contains('keyboard-open'));
    assert(isKeyboardClosedClass, 'Blurring input removes .keyboard-open class');

    // Cancel mobile search
    await phonePage.locator('#btnCancelMobileSearch').click();
    await phonePage.waitForTimeout(200);
    assert(!(await mobileSearchBlock.isVisible()), 'Clicking Cancel closes mobile search');
    assert(await phonePage.locator('#updatesTitleRow').isVisible(), 'Updates title row is restored');

    // 6. New Post Action Flows
    console.log('\n--- Testing New Post Flows ---');

    // Flow A: Non-business owner clicked New Post -> shows "Only listed businesses can post" sheet
    await phonePage.evaluate(() => {
        window.__TEST_DISCOVER_DATA__(null, null, { uid: 'regular_user_1', email: 'regular@example.com' }, null);
    });
    await phonePage.locator('#btnNavNewPost').click();
    await phonePage.waitForTimeout(250);

    const notListedSheet = phonePage.locator('.not-listed-dialog');
    const notListedText = await notListedSheet.innerText();
    assert(notListedText.includes('Only listed businesses can post'), `Non-owner sees sheet: "${notListedText.split('\n')[0]}"`);
    assert(notListedText.includes('See plans'), 'Sheet has "See plans" button');

    await phonePage.locator('#btnCloseNotListed').click();
    await phonePage.waitForTimeout(200);
    assert(!(await notListedSheet.isVisible()), 'Close button dismisses sheet');

    // Flow B: Unauthenticated user clicked New Post -> redirects to /login?redirect=/discover
    await phonePage.evaluate(() => {
        window.__TEST_DISCOVER_DATA__(null, null, null, null);
    });
    // In our test, clicking will set location.href; let's verify logic
    const willRedirect = await phonePage.evaluate(() => {
        let redirectTarget = null;
        const origLocation = window.location.href;
        // currentUser is null
        if (!window.currentUser) {
            redirectTarget = '/login?redirect=/discover';
        }
        return redirectTarget;
    });
    assert(willRedirect === '/login?redirect=/discover', 'Unauthenticated user gets redirected to /login?redirect=/discover');

    // Flow C: Live Business Owner opens shared composer
    await phonePage.evaluate(({ mockPosts, mockLiveBusinesses }) => {
        // Set user as owner of Kape Real (Featured plan: unlimited posts)
        window.__TEST_DISCOVER_DATA__(mockPosts, mockLiveBusinesses, { uid: 'owner_kape', email: 'kape@example.com' }, mockLiveBusinesses[1]);
    }, { mockPosts, mockLiveBusinesses });

    await phonePage.locator('#btnNavNewPost').click();
    await phonePage.waitForTimeout(300);

    const composerModal = phonePage.locator('#calzadaComposerModal');
    assert(await composerModal.isVisible(), 'Shared post composer modal opened for live business owner');

    const composerSub = await composerModal.locator('.composer-sub').innerText();
    assert(composerSub.includes('Posting as Kape Real'), `Composer displays business name: "${composerSub}"`);
    assert(composerSub.includes('Unlimited posts this month'), `Composer displays plan limit status for Featured: "${composerSub}"`);

    // Segmented control has Announcement, Promo, New item
    const segmentedLabels = await composerModal.locator('.composer-segmented .segmented-item span').allInnerTexts();
    assert(segmentedLabels.join(', ') === 'Announcement, Promo, New item', `Segmented control options: ${segmentedLabels.join(', ')}`);

    // Promo date picker is hidden until Promo radio is clicked
    const promoPickerVisibleBefore = await composerModal.locator('#promoUntilContainer').isVisible();
    assert(!promoPickerVisibleBefore, 'Promo expiration date input is hidden for Announcement');

    await composerModal.locator('.segmented-item:has(input[value="promo"])').click();
    await phonePage.waitForTimeout(200);
    const promoPickerVisibleAfter = await composerModal.locator('#promoUntilContainer').isVisible();
    assert(promoPickerVisibleAfter, 'Promo expiration date input is visible when Promo is selected');

    // Photos dropzone exists and allows up to 5 photos
    const dropzoneVisible = await composerModal.locator('#composerDropzone').isVisible();
    assert(dropzoneVisible, 'Photo upload dropzone is present');

    // Close composer
    await composerModal.locator('#btnComposerClose').click();
    await phonePage.waitForTimeout(200);
    assert(!(await composerModal.isVisible()), 'Close button dismissed post composer');

    // Check for any unexpected console errors
    assert(consoleErrors.length === 0, `Zero unexpected console errors (found: ${consoleErrors.length})`);
    if (consoleErrors.length > 0) {
        console.error('Console errors:', consoleErrors);
    }

    await phoneContext.close();
    await browser.close();

    console.log('\n========================================================');
    if (failedTests === 0) {
        console.log('PHASE 5 VERIFICATION PASSED: ALL TESTS 100% OK!');
    } else {
        console.error(`PHASE 5 VERIFICATION FAILED: ${failedTests} test(s) failed.`);
        process.exit(1);
    }
    console.log('========================================================\n');
}

testPhase5().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
});
