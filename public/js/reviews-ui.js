/**
 * Calzada Reviews UI Component
 * Reference: Google Maps and Airbnb review blocks, flat design.
 * Applies to Place Panel and Business Profile.
 *
 * Design system:
 * - Flat white cards, 1px solid #E2E8F0, 12px radius, no drop shadows.
 * - Sora for headings, Outfit for body text. #378ADD is the only accent color.
 * - Star yellow #F59E0B for stars only.
 * - Banned: gradients, glassmorphism, emoji as icons, badges/pills.
 */
(function () {
    'use strict';

    if (window.CalzadaReviewsUI) return;

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function t(key, params) {
        if (typeof window.t === 'function') {
            return window.t(key, params);
        }
        const EN_FALLBACKS = {
            'places.reviews.no_reviews': 'No reviews yet. Be the first.',
            'places.reviews.reviews_count': '{count} reviews',
            'places.reviews.reviews_count_singular': '1 review',
            'places.reviews.how_was': 'How was {place}?',
            'places.reviews.rate_this': 'Rate this place',
            'places.reviews.composer_placeholder': 'What should other commuters know? (optional)',
            'places.reviews.post_review': 'Post review',
            'places.reviews.update_review': 'Update review',
            'places.reviews.your_review': 'Your review',
            'places.reviews.edit': 'Edit',
            'places.reviews.delete': 'Delete',
            'places.reviews.delete_confirm': 'Delete this review?',
            'places.reviews.thanks_live': 'Thanks! Your review is live.',
            'places.reviews.more': 'More',
            'places.reviews.see_all': 'See all reviews ({count})',
            'ticket.rate_place': 'How was {place}? Rate it'
        };
        let s = EN_FALLBACKS[key] || key;
        if (params) {
            Object.entries(params).forEach(([k, v]) => {
                s = s.split(`{${k}}`).join(v);
            });
        }
        return s;
    }

    function formatRelativeTime(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '';
        const now = new Date();
        const diffSec = Math.max(0, Math.floor((now - date) / 1000));
        const lang = localStorage.getItem('calzada_lang') || document.documentElement.lang || 'en';
        const isTl = lang === 'tl';

        if (diffSec < 60) return isTl ? 'ngayon lang' : 'just now';
        const diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) return isTl ? `${diffMin}m ang nakalipas` : `${diffMin}m ago`;
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return isTl ? `${diffHr}h ang nakalipas` : `${diffHr}h ago`;
        const diffDays = Math.floor(diffHr / 24);
        if (diffDays === 1) return isTl ? 'kahapon' : 'yesterday';
        if (diffDays < 7) return isTl ? `${diffDays} araw ang nakalipas` : `${diffDays} days ago`;
        const diffWeeks = Math.floor(diffDays / 7);
        if (diffWeeks < 4) return isTl ? `${diffWeeks} linggo ang nakalipas` : `${diffWeeks} weeks ago`;
        const diffMonths = Math.floor(diffDays / 30);
        if (diffMonths < 12) return isTl ? `${diffMonths} buwan ang nakalipas` : `${diffMonths} months ago`;
        return date.toLocaleDateString(isTl ? 'fil-PH' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    async function fetchAuthToken() {
        if (window.CalzadaAuth && typeof window.CalzadaAuth.getFirebaseIdToken === 'function') {
            return await window.CalzadaAuth.getFirebaseIdToken();
        }
        try {
            const mod = await import('../js/firebase-init.js');
            return await mod.getFirebaseIdToken();
        } catch (_) {
            return null;
        }
    }

    function isUserLoggedIn() {
        if (window.CalzadaAuth && typeof window.CalzadaAuth.getCurrentUser === 'function') {
            return !!window.CalzadaAuth.getCurrentUser();
        }
        return false;
    }

    function getCurrentUser() {
        if (window.CalzadaAuth && typeof window.CalzadaAuth.getCurrentUser === 'function') {
            return window.CalzadaAuth.getCurrentUser();
        }
        return null;
    }

    const STAR_SVG = `<svg class="star-outline-svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;

    function renderStarRatingRow(ratingVal, size = 15) {
        const rounded = Math.round(ratingVal);
        let html = '';
        for (let i = 1; i <= 5; i++) {
            const isFilled = i <= rounded;
            html += `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${isFilled ? '#F59E0B' : '#E2E8F0'}" stroke="${isFilled ? '#F59E0B' : '#E2E8F0'}" stroke-width="1" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
        }
        return html;
    }

    /**
     * Mount the reviews UI inside a container
     */
    function mount(container, options = {}) {
        if (!container) return null;
        const placeId = String(options.placeId || '').trim();
        const placeName = String(options.placeName || 'this place').trim();
        const returnUrl = options.returnUrl || (window.location.pathname + window.location.search);

        let activeRating = 0;
        let userExistingReview = null;
        let reviewsData = null;
        let showingAllReviews = false;
        let isDeleting = false;

        // Pending rating handoff function (defined after DOM is ready)
        let tryRestorePendingHandoff = null;

        container.innerHTML = `
            <div class="reviews-block-root" data-place-id="${escapeHtml(placeId)}">
                <!-- 1. Rating Summary Row -->
                <div class="reviews-summary-card" id="reviewsSummaryRow">
                    <div class="reviews-summary-skeleton" id="reviewsSummarySkeleton">
                        <div class="sk-line sk-score"></div>
                        <div class="sk-line sk-bars"></div>
                    </div>
                    <div class="reviews-summary-content" id="reviewsSummaryContent" style="display: none;">
                        <div class="reviews-summary-left">
                            <div class="reviews-avg-number" id="reviewsAvgScore">0.0</div>
                            <div class="reviews-avg-stars" id="reviewsAvgStars"></div>
                            <div class="reviews-total-count" id="reviewsTotalCount">0 reviews</div>
                        </div>
                        <div class="reviews-breakdown" id="reviewsBreakdown">
                            <!-- 5 to 1 breakdown bars -->
                        </div>
                    </div>
                    <div class="reviews-empty-state" id="reviewsEmptySummary" style="display: none;">
                        <p class="reviews-empty-text">${escapeHtml(t('places.reviews.no_reviews'))}</p>
                    </div>
                </div>

                <!-- 2. "Rate this place" card (Always visible right under summary) -->
                <div class="rate-this-card" id="rateThisCard">
                    <div class="rate-user-row">
                        <div class="rate-user-avatar" id="rateUserAvatar">
                            <span id="rateUserInitial">?</span>
                        </div>
                        <div class="rate-user-prompt">
                            <span class="rate-prompt-line" id="ratePromptLine">${escapeHtml(t('places.reviews.how_was', { place: placeName }))}</span>
                        </div>
                    </div>

                    <!-- 5 Outline Stars (44px tap targets) -->
                    <div class="rate-stars-picker" id="rateStarsPicker" role="group" aria-label="Rating stars">
                        <button type="button" class="star-btn" data-val="1" aria-label="1 star">${STAR_SVG}</button>
                        <button type="button" class="star-btn" data-val="2" aria-label="2 stars">${STAR_SVG}</button>
                        <button type="button" class="star-btn" data-val="3" aria-label="3 stars">${STAR_SVG}</button>
                        <button type="button" class="star-btn" data-val="4" aria-label="4 stars">${STAR_SVG}</button>
                        <button type="button" class="star-btn" data-val="5" aria-label="5 stars">${STAR_SVG}</button>
                    </div>

                    <!-- Composer (Expands on star tap) -->
                    <div class="rate-composer" id="rateComposer" style="display: none;">
                        <textarea class="rate-comment-input" id="rateCommentInput" rows="3" maxlength="500" placeholder="${escapeHtml(t('places.reviews.composer_placeholder'))}"></textarea>
                        <div class="rate-composer-footer">
                            <span class="rate-char-counter" id="rateCharCounter">0/500</span>
                            <div class="rate-composer-actions">
                                <button type="button" class="rate-btn-cancel" id="rateBtnCancel" style="display: none;">Cancel</button>
                                <button type="button" class="rate-btn-submit" id="rateBtnSubmit">${escapeHtml(t('places.reviews.post_review'))}</button>
                            </div>
                        </div>
                    </div>

                    <!-- Already Reviewed Card View -->
                    <div class="rate-existing-view" id="rateExistingView" style="display: none;">
                        <div class="rate-existing-top">
                            <span class="rate-existing-badge">${escapeHtml(t('places.reviews.your_review'))}</span>
                            <div class="rate-existing-actions">
                                <button type="button" class="btn-action-edit" id="btnEditReview">${escapeHtml(t('places.reviews.edit'))}</button>
                                <button type="button" class="btn-action-delete" id="btnDeleteReview">${escapeHtml(t('places.reviews.delete'))}</button>
                            </div>
                        </div>
                        <div class="rate-existing-comment" id="rateExistingComment"></div>
                    </div>

                    <!-- Success live notice -->
                    <div class="rate-live-notice" id="rateLiveNotice" style="display: none;" role="status">
                        ${escapeHtml(t('places.reviews.thanks_live'))}
                    </div>
                </div>

                <!-- 3. Review Cards List -->
                <div class="reviews-list-section" id="reviewsListSection">
                    <div class="reviews-cards-container" id="reviewsCardsContainer"></div>
                    <button type="button" class="btn-see-all-reviews" id="btnSeeAllReviews" style="display: none;">
                        ${escapeHtml(t('places.reviews.see_all', { count: 0 }))}
                    </button>
                </div>
            </div>
        `;

        const root = container.querySelector('.reviews-block-root');
        const summarySkeleton = root.querySelector('#reviewsSummarySkeleton');
        const summaryContent = root.querySelector('#reviewsSummaryContent');
        const emptySummary = root.querySelector('#reviewsEmptySummary');
        const avgScoreEl = root.querySelector('#reviewsAvgScore');
        const avgStarsEl = root.querySelector('#reviewsAvgStars');
        const totalCountEl = root.querySelector('#reviewsTotalCount');
        const breakdownEl = root.querySelector('#reviewsBreakdown');

        const rateUserAvatar = root.querySelector('#rateUserAvatar');
        const rateUserInitial = root.querySelector('#rateUserInitial');
        const starBtns = root.querySelectorAll('.rate-stars-picker .star-btn');
        const rateComposer = root.querySelector('#rateComposer');
        const commentInput = root.querySelector('#rateCommentInput');
        const charCounter = root.querySelector('#rateCharCounter');
        const btnCancel = root.querySelector('#rateBtnCancel');
        const btnSubmit = root.querySelector('#rateBtnSubmit');
        const rateExistingView = root.querySelector('#rateExistingView');
        const rateExistingComment = root.querySelector('#rateExistingComment');
        const btnEditReview = root.querySelector('#btnEditReview');
        const btnDeleteReview = root.querySelector('#btnDeleteReview');
        const rateLiveNotice = root.querySelector('#rateLiveNotice');

        const reviewsCardsContainer = root.querySelector('#reviewsCardsContainer');
        const btnSeeAllReviews = root.querySelector('#btnSeeAllReviews');

        // Update user avatar/initials
        function syncUserAvatar() {
            const user = getCurrentUser();
            if (user) {
                if (user.photoURL) {
                    rateUserAvatar.innerHTML = `<img src="${escapeHtml(user.photoURL)}" alt="${escapeHtml(user.displayName || 'User')}">`;
                } else {
                    const name = user.displayName || user.email || 'U';
                    rateUserInitial.textContent = name.trim().charAt(0).toUpperCase();
                }
            } else {
                rateUserInitial.textContent = '?';
            }
        }
        syncUserAvatar();

        // Update star picker visuals
        function updateStarPicker(val) {
            const v = Math.round(val);
            starBtns.forEach(btn => {
                const bVal = parseInt(btn.getAttribute('data-val'), 10);
                if (bVal <= v) {
                    btn.classList.add('filled');
                } else {
                    btn.classList.remove('filled');
                }
            });
        }
        updateStarPicker(0);

        // Hover handling
        starBtns.forEach(btn => {
            const val = parseInt(btn.getAttribute('data-val'), 10);
            btn.addEventListener('mouseenter', () => {
                starBtns.forEach(b => {
                    const bv = parseInt(b.getAttribute('data-val'), 10);
                    if (bv <= val) b.classList.add('hovered');
                    else b.classList.remove('hovered');
                });
            });
            btn.addEventListener('mouseleave', () => {
                starBtns.forEach(b => b.classList.remove('hovered'));
                updateStarPicker(activeRating);
            });

            // Tapping a star
            async function onStarSelect() {
                if (!isUserLoggedIn()) {
                    // Hand-off via sessionStorage
                    const pending = {
                        placeId,
                        placeName,
                        rating: val,
                        returnUrl
                    };
                    try {
                        sessionStorage.setItem('calzada_pending_rating', JSON.stringify(pending));
                    } catch (_) {}
                    const destUrl = `/login?redirect=${encodeURIComponent(returnUrl)}`;
                    window.location.href = destUrl;
                    return;
                }

                // Signed in: set active rating and expand composer
                activeRating = val;
                updateStarPicker(activeRating);
                rateExistingView.style.display = 'none';
                rateComposer.style.display = 'flex';
                btnSubmit.textContent = userExistingReview
                    ? t('places.reviews.update_review')
                    : t('places.reviews.post_review');
                btnCancel.style.display = userExistingReview ? 'inline-flex' : 'none';
                commentInput.focus();
            }

            btn.addEventListener('click', onStarSelect);
            if (typeof window.bindTap === 'function') {
                window.bindTap(btn, onStarSelect);
            }
        });

        // 500-char counter
        commentInput.addEventListener('input', () => {
            const len = commentInput.value.length;
            charCounter.textContent = `${len}/500`;
        });

        // Cancel composer
        btnCancel.addEventListener('click', () => {
            rateComposer.style.display = 'none';
            if (userExistingReview) {
                rateExistingView.style.display = 'block';
                activeRating = userExistingReview.rating || 5;
                updateStarPicker(activeRating);
            }
        });

        // Post / Update Review
        async function onSubmitReview() {
            if (activeRating < 1 || activeRating > 5) return;
            btnSubmit.disabled = true;
            btnSubmit.textContent = '...';

            try {
                const token = await fetchAuthToken();
                if (!token) {
                    btnSubmit.disabled = false;
                    btnSubmit.textContent = userExistingReview ? t('places.reviews.update_review') : t('places.reviews.post_review');
                    return;
                }

                const commentText = commentInput.value.trim();
                const res = await fetch(`/api/places/${encodeURIComponent(placeId)}/rating`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        rating: activeRating,
                        comment_text: commentText
                    })
                });

                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }

                const resData = await res.json();
                userExistingReview = resData.user_review || {
                    rating: activeRating,
                    comment_text: commentText,
                    reviewer_name: getCurrentUser()?.displayName || 'You',
                    created_at: new Date().toISOString()
                };

                // Star pop animation
                starBtns.forEach(btn => {
                    const bv = parseInt(btn.getAttribute('data-val'), 10);
                    if (bv <= activeRating) {
                        btn.classList.add('pop');
                        setTimeout(() => btn.classList.remove('pop'), 400);
                    }
                });

                // Show live notice
                rateLiveNotice.textContent = t('places.reviews.thanks_live');
                rateLiveNotice.style.display = 'block';
                setTimeout(() => {
                    rateLiveNotice.style.display = 'none';
                }, 4000);

                // Collapse composer, show existing view
                rateComposer.style.display = 'none';
                showExistingReviewView(userExistingReview);

                // Reload reviews & update summary
                await loadReviews(true);
            } catch (err) {
                console.error('[CalzadaReviewsUI] Submit failed:', err);
                rateLiveNotice.textContent = 'Failed to post review. Please try again.';
                rateLiveNotice.style.display = 'block';
            } finally {
                btnSubmit.disabled = false;
                btnSubmit.textContent = userExistingReview ? t('places.reviews.update_review') : t('places.reviews.post_review');
            }
        }
        btnSubmit.addEventListener('click', onSubmitReview);
        if (typeof window.bindTap === 'function') {
            window.bindTap(btnSubmit, onSubmitReview);
        }

        // Edit button handler
        btnEditReview.addEventListener('click', () => {
            rateExistingView.style.display = 'none';
            rateComposer.style.display = 'flex';
            btnCancel.style.display = 'inline-flex';
            btnSubmit.textContent = t('places.reviews.update_review');
            commentInput.value = userExistingReview?.comment_text || '';
            charCounter.textContent = `${commentInput.value.length}/500`;
            commentInput.focus();
        });

        // Delete button handler (two-step inline confirmation)
        btnDeleteReview.addEventListener('click', async () => {
            if (!isDeleting) {
                isDeleting = true;
                btnDeleteReview.textContent = 'Confirm delete?';
                setTimeout(() => {
                    if (isDeleting) {
                        isDeleting = false;
                        btnDeleteReview.textContent = t('places.reviews.delete');
                    }
                }, 4000);
                return;
            }

            isDeleting = false;
            btnDeleteReview.disabled = true;
            btnDeleteReview.textContent = '...';

            try {
                const token = await fetchAuthToken();
                if (!token) return;

                const res = await fetch(`/api/places/${encodeURIComponent(placeId)}/rating`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (!res.ok) throw new Error(`HTTP ${res.status}`);

                userExistingReview = null;
                activeRating = 0;
                updateStarPicker(0);
                commentInput.value = '';
                charCounter.textContent = '0/500';
                rateComposer.style.display = 'none';
                rateExistingView.style.display = 'none';

                // Reload reviews & summary
                await loadReviews(true);
            } catch (err) {
                console.error('[CalzadaReviewsUI] Delete failed:', err);
            } finally {
                btnDeleteReview.disabled = false;
                btnDeleteReview.textContent = t('places.reviews.delete');
            }
        });

        function showExistingReviewView(review) {
            if (!review) return;
            rateExistingView.style.display = 'block';
            rateComposer.style.display = 'none';
            activeRating = review.rating || 5;
            updateStarPicker(activeRating);
            if (review.comment_text && review.comment_text.trim()) {
                rateExistingComment.textContent = review.comment_text.trim();
                rateExistingComment.style.display = 'block';
            } else {
                rateExistingComment.textContent = '';
                rateExistingComment.style.display = 'none';
            }
        }

        // Render Summary Row (Score, 5 stars, Breakdown bars)
        function renderSummary(avg, total, breakdown) {
            summarySkeleton.style.display = 'none';
            if (total === 0) {
                summaryContent.style.display = 'none';
                emptySummary.style.display = 'block';
                return;
            }

            emptySummary.style.display = 'none';
            summaryContent.style.display = 'flex';

            avgScoreEl.textContent = avg.toFixed(1);
            avgStarsEl.innerHTML = renderStarRatingRow(avg, 16);
            totalCountEl.textContent = total === 1
                ? t('places.reviews.reviews_count_singular')
                : t('places.reviews.reviews_count', { count: total });

            // 5 to 1 breakdown bars
            let barsHtml = '';
            for (let star = 5; star >= 1; star--) {
                const count = (breakdown && breakdown[star]) ? breakdown[star] : 0;
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                barsHtml += `
                    <div class="breakdown-row" data-star="${star}">
                        <span class="breakdown-num">${star}</span>
                        <div class="breakdown-bar-track">
                            <div class="breakdown-bar-fill" style="width: ${pct}%;"></div>
                        </div>
                        <span class="breakdown-count">${count}</span>
                    </div>
                `;
            }
            breakdownEl.innerHTML = barsHtml;
        }

        // Render Review Cards
        function renderReviewCards(reviews, total) {
            const currentUid = getCurrentUser()?.uid || null;
            if (!reviews || reviews.length === 0) {
                reviewsCardsContainer.innerHTML = '';
                btnSeeAllReviews.style.display = 'none';
                return;
            }

            const limit = showingAllReviews ? reviews.length : 3;
            const slice = reviews.slice(0, limit);

            reviewsCardsContainer.innerHTML = slice.map((r, idx) => {
                const reviewerName = r.reviewer_name || 'Calzada Commuter';
                const initial = reviewerName.trim().charAt(0).toUpperCase() || 'U';
                const relativeTime = formatRelativeTime(r.created_at);
                const isOwn = Boolean(r.is_mine || (currentUid && r.user_id === currentUid));
                const commentText = (r.comment_text || '').trim();
                const hasComment = commentText.length > 0;
                const isLong = commentText.length > 140 || commentText.includes('\n');

                return `
                    <div class="review-card" data-review-id="${escapeHtml(r.id)}" data-review-idx="${idx}">
                        <div class="review-card-head">
                            <div class="review-card-avatar">${escapeHtml(initial)}</div>
                            <div class="review-card-meta">
                                <div class="review-card-author-line">
                                    <span class="review-card-name">${escapeHtml(reviewerName)}</span>
                                    ${isOwn ? `<span class="review-badge-self">You</span>` : ''}
                                </div>
                                <span class="review-card-date">${escapeHtml(relativeTime)}</span>
                            </div>
                            <div class="review-card-stars">
                                ${renderStarRatingRow(r.rating || 5, 14)}
                            </div>
                        </div>
                        ${hasComment ? `
                            <div class="review-card-body">
                                <p class="review-comment-text ${isLong ? 'clamped' : ''}">${escapeHtml(commentText)}</p>
                                ${isLong ? `<button type="button" class="btn-review-more">${escapeHtml(t('places.reviews.more'))}</button>` : ''}
                            </div>
                        ` : ''}
                        ${isOwn ? `
                            <div class="review-card-own-actions">
                                <button type="button" class="btn-card-edit">${escapeHtml(t('places.reviews.edit'))}</button>
                                <button type="button" class="btn-card-delete">${escapeHtml(t('places.reviews.delete'))}</button>
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('');

            // Bind "More" buttons
            reviewsCardsContainer.querySelectorAll('.btn-review-more').forEach(btn => {
                btn.addEventListener('click', () => {
                    const comment = btn.previousElementSibling;
                    if (comment) comment.classList.remove('clamped');
                    btn.remove();
                });
            });

            // Bind own review action buttons in cards
            reviewsCardsContainer.querySelectorAll('.btn-card-edit').forEach(btn => {
                btn.addEventListener('click', () => {
                    btnEditReview.click();
                    root.querySelector('#rateThisCard')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                });
            });
            reviewsCardsContainer.querySelectorAll('.btn-card-delete').forEach(btn => {
                btn.addEventListener('click', () => {
                    btnDeleteReview.click();
                });
            });

            // "See all reviews" button
            if (total > 3 && !showingAllReviews) {
                btnSeeAllReviews.textContent = t('places.reviews.see_all', { count: total });
                btnSeeAllReviews.style.display = 'block';
            } else {
                btnSeeAllReviews.style.display = 'none';
            }
        }

        btnSeeAllReviews.addEventListener('click', async () => {
            showingAllReviews = true;
            await loadReviews(false);
        });

        // Load reviews from server
        async function loadReviews(reset = true) {
            if (reset) {
                summarySkeleton.style.display = 'block';
                summaryContent.style.display = 'none';
                emptySummary.style.display = 'none';
            }

            try {
                const token = await fetchAuthToken();
                const headers = {};
                if (token) headers['Authorization'] = `Bearer ${token}`;

                const limit = showingAllReviews ? 50 : 10;
                const res = await fetch(`/api/places/${encodeURIComponent(placeId)}/reviews?limit=${limit}&offset=0`, {
                    headers
                });

                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                reviewsData = data;

                const avg = parseFloat(data.average_rating) || 0;
                const total = parseInt(data.total_ratings, 10) || 0;

                // Compute breakdown if not supplied by server
                let breakdown = data.breakdown;
                if (!breakdown) {
                    breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
                    (data.reviews || []).forEach(r => {
                        const rv = parseInt(r.rating, 10);
                        if (rv >= 1 && rv <= 5) breakdown[rv] = (breakdown[rv] || 0) + 1;
                    });
                }

                renderSummary(avg, total, breakdown);

                // User's own review
                if (data.user_review && isUserLoggedIn()) {
                    userExistingReview = data.user_review;
                    showExistingReviewView(userExistingReview);
                } else if (!isUserLoggedIn()) {
                    userExistingReview = null;
                    rateExistingView.style.display = 'none';
                    rateComposer.style.display = 'none';
                } else {
                    // Signed in without existing review:
                    // If rating was restored or selected, maintain composer visibility & star state
                    if (activeRating > 0) {
                        updateStarPicker(activeRating);
                        rateExistingView.style.display = 'none';
                        rateComposer.style.display = 'flex';
                    }
                }

                tryRestorePendingHandoff();
                renderReviewCards(data.reviews || [], total);
            } catch (err) {
                console.warn('[CalzadaReviewsUI] Load reviews failed:', err);
                summarySkeleton.style.display = 'none';
                renderSummary(0, 0, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
            }
        }

        // Restore pending rating from login hand-off (delete on read)
        tryRestorePendingHandoff = function() {
            if (!isUserLoggedIn()) return;
            try {
                const rawPending = sessionStorage.getItem('calzada_pending_rating');
                if (!rawPending) return;
                const pending = JSON.parse(rawPending);
                const matches = pending && (
                    String(pending.placeId) === String(placeId) ||
                    (pending.placeName && pending.placeName.toLowerCase() === placeName.toLowerCase()) ||
                    (pending.placeName && placeName.toLowerCase().includes(pending.placeName.toLowerCase())) ||
                    (pending.placeName && pending.placeName.toLowerCase().includes(placeName.toLowerCase()))
                );
                if (matches) {
                    sessionStorage.removeItem('calzada_pending_rating'); // Delete on read!
                    activeRating = parseInt(pending.rating, 10) || 5;
                    updateStarPicker(activeRating);
                    rateExistingView.style.display = 'none';
                    rateComposer.style.display = 'flex';
                    btnSubmit.textContent = userExistingReview ? t('places.reviews.update_review') : t('places.reviews.post_review');
                    commentInput.focus();
                }
            } catch (_) {}
        };

        // Robust listener for auth state changes
        let unsubAuth = null;
        function ensureAuthListener() {
            if (unsubAuth) return;
            if (window.CalzadaAuth && typeof window.CalzadaAuth.onAuthStateChanged === 'function') {
                unsubAuth = window.CalzadaAuth.onAuthStateChanged((user) => {
                    syncUserAvatar();
                    if (user) {
                        tryRestorePendingHandoff();
                    }
                    loadReviews(true);
                });
            } else {
                setTimeout(ensureAuthListener, 200);
            }
        }
        ensureAuthListener();

        // Initial check in case user is already authenticated
        tryRestorePendingHandoff();

        // Initial load
        loadReviews(true);

        return {
            placeId,
            reload: () => loadReviews(true),
            destroy: () => {
                if (typeof unsubAuth === 'function') unsubAuth();
                container.innerHTML = '';
            }
        };
    }

    window.CalzadaReviewsUI = {
        mount
    };
})();
