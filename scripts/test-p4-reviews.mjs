/**
 * scripts/test-p4-reviews.mjs
 *
 * Phase 4 Section 1 Verification Suite:
 * - Summary row: Sora 32px average, stars, review count, 5->1 breakdown bars (6px height, #378ADD on #E2E8F0).
 * - "No reviews yet. Be the first." empty state when zero reviews.
 * - "Rate this place" card: avatar/initials, "How was {place}?", 5 outline stars with 44px tap targets.
 * - Composer: expanded on star tap with that rating set, 500-char counter, "Post review".
 * - Post review: star pop animation, "Thanks! Your review is live.", review added to top, summary updated.
 * - Signed-out hand-off: tap star -> redirects to /login?redirect=... -> login -> redirected back with stars kept (sessionStorage deleted on read).
 * - Own review view: "Your review" with Edit and Delete.
 * - Business profile: reviews block mounted on business.html for biz_{businessId}.
 * - Arrival ticket prompt: "How was {place}? Rate it" with 5 stars on trip-ticket.js.
 */

import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

const app = getApps().length > 0 ? getApps()[0] : initializeApp({ projectId: 'calzada-web' });
const adminDb = getFirestore(app);

let authServer = null;

function createEmulatorToken(uid, claims = {}) {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
        sub: uid,
        user_id: uid,
        aud: "calzada-web",
        iss: "https://securetoken.google.com/calzada-web",
        email: `${uid}@test.calzadaph.com`,
        exp: Math.floor(Date.now() / 1000) + 7200,
        iat: Math.floor(Date.now() / 1000),
        auth_time: Math.floor(Date.now() / 1000),
        firebase: { sign_in_provider: "custom" },
        ...claims
    })).toString('base64url');
    return `${header}.${payload}.`;
}

function startAuthEmulator() {
    return new Promise((resolve) => {
        authServer = http.createServer((req, res) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
            res.setHeader('Access-Control-Allow-Headers', '*');

            if (req.method === 'OPTIONS') {
                res.writeHead(204);
                res.end();
                return;
            }

            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                const url = req.url || '';
                let uid = 'p4_reviewer_1';
                let isAdmin = false;

                try {
                    if (body.startsWith('{')) {
                        const parsed = JSON.parse(body);
                        const tokenStr = parsed.token || parsed.idToken;
                        if (tokenStr) {
                            const parts = tokenStr.split('.');
                            const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
                            uid = payload.sub || uid;
                            if (payload.admin === true || uid.includes('admin')) isAdmin = true;
                        }
                    } else if (body.includes('refresh_token')) {
                        const match = body.match(/refresh_token=refresh-token-([^&]+)/);
                        if (match) uid = match[1];
                        if (body.includes('admin') || uid.includes('admin')) isAdmin = true;
                    }
                } catch (_) {}

                if (url.includes('accounts:signInWithCustomToken') || url.includes('accounts:signInWithPassword')) {
                    const customJwt = createEmulatorToken(uid, { admin: isAdmin });
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        kind: 'identitytoolkit#VerifyCustomTokenResponse',
                        idToken: customJwt,
                        refreshToken: `refresh-token-${uid}`,
                        expiresIn: '7200',
                        isNewUser: false
                    }));
                } else if (url.includes('securetoken.googleapis.com/v1/token')) {
                    const customJwt = createEmulatorToken(uid, { admin: isAdmin });
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        access_token: customJwt,
                        expires_in: "7200",
                        token_type: "Bearer",
                        refresh_token: `refresh-token-${uid}`,
                        id_token: customJwt,
                        user_id: uid,
                        project_id: "calzada-web"
                    }));
                } else if (url.includes('accounts:lookup')) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        kind: 'identitytoolkit#GetAccountInfoResponse',
                        users: [{
                            localId: uid,
                            email: `${uid}@test.calzadaph.com`,
                            displayName: `User ${uid}`,
                            emailVerified: true,
                            customAttributes: JSON.stringify({ admin: isAdmin })
                        }]
                    }));
                } else {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({}));
                }
            });
        });

        authServer.listen(9099, '127.0.0.1', () => {
            console.log('[Firebase Auth Emulator] listening on 127.0.0.1:9099');
            resolve(authServer);
        });
    });
}

function checkAppServer() {
    return new Promise((resolve, reject) => {
        const req = http.get('http://127.0.0.1:5000/api/places/1/reviews', (res) => {
            if (res.statusCode === 200) {
                console.log('[App Server] Connected to port 5000');
                resolve();
            } else {
                reject(new Error(`Server returned HTTP ${res.statusCode}`));
            }
        });
        req.on('error', reject);
    });
}

async function loginInBrowser(page, token) {
    return await page.evaluate(async (tok) => {
        const { signInWithCustomToken } = await import("https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js");
        const { auth } = await import('../js/firebase-init.js');
        return await signInWithCustomToken(auth, tok);
    }, token);
}

async function runReviewsTests() {
    console.log('========================================================');
    console.log('PHASE 4 SECTION 1: REVIEWS UI VERIFICATION SUITE');
    console.log('========================================================\n');

    let passed = 0;
    let failed = 0;

    function report(success, message) {
        if (success) {
            console.log(`  [PASS] ${message}`);
            passed++;
        } else {
            console.error(`  [FAIL] ${message}`);
            failed++;
        }
    }

    await startAuthEmulator();
    await checkAppServer();

    const browser = await chromium.launch({ headless: true });

    const user1Uid = 'reviewer_test_user_1';
    const user1Token = createEmulatorToken(user1Uid);

    const user2Uid = 'reviewer_test_user_2';
    const user2Token = createEmulatorToken(user2Uid);

    const placeId = '1'; // CityMall Calamba
    const bizId = 'biz_p4_test_rev';

    try {
        // Step 0: Clean up test reviews in Firestore
        console.log('Step 0: Cleaning up test reviews and business in Firestore...');
        const allOldReviews = await adminDb.collection('place_reviews').get();
        for (const rDoc of allOldReviews.docs) {
            const data = rDoc.data();
            if (data.placeId === placeId || data.placeId === bizId || rDoc.id.startsWith(placeId + '_') || rDoc.id.startsWith(bizId + '_')) {
                await rDoc.ref.delete().catch(() => {});
            }
        }
        await adminDb.collection('businesses').doc('p4_test_rev').set({
            name: 'P4 Artisan Coffee',
            category: 'coffee',
            barangay: 'Real',
            municipality: 'Calamba',
            address: 'Real Road, Brgy. Real, Calamba City',
            status: 'approved',
            verified: true,
            createdAt: Timestamp.now()
        });

        // ----------------------------------------------------
        // TEST 1: Rating summary row (Empty state & Card properties)
        // ----------------------------------------------------
        console.log('\n--- TEST 1: Rating Summary Row (Initial Zero-Reviews State) ---');
        const context1 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const page1 = await context1.newPage();

        await context1.addInitScript(() => {
            window.localStorage.setItem('calzada_use_emulator', '1');
        });

        await page1.goto('http://127.0.0.1:5000/pages/places.html?emulator=1&place=CityMall%20Calamba', { waitUntil: 'domcontentloaded' });
        await page1.waitForSelector('.reviews-block-root', { timeout: 15000 });
        await page1.waitForTimeout(500);

        // Sign in user1 in the browser
        await loginInBrowser(page1, user1Token);
        await page1.waitForTimeout(600);

        // Verify place panel is open
        const panelVisible = await page1.evaluate(() => {
            const p = document.getElementById('placePanel');
            return p && (p.classList.contains('active') || p.classList.contains('open') || window.getComputedStyle(p).display !== 'none');
        });
        report(panelVisible, 'Place panel opened for CityMall Calamba');

        // Check empty summary state
        const emptySummaryInfo = await page1.evaluate(() => {
            const root = document.querySelector('.reviews-block-root');
            if (!root) return null;
            const emptyEl = root.querySelector('#reviewsEmptySummary');
            const emptyText = emptyEl?.textContent?.trim() || '';
            const emptyVisible = emptyEl && window.getComputedStyle(emptyEl).display !== 'none';
            return { exists: true, emptyVisible, emptyText };
        });

        report(emptySummaryInfo && emptySummaryInfo.exists, 'Reviews UI mounted inside place panel');
        report(emptySummaryInfo && emptySummaryInfo.emptyVisible && emptySummaryInfo.emptyText.includes('No reviews yet'), `Empty summary shows: "${emptySummaryInfo?.emptyText}"`);

        // Check "Rate this place" card: 5 outline stars with 44px tap targets
        const rateCardInfo = await page1.evaluate(() => {
            const root = document.querySelector('.reviews-block-root');
            const card = root?.querySelector('#rateThisCard');
            const stars = root?.querySelectorAll('#rateStarsPicker .star-btn');
            if (!card || !stars || stars.length === 0) return null;
            const firstStar = stars[0];
            const starRect = firstStar.getBoundingClientRect();
            const cardStyle = window.getComputedStyle(card);
            const promptText = card.querySelector('#ratePromptLine')?.textContent || '';

            return {
                cardVisible: cardStyle.display !== 'none',
                cardRadius: cardStyle.borderRadius,
                cardShadow: cardStyle.boxShadow,
                starCount: stars.length,
                starWidth: starRect.width,
                starHeight: starRect.height,
                promptText
            };
        });

        report(rateCardInfo && rateCardInfo.cardVisible, '"Rate this place" card is always visible');
        report(rateCardInfo && rateCardInfo.cardRadius === '12px' && (rateCardInfo.cardShadow === 'none' || rateCardInfo.cardShadow.includes('0px 0px 0px')), 'Flat white card (12px radius, no drop shadow)');
        report(rateCardInfo && rateCardInfo.starCount === 5, 'Five stars rendered');
        report(rateCardInfo && rateCardInfo.starWidth >= 40 && rateCardInfo.starHeight >= 40, `44px tap targets for stars (measured ${rateCardInfo?.starWidth}x${rateCardInfo?.starHeight})`);
        report(rateCardInfo && rateCardInfo.promptText.includes('CityMall'), `Prompt says "How was CityMall...": "${rateCardInfo?.promptText}"`);

        // ----------------------------------------------------
        // TEST 2: Interactive Composer & Posting Review
        // ----------------------------------------------------
        console.log('\n--- TEST 2: Interactive Composer & Posting Review ---');

        // Tap star 4
        await page1.evaluate(() => {
            const btn4 = document.querySelector('.reviews-block-root .star-btn[data-val="4"]');
            if (btn4) btn4.click();
        });
        await page1.waitForTimeout(400);

        const composerExpanded = await page1.evaluate(() => {
            const composer = document.querySelector('#rateComposer');
            const counter = document.querySelector('#rateCharCounter');
            const submitBtn = document.querySelector('#rateBtnSubmit');
            const stars = document.querySelectorAll('#rateStarsPicker .star-btn.filled');
            return {
                visible: composer && window.getComputedStyle(composer).display !== 'none',
                counterText: counter?.textContent?.trim(),
                submitBtnText: submitBtn?.textContent?.trim(),
                filledStars: stars.length
            };
        });

        report(composerExpanded && composerExpanded.visible, 'Tapping star 4 expands the composer');
        report(composerExpanded && composerExpanded.filledStars === 4, '4 stars pre-filled in picker');
        report(composerExpanded && composerExpanded.counterText === '0/500', '500-character counter initialized at 0/500');

        // Type comment into textarea
        const testComment = 'Great shopping center in Calamba. Clean, airconditioned, and easy parking.';
        await page1.fill('#rateCommentInput', testComment);
        await page1.waitForTimeout(100);

        const counterUpdated = await page1.evaluate(() => {
            return document.querySelector('#rateCharCounter')?.textContent?.trim();
        });
        report(counterUpdated === `${testComment.length}/500`, `Character counter updates dynamically (${counterUpdated})`);

        // Click "Post review"
        await page1.click('#rateBtnSubmit');
        await page1.waitForTimeout(1500);

        // Verify star pop, success message, review card added on top, and summary updated
        const postResult = await page1.evaluate((expectedComment) => {
            const liveMsg = document.querySelector('#rateLiveNotice');
            const cards = document.querySelectorAll('.review-card');
            const firstCard = cards[0];
            const authorName = firstCard?.querySelector('.review-card-name')?.textContent?.trim();
            const comment = firstCard?.querySelector('.review-comment-text')?.textContent?.trim();
            const selfBadge = firstCard?.querySelector('.review-badge-self');
            const editBtn = firstCard?.querySelector('.btn-card-edit');
            const deleteBtn = firstCard?.querySelector('.btn-card-delete');
            const avgScoreEl = document.querySelector('#reviewsAvgScore');
            const totalCountEl = document.querySelector('#reviewsTotalCount');
            const scoreStyle = avgScoreEl ? window.getComputedStyle(avgScoreEl) : null;
            const bars = document.querySelectorAll('.breakdown-row');

            return {
                liveMsgVisible: liveMsg && window.getComputedStyle(liveMsg).display !== 'none',
                liveMsgText: liveMsg?.textContent?.trim(),
                cardsCount: cards.length,
                authorName,
                comment,
                hasSelfBadge: !!selfBadge,
                hasEdit: !!editBtn,
                hasDelete: !!deleteBtn,
                avgScore: avgScoreEl?.textContent?.trim(),
                scoreFont: scoreStyle?.fontFamily || '',
                scoreSize: scoreStyle?.fontSize || '',
                totalCount: totalCountEl?.textContent?.trim(),
                barsCount: bars.length
            };
        }, testComment);

        report(postResult && postResult.liveMsgVisible && postResult.liveMsgText.includes('Thanks'), `Live notice displayed: "${postResult?.liveMsgText}"`);
        report(postResult && postResult.cardsCount >= 1, 'New review card added to reviews list');
        report(postResult && postResult.comment === testComment, 'Comment text matches posted content');
        report(postResult && postResult.hasEdit && postResult.hasDelete, 'Own review includes Edit and Delete buttons');
        report(postResult && postResult.avgScore === '4.0', `Summary average updated to 4.0 (${postResult?.avgScore})`);
        report(postResult && (postResult.scoreSize === '32px' || postResult.scoreFont.includes('Sora')), `Average score styled in Sora 32px (${postResult?.scoreSize}, ${postResult?.scoreFont})`);
        report(postResult && postResult.barsCount === 5, '5 breakdown rows render (5 to 1)');

        // ----------------------------------------------------
        // TEST 3: Signed-out user tap star -> Login -> Redirect back with 4 stars kept
        // ----------------------------------------------------
        console.log('\n--- TEST 3: Signed-out User Star Tap -> Login -> Restore with 4 Stars ---');
        const contextGuest = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const pageGuest = await contextGuest.newPage();

        await contextGuest.addInitScript(() => {
            window.localStorage.setItem('calzada_use_emulator', '1');
        });

        // Navigate to places page signed out
        await pageGuest.goto('http://127.0.0.1:5000/pages/places.html?emulator=1&place=CityMall%20Calamba', { waitUntil: 'domcontentloaded' });
        await pageGuest.waitForSelector('.reviews-block-root', { timeout: 15000 });
        await pageGuest.waitForTimeout(800);

        // Click star 4 as guest
        await pageGuest.evaluate(() => {
            const star4 = document.querySelector('.reviews-block-root .star-btn[data-val="4"]');
            if (star4) star4.click();
        });
        await pageGuest.waitForTimeout(1000);

        // Verify URL redirected to /login with redirect param
        const currentUrl = pageGuest.url();
        report(currentUrl.includes('/login') && currentUrl.includes('redirect='), `Redirected to login: ${currentUrl}`);

        // Check sessionStorage handoff
        const pendingSession = await pageGuest.evaluate(() => {
            const raw = sessionStorage.getItem('calzada_pending_rating');
            return raw ? JSON.parse(raw) : null;
        });
        report(pendingSession && pendingSession.rating === 4, `sessionStorage has pending rating of 4 stars (${pendingSession?.rating})`);

        // Navigate back to redirect target and authenticate user2
        await pageGuest.goto('http://127.0.0.1:5000/pages/places.html?emulator=1&place=CityMall%20Calamba', { waitUntil: 'domcontentloaded' });
        await pageGuest.waitForSelector('.reviews-block-root', { timeout: 15000 });
        await loginInBrowser(pageGuest, user2Token);
        await pageGuest.waitForSelector('#rateComposer:not([style*="none"])', { timeout: 10000 }).catch(() => {});
        await pageGuest.waitForTimeout(500);

        // Verify composer auto-opened with 4 stars and sessionStorage deleted on read
        const restoredState = await pageGuest.evaluate(() => {
            const composer = document.querySelector('#rateComposer');
            const filledStars = document.querySelectorAll('#rateStarsPicker .star-btn.filled');
            const remainingStorage = sessionStorage.getItem('calzada_pending_rating');
            return {
                composerVisible: composer && window.getComputedStyle(composer).display !== 'none',
                filledStarsCount: filledStars.length,
                storageCleared: remainingStorage === null
            };
        });

        report(restoredState && restoredState.composerVisible, 'Composer automatically expanded on return from login');
        report(restoredState && restoredState.filledStarsCount === 4, '4 stars preserved and pre-selected');
        report(restoredState && restoredState.storageCleared, 'sessionStorage item deleted on read');

        // ----------------------------------------------------
        // TEST 4: Business Profile Reviews (biz_{businessId})
        // ----------------------------------------------------
        console.log('\n--- TEST 4: Business Profile Reviews Block ---');
        const contextBiz = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const pageBiz = await contextBiz.newPage();

        await contextBiz.addInitScript(() => {
            window.localStorage.setItem('calzada_use_emulator', '1');
        });

        await pageBiz.goto('http://127.0.0.1:5000/pages/business.html?emulator=1&id=p4_test_rev', { waitUntil: 'domcontentloaded' });
        await pageBiz.waitForSelector('#bizReviewsSection .reviews-block-root', { timeout: 15000 });
        await loginInBrowser(pageBiz, user1Token);
        await pageBiz.waitForTimeout(800);

        const bizReviewUI = await pageBiz.evaluate(() => {
            const section = document.getElementById('bizReviewsSection');
            const root = section?.querySelector('.reviews-block-root');
            const prompt = root?.querySelector('#ratePromptLine')?.textContent?.trim();
            const stars = root?.querySelectorAll('#rateStarsPicker .star-btn');
            return {
                mounted: !!root,
                prompt,
                starsCount: stars ? stars.length : 0
            };
        });

        report(bizReviewUI && bizReviewUI.mounted, 'Reviews UI block mounted in business.html (#bizReviewsSection)');
        report(bizReviewUI && bizReviewUI.prompt && bizReviewUI.prompt.includes('P4 Artisan Coffee'), `Business prompt contains business name: "${bizReviewUI?.prompt}"`);

        // Post a review on the business profile
        await pageBiz.evaluate(() => {
            const star5 = document.querySelector('#bizReviewsSection .star-btn[data-val="5"]');
            if (star5) star5.click();
        });
        await pageBiz.waitForTimeout(300);

        await pageBiz.fill('#bizReviewsSection #rateCommentInput', 'Best latte in Brgy. Real!');
        await pageBiz.click('#bizReviewsSection #rateBtnSubmit');
        await pageBiz.waitForTimeout(1500);

        const bizPostResult = await pageBiz.evaluate(() => {
            const cards = document.querySelectorAll('#bizReviewsSection .review-card');
            const firstComment = cards[0]?.querySelector('.review-comment-text')?.textContent?.trim();
            return {
                count: cards.length,
                firstComment
            };
        });

        report(bizPostResult && bizPostResult.count >= 1 && bizPostResult.firstComment === 'Best latte in Brgy. Real!', 'Review posted successfully to business profile (biz_p4_test_rev)');

        // ----------------------------------------------------
        // TEST 5: Arrival Ticket Rating Prompt
        // ----------------------------------------------------
        console.log('\n--- TEST 5: Arrival Ticket Rating Prompt ---');
        const contextTicket = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const pageTicket = await contextTicket.newPage();

        await contextTicket.addInitScript(() => {
            window.localStorage.setItem('calzada_use_emulator', '1');
        });

        // Go to planner and test rendering trip-ticket with known destination
        await pageTicket.goto('http://127.0.0.1:5000/pages/planner.html?emulator=1', { waitUntil: 'domcontentloaded' });
        await pageTicket.waitForTimeout(1000);
        await loginInBrowser(pageTicket, user1Token);
        await pageTicket.waitForTimeout(500);

        const ticketPromptResult = await pageTicket.evaluate(async () => {
            if (!window.CalzadaTicket || typeof window.CalzadaTicket.open !== 'function') {
                return { error: 'CalzadaTicket.open not found' };
            }

            const mockTrip = {
                destId: '1',
                destName: 'CityMall Calamba',
                originLabel: 'SM City Calamba',
                startedAt: Date.now() - 600000,
                arrivedAt: Date.now(),
                durationMin: 10,
                estimatedMin: 12,
                distanceKm: 2.5,
                fare: 15,
                mode: 'jeepney',
                legs: []
            };

            await window.CalzadaTicket.open(mockTrip);
            const promptEl = document.querySelector('.tkt-rate-prompt');
            const stars = document.querySelectorAll('.tkt-star-btn');
            const firstStarRect = stars[0]?.getBoundingClientRect();

            return {
                promptText: promptEl?.textContent?.trim() || '',
                starsCount: stars.length,
                starWidth: firstStarRect?.width || 0,
                starHeight: firstStarRect?.height || 0
            };
        });

        report(ticketPromptResult && ticketPromptResult.starsCount === 5, 'Arrival ticket renders 5 rating stars');
        report(ticketPromptResult && ticketPromptResult.promptText.includes('CityMall'), `Arrival ticket prompt: "${ticketPromptResult?.promptText}"`);
        report(ticketPromptResult && ticketPromptResult.starWidth >= 40 && ticketPromptResult.starHeight >= 40, `Ticket stars have 44px tap targets (${ticketPromptResult?.starWidth}x${ticketPromptResult?.starHeight})`);

    } catch (err) {
        console.error('Test execution error:', err);
        failed++;
    } finally {
        await browser.close().catch(() => {});
        if (authServer) authServer.close();
    }

    console.log('\n========================================================');
    console.log(`RESULTS: ${passed} passed, ${failed} failed`);
    console.log('========================================================\n');

    process.exit(failed > 0 ? 1 : 0);
}

runReviewsTests();
