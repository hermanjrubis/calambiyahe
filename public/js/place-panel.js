/**
 * place-panel.js
 * Handles the Side-by-Side Place Overview Panel logic for places.html
 */

function resolvePlaceImageUrl(path) {
    if (!path || typeof path !== 'string') return '../assets/hero-places-bg.png';
    const trimmed = path.trim();
    if (!trimmed) return '../assets/hero-places-bg.png';
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
        return trimmed;
    }
    if (trimmed.startsWith('../assets/')) {
        return trimmed;
    }
    if (trimmed.startsWith('/assets/')) {
        return '..' + trimmed;
    }
    if (trimmed.startsWith('assets/')) {
        return '../' + trimmed;
    }
    if (trimmed.startsWith('/public/assets/')) {
        return '..' + trimmed.slice('/public'.length);
    }
    if (trimmed.startsWith('public/assets/')) {
        return '../' + trimmed.slice('public'.length);
    }
    if (trimmed.startsWith('./assets/')) {
        return '.' + trimmed;
    }
    return trimmed;
}
window.resolvePlaceImageUrl = resolvePlaceImageUrl;

const placesData = {};

if (typeof window !== 'undefined') {
    window.placesData = Object.assign(window.placesData || {}, placesData);
}

let currentActivePlace = null;
let currentPlaceId = null;
let panelDOMInitialized = false;

// Inject Panel HTML into DOM
function initPlacePanelDOM() {
    if (panelDOMInitialized || document.getElementById('placePanel')) {
        panelDOMInitialized = true;
        return;
    }

    const panelHTML = `
        <div class="place-panel-backdrop" id="placePanelBackdrop"></div>
        <div class="place-panel-container" id="placePanel">
            <div class="panel-drag-handle"><div class="panel-drag-pill"></div></div>
            
            <!-- Hero Carousel / Image Container (12px radius) -->
            <div class="panel-hero" id="ppHero">
                <div class="panel-hero-skeleton" id="ppHeroSkeleton"></div>
                <div class="carousel-container" id="ppCarousel">
                    <div class="carousel-slides" id="ppCarouselSlides"></div>
                    <button class="carousel-nav carousel-prev" id="ppCarouselPrev" aria-label="Previous" type="button" style="visibility:hidden;pointer-events:none;">
                        <svg class="carousel-nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6l6 6"/></svg>
                    </button>
                    <button class="carousel-nav carousel-next" id="ppCarouselNext" aria-label="Next" type="button">
                        <svg class="carousel-nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6l-6 6"/></svg>
                    </button>
                    <div class="carousel-dots" id="ppCarouselDots"></div>
                </div>
            </div>


            <!-- Details Body -->
            <div class="panel-body" id="ppBody">
                <!-- Owner Banner (shown when place.ownerId === currentUser.uid) -->
                <div id="ppOwnerBanner" style="display:none; margin: 0 0 12px; padding: 10px 14px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; align-items: center; justify-content: space-between;">
                    <span style="font-size: 13px; font-weight: 500; color: #334155;">This is your business</span>
                    <a href="/pages/my-business.html" style="font-size: 13px; font-weight: 600; color: #378ADD; text-decoration: none;">Edit details →</a>
                </div>

                <!-- 1. Header Row: 18px semibold Name + Save & Close Actions side by side -->
                <div class="panel-header-row">
                    <h3 class="panel-place-title" id="ppName">Place Name</h3>
                    <div class="panel-header-actions">
                        <button class="panel-save-btn" id="ppSaveBtn" type="button" aria-label="Save place" title="Save place" aria-pressed="false">
                            <svg class="save-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                            </svg>
                        </button>
                        <button class="panel-close-btn" id="closePanelBtn" aria-label="Close details" type="button" title="Close details">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                </div>

                <!-- 2. Info Block with Hairline Dividers -->
                <div class="panel-info-block" id="ppInfoBlock">
                    <!-- Address Row -->
                    <div class="panel-info-row" id="ppRowAddress">
                        <div class="panel-info-icon" title="Address">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                <circle cx="12" cy="10" r="3"></circle>
                            </svg>
                        </div>
                        <div class="panel-info-text" id="ppAddress">--</div>
                    </div>

                    <!-- Hours Row with Expandable Accordion -->
                    <div class="panel-info-row panel-hours-row" id="ppRowHours">
                        <div class="panel-info-icon" title="Opening Hours">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                        </div>
                        <div class="panel-hours-wrapper" id="ppHoursWrapper">
                            <div class="panel-hours-header" id="ppHoursToggle">
                                <span class="panel-hours-status" id="ppHoursStatus">Open · Closes 5 PM</span>
                                <svg class="panel-hours-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="6 9 12 15 18 9"></polyline>
                                </svg>
                            </div>
                            <div class="panel-hours-dropdown" id="ppHoursDropdown">
                                <table class="panel-hours-table" id="ppHoursTable"></table>
                                <p class="panel-hours-note" id="ppHoursNote">Hours can change, especially on holidays.</p>
                            </div>
                        </div>
                    </div>

                    <!-- Offerings Row -->
                    <div class="panel-info-row" id="ppRowOfferings" style="display:none;">
                        <div class="panel-info-icon" title="Offerings">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                            </svg>
                        </div>
                        <div class="panel-info-text" id="ppOfferings" style="font-size: 13px; color: #475569; line-height: 1.4;">--</div>
                    </div>

                    <!-- Website Row -->
                    <div class="panel-info-row" id="ppRowWebsite">
                        <div class="panel-info-icon" title="Website">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="2" y1="12" x2="22" y2="12"></line>
                                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                            </svg>
                        </div>
                        <div class="panel-info-text">
                            <a href="#" target="_blank" rel="noopener noreferrer" class="panel-info-link" id="ppWebsite">--</a>
                        </div>
                    </div>

                    <!-- Phone Row -->
                    <div class="panel-info-row" id="ppRowPhone">
                        <div class="panel-info-icon" title="Phone">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                            </svg>
                        </div>
                        <div class="panel-info-text">
                            <a href="#" class="panel-info-link" id="ppPhone">--</a>
                        </div>
                    </div>

                    <!-- Facebook / Instagram page Row -->
                    <div class="panel-info-row" id="ppRowSocial">
                        <div class="panel-info-icon" title="Page">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M7 10v4h3v7h4v-7h3l1 -4h-4v-2a1 1 0 0 1 1 -1h3v-4h-3a5 5 0 0 0 -5 5v2h-3"></path>
                            </svg>
                        </div>
                        <div class="panel-info-text">
                            <a href="#" target="_blank" rel="noopener noreferrer" class="panel-info-link" id="ppSocial">--</a>
                        </div>
                    </div>

                    <!-- Updates Row -->
                    <div class="panel-info-row" id="ppRowUpdates" style="display:none;">
                        <div class="panel-info-icon" title="Updates">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                                <polyline points="22,6 12,13 2,6"/>
                            </svg>
                        </div>
                        <div class="panel-info-text">
                            <a href="#" class="panel-info-link" id="ppSeeUpdatesLink">See updates →</a>
                        </div>
                    </div>
                </div>

                <!-- 3. Rating & Reviews Section (Mounted by CalzadaReviewsUI) -->
                <div class="panel-rating-section" id="ppRatingCard">
                    <div id="ppReviewsBlock" class="reviews-mount-point"></div>
                </div>

                <!-- 5. Bottom Action: Plan Route Primary Button -->
                <div class="panel-bottom-section">
                    <button class="panel-cta-btn" id="ppPlanBtn" type="button">Plan route</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', panelHTML);
    panelDOMInitialized = true;

    const backdrop = document.getElementById('placePanelBackdrop');
    const closeBtn = document.getElementById('closePanelBtn');
    const planBtn = document.getElementById('ppPlanBtn');
    const hoursToggle = document.getElementById('ppHoursToggle');
    const hoursWrapper = document.getElementById('ppHoursWrapper');
    const saveBtn = document.getElementById('ppSaveBtn');
    const panel = document.getElementById('placePanel');

    // Remove will-change on transitionend
    if (panel) {
        panel.addEventListener('transitionend', (e) => {
            if (e.target === panel && e.propertyName === 'transform') {
                panel.style.willChange = '';
            }
        });
    }

    // Close Events
    function handleBackdropClose() {
        closePlacePanel();
    }
    function handleCloseBtn() {
        closePlacePanel();
    }
    if (backdrop) {
        backdrop.addEventListener('click', handleBackdropClose);
        if (typeof window.bindTap === 'function') window.bindTap(backdrop, handleBackdropClose);
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', handleCloseBtn);
        if (typeof window.bindTap === 'function') window.bindTap(closeBtn, handleCloseBtn);
    }

    // Mobile Sheet Drag Handle Gesture
    const dragHandle = document.querySelector('.panel-drag-handle');
    if (dragHandle) {
        let startY = 0;
        let currentY = 0;
        let isDragging = false;
        const panel = document.getElementById('placePanel');

        dragHandle.addEventListener('touchstart', (e) => {
            if (e.touches && e.touches.length > 0) {
                startY = e.touches[0].clientY;
                currentY = startY;
                isDragging = true;
            }
        }, { passive: true });

        dragHandle.addEventListener('touchmove', (e) => {
            if (!isDragging || !e.touches || e.touches.length === 0) return;
            currentY = e.touches[0].clientY;
            const deltaY = currentY - startY;
            if (deltaY > 0 && panel) {
                panel.style.transform = `translateY(${deltaY}px)`;
                panel.style.transition = 'none';
            }
        }, { passive: true });

        dragHandle.addEventListener('touchend', () => {
            if (!isDragging) return;
            isDragging = false;
            const deltaY = currentY - startY;
            if (panel) {
                panel.style.transform = '';
                panel.style.transition = '';
            }
            if (deltaY > 50) {
                closePlacePanel();
            }
        });

        dragHandle.addEventListener('click', () => {
            closePlacePanel();
        });
    }

    // Opening Hours Accordion Toggle
    function handleHoursToggle(e) {
        if (e && e.stopPropagation) e.stopPropagation();
        if (hoursWrapper) hoursWrapper.classList.toggle('expanded');
    }
    if (hoursToggle && hoursWrapper) {
        hoursToggle.addEventListener('click', handleHoursToggle);
        if (typeof window.bindTap === 'function') window.bindTap(hoursToggle, handleHoursToggle);
    }

    // Celebratory Confetti Burst for Bookmark Save (Delegates to shared bookmark-confetti.js)
    function triggerBookmarkCelebration(anchorEl) {
        if (!anchorEl) return;
        const celebrate = window.calzadaBookmarkCelebration || (typeof window.triggerBookmarkCelebration === 'function' && window.triggerBookmarkCelebration !== triggerBookmarkCelebration ? window.triggerBookmarkCelebration : null);
        if (celebrate) {
            celebrate(anchorEl);
        }
    }

    // Save Place Event
    function showSignInToSavePrompt() {
        const currentPath = encodeURIComponent(window.location.pathname + window.location.search);
        const loginUrl = `/login?redirect=${currentPath}`;
        const isTl = (window.currentLang === 'tl' || localStorage.getItem('calzada_lang') === 'tl');
        const msg = isTl ? 'Mag-sign in para mag-save' : 'Sign in to save';
        const actionText = isTl ? 'Mag-sign in' : 'Sign in';

        let toast = document.getElementById('signInToSaveToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'signInToSaveToast';
            toast.className = 'cz-signin-prompt-toast';
            document.body.appendChild(toast);
        }
        toast.innerHTML = `<span class="cz-prompt-msg">${msg}</span><a href="${loginUrl}" class="cz-prompt-link">${actionText}</a>`;
        toast.classList.add('visible');
        setTimeout(() => {
            toast.classList.remove('visible');
        }, 4500);
    }

    async function handleSavePlace(e) {
        if (e && e.stopPropagation) e.stopPropagation();
        if (!currentActivePlace) return;

        const user = window.CalzadaAuth?.getCurrentUser();
        if (!user || user.isAnonymous) {
            showSignInToSavePrompt();
            return;
        }

        const placeName = currentActivePlace.name;
        const category = currentActivePlace.category || 'Establishment';
        const isCurrentlySaved = saveBtn.classList.contains('saved');

        // Toggle visual state
        if (isCurrentlySaved) {
            saveBtn.classList.remove('saved');
            saveBtn.setAttribute('aria-pressed', 'false');
            saveBtn.setAttribute('aria-label', 'Save place');
            saveBtn.setAttribute('title', 'Save place');
        } else {
            saveBtn.classList.add('saved');
            saveBtn.setAttribute('aria-pressed', 'true');
            saveBtn.setAttribute('aria-label', 'Remove from saved');
            saveBtn.setAttribute('title', 'Remove from saved');
            triggerBookmarkCelebration(saveBtn);
        }

        // Sync with Calzada User Stats / Firestore
        if (typeof window.toggleSavePlace === 'function') {
            window.toggleSavePlace(placeName, category, currentPlaceId);
        } else if (window.CalzadaActivity) {
            if (isCurrentlySaved) {
                window.CalzadaActivity.unsavePlace(currentPlaceId || placeName);
            } else {
                window.CalzadaActivity.savePlace(currentPlaceId || placeName, placeName, { category });
            }
        }

        // Sync to backend endpoint (only if signed in)
        if (currentPlaceId) {
            try {
                const token = await fetchAuthToken();
                if (token) {
                    await fetch(`/api/places/${currentPlaceId}/save`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ saved: !isCurrentlySaved })
                    });
                }
            } catch (err) {
                console.warn('Backend save API sync:', err);
            }
        }
    }
    if (saveBtn) {
        saveBtn.addEventListener('click', handleSavePlace);
        if (typeof window.bindTap === 'function') window.bindTap(saveBtn, handleSavePlace);
    }

    function showPanelToast(msg, type = 'info') {
        if (typeof window.showToast === 'function') {
            return window.showToast(msg, type);
        }
        let toast = document.getElementById('calzadaPanelToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'calzadaPanelToast';
            toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#042C53;color:#ffffff;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:500;box-shadow:0 8px 24px rgba(0,0,0,0.2);z-index:10000;pointer-events:none;transition:opacity 0.25s ease;';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.style.opacity = '1';
        toast.style.display = 'block';
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300);
        }, 2500);
    }

    // Plan Route Event
    function handlePlanRoute() {
        const placeName = planBtn.getAttribute('data-dest') || (currentActivePlace && currentActivePlace.name);
        const rawLat = planBtn.getAttribute('data-lat') || (currentActivePlace && currentActivePlace.lat);
        const rawLng = planBtn.getAttribute('data-lng') || (currentActivePlace && (currentActivePlace.lng != null ? currentActivePlace.lng : currentActivePlace.lon));

        if (placeName) {
            const user = window.CalzadaAuth?.getCurrentUser();
            if (!user || user.isAnonymous) {
                const numLat = parseFloat(rawLat);
                const numLng = parseFloat(rawLng);
                const pending = {
                    dest: {
                        name: placeName,
                        lat: !isNaN(numLat) ? numLat : 0,
                        lng: !isNaN(numLng) ? numLng : 0
                    },
                    origin: { kind: 'my_location' },
                    mode: 'jeepney',
                    savedAt: Date.now()
                };
                try {
                    sessionStorage.setItem('calzada_pending_route', JSON.stringify(pending));
                } catch (_) {}

                const toastMsg = (typeof window.t === 'function' ? window.t('planner.gate_toast') : null) || 'Sign in to see your route';
                showPanelToast(toastMsg, 'info');

                setTimeout(() => {
                    window.location.href = '/login?redirect=%2Fplanner%3Fresume%3D1&reason=route';
                }, 900);
                return;
            }

            // Already on the planner: set the destination in place instead of reloading the page
            const inPlannerLat = parseFloat(rawLat);
            const inPlannerLng = parseFloat(rawLng);
            if (typeof window._calzadaSetDestination === 'function' && !isNaN(inPlannerLat) && !isNaN(inPlannerLng)) {
                closePlacePanel();
                if (typeof window.CalzadaPlannerCategory === 'object' && window.CalzadaPlannerCategory && typeof window.CalzadaPlannerCategory.closePanels === 'function') {
                    window.CalzadaPlannerCategory.closePanels();
                }
                window._calzadaSetDestination(placeName, [inPlannerLat, inPlannerLng]);
                return;
            }
            setTimeout(() => {
                const numLat = parseFloat(rawLat);
                const numLng = parseFloat(rawLng);
                const hasCoords = !isNaN(numLat) && !isNaN(numLng) && numLat !== 0 && numLng !== 0;
                let targetUrl;
                if (hasCoords) {
                    targetUrl = `/planner?destLat=${numLat}&destLng=${numLng}&destName=${encodeURIComponent(placeName)}&dlat=${numLat}&dlng=${numLng}&dest=${encodeURIComponent(placeName)}`;
                } else {
                    targetUrl = `/planner?dest=${encodeURIComponent(placeName)}&destName=${encodeURIComponent(placeName)}`;
                }
                window.location.href = targetUrl;
            }, 0);
        }
    }
    if (planBtn) {
        planBtn.addEventListener('click', handlePlanRoute);
        if (typeof window.bindTap === 'function') window.bindTap(planBtn, handlePlanRoute);
    }
}

// Inject on DOM Content Loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initPlacePanelDOM();
        handleUrlParamsOnLoad();
    });
} else {
    initPlacePanelDOM();
    handleUrlParamsOnLoad();
}

function handleUrlParamsOnLoad() {
    const urlParams = new URLSearchParams(window.location.search);
    const placeParam = urlParams.get('place');
    const placeLat = urlParams.get('lat') || urlParams.get('dlat') || urlParams.get('destLat');
    const placeLng = urlParams.get('lng') || urlParams.get('dlng') || urlParams.get('destLng');
    if (placeParam) {
        setTimeout(() => openPlacePanel(placeParam, placeLat ? parseFloat(placeLat) : undefined, placeLng ? parseFloat(placeLng) : undefined), 250);
    }
    
    // Handle back button closing panel
    window.addEventListener('popstate', () => {
        const params = new URLSearchParams(window.location.search);
        if (!params.has('place')) {
            closePlacePanel(false);
        }
    });
}


let currentCarouselIndex = 0;
window.currentCarouselIndex = 0;
let inline360Viewer = null;
let inline360PanoUrl = null;
let inline360Place = null;
let inline360Initialized = false;
let inline360LoadTimeout = null;
let inline360HintTimer = null;
let inline360HintShown = false;
let inline360SkeletonFadeTimer = null;
let inline360IdleWaitHandle = null;
let inline360IdleWaitIsTimeout = false;
let inline360RafWaitHandle = null;
let placePanel360ManifestCache = null;

function cancelViewerRenderWait() {
    if (inline360RafWaitHandle) {
        cancelAnimationFrame(inline360RafWaitHandle);
        inline360RafWaitHandle = null;
    }
    if (inline360IdleWaitHandle !== null) {
        if (inline360IdleWaitIsTimeout) {
            clearTimeout(inline360IdleWaitHandle);
        } else if (typeof window.cancelIdleCallback === 'function') {
            window.cancelIdleCallback(inline360IdleWaitHandle);
        }
        inline360IdleWaitHandle = null;
        inline360IdleWaitIsTimeout = false;
    }
}

function waitForFirstRender(callback) {
    cancelViewerRenderWait();
    inline360RafWaitHandle = requestAnimationFrame(() => {
        inline360RafWaitHandle = requestAnimationFrame(() => {
            inline360RafWaitHandle = null;
            if (typeof window.requestIdleCallback === 'function') {
                inline360IdleWaitIsTimeout = false;
                inline360IdleWaitHandle = window.requestIdleCallback(() => {
                    inline360IdleWaitHandle = null;
                    callback();
                }, { timeout: 600 });
            } else {
                inline360IdleWaitIsTimeout = true;
                inline360IdleWaitHandle = setTimeout(() => {
                    inline360IdleWaitHandle = null;
                    inline360IdleWaitIsTimeout = false;
                    callback();
                }, 300);
            }
        });
    });
}

async function fetchManifestNode(nodeId) {
    if (!nodeId) return null;
    if (!placePanel360ManifestCache) {
        try {
            const res = await fetch('../assets/360/manifest.json', { cache: 'no-cache' });
            if (res.ok) {
                const data = await res.json();
                placePanel360ManifestCache = {};
                (data.nodes || []).forEach(n => {
                    placePanel360ManifestCache[n.id] = n;
                });
            }
        } catch (e) {
            console.warn('[360 Manifest] Could not load manifest.json in place-panel:', e);
        }
    }
    if (placePanel360ManifestCache && placePanel360ManifestCache[nodeId]) {
        return placePanel360ManifestCache[nodeId];
    }
    if (nodeId === '14.202352_121.158453') {
        return {
            id: '14.202352_121.158453',
            file: '14.202352, 121.158453.jpg',
            northOffset: 61.5
        };
    }
    return null;
}

function hideFirstTimeHint(instant = false) {
    if (inline360HintTimer) {
        clearTimeout(inline360HintTimer);
        inline360HintTimer = null;
    }
    const hint = document.getElementById('ppInline360Hint');
    if (hint) {
        if (window._inline360HintAnimEndHandler) {
            hint.removeEventListener('animationend', window._inline360HintAnimEndHandler);
            window._inline360HintAnimEndHandler = null;
        }
        hint.classList.remove('entering');
        if (instant) {
            hint.classList.remove('hiding');
            hint.style.display = 'none';
        } else {
            hint.classList.add('hiding');
            setTimeout(() => {
                if (hint.classList.contains('hiding')) {
                    hint.style.display = 'none';
                    hint.classList.remove('hiding');
                }
            }, 180);
        }
    }
    const container = document.getElementById('ppInline360Container');
    if (container && window._inline360HintDismissHandler) {
        container.removeEventListener('pointerdown', window._inline360HintDismissHandler, true);
        container.removeEventListener('touchstart', window._inline360HintDismissHandler, true);
        container.removeEventListener('mousedown', window._inline360HintDismissHandler, true);
        container.removeEventListener('wheel', window._inline360HintDismissHandler, true);
        window._inline360HintDismissHandler = null;
    }
}

function destroyInline360Viewer() {
    cancelViewerRenderWait();
    hideFirstTimeHint(true);
    inline360HintShown = false;
    if (inline360SkeletonFadeTimer) {
        clearTimeout(inline360SkeletonFadeTimer);
        inline360SkeletonFadeTimer = null;
    }
    if (inline360LoadTimeout) {
        clearTimeout(inline360LoadTimeout);
        inline360LoadTimeout = null;
    }
    if (inline360Viewer) {
        try {
            inline360Viewer.destroy();
        } catch (_) {}
        inline360Viewer = null;
    }
    window._inline360Viewer = null;
    window.inline360Viewer = null;
    const container = document.getElementById('ppInline360Container');
    if (container) {
        container.innerHTML = '';
    }
    inline360Initialized = false;
    inline360Place = null;
    inline360PanoUrl = null;
}
window.destroyInline360Viewer = destroyInline360Viewer;

function attachInline360Containment(containerEl) {
    if (!containerEl) return;

    // Prevent scrolling parent .panel-body or page during 360 touch drag & pinch
    containerEl.addEventListener('touchmove', (e) => {
        e.preventDefault();
    }, { passive: false });

    // Prevent wheel from scrolling the page or panel-body, while letting Pannellum zoom
    containerEl.addEventListener('wheel', (e) => {
        e.preventDefault();
    }, { passive: false });

    // Prevent Safari/iOS pinch-to-zoom on the webpage
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(evt => {
        containerEl.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, { passive: false });
    });
}

function triggerInline360Error() {
    cancelViewerRenderWait();
    if (inline360LoadTimeout) {
        clearTimeout(inline360LoadTimeout);
        inline360LoadTimeout = null;
    }
    if (inline360SkeletonFadeTimer) {
        clearTimeout(inline360SkeletonFadeTimer);
        inline360SkeletonFadeTimer = null;
    }
    hideFirstTimeHint(true);
    const skeleton = document.getElementById('ppInline360Skeleton');
    if (skeleton) skeleton.style.display = 'none';
    const errorPanel = document.getElementById('ppInline360Error');
    if (errorPanel) errorPanel.style.display = 'flex';
}

function showFirstTimeHint() {
    let seen = false;
    try {
        seen = localStorage.getItem('calzada_360_hint_seen') === '1';
    } catch (_) {
        seen = Boolean(window._calzada360HintSeen);
    }
    if (seen || inline360HintShown) return;

    // Check popup is open and user is currently on slide 2
    const panel = document.getElementById('placePanel');
    if (!panel || !panel.classList.contains('active')) return;
    if (currentCarouselIndex !== 1) return;

    // Viewer must be loaded and skeleton gone
    if (!inline360Viewer || (typeof inline360Viewer.isLoaded === 'function' && !inline360Viewer.isLoaded())) return;
    const errorPanel = document.getElementById('ppInline360Error');
    if (errorPanel && (errorPanel.style.display === 'flex' || window.getComputedStyle(errorPanel).display === 'flex')) return;
    const skeleton = document.getElementById('ppInline360Skeleton');
    if (skeleton && (skeleton.style.display !== 'none' || skeleton.style.opacity === '1')) return;

    const hint = document.getElementById('ppInline360Hint');
    if (!hint) return;

    // Mark seen only when hint is actually shown
    inline360HintShown = true;
    try {
        localStorage.setItem('calzada_360_hint_seen', '1');
    } catch (_) {
        window._calzada360HintSeen = true;
    }

    hint.style.display = 'flex';
    hint.classList.remove('hiding');
    hint.classList.add('entering');

    if (inline360HintTimer) {
        clearTimeout(inline360HintTimer);
        inline360HintTimer = null;
    }
    if (window._inline360HintAnimEndHandler) {
        hint.removeEventListener('animationend', window._inline360HintAnimEndHandler);
        window._inline360HintAnimEndHandler = null;
    }

    function onDismiss() {
        hideFirstTimeHint(false);
    }
    window._inline360HintDismissHandler = onDismiss;

    function startTimer() {
        if (inline360HintTimer) {
            clearTimeout(inline360HintTimer);
            inline360HintTimer = null;
        }
        inline360HintTimer = setTimeout(onDismiss, 2500);
    }

    const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
        startTimer();
    } else {
        let safetyTimer = null;
        const onAnimationEnd = (e) => {
            if (e && (e.target !== hint || e.animationName !== 'hintEnter')) return;
            if (safetyTimer) {
                clearTimeout(safetyTimer);
                safetyTimer = null;
            }
            hint.removeEventListener('animationend', onAnimationEnd);
            window._inline360HintAnimEndHandler = null;
            startTimer();
        };
        window._inline360HintAnimEndHandler = onAnimationEnd;
        hint.addEventListener('animationend', onAnimationEnd);
        safetyTimer = setTimeout(onAnimationEnd, 600);
    }

    const container = document.getElementById('ppInline360Container');
    if (container) {
        container.addEventListener('pointerdown', onDismiss, { capture: true, once: true });
        container.addEventListener('touchstart', onDismiss, { capture: true, once: true });
        container.addEventListener('mousedown', onDismiss, { capture: true, once: true });
        container.addEventListener('wheel', onDismiss, { capture: true, once: true });
    }
}


// The signed-in user, from firebase-init.js (modular SDK; there is no firebase.auth() global)
function currentPanelUser() {
    try { return window.CalzadaAuth && window.CalzadaAuth.getCurrentUser ? window.CalzadaAuth.getCurrentUser() : null; }
    catch (_) { return null; }
}

// A business tour as Pannellum scenes. The admin publishes tour360.photos [{url, thumbUrl, label}];
// older data may already be { scenes, defaultScene }.
function tourScenesOf(place) {
    const t = place && place.tour360;
    if (!t) return null;
    if (Array.isArray(t.photos) && t.photos.length) {
        const scenes = {};
        t.photos.forEach((p, i) => {
            if (p && typeof p.url === 'string' && p.url) scenes['s' + i] = { title: p.label || '', panorama: p.url };
        });
        const keys = Object.keys(scenes);
        return keys.length ? { scenes, defaultScene: keys[0] } : null;
    }
    if (t.scenes && typeof t.scenes === 'object' && Object.keys(t.scenes).length) {
        return { scenes: t.scenes, defaultScene: t.defaultScene };
    }
    return null;
}

// Label of the current view, and tabs to move between views when there are several
function addTourSceneTabs(container, viewer, scenes, firstKey) {
    const keys = Object.keys(scenes);
    if (!keys.length || !container) return;
    const bar = document.createElement('div');
    bar.className = 'pp-tour-tabs';
    bar.style.cssText = 'position:absolute;left:10px;bottom:40px;z-index:5;display:flex;gap:6px;max-width:calc(100% - 20px);overflow-x:auto;scrollbar-width:none;';
    const paint = (active) => {
        bar.querySelectorAll('button').forEach((b) => {
            const on = b.dataset.scene === active;
            b.style.background = on ? '#378ADD' : '#FFFFFF';
            b.style.color = on ? '#FFFFFF' : '#042C53';
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    };
    keys.forEach((k, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.scene = k;
        b.textContent = scenes[k].title || ('View ' + (i + 1));
        b.style.cssText = 'flex:0 0 auto;border:1px solid #E2E8F0;border-radius:8px;padding:5px 10px;font:600 12px Outfit,system-ui,sans-serif;cursor:' + (keys.length > 1 ? 'pointer' : 'default') + ';';
        if (keys.length > 1) {
            b.addEventListener('click', (e) => {
                e.stopPropagation();
                try { viewer.loadScene(k); } catch (_) {}
                paint(k);
            });
        }
        bar.appendChild(b);
    });
    paint(firstKey || keys[0]);
    try { viewer.on('scenechange', (k) => paint(k)); } catch (_) {}
    container.appendChild(bar);
}

async function initInline360Viewer(place) {
    if (!place) return;
    if (place.name && typeof window !== 'undefined' && window.placesData && window.placesData[place.name]) {
        place = { ...place, ...window.placesData[place.name] };
    }
    const container = document.getElementById('ppInline360Container');
    const skeleton = document.getElementById('ppInline360Skeleton');
    const errorPanel = document.getElementById('ppInline360Error');
    const retryBtn = document.getElementById('ppInline360RetryBtn');
    const fsBtn = document.getElementById('ppHeroFullscreenBtn');
    if (!container) return;

    if (skeleton) {
        skeleton.style.display = 'flex';
        skeleton.style.opacity = '1';
    }
    if (errorPanel) {
        errorPanel.style.display = 'none';
    }

    if (inline360LoadTimeout) {
        clearTimeout(inline360LoadTimeout);
        inline360LoadTimeout = null;
    }

    if (inline360Viewer) {
        try { inline360Viewer.destroy(); } catch (_) {}
        inline360Viewer = null;
    }
    container.innerHTML = '';

    // Multi-scene business tour360 (published by the admin as tour360.photos)
    const tour = tourScenesOf(place);
    if (tour && window.pannellum) {
        const scenesObj = {};
        for (const [sKey, sVal] of Object.entries(tour.scenes)) {
            scenesObj[sKey] = {
                title: sVal.title || '',
                type: 'equirectangular',
                panorama: sVal.panorama,
                hotSpots: sVal.hotSpots || []
            };
        }
        const defaultScene = tour.defaultScene || Object.keys(scenesObj)[0];
        try {
            inline360Viewer = window.pannellum.viewer('ppInline360Container', {
                default: {
                    firstScene: defaultScene,
                    sceneFadeDuration: 1000,
                    autoLoad: true,
                    showControls: false,
                    showFullscreenCtrl: false,
                    showZoomCtrl: false,
                    mouseZoom: true,
                    draggable: true,
                    keyboardZoom: true,
                    hfov: 100,
                    minHfov: 50,
                    maxHfov: 120,
                    autoRotate: 0,
                    compass: false,
                    friction: 0.15
                },
                scenes: scenesObj
            });
            window._inline360Viewer = inline360Viewer;
            window.inline360Viewer = inline360Viewer;

            if (fsBtn) {
                fsBtn.onclick = (e) => {
                    if (e && e.stopPropagation) e.stopPropagation();
                    try { inline360Viewer.toggleFullscreen(); } catch (_) {}
                };
            }

            inline360Viewer.on('load', () => {
                if (inline360LoadTimeout) clearTimeout(inline360LoadTimeout);
                if (skeleton) skeleton.style.display = 'none';
                waitForFirstRender(() => {
                    if (skeleton) skeleton.style.display = 'none';
                    showFirstTimeHint();
                });
            });
            inline360Viewer.on('error', () => triggerInline360Error());
            addTourSceneTabs(container, inline360Viewer, scenesObj, defaultScene);
            return;
        } catch (err) {
            console.warn('[Inline360] tour360 init error:', err);
            triggerInline360Error();
            return;
        }
    }

    let panoUrl = null;
    let northOffsetVal = 0;
    const fallbackNodeId = place.fallbackNodeId;

    if (fallbackNodeId) {
        let nodeConfig = await fetchManifestNode(fallbackNodeId);
        if (!nodeConfig && fallbackNodeId === '14.202352_121.158453') {
            nodeConfig = { file: '14.202352, 121.158453.jpg', northOffset: 61.5 };
        }
        if (nodeConfig && nodeConfig.file) {
            panoUrl = `../assets/360/${encodeURIComponent(nodeConfig.file)}`;
            northOffsetVal = nodeConfig.northOffset || 0;
        } else {
            const defaultFilename = `${fallbackNodeId.replace('_', ', ')}.jpg`;
            panoUrl = `../assets/360/${encodeURIComponent(defaultFilename)}`;
        }
    } else if (place.tour360 && place.tour360.panorama) {
        panoUrl = place.tour360.panorama;
    } else if (place.pano) {
        panoUrl = resolvePlaceImageUrl(place.pano);
    }

    if (!panoUrl) {
        triggerInline360Error();
        return;
    }

    inline360PanoUrl = panoUrl;

    if (retryBtn) {
        function onRetryAction(e) {
            if (e && e.stopPropagation) e.stopPropagation();
            initInline360Viewer(place);
        }
        retryBtn.onclick = onRetryAction;
        if (typeof window.bindTap === 'function') window.bindTap(retryBtn, onRetryAction);
    }

    if (fsBtn) {
        function onFsAction(e) {
            if (e && e.stopPropagation) e.stopPropagation();
            if (fallbackNodeId) {
                if (typeof window.launch360Viewer === 'function') {
                    window.launch360Viewer(fallbackNodeId);
                } else if (typeof window._open360Viewer === 'function') {
                    window._open360Viewer(fallbackNodeId);
                }
            } else if (place.pano) {
                let curYaw = 0;
                let curPitch = -5;
                let curHfov = 100;
                if (inline360Viewer) {
                    try {
                        curYaw = inline360Viewer.getYaw();
                        curPitch = inline360Viewer.getPitch();
                        curHfov = inline360Viewer.getHfov();
                    } catch (_) {}
                }
                launchPlacePano(place.pano, place.name, {
                    yaw: curYaw,
                    pitch: curPitch,
                    hfov: curHfov
                });
            }
        }
        fsBtn.onclick = onFsAction;
        if (typeof window.bindTap === 'function') window.bindTap(fsBtn, onFsAction);
    }

    inline360LoadTimeout = setTimeout(() => {
        triggerInline360Error();
    }, 15000);

    try {
        inline360Viewer = window.pannellum.viewer('ppInline360Container', {
            type: 'equirectangular',
            panorama: panoUrl,
            autoLoad: true,
            showControls: false,
            showFullscreenCtrl: false,
            showZoomCtrl: false,
            mouseZoom: true,
            draggable: true,
            keyboardZoom: true,
            hfov: 100,
            minHfov: 50,
            maxHfov: 120,
            autoRotate: 0,
            compass: false,
            friction: 0.15,
            northOffset: northOffsetVal || 0
        });

        window._inline360Viewer = inline360Viewer;
        window.inline360Viewer = inline360Viewer;

        inline360Viewer.on('load', () => {
            if (inline360LoadTimeout) {
                clearTimeout(inline360LoadTimeout);
                inline360LoadTimeout = null;
            }
            if (skeleton) {
                skeleton.style.opacity = '0';
                if (inline360SkeletonFadeTimer) {
                    clearTimeout(inline360SkeletonFadeTimer);
                }
                inline360SkeletonFadeTimer = setTimeout(() => {
                    skeleton.style.display = 'none';
                    inline360SkeletonFadeTimer = null;
                }, 200);
            }
            // Wait until first frames are actually rendered before showing hint:
            // two requestAnimationFrame callbacks plus a short idle wait (requestIdleCallback with a 600 ms timeout, falling back to setTimeout 300 ms)
            waitForFirstRender(() => {
                const panel = document.getElementById('placePanel');
                if (!panel || !panel.classList.contains('active')) return;
                if (currentCarouselIndex !== 1) return;
                if (skeleton) skeleton.style.display = 'none';
                showFirstTimeHint();
            });
        });

        inline360Viewer.on('error', () => {
            triggerInline360Error();
        });
    } catch (err) {
        console.warn('[Inline360] init error:', err);
        triggerInline360Error();
    }
}

function setupCarousel(place) {
    const slidesContainer = document.getElementById('ppCarouselSlides');
    const dotsContainer = document.getElementById('ppCarouselDots');
    const prevBtn = document.getElementById('ppCarouselPrev');
    const nextBtn = document.getElementById('ppCarouselNext');
    const carouselEl = document.getElementById('ppCarousel');
    const heroSkeleton = document.getElementById('ppHeroSkeleton');

    if (!slidesContainer) return;

    // Reset previous inline 360 viewer instance
    destroyInline360Viewer();
    inline360Place = place;
    inline360Initialized = false;

    const placeName = place?.name || '';
    const rawPhoto = place?.photo !== undefined ? place.photo : (place?.image_path || place?.image || null);
    const photo = (typeof rawPhoto === 'string' && rawPhoto.trim() !== '' && !rawPhoto.includes('hero-places-bg'))
        ? rawPhoto.trim()
        : null;
    const resolvedPhotoUrl = photo ? resolvePlaceImageUrl(photo) : null;

    // Check if Slide 1 already exists with matching photo
    const existingSlide1 = slidesContainer.querySelector('.carousel-slide-wrap');
    const existingImg = existingSlide1?.querySelector('img.carousel-slide');
    let canKeepSlide1 = false;
    if (existingImg && resolvedPhotoUrl) {
        const existingSrc = existingImg.src || existingImg.getAttribute('src');
        if (existingSrc === resolvedPhotoUrl || (photo && existingSrc.endsWith(photo))) {
            canKeepSlide1 = true;
        }
    }

    if (canKeepSlide1) {
        while (slidesContainer.children.length > 1) {
            slidesContainer.removeChild(slidesContainer.lastChild);
        }
    } else {
        slidesContainer.innerHTML = '';
    }

    if (dotsContainer) dotsContainer.innerHTML = '';
    currentCarouselIndex = 0;
    window.currentCarouselIndex = 0;

    const pano = (place?.pano && typeof place.pano === 'string' && place.pano.trim() !== '')
        ? place.pano.trim()
        : null;

    // Check Street View fallback (e.g. STI College fallback from place-links.json)
    const fallbackNodeId = place?.fallbackNodeId || null;
    const hasTour360 = Boolean(tourScenesOf(place) || place?.tour360?.panorama);
    const isBusiness = Boolean(place?.source === 'business' || place?.businessId || (place?.id && String(place.id).startsWith('biz_')));
    const has360Plan = Boolean(place?.has360 || place?.plan === 'plus360' || place?.plan === 'featured');
    const hasPano = Boolean(pano || fallbackNodeId || hasTour360);
    const show360ComingSoon = isBusiness && has360Plan && !hasTour360;
    const hasSlide2 = hasPano || show360ComingSoon || (!isBusiness);

    // --- SLIDE 1: Establishment Photo ---
    if (!canKeepSlide1) {
        const slide1Wrap = document.createElement('div');
        slide1Wrap.className = 'carousel-slide-wrap';

        const chip1 = document.createElement('span');
        chip1.className = 'hero-slide-chip';
        chip1.id = 'ppHeroChipPhoto';
        chip1.textContent = typeof window.t === 'function' ? window.t('places.popup.chip_photo') : 'Photo';
        slide1Wrap.appendChild(chip1);

        if (photo) {
            if (heroSkeleton) heroSkeleton.style.display = 'block';
            const imgEl = document.createElement('img');
            imgEl.className = 'carousel-slide';
            imgEl.alt = `${placeName} photo`;
            imgEl.src = resolvedPhotoUrl;

            function revealPhoto() {
                imgEl.classList.add('photo-fade-in');
                if (heroSkeleton) heroSkeleton.style.display = 'none';
            }

            if (imgEl.complete && imgEl.naturalWidth > 0) {
                revealPhoto();
            } else {
                imgEl.addEventListener('load', revealPhoto, { once: true });
                imgEl.addEventListener('error', () => {
                    if (heroSkeleton) heroSkeleton.style.display = 'none';
                    renderPhotoPlaceholder(slide1Wrap);
                }, { once: true });
            }
            slide1Wrap.appendChild(imgEl);
        } else {
            if (heroSkeleton) heroSkeleton.style.display = 'none';
            renderPhotoPlaceholder(slide1Wrap);
        }

        slidesContainer.appendChild(slide1Wrap);
    }

    // --- SLIDE 2: 360° of the Establishment ---
    const slide2Wrap = document.createElement('div');
    slide2Wrap.className = 'carousel-slide-wrap';
    slide2Wrap.id = 'ppSlide2Wrap';

    const chip2 = document.createElement('span');
    chip2.className = 'hero-slide-chip';
    chip2.id = 'ppHeroChipPano';
    chip2.textContent = typeof window.t === 'function' ? window.t('places.popup.chip_360') : '360°';
    slide2Wrap.appendChild(chip2);

    if (hasPano) {
        // Container for Pannellum
        const inlineContainer = document.createElement('div');
        inlineContainer.className = 'inline-360-container';
        inlineContainer.id = 'ppInline360Container';
        inlineContainer.setAttribute('role', 'application');
        inlineContainer.setAttribute('tabindex', '0');
        const ariaLabel = typeof window.t === 'function'
            ? window.t('places.popup.aria_360_label', { name: placeName })
            : `${placeName} 360° view`;
        inlineContainer.setAttribute('aria-label', ariaLabel);
        attachInline360Containment(inlineContainer);
        slide2Wrap.appendChild(inlineContainer);

        // Skeleton overlay
        const skeleton = document.createElement('div');
        skeleton.className = 'inline-360-skeleton';
        skeleton.id = 'ppInline360Skeleton';
        const loadText = typeof window.t === 'function' ? window.t('places.popup.loading_360') : 'Loading 360°…';
        skeleton.innerHTML = `
            <svg class="inline-360-skeleton-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 15.328c2.414 -.718 4 -1.94 4 -3.328c0 -2.21 -4.03 -4 -9 -4s-9 1.79 -9 4s4.03 4 9 4"/>
                <path d="M9 13l3 3l-3 3"/>
            </svg>
            <p class="inline-360-skeleton-text" id="ppInline360LoadingText">${loadText}</p>
        `;
        slide2Wrap.appendChild(skeleton);

        // Error panel
        const errorPanel = document.createElement('div');
        errorPanel.className = 'inline-360-error';
        errorPanel.id = 'ppInline360Error';
        errorPanel.style.display = 'none';
        const errText = typeof window.t === 'function' ? window.t('places.popup.error_360') : "Couldn't load the 360° view.";
        const retText = typeof window.t === 'function' ? window.t('places.popup.retry') : 'Retry';
        errorPanel.innerHTML = `
            <svg class="inline-360-error-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="9"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p class="inline-360-error-text" id="ppInline360ErrorText">${errText}</p>
            <button type="button" class="inline-360-retry-btn" id="ppInline360RetryBtn">${retText}</button>
        `;
        slide2Wrap.appendChild(errorPanel);

        // Fullscreen button
        const fsBtn = document.createElement('button');
        fsBtn.type = 'button';
        fsBtn.className = 'hero-fullscreen-btn';
        fsBtn.id = 'ppHeroFullscreenBtn';
        const fsAria = typeof window.t === 'function' ? window.t('places.popup.fullscreen') : 'Full screen';
        fsBtn.setAttribute('aria-label', fsAria);
        fsBtn.innerHTML = `
            <svg class="hero-fullscreen-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 8v-2a2 2 0 0 1 2 -2h2"/>
                <path d="M4 16v2a2 2 0 0 0 2 2h2"/>
                <path d="M16 4h2a2 2 0 0 1 2 2v2"/>
                <path d="M16 20h2a2 2 0 0 0 2 -2v-2"/>
            </svg>
        `;
        slide2Wrap.appendChild(fsBtn);

        // First-time hint
        const hint = document.createElement('div');
        hint.className = 'inline-360-hint';
        hint.id = 'ppInline360Hint';
        hint.setAttribute('role', 'status');
        hint.setAttribute('aria-live', 'polite');
        hint.style.display = 'none';
        const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
        const hintLine1 = typeof window.t === 'function' ? window.t('places.popup.hint_drag') : 'Drag to look around';
        const hintLine2Key = isTouch ? 'places.popup.hint_zoom_touch' : 'places.popup.hint_zoom_desktop';
        const hintLine2 = typeof window.t === 'function' ? window.t(hintLine2Key) : (isTouch ? 'Pinch to zoom' : 'Scroll to zoom');
        hint.innerHTML = `
            <div class="inline-360-hint-icon-circle">
                <svg class="inline-360-hint-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M8 13v-8.5a1.5 1.5 0 0 1 3 0v7.5"/>
                    <path d="M11 11.5v-2a1.5 1.5 0 0 1 3 0v2.5"/>
                    <path d="M14 10.5a1.5 1.5 0 0 1 3 0v1.5"/>
                    <path d="M17 11.5a1.5 1.5 0 0 1 3 0v4.5a6 6 0 0 1 -6 6h-2h.208a6 6 0 0 1 -5.012 -2.7a69.74 69.74 0 0 1 -.196 -.3c-.312 -.479 -1.407 -2.388 -3.286 -5.728a1.5 1.5 0 0 1 .536 -2.022a1.867 1.867 0 0 1 2.28 .28l1.47 1.47"/>
                </svg>
            </div>
            <div class="inline-360-hint-text">
                <span class="inline-360-hint-line1" id="ppInline360HintLine1">${hintLine1}</span>
                <span class="inline-360-hint-line2" id="ppInline360HintLine2">${hintLine2}</span>
            </div>
        `;
        slide2Wrap.appendChild(hint);
    } else if (show360ComingSoon) {
        const comingSoonSlide = document.createElement('div');
        comingSoonSlide.className = 'hero-placeholder-slide';
        comingSoonSlide.style.padding = '0';
        comingSoonSlide.innerHTML = `
            <div class="hero-360-coming-soon" style="position: relative; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; background: #0F172A; text-align: center; padding: 24px;">
                ${resolvedPhotoUrl ? `<img src="${escapeHtml(resolvedPhotoUrl)}" alt="" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.4;">` : ''}
                <div style="position: relative; z-index: 2; display: flex; flex-direction: column; align-items: center; gap: 8px;">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#378ADD" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="9"/>
                        <path d="M3.6 9h16.8M3.6 15h16.8"/>
                        <path d="M11.5 3a17 17 0 0 0 0 18M12.5 3a17 17 0 0 1 0 18"/>
                    </svg>
                    <span style="font-size: 16px; font-weight: 600; color: #FFFFFF;">360° tour coming soon</span>
                    <span style="font-size: 13px; color: #CBD5E1;">Our team will visit to capture it</span>
                </div>
            </div>
        `;
        slide2Wrap.appendChild(comingSoonSlide);
    } else {
        const placeholderSlide = document.createElement('div');
        placeholderSlide.className = 'hero-placeholder-slide';
        placeholderSlide.innerHTML = `
            <svg class="hero-placeholder-icon" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#378ADD" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="9"/>
                <path d="M3.6 9h16.8M3.6 15h16.8"/>
                <path d="M11.5 3a17 17 0 0 0 0 18M12.5 3a17 17 0 0 1 0 18"/>
            </svg>
            <span class="hero-placeholder-text" id="ppPanoComingSoonText">${typeof window.t === 'function' ? window.t('places.popup.pano_coming_soon') : '360° view coming soon'}</span>
        `;
        slide2Wrap.appendChild(placeholderSlide);
    }

    if (hasSlide2) {
        slidesContainer.appendChild(slide2Wrap);
    }

    // --- DOTS & NAV: Only if hasSlide2 ---
    if (!hasSlide2) {
        if (dotsContainer) dotsContainer.style.display = 'none';
        if (prevBtn) prevBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';
    } else if (dotsContainer) {
        const dot1Aria = typeof window.t === 'function' ? window.t('places.popup.dot_photo') : 'Slide 1 of 2 – Photo';
        const dot2Aria = typeof window.t === 'function' ? window.t('places.popup.dot_360') : 'Slide 2 of 2 – 360°';
        dotsContainer.innerHTML = `
            <button type="button" class="carousel-dot active" data-index="0" aria-label="${dot1Aria}" tabindex="0" aria-current="true"></button>
            <button type="button" class="carousel-dot" data-index="1" aria-label="${dot2Aria}" tabindex="0"></button>
        `;
        dotsContainer.style.display = 'flex';
        const dots = dotsContainer.querySelectorAll('.carousel-dot');
        dots.forEach((dot, idx) => {
            function onDotAction(e) {
                if (e && e.stopPropagation) e.stopPropagation();
                goToCarouselSlide(idx);
            }
            dot.onclick = onDotAction;
            if (typeof window.bindTap === 'function') window.bindTap(dot, onDotAction);
            dot.onkeydown = (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onDotAction(e);
                }
            };
        });
    }

    // --- ARROWS ---
    if (prevBtn && nextBtn) {
        prevBtn.style.display = 'flex';
        nextBtn.style.display = 'flex';
        prevBtn.style.visibility = 'hidden';
        prevBtn.style.pointerEvents = 'none';
        nextBtn.style.visibility = 'visible';
        nextBtn.style.pointerEvents = 'auto';
        prevBtn.setAttribute('aria-label', typeof window.t === 'function' ? window.t('places.popup.prev') : 'Previous');
        nextBtn.setAttribute('aria-label', typeof window.t === 'function' ? window.t('places.popup.next') : 'Next');

        function onPrevClick(e) {
            if (e && e.stopPropagation) e.stopPropagation();
            goToCarouselSlide(0);
        }
        function onNextClick(e) {
            if (e && e.stopPropagation) e.stopPropagation();
            goToCarouselSlide(1);
        }

        prevBtn.onclick = onPrevClick;
        nextBtn.onclick = onNextClick;
        if (typeof window.bindTap === 'function') {
            window.bindTap(prevBtn, onPrevClick);
            window.bindTap(nextBtn, onNextClick);
        }
    }

    // --- TOUCH SWIPE ---
    if (carouselEl) {
        let touchStartX = 0;
        let touchStartY = 0;

        carouselEl.ontouchstart = (e) => {
            if (e.target && e.target.closest('#ppInline360Container')) return;
            if (e.touches && e.touches.length > 0) {
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
            }
        };

        carouselEl.ontouchend = (e) => {
            if (e.target && e.target.closest('#ppInline360Container')) return;
            if (e.changedTouches && e.changedTouches.length > 0) {
                const touchEndX = e.changedTouches[0].clientX;
                const touchEndY = e.changedTouches[0].clientY;
                const diffX = touchStartX - touchEndX;
                const diffY = touchStartY - touchEndY;

                // Swipe on slide 1 goes to slide 2; swipe on slide 2 does NOT change slides
                if (Math.abs(diffX) > 35 && Math.abs(diffX) > Math.abs(diffY)) {
                    if (currentCarouselIndex === 0 && diffX > 0) {
                        goToCarouselSlide(1);
                    }
                }
            }
        };
    }

    goToCarouselSlide(0);
}

function renderPhotoPlaceholder(container) {
    const existing = container.querySelector('.hero-placeholder-slide');
    if (existing) return;
    const placeholder = document.createElement('div');
    placeholder.className = 'hero-placeholder-slide';
    placeholder.innerHTML = `
        <svg class="hero-placeholder-icon" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#378ADD" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 9h1M9 13h1M9 17h1M14 9h1M14 13h1M14 17h1"/>
        </svg>
        <span class="hero-placeholder-text" id="ppPhotoComingSoonText">${typeof window.t === 'function' ? window.t('places.popup.photo_coming_soon') : 'Photo coming soon'}</span>
    `;
    container.appendChild(placeholder);
}

function goToCarouselSlide(index) {
    index = Math.max(0, Math.min(1, index));
    currentCarouselIndex = index;
    window.currentCarouselIndex = index;

    const slidesContainer = document.getElementById('ppCarouselSlides');
    if (slidesContainer) {
        slidesContainer.style.transform = `translateX(-${index * 100}%)`;
    }

    const dots = document.querySelectorAll('#ppCarouselDots .carousel-dot');
    dots.forEach((dot, idx) => {
        if (idx === index) {
            dot.classList.add('active');
            dot.setAttribute('aria-current', 'true');
        } else {
            dot.classList.remove('active');
            dot.removeAttribute('aria-current');
        }
    });

    const prevBtn = document.getElementById('ppCarouselPrev');
    const nextBtn = document.getElementById('ppCarouselNext');
    if (prevBtn && nextBtn) {
        if (index === 0) {
            prevBtn.style.visibility = 'hidden';
            prevBtn.style.pointerEvents = 'none';
            nextBtn.style.visibility = 'visible';
            nextBtn.style.pointerEvents = 'auto';
        } else {
            prevBtn.style.visibility = 'visible';
            prevBtn.style.pointerEvents = 'auto';
            nextBtn.style.visibility = 'hidden';
            nextBtn.style.pointerEvents = 'none';
        }
    }

    // Lazy initialization & resize of inline 360 viewer
    if (index === 0) {
        cancelViewerRenderWait();
        hideFirstTimeHint(true);
    } else if (index === 1 && inline360Place) {
        const hasPano = Boolean(inline360Place.pano || inline360Place.fallbackNodeId || tourScenesOf(inline360Place) || inline360Place.tour360?.panorama);
        if (hasPano) {
            if (!inline360Initialized) {
                inline360Initialized = true;
                initInline360Viewer(inline360Place);
            } else if (inline360Viewer) {
                requestAnimationFrame(() => {
                    try { inline360Viewer.resize(); } catch (_) {}
                });
                if (typeof inline360Viewer.isLoaded === 'function' && inline360Viewer.isLoaded()) {
                    const skeleton = document.getElementById('ppInline360Skeleton');
                    if (!skeleton || skeleton.style.display === 'none') {
                        waitForFirstRender(() => {
                            const panel = document.getElementById('placePanel');
                            if (!panel || !panel.classList.contains('active')) return;
                            if (currentCarouselIndex !== 1) return;
                            showFirstTimeHint();
                        });
                    }
                }
            }
        }
    }
}
window.goToCarouselSlide = goToCarouselSlide;

// Window resize & orientationchange for inline 360 viewer
window.addEventListener('resize', () => {
    if (currentCarouselIndex === 1 && inline360Viewer) {
        try { inline360Viewer.resize(); } catch (_) {}
    }
});
window.addEventListener('orientationchange', () => {
    if (currentCarouselIndex === 1 && inline360Viewer) {
        setTimeout(() => {
            try { inline360Viewer.resize(); } catch (_) {}
        }, 150);
    }
});

// Global Keyboard Left / Right navigation for popup hero slides
window.addEventListener('keydown', (e) => {
    const panel = document.getElementById('placePanel');
    if (!panel || !panel.classList.contains('active')) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

    // Do NOT navigate slides if focus is inside the 360 container (allow keys to pan the 360)
    const inlineContainer = document.getElementById('ppInline360Container');
    if (inlineContainer && (e.target === inlineContainer || inlineContainer.contains(e.target))) {
        return;
    }

    if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToCarouselSlide(0);
    } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToCarouselSlide(1);
    }
});

// Cleanup on unload
window.addEventListener('pagehide', () => {
    destroyInline360Viewer();
});
window.addEventListener('beforeunload', () => {
    destroyInline360Viewer();
});

/**
 * Launch single establishment 360 panorama in the existing Pannellum viewer overlay
 * @param {string} panoUrl
 * @param {string} placeName
 * @param {object} [initialView]
 */
function launchPlacePano(panoUrl, placeName, initialView) {
    if (!panoUrl) return;

    const targetOverlay = document.getElementById('calzadaStreetviewOverlay');
    const targetContainer = document.getElementById('calzadaPannellumContainer');
    if (!targetOverlay || !targetContainer || typeof window.pannellum === 'undefined') {
        console.warn('Pannellum viewer overlay not available');
        return;
    }

    // Hide street view tour minimap and ground cursor for single place panorama
    const targetMinimap = document.getElementById('streetviewMinimapCard');
    const targetGroundArrow = document.getElementById('calzadaGroundArrow');
    if (targetMinimap) targetMinimap.style.display = 'none';
    if (targetGroundArrow) targetGroundArrow.style.display = 'none';

    // Show place pill with establishment title
    const targetPlacePill = document.getElementById('streetviewPlacePill');
    const targetPlaceName = document.getElementById('streetviewPlaceName');
    if (targetPlacePill) targetPlacePill.style.display = 'flex';
    if (targetPlaceName) targetPlaceName.textContent = placeName || '360° Panorama';

    // HUD hint
    const targetHud = document.getElementById('streetviewControlsHud');
    if (targetHud) {
        const textSpan = targetHud.querySelector('span');
        if (textSpan) textSpan.textContent = 'Drag to look around';
        targetHud.style.display = 'flex';
        targetHud.style.opacity = '1';
        setTimeout(() => {
            if (targetHud) targetHud.style.opacity = '0';
        }, 4000);
    }

    // Prevent background scrolling
    document.body.style.overflow = 'hidden';

    // Reveal overlay
    targetOverlay.style.display = 'block';
    requestAnimationFrame(() => targetOverlay.classList.add('active'));

    // Clear and create viewer
    targetContainer.innerHTML = '';
    if (window._placePannellumViewer) {
        try { window._placePannellumViewer.destroy(); } catch (_) {}
        window._placePannellumViewer = null;
    }

    const resolvedPanoUrl = resolvePlaceImageUrl(panoUrl);
    try {
        window._placePannellumViewer = window.pannellum.viewer('calzadaPannellumContainer', {
            type: 'equirectangular',
            panorama: resolvedPanoUrl,
            autoLoad: true,
            showZoomCtrl: true,
            showFullscreenCtrl: true,
            compass: false,
            hfov: (initialView && typeof initialView.hfov === 'number') ? initialView.hfov : 100,
            pitch: (initialView && typeof initialView.pitch === 'number') ? initialView.pitch : -5,
            yaw: (initialView && typeof initialView.yaw === 'number') ? initialView.yaw : 0
        });
    } catch (err) {
        console.error('[launchPlacePano] Viewer error:', err.message || err);
    }

    function closeSinglePano() {
        if (!targetOverlay) return;
        targetOverlay.classList.remove('active');
        if (targetHud) targetHud.style.display = 'none';
        setTimeout(() => {
            targetOverlay.style.display = 'none';
            document.body.style.overflow = '';
            if (targetMinimap) targetMinimap.style.display = '';
            if (targetGroundArrow) targetGroundArrow.style.display = '';
            if (window._placePannellumViewer) {
                try { window._placePannellumViewer.destroy(); } catch (_) {}
                window._placePannellumViewer = null;
            }
        }, 280);
        window.removeEventListener('keydown', onEscKey);
        const targetCloseBtn = document.getElementById('streetviewCloseBtn');
        if (targetCloseBtn) targetCloseBtn.removeEventListener('click', onCloseClick);
    }

    function onEscKey(e) {
        if (e.key === 'Escape' && targetOverlay.classList.contains('active') && window._placePannellumViewer) {
            e.preventDefault();
            e.stopPropagation();
            closeSinglePano();
        }
    }

    function onCloseClick(e) {
        e.preventDefault();
        e.stopPropagation();
        closeSinglePano();
    }

    window.addEventListener('keydown', onEscKey);
    const targetCloseBtn = document.getElementById('streetviewCloseBtn');
    if (targetCloseBtn) targetCloseBtn.addEventListener('click', onCloseClick, { once: true });
}
window.launchPlacePano = launchPlacePano;

/**
 * Format Opening Hours status and schedule map
 */
function formatOpeningHoursStatus(openingHours) {
    if (!openingHours) return null;
    let hoursObj = openingHours;
    if (typeof hoursObj === 'string') {
        try {
            hoursObj = JSON.parse(hoursObj);
        } catch (e) {
            return { isOpen: true, statusText: hoursObj, hoursMap: null, todayKey: '' };
        }
    }
    if (typeof hoursObj !== 'object' || hoursObj === null) return null;

    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const now = new Date();
    const currentDayIdx = now.getDay();
    const todayKey = days[currentDayIdx];
    const todaySchedule = hoursObj[todayKey];

    const parseTimeToMins = (timeStr) => {
        if (!timeStr) return null;
        const match = timeStr.trim().match(/^(\d+):?(\d+)?\s*(AM|PM)$/i);
        if (!match) return null;
        let hours = parseInt(match[1], 10);
        const mins = match[2] ? parseInt(match[2], 10) : 0;
        const period = match[3].toUpperCase();
        if (period === 'PM' && hours < 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
        return hours * 60 + mins;
    };

    const currentMins = now.getHours() * 60 + now.getMinutes();
    let isOpen = false;
    let statusText = typeof window.t === 'function' ? window.t('places.popup.closed') : 'Closed';

    const is24h = (v) => typeof v === 'string' && /24\s*hours/i.test(v);
    if (is24h(todaySchedule)) {
        return {
            isOpen: true,
            statusText: typeof window.t === 'function' ? window.t('places.popup.open_24h') : 'Open 24 hours',
            hoursMap: hoursObj,
            todayKey
        };
    }
    // A place that closed after midnight may still be open from yesterday's hours
    const prevSchedule = hoursObj[days[(currentDayIdx + 6) % 7]];
    if (prevSchedule && !is24h(prevSchedule) && prevSchedule.toLowerCase() !== 'closed') {
        const pp = prevSchedule.split('-').map(s => s.trim());
        const ps = pp.length === 2 ? parseTimeToMins(pp[0]) : null;
        const pe = pp.length === 2 ? parseTimeToMins(pp[1]) : null;
        if (ps !== null && pe !== null && pe < ps && currentMins < pe) {
            return {
                isOpen: true,
                statusText: typeof window.t === 'function'
                    ? window.t('places.popup.open_closes', { time: pp[1] })
                    : `Open · Closes ${pp[1]}`,
                hoursMap: hoursObj,
                todayKey
            };
        }
    }

    if (todaySchedule && todaySchedule.toLowerCase() !== 'closed') {
        const parts = todaySchedule.split('-').map(s => s.trim());
        if (parts.length === 2) {
            const startMins = parseTimeToMins(parts[0]);
            const endMins = parseTimeToMins(parts[1]);

            if (startMins !== null && endMins !== null) {
                // Closing at or after midnight (e.g. 9:00 AM - 2:30 AM): open from the start until midnight
                const closesNextDay = endMins <= startMins;
                if (currentMins >= startMins && (closesNextDay || currentMins < endMins)) {
                    isOpen = true;
                    statusText = typeof window.t === 'function'
                        ? window.t('places.popup.open_closes', { time: parts[1] })
                        : `Open · Closes ${parts[1]}`;
                } else if (currentMins < startMins) {
                    isOpen = false;
                    statusText = typeof window.t === 'function'
                        ? window.t('places.popup.closed_opens', { time: parts[0] })
                        : `Closed · Opens ${parts[0]}`;
                } else {
                    isOpen = false;
                    const nextDayKey = days[(currentDayIdx + 1) % 7];
                    const nextSched = hoursObj[nextDayKey];
                    if (nextSched && nextSched.toLowerCase() !== 'closed') {
                        const nextStart = nextSched.split('-')[0].trim();
                        statusText = typeof window.t === 'function'
                            ? window.t('places.popup.closed_opens_tomorrow', { time: nextStart })
                            : `Closed · Opens ${nextStart} tomorrow`;
                    } else {
                        statusText = typeof window.t === 'function' ? window.t('places.popup.closed') : 'Closed';
                    }
                }
            } else {
                statusText = todaySchedule;
            }
        } else {
            statusText = todaySchedule;
        }
    } else {
        isOpen = false;
        const nextDayKey = days[(currentDayIdx + 1) % 7];
        const nextSched = hoursObj[nextDayKey];
        if (nextSched && nextSched.toLowerCase() !== 'closed') {
            const nextStart = nextSched.split('-')[0].trim();
            statusText = typeof window.t === 'function'
                ? window.t('places.popup.closed_opens_tomorrow', { time: nextStart })
                : `Closed · Opens ${nextStart} tomorrow`;
        } else {
            statusText = typeof window.t === 'function' ? window.t('places.popup.closed_today') : 'Closed today';
        }
    }

    return {
        isOpen,
        statusText,
        hoursMap: hoursObj,
        todayKey
    };
}

function fillPanelSocial(url) {
    const row = document.getElementById('ppRowSocial');
    const link = document.getElementById('ppSocial');
    if (!row || !link) return;
    let href = '';
    try { const u = new URL(String(url || '').trim()); if (u.protocol === 'https:') href = u.href; } catch (_) {}
    if (!href) { row.style.display = 'none'; return; }
    const isIg = /instagram\.com/i.test(href);
    const tr = (k, f) => (typeof window.t === 'function' && window.t(k) !== k ? window.t(k) : f);
    link.textContent = isIg ? tr('places.popup.instagram', 'Instagram page') : tr('places.popup.facebook', 'Facebook page');
    link.href = href;
    row.style.display = 'flex';
}

function renderOpeningHoursTable(hoursData, hoursTableEl) {
    if (!hoursData || !hoursData.hoursMap || !hoursTableEl) return;
    const dayNames = {
        mon: typeof window.t === 'function' ? window.t('places.day_mon') : 'Monday',
        tue: typeof window.t === 'function' ? window.t('places.day_tue') : 'Tuesday',
        wed: typeof window.t === 'function' ? window.t('places.day_wed') : 'Wednesday',
        thu: typeof window.t === 'function' ? window.t('places.day_thu') : 'Thursday',
        fri: typeof window.t === 'function' ? window.t('places.day_fri') : 'Friday',
        sat: typeof window.t === 'function' ? window.t('places.day_sat') : 'Saturday',
        sun: typeof window.t === 'function' ? window.t('places.day_sun') : 'Sunday'
    };
    const todayTag = typeof window.t === 'function' ? ` ${window.t('places.today_tag')}` : ' (Today)';
    const orderedDays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    hoursTableEl.innerHTML = orderedDays.map(dKey => {
        const isToday = dKey === hoursData.todayKey;
        let timeStr = hoursData.hoursMap[dKey] || 'Closed';
        if (timeStr.toLowerCase() === 'closed') {
            timeStr = typeof window.t === 'function' ? window.t('places.popup.closed') : 'Closed';
        } else if (/24\s*hours/i.test(timeStr)) {
            timeStr = typeof window.t === 'function' ? window.t('places.popup.open_24h') : 'Open 24 hours';
        }
        timeStr = escapeHtml(timeStr);
        return `
            <tr class="${isToday ? 'today-row' : ''}">
                <td class="day-col">${dayNames[dKey]}${isToday ? todayTag : ''}</td>
                <td class="time-col">${timeStr}</td>
            </tr>
        `;
    }).join('');
}

/**
 * Helpers for Reviews & Ratings
 */
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getAvatarColor(name) {
    // Flat, clean neutral avatar background
    return '#e2e8f0';
}


function formatRelativeTime(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const diffInSeconds = Math.max(0, Math.floor((now - date) / 1000));

    const lang = localStorage.getItem('calzada_lang') || document.documentElement.lang || 'en';
    const isTl = lang === 'tl';

    if (diffInSeconds < 60) return isTl ? 'ngayon lang' : 'just now';
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return isTl ? `${diffInMinutes}m ang nakalipas` : `${diffInMinutes}m ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return isTl ? `${diffInHours}h ang nakalipas` : `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays === 1) return isTl ? 'kahapon' : 'yesterday';
    if (diffInDays < 7) return isTl ? `${diffInDays}d ang nakalipas` : `${diffInDays}d ago`;
    if (diffInDays < 30) {
        const weeks = Math.floor(diffInDays / 7);
        return isTl ? `${weeks}w ang nakalipas` : `${weeks}w ago`;
    }

    return date.toLocaleDateString(isTl ? 'fil-PH' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Get Firebase Auth ID Token for API requests
 */
async function fetchAuthToken() {
    if (window.CalzadaAuth && typeof window.CalzadaAuth.getFirebaseIdToken === 'function') {
        return await window.CalzadaAuth.getFirebaseIdToken();
    }
    try {
        const mod = await import('../js/firebase-init.js');
        return await mod.getFirebaseIdToken();
    } catch (e) {
        console.warn('Could not load Firebase auth module:', e);
        return null;
    }
}
function isUserLoggedIn() {
    if (window.CalzadaAuth && typeof window.CalzadaAuth.getCurrentUser === 'function') {
        const user = window.CalzadaAuth.getCurrentUser();
        return !!user;
    }
    return false;
}

// Global state for active place panel ratings
let reviewsOffset = 0;
const REVIEWS_PAGE_LIMIT = 3;
let activeUserRating = 0;
let userHasExistingReview = false;

// Global Firebase Auth listener for Place Panel UI synchronization
let authListenerInitialized = false;
function initAuthListenerForPlacePanel() {
    if (authListenerInitialized) return;
    if (window.CalzadaAuth && typeof window.CalzadaAuth.onAuthStateChanged === 'function') {
        authListenerInitialized = true;
        window.CalzadaAuth.onAuthStateChanged((user) => {
            if (currentPlaceId) {
                if (activePanelReviewsInstance && typeof activePanelReviewsInstance.reload === 'function') {
                    activePanelReviewsInstance.reload();
                } else {
                    setupRatingAndReviews(currentPlaceId);
                }
            }
        });
    } else {
        setTimeout(initAuthListenerForPlacePanel, 300);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuthListenerForPlacePanel);
} else {
    initAuthListenerForPlacePanel();
}

/**
 * Configure Live Ratings & Reviews (Mounted via CalzadaReviewsUI)
 */
let activePanelReviewsInstance = null;
let currentPlaceName = '';

async function setupRatingAndReviews(placeId) {
    if (placeId) currentPlaceId = placeId;
    const activeId = placeId || currentPlaceId;
    const mountEl = document.getElementById('ppReviewsBlock');
    if (!mountEl) return;

    if (activePanelReviewsInstance && String(activePanelReviewsInstance.placeId) === String(activeId)) {
        if (typeof activePanelReviewsInstance.reload === 'function') {
            activePanelReviewsInstance.reload();
        }
        return;
    }

    if (activePanelReviewsInstance && typeof activePanelReviewsInstance.destroy === 'function') {
        activePanelReviewsInstance.destroy();
        activePanelReviewsInstance = null;
    }

    if (window.CalzadaReviewsUI && activeId) {
        activePanelReviewsInstance = window.CalzadaReviewsUI.mount(mountEl, {
            placeId: activeId,
            placeName: currentPlaceName,
            returnUrl: '/places?place=' + encodeURIComponent(currentPlaceName || activeId)
        });
    }
}



// 360 Photosphere Place Links Integration for Place Panel
const DEFAULT_360_LINKS = [
    { placeId: "13", placeName: "STI College - Calamba", nodeId: "14.202352_121.158453", distance: 18.5 },
    { placeId: "19", placeName: "PWU CDCEC Calamba", nodeId: "14.205243_121.156249", distance: 1.6 }
];

let placePanel360LinksMap = new Map();
DEFAULT_360_LINKS.forEach(link => {
    if (link.placeId) placePanel360LinksMap.set(String(link.placeId).trim(), link);
    if (link.placeName) {
        placePanel360LinksMap.set(link.placeName.trim().toLowerCase(), link);
        placePanel360LinksMap.set(link.placeName.replace(/[^a-z0-9]/gi, '').toLowerCase(), link);
    }
});

let placePanel360LoadPromise = null;

function loadPlacePanel360Links() {
    if (!placePanel360LoadPromise) {
        placePanel360LoadPromise = (async () => {
            try {
                const res = await fetch('../assets/360/place-links.json', { cache: 'no-cache' });
                if (res.ok) {
                    const data = await res.json();
                    (data.links || []).forEach(link => {
                        if (link.placeId) placePanel360LinksMap.set(String(link.placeId).trim(), link);
                        if (link.placeName) {
                            placePanel360LinksMap.set(link.placeName.trim().toLowerCase(), link);
                            placePanel360LinksMap.set(link.placeName.replace(/[^a-z0-9]/gi, '').toLowerCase(), link);
                        }
                    });
                }
            } catch (err) {
                console.warn('[360 Links] Could not load place-links in place-panel:', err);
            }
        })();
    }
    return placePanel360LoadPromise;
}

loadPlacePanel360Links();

function getPlacePanel360Link(placeId, placeName) {
    if (placeId && placePanel360LinksMap.has(String(placeId).trim())) {
        return placePanel360LinksMap.get(String(placeId).trim());
    }
    if (placeName) {
        const norm = placeName.trim().toLowerCase();
        if (placePanel360LinksMap.has(norm)) {
            return placePanel360LinksMap.get(norm);
        }
        const stripped = placeName.replace(/[^a-z0-9]/gi, '').toLowerCase();
        if (placePanel360LinksMap.has(stripped)) {
            return placePanel360LinksMap.get(stripped);
        }
    }
    return null;
}

/**
 * Open Place Detail Panel
 */
window.openPlacePanel = function(placeName, optLat, optLng, openOptions) {
    if (!placeName) return;
    currentPlaceName = placeName;
    const openOnSlide = openOptions && openOptions.slide === '360' ? 1 : 0;

    // 1. Ensure DOM elements exist
    initPlacePanelDOM();

    const backdrop = document.getElementById('placePanelBackdrop');
    const panel = document.getElementById('placePanel');

    // Add will-change: transform only while animating
    if (panel) {
        panel.style.willChange = 'transform';
    }

    // 2. Open animations immediately for instant UI feedback
    if (backdrop) backdrop.classList.add('active');
    if (panel) {
        panel.classList.add('active');
        panel.classList.add('open');
    }
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    // Show skeletons immediately for photo, rating summary, and reviews
    const heroSkeleton = document.getElementById('ppHeroSkeleton');
    if (heroSkeleton) heroSkeleton.style.display = 'block';

    const prevBtn = document.getElementById('ppCarouselPrev');
    const nextBtn = document.getElementById('ppCarouselNext');
    const dotsContainer = document.getElementById('ppCarouselDots');
    if (prevBtn) {
        prevBtn.style.display = 'flex';
        prevBtn.style.visibility = 'hidden';
        prevBtn.style.pointerEvents = 'none';
    }
    if (nextBtn) {
        nextBtn.style.display = 'flex';
        nextBtn.style.visibility = 'visible';
        nextBtn.style.pointerEvents = 'auto';
    }
    if (dotsContainer) dotsContainer.style.display = 'none';

    const ratingSummarySkeleton = document.getElementById('ppRatingSummarySkeleton');
    const ratingSummary = document.getElementById('ppRatingSummary');
    if (ratingSummarySkeleton) ratingSummarySkeleton.style.display = 'block';
    if (ratingSummary) ratingSummary.style.display = 'none';

    const reviewsHeaderSkeleton = document.getElementById('ppReviewsHeaderSkeleton');
    const reviewsHeader = document.getElementById('ppReviewsHeader');
    const reviewsLoading = document.getElementById('ppReviewsLoading');
    const reviewsEmpty = document.getElementById('ppReviewsEmpty');
    const reviewsList = document.getElementById('ppReviewsList');
    const seeMoreBtn = document.getElementById('ppReviewsSeeMoreBtn');

    if (reviewsHeaderSkeleton) reviewsHeaderSkeleton.style.display = 'block';
    if (reviewsHeader) reviewsHeader.style.display = 'none';
    if (reviewsLoading) reviewsLoading.style.display = 'flex';
    if (reviewsEmpty) reviewsEmpty.style.display = 'none';
    if (reviewsList) {
        reviewsList.innerHTML = '';
        reviewsList.style.display = 'none';
    }
    if (seeMoreBtn) seeMoreBtn.style.display = 'none';

    // 3. Find base data or construct fallback (fast object lookup)
    const activeDataStore = (typeof window !== 'undefined' && window.placesData) ? window.placesData : placesData;
    const targetNorm = (placeName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedKey = Object.keys(activeDataStore).find(
        k => k.toLowerCase().trim() === placeName.toLowerCase().trim() ||
             k.toLowerCase().replace(/[^a-z0-9]/g, '') === targetNorm
    );
    let data = normalizedKey ? activeDataStore[normalizedKey] : null;

    if (!data && typeof window !== 'undefined') {
        const pool = (Array.isArray(window.FALLBACK_PLACES) && window.FALLBACK_PLACES.length > 0)
            ? window.FALLBACK_PLACES
            : (Array.isArray(window._cachedAllPlaces) ? window._cachedAllPlaces : []);
        const fpMatch = pool.find(p =>
            (p.id != null && String(p.id) === String(placeName)) ||
            (p.name && p.name.toLowerCase().trim() === placeName.toLowerCase().trim()) ||
            (p.name && (p.name || '').toLowerCase().replace(/[^a-z0-9]/g, '') === targetNorm) ||
            (p.slug && p.slug.toLowerCase() === targetNorm)
        );
        if (fpMatch) {
            data = {
                ...fpMatch,
                image: fpMatch.photo || fpMatch.image_path || '../assets/hero-places-bg.png'
            };
        }
    }
    
    if (!data) {
        data = {
            name: placeName,
            category: "Destination",
            image: "../assets/hero-places-bg.png",
            barangay: "Calamba City",
            full_address: "Calamba City, Laguna",
            phone: "",
            website: "",
            opening_hours: null,
            landmarks: ["Popular destination in Calamba"],
            howToGetThere: "Use the Route Planner for detailed directions to this location.",
            about: "A notable destination within the Calambiyahe transit network.",
            fare: "Depends",
            travelTime: "Depends",
            transport: "Multiple"
        };
    }

    if (optLat != null) data.lat = optLat;
    if (optLng != null) data.lng = optLng;

    currentActivePlace = data;
    const currentOpenedName = data.name;

    // 4. Set Place Name immediately
    const nameEl = document.getElementById('ppName');
    if (nameEl) nameEl.textContent = data.name;

    // 5. Reuse the card's already-loaded image for the hero (same URL -> cached)
    let photoSrc = null;
    if (window._lastFocusedPlaceCard) {
        const cardImg = window._lastFocusedPlaceCard.querySelector('.ref-card-img');
        if (cardImg && (cardImg.currentSrc || cardImg.src)) {
            photoSrc = cardImg.currentSrc || cardImg.src;
        }
    }
    if (!photoSrc) {
        const rawPhoto = data?.photo !== undefined ? data.photo : (data?.image_path || data?.image || null);
        if (typeof rawPhoto === 'string' && rawPhoto.trim() !== '' && !rawPhoto.includes('hero-places-bg')) {
            photoSrc = resolvePlaceImageUrl(rawPhoto.trim());
        }
    }

    const slidesContainer = document.getElementById('ppCarouselSlides');
    if (slidesContainer) {
        slidesContainer.innerHTML = '';
        const slide1Wrap = document.createElement('div');
        slide1Wrap.className = 'carousel-slide-wrap';
        const chip1 = document.createElement('span');
        chip1.className = 'hero-slide-chip';
        chip1.id = 'ppHeroChipPhoto';
        chip1.textContent = typeof window.t === 'function' ? window.t('places.popup.chip_photo') : 'Photo';
        slide1Wrap.appendChild(chip1);

        if (photoSrc) {
            const imgEl = document.createElement('img');
            imgEl.className = 'carousel-slide';
            imgEl.alt = `${data.name} photo`;
            imgEl.src = photoSrc;

            function revealPhotoSync() {
                imgEl.classList.add('photo-fade-in');
                if (heroSkeleton) heroSkeleton.style.display = 'none';
            }

            if (imgEl.complete && imgEl.naturalWidth > 0) {
                revealPhotoSync();
            } else {
                if (heroSkeleton) heroSkeleton.style.display = 'block';
                imgEl.addEventListener('load', revealPhotoSync, { once: true });
                imgEl.addEventListener('error', () => {
                    if (heroSkeleton) heroSkeleton.style.display = 'none';
                    renderPhotoPlaceholder(slide1Wrap);
                }, { once: true });
            }
            slide1Wrap.appendChild(imgEl);
        } else {
            if (heroSkeleton) heroSkeleton.style.display = 'none';
            renderPhotoPlaceholder(slide1Wrap);
        }
        slidesContainer.appendChild(slide1Wrap);
    }

    // 6. Defer full details population to after the first frame
    const activeOpenedPlace = data;
    requestAnimationFrame(() => {
        setTimeout(async () => {
            if (!panel || !panel.classList.contains('active')) return;
            if (currentActivePlace !== activeOpenedPlace) return;

            await fillRest(activeOpenedPlace, placeName, optLat, optLng);
            // Optional: open directly on the 360 slide (used by the planner place card)
            if (openOnSlide === 1 && panel && panel.classList.contains('active')) {
                try { goToCarouselSlide(1); } catch (_) {}
            }
        }, 0);
    });
};

/**
 * Deferred population for place panel content (runs after sheet starts moving)
 */
async function fillRest(data, placeName, optLat, optLng) {
    const planBtn = document.getElementById('ppPlanBtn');
    if (planBtn) {
        planBtn.setAttribute('data-dest', data.name);
        const curLat = data.lat != null ? data.lat : (optLat != null ? optLat : null);
        const curLng = (data.lng != null ? data.lng : data.lon) != null ? (data.lng != null ? data.lng : data.lon) : (optLng != null ? optLng : null);
        if (curLat != null && curLng != null) {
            planBtn.setAttribute('data-lat', curLat);
            planBtn.setAttribute('data-lng', curLng);
        } else {
            planBtn.removeAttribute('data-lat');
            planBtn.removeAttribute('data-lng');
        }
    }

    // Upfront setup for 2-slide hero (Slide 1: photo, Slide 2: 360)
    const upfrontLink = getPlacePanel360Link(data?.id, data?.name || placeName);
    const isStiUpfront = /\bsti\b/i.test(data?.name || '') || /\bsti\b/i.test(placeName || '');
    const upfrontFallbackNodeId = isStiUpfront ? (upfrontLink?.nodeId || '14.202352_121.158453') : null;
    setupCarousel({
        ...data,
        fallbackNodeId: upfrontFallbackNodeId
    });

    // Owner banner
    const ownerBanner = document.getElementById('ppOwnerBanner');
    if (ownerBanner) {
        let isOwner = false;
        try {
            const me = currentPanelUser();
            isOwner = Boolean(data.ownerId && me && me.uid === data.ownerId);
        } catch (_) {}
        ownerBanner.style.display = isOwner ? 'flex' : 'none';
    }

    // Populate Initial Address Row
    const rowAddress = document.getElementById('ppRowAddress');
    const addressEl = document.getElementById('ppAddress');
    const displayAddress = data.full_address || data.barangay || (data.municipality ? `${data.barangay ? data.barangay + ', ' : ''}${data.municipality}` : '');
    if (addressEl && rowAddress) {
        if (displayAddress && displayAddress.trim()) {
            addressEl.textContent = displayAddress;
            rowAddress.style.display = 'flex';
        } else {
            rowAddress.style.display = 'none';
        }
    }

    // Populate Initial Opening Hours Row & Accordion
    const rowHours = document.getElementById('ppRowHours');
    const hoursStatusEl = document.getElementById('ppHoursStatus');
    const hoursTableEl = document.getElementById('ppHoursTable');
    const hoursWrapper = document.getElementById('ppHoursWrapper');
    if (hoursWrapper) hoursWrapper.classList.remove('expanded');

    if (data.openHours && typeof CalzadaBusinessFields !== 'undefined') {
        const openStatus = CalzadaBusinessFields.getOpenStatus(data.openHours);
        const weekly = CalzadaBusinessFields.formatWeeklyHours(data.openHours);
        if (rowHours && hoursStatusEl && hoursTableEl) {
            hoursStatusEl.textContent = openStatus.statusText;
            hoursStatusEl.className = `panel-hours-status ${openStatus.isOpen ? 'open' : 'closed'}`;
            hoursTableEl.innerHTML = weekly.map(w => `
                <tr>
                    <td style="padding:4px 8px;font-weight:500;color:#475569;">${w.dayName}</td>
                    <td style="padding:4px 8px;color:#1E293B;text-align:right;">${w.hoursText}</td>
                </tr>
            `).join('');
            rowHours.style.display = 'flex';
        }
    } else {
        const hoursData = formatOpeningHoursStatus(data.opening_hours);
        if (rowHours && hoursStatusEl && hoursTableEl) {
            if (hoursData && hoursData.statusText) {
                hoursStatusEl.textContent = hoursData.statusText;
                hoursStatusEl.className = `panel-hours-status ${hoursData.isOpen ? 'open' : 'closed'}`;

                if (hoursData.hoursMap && typeof hoursData.hoursMap === 'object') {
                    renderOpeningHoursTable(hoursData, hoursTableEl);
                } else {
                    hoursTableEl.innerHTML = `<tr><td colspan="2" style="padding:4px 6px;color:#64748b;">${hoursData.statusText}</td></tr>`;
                }
                rowHours.style.display = 'flex';
            } else {
                rowHours.style.display = 'none';
            }
        }
    }

    // Populate Offerings Row
    const rowOfferings = document.getElementById('ppRowOfferings');
    const offeringsEl = document.getElementById('ppOfferings');
    if (rowOfferings && offeringsEl) {
        if (Array.isArray(data.offerings) && data.offerings.length > 0) {
            offeringsEl.textContent = data.offerings.join(' · ');
            rowOfferings.style.display = 'flex';
        } else {
            rowOfferings.style.display = 'none';
        }
    }

    // Populate Updates Link
    const rowUpdates = document.getElementById('ppRowUpdates');
    const updatesLink = document.getElementById('ppSeeUpdatesLink');
    if (rowUpdates && updatesLink) {
        if (data.source === 'business' || data.businessId) {
            const bId = data.businessId || String(data.id || '').replace(/^biz_/, '');
            updatesLink.href = `/pages/my-business.html?id=${encodeURIComponent(bId)}`;
            rowUpdates.style.display = 'flex';
        } else {
            rowUpdates.style.display = 'none';
        }
    }

    // Populate Initial Website Link
    const rowWebsite = document.getElementById('ppRowWebsite');
    const websiteEl = document.getElementById('ppWebsite');
    if (rowWebsite && websiteEl) {
        if (data.website && data.website.trim()) {
            const rawWeb = data.website.trim();
            const fullUrl = rawWeb.startsWith('http://') || rawWeb.startsWith('https://') ? rawWeb : `https://${rawWeb}`;
            websiteEl.textContent = rawWeb.replace(/^https?:\/\//i, '');
            websiteEl.href = fullUrl;
            rowWebsite.style.display = 'flex';
        } else {
            rowWebsite.style.display = 'none';
        }
    }

    // Populate Initial Phone Link
    const rowPhone = document.getElementById('ppRowPhone');
    const phoneEl = document.getElementById('ppPhone');
    if (rowPhone && phoneEl) {
        if (data.phone && data.phone.trim()) {
            const phoneClean = data.phone.trim();
            phoneEl.textContent = phoneClean;
            phoneEl.href = `tel:${phoneClean.replace(/[^0-9+]/g, '')}`;
            rowPhone.style.display = 'flex';
        } else {
            rowPhone.style.display = 'none';
        }
    }

    // Populate the place's Facebook or Instagram page
    fillPanelSocial(data.social);

    // Update Save Button State
    const saveBtn = document.getElementById('ppSaveBtn');
    if (saveBtn) {
        let isSaved = false;
        if (typeof window.isPlaceSaved === 'function') {
            isSaved = window.isPlaceSaved(data.name, data.id);
        } else if (window.getCurrentSavedPlaces && typeof window.getCurrentSavedPlaces === 'function') {
            const list = window.getCurrentSavedPlaces();
            isSaved = list.some(s => (s.name || s.placeName || '').toLowerCase() === (data.name || '').toLowerCase() || (data.id && s.id === data.id));
        }
        if (isSaved) {
            saveBtn.classList.add('saved');
            saveBtn.setAttribute('aria-pressed', 'true');
            saveBtn.setAttribute('aria-label', 'Remove from saved');
            saveBtn.setAttribute('title', 'Remove from saved');
        } else {
            saveBtn.classList.remove('saved');
            saveBtn.setAttribute('aria-pressed', 'false');
            saveBtn.setAttribute('aria-label', 'Save place');
            saveBtn.setAttribute('title', 'Save place');
        }
    }

    // Update URL history
    try {
        const url = new URL(window.location);
        url.searchParams.set('place', placeName);
        window.history.pushState({}, '', url);
    } catch (e) {
        // Ignore URL state error in sandbox
    }

    // Resolve place ID and live data from API asynchronously
    let placeId = data.id || null;
    try {
        let allPlaces = (typeof window !== 'undefined' && Array.isArray(window._cachedAllPlaces) && window._cachedAllPlaces.length > 0)
            ? window._cachedAllPlaces
            : [];
        if (allPlaces.length === 0) {
            const searchRes = await fetch(`/api/places?category=all`);
            if (searchRes.ok) {
                try {
                    allPlaces = await searchRes.json();
                    if (typeof window !== 'undefined') window._cachedAllPlaces = allPlaces;
                } catch (_) {}
            }
        }
        if (typeof window !== 'undefined' && Array.isArray(window.FALLBACK_PLACES) && window.FALLBACK_PLACES.length > allPlaces.length) {
            allPlaces = window.FALLBACK_PLACES;
        }
        const targetNorm = (placeName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const match = allPlaces.find(p => (p.name && p.name.toLowerCase().trim() === placeName.toLowerCase().trim()) || (p.id != null && String(p.id) === String(placeName))) ||
                      allPlaces.find(p => (p.name || '').toLowerCase().replace(/[^a-z0-9]/g, '') === targetNorm) ||
                      allPlaces.find(p => p.slug && p.slug.toLowerCase() === targetNorm);
        if (match) {
            placeId = match.id;
            currentPlaceId = match.id;
            data = { ...data, ...match };
            currentActivePlace = data;

            const nameEl = document.getElementById('ppName');
            if (nameEl && match.name) nameEl.textContent = match.name;

            if (planBtn && match.lat != null && (match.lng != null || match.lon != null)) {
                planBtn.setAttribute('data-lat', match.lat);
                planBtn.setAttribute('data-lng', match.lng != null ? match.lng : match.lon);
            }

            // Update fields with live database values if available
            if (match.full_address && addressEl && rowAddress) {
                addressEl.textContent = match.full_address;
                rowAddress.style.display = 'flex';
            }
            if (match.website && websiteEl && rowWebsite) {
                const rawWeb = match.website.trim();
                const fullUrl = rawWeb.startsWith('http://') || rawWeb.startsWith('https://') ? rawWeb : `https://${rawWeb}`;
                websiteEl.textContent = rawWeb.replace(/^https?:\/\//i, '');
                websiteEl.href = fullUrl;
                rowWebsite.style.display = 'flex';
            }
            if (match.phone && phoneEl && rowPhone) {
                phoneEl.textContent = match.phone.trim();
                phoneEl.href = `tel:${match.phone.trim().replace(/[^0-9+]/g, '')}`;
                rowPhone.style.display = 'flex';
            }
            if (match.social) fillPanelSocial(match.social);
            if (match.openHours && typeof CalzadaBusinessFields !== 'undefined') {
                const openStatus = CalzadaBusinessFields.getOpenStatus(match.openHours);
                const weekly = CalzadaBusinessFields.formatWeeklyHours(match.openHours);
                const liveRow = document.getElementById('ppRowHours');
                const liveStatus = document.getElementById('ppHoursStatus');
                const liveTable = document.getElementById('ppHoursTable');
                if (liveRow && liveStatus && liveTable) {
                    liveStatus.textContent = openStatus.statusText;
                    liveStatus.className = `panel-hours-status ${openStatus.isOpen ? 'open' : 'closed'}`;
                    liveTable.innerHTML = weekly.map(w => `
                        <tr>
                            <td style="padding:4px 8px;font-weight:500;color:#475569;">${w.dayName}</td>
                            <td style="padding:4px 8px;color:#1E293B;text-align:right;">${w.hoursText}</td>
                        </tr>
                    `).join('');
                    liveRow.style.display = 'flex';
                }
            } else if (match.opening_hours) {
                const liveHours = formatOpeningHoursStatus(match.opening_hours);
                const liveRow = document.getElementById('ppRowHours');
                const liveStatus = document.getElementById('ppHoursStatus');
                const liveTable = document.getElementById('ppHoursTable');
                if (liveHours && liveRow && liveStatus && liveTable) {
                    liveStatus.textContent = liveHours.statusText;
                    liveStatus.className = `panel-hours-status ${liveHours.isOpen ? 'open' : 'closed'}`;
                    if (liveHours.hoursMap) renderOpeningHoursTable(liveHours, liveTable);
                    liveRow.style.display = 'flex';
                }
            }

            if (Array.isArray(match.offerings) && match.offerings.length > 0) {
                const rOff = document.getElementById('ppRowOfferings');
                const offEl = document.getElementById('ppOfferings');
                if (rOff && offEl) {
                    offEl.textContent = match.offerings.join(' · ');
                    rOff.style.display = 'flex';
                }
            }

            if (match.ownerId) {
                const ob = document.getElementById('ppOwnerBanner');
                if (ob) {
                    try {
                        const me = currentPanelUser();
                        if (me) {
                            ob.style.display = (me.uid === match.ownerId) ? 'flex' : 'none';
                        }
                    } catch (_) {}
                }
            }
        }
    } catch (e) {
        console.warn('Could not fetch place details from API:', e);
    }

    // Update 2-slide hero with full API data and check for Street View fallback
    try {
        await loadPlacePanel360Links();
        const live360Link = getPlacePanel360Link(placeId || data.id, data.name || placeName);
        const liveIsSti = /\bsti\b/i.test(data?.name || '') || /\bsti\b/i.test(placeName || '');
        const liveFallbackNodeId = liveIsSti ? (live360Link?.nodeId || '14.202352_121.158453') : null;
        setupCarousel({
            ...data,
            fallbackNodeId: liveFallbackNodeId
        });
    } catch (e) {
        console.warn('Error evaluating 360 link in place-panel:', e);
        setupCarousel(data);
    }

    if (placeId) {
        await setupRatingAndReviews(placeId);
    } else {
        await setupRatingAndReviews(null);
    }

    // Record recentlyViewed activity (silently skipped if unauthenticated/guest)
    try {
        if (window.CalzadaActivity && typeof window.CalzadaActivity.addRecentlyViewed === 'function') {
            window.CalzadaActivity.addRecentlyViewed(placeId || data.id || data.name, data.name || placeName);
        }
    } catch (_) {}

    // Localize popup strings
    updatePlacePanelI18n();
}

// Fallback global handler for opening 360 viewer if not already provided
if (!window._open360Viewer) {
    window._open360Viewer = function(nodeId) {
        if (!nodeId) return;

        window.dispatchEvent(new CustomEvent('calzada:open-360', {
            detail: { nodeId }
        }));

        if (typeof window.launch360Viewer === 'function') {
            window.launch360Viewer(nodeId);
            return;
        }

        let viewerModal = document.getElementById('calzada360ViewerModal');
        if (!viewerModal) {
            viewerModal = document.createElement('div');
            viewerModal.id = 'calzada360ViewerModal';
            viewerModal.className = 'calzada-360-modal-overlay';
            viewerModal.innerHTML = `
                <div class="calzada-360-modal-container">
                    <div class="calzada-360-modal-header">
                        <div class="calzada-360-modal-title">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#378ADD" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="9"/>
                                <path d="M3.6 9h16.8M3.6 15h16.8"/>
                                <path d="M11.5 3a17 17 0 0 0 0 18M12.5 3a17 17 0 0 1 0 18"/>
                            </svg>
                            <span id="calzada360ModalNodeText">360° Photosphere Viewer</span>
                        </div>
                        <button type="button" class="calzada-360-close-btn" id="calzada360CloseBtn" aria-label="Close 360 Viewer">&times;</button>
                    </div>
                    <div class="calzada-360-preview-viewport" id="calzada360Viewport">
                        <img id="calzada360ModalImg" alt="360 Photosphere" class="calzada-360-full-img" />
                        <div class="calzada-360-status-pill" id="calzada360StatusPill">
                            <span class="calzada-360-pulse-dot"></span>
                            <span id="calzada360PillText">Node: ${nodeId}</span>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(viewerModal);

            const closeBtn = document.getElementById('calzada360CloseBtn');
            function onClose360Modal() {
                viewerModal.classList.remove('active');
            }
            if (closeBtn) {
                closeBtn.onclick = onClose360Modal;
                if (typeof window.bindTap === 'function') window.bindTap(closeBtn, onClose360Modal);
            }
            viewerModal.onclick = (e) => {
                if (e.target === viewerModal) onClose360Modal();
            };
            if (typeof window.bindTap === 'function') {
                window.bindTap(viewerModal, (e) => {
                    if (e.target === viewerModal) onClose360Modal();
                });
            }
            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && viewerModal.classList.contains('active')) {
                    viewerModal.classList.remove('active');
                }
            });
        }

        const modalImg = document.getElementById('calzada360ModalImg');
        const nodeText = document.getElementById('calzada360ModalNodeText');
        const pillText = document.getElementById('calzada360PillText');
        const photoFilename = `${nodeId.replace('_', ', ')}.jpg`;
        const photoUrl = `../assets/360/${encodeURIComponent(photoFilename)}`;

        if (modalImg) modalImg.src = photoUrl;
        if (nodeText) nodeText.textContent = `360° Photosphere · ${nodeId}`;
        if (pillText) pillText.textContent = `Node: ${nodeId}`;

        viewerModal.classList.add('active');
    };
}

function closePlacePanel(updateHistory = true) {
    const backdrop = document.getElementById('placePanelBackdrop');
    const panel = document.getElementById('placePanel');
    if (backdrop) backdrop.classList.remove('active');
    if (panel) {
        panel.classList.remove('active');
        panel.classList.remove('open');
    }
    document.documentElement.style.overflow = '';
    document.body.style.overflow = ''; 

    // Destroy inline 360 viewer
    destroyInline360Viewer();

    // Reset skeletons and carousel slides for next open
    const heroSkeleton = document.getElementById('ppHeroSkeleton');
    if (heroSkeleton) heroSkeleton.style.display = 'block';
    const slidesContainer = document.getElementById('ppCarouselSlides');
    if (slidesContainer) slidesContainer.innerHTML = ''; 

    const ratingSummarySkeleton = document.getElementById('ppRatingSummarySkeleton');
    const ratingSummary = document.getElementById('ppRatingSummary');
    if (ratingSummarySkeleton) ratingSummarySkeleton.style.display = 'none';
    if (ratingSummary) ratingSummary.style.display = 'none';

    const reviewsHeaderSkeleton = document.getElementById('ppReviewsHeaderSkeleton');
    const reviewsHeader = document.getElementById('ppReviewsHeader');
    const reviewsLoading = document.getElementById('ppReviewsLoading');
    const reviewsEmpty = document.getElementById('ppReviewsEmpty');
    const reviewsList = document.getElementById('ppReviewsList');
    if (reviewsHeaderSkeleton) reviewsHeaderSkeleton.style.display = 'none';
    if (reviewsHeader) reviewsHeader.style.display = 'none';
    if (reviewsLoading) reviewsLoading.style.display = 'none';
    if (reviewsEmpty) reviewsEmpty.style.display = 'none';
    if (reviewsList) {
        reviewsList.innerHTML = '';
        reviewsList.style.display = 'none';
    } 

    if (updateHistory) {
        const url = new URL(window.location);
        url.searchParams.delete('place');
        window.history.pushState({}, '', url);
    }

    // Restore focus to the card that opened the panel (only if opened by keyboard)
    if (window._lastOpenedByKeyboard && window._lastFocusedPlaceCard && typeof window._lastFocusedPlaceCard.focus === 'function') {
        try {
            window._lastFocusedPlaceCard.focus();
        } catch (_) {}
    } else {
        if (document.activeElement && document.activeElement !== document.body) {
            try { document.activeElement.blur(); } catch (_) {}
        }
    }
}
window.closePlacePanel = closePlacePanel;

// Escape key to close place panel and return focus (req 9)
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const panel = document.getElementById('placePanel');
        if (panel && panel.classList.contains('active')) {
            closePlacePanel();
        }
    }
});

function updatePlacePanelI18n() {
    const chipPhoto = document.getElementById('ppHeroChipPhoto');
    if (chipPhoto) {
        chipPhoto.textContent = typeof window.t === 'function' ? window.t('places.popup.chip_photo') : 'Photo';
    }
    const chipPano = document.getElementById('ppHeroChipPano');
    if (chipPano) {
        chipPano.textContent = typeof window.t === 'function' ? window.t('places.popup.chip_360') : '360°';
    }
    const prevBtn = document.getElementById('ppCarouselPrev');
    if (prevBtn) {
        prevBtn.setAttribute('aria-label', typeof window.t === 'function' ? window.t('places.popup.prev') : 'Previous');
    }
    const nextBtn = document.getElementById('ppCarouselNext');
    if (nextBtn) {
        nextBtn.setAttribute('aria-label', typeof window.t === 'function' ? window.t('places.popup.next') : 'Next');
    }
    const dots = document.querySelectorAll('#ppCarouselDots .carousel-dot');
    if (dots && dots.length >= 2) {
        dots[0].setAttribute('aria-label', typeof window.t === 'function' ? window.t('places.popup.dot_photo') : 'Slide 1 of 2 – Photo');
        dots[1].setAttribute('aria-label', typeof window.t === 'function' ? window.t('places.popup.dot_360') : 'Slide 2 of 2 – 360°');
    }
    const inlineContainer = document.getElementById('ppInline360Container');
    if (inlineContainer && currentActivePlace) {
        const aLabel = typeof window.t === 'function'
            ? window.t('places.popup.aria_360_label', { name: currentActivePlace.name || '' })
            : `${currentActivePlace.name} 360° view`;
        inlineContainer.setAttribute('aria-label', aLabel);
    }
    const loadingText = document.getElementById('ppInline360LoadingText');
    if (loadingText) {
        loadingText.textContent = typeof window.t === 'function' ? window.t('places.popup.loading_360') : 'Loading 360°…';
    }
    const errorText = document.getElementById('ppInline360ErrorText');
    if (errorText) {
        errorText.textContent = typeof window.t === 'function' ? window.t('places.popup.error_360') : "Couldn't load the 360° view.";
    }
    const retryBtn = document.getElementById('ppInline360RetryBtn');
    if (retryBtn) {
        retryBtn.textContent = typeof window.t === 'function' ? window.t('places.popup.retry') : 'Retry';
    }
    const fsBtn = document.getElementById('ppHeroFullscreenBtn');
    if (fsBtn) {
        fsBtn.setAttribute('aria-label', typeof window.t === 'function' ? window.t('places.popup.fullscreen') : 'Full screen');
    }
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    const hintLine1 = document.getElementById('ppInline360HintLine1');
    if (hintLine1) {
        hintLine1.textContent = typeof window.t === 'function' ? window.t('places.popup.hint_drag') : 'Drag to look around';
    }
    const hintLine2 = document.getElementById('ppInline360HintLine2');
    if (hintLine2) {
        const line2Key = isTouch ? 'places.popup.hint_zoom_touch' : 'places.popup.hint_zoom_desktop';
        hintLine2.textContent = typeof window.t === 'function' ? window.t(line2Key) : (isTouch ? 'Pinch to zoom' : 'Scroll to zoom');
    }
    const photoComingSoon = document.getElementById('ppPhotoComingSoonText');
    if (photoComingSoon) {
        photoComingSoon.textContent = typeof window.t === 'function' ? window.t('places.popup.photo_coming_soon') : 'Photo coming soon';
    }
    const panoComingSoon = document.getElementById('ppPanoComingSoonText');
    if (panoComingSoon) {
        panoComingSoon.textContent = typeof window.t === 'function' ? window.t('places.popup.pano_coming_soon') : '360° view coming soon';
    }
    const hero360BtnText = document.getElementById('ppHero360BtnText');
    if (hero360BtnText) {
        hero360BtnText.textContent = typeof window.t === 'function' ? window.t('places.popup.view_360') : 'View 360°';
    }
    const ratingLabel = document.getElementById('ppRatingLabel');
    if (ratingLabel) {
        ratingLabel.textContent = typeof window.t === 'function' ? window.t('places.popup.rating_reviews') : 'Rating & reviews';
    }
    const planBtn = document.getElementById('ppPlanBtn');
    if (planBtn) {
        planBtn.textContent = typeof window.t === 'function' ? window.t('places.popup.plan_route') : 'Plan route';
    }
    const seeMoreBtn = document.getElementById('ppReviewsSeeMoreBtn');
    if (seeMoreBtn) {
        seeMoreBtn.textContent = typeof window.t === 'function' ? window.t('places.popup.see_more') : 'See more';
    }
    const hoursNoteEl = document.getElementById('ppHoursNote');
    if (hoursNoteEl && typeof window.t === 'function' && window.t('places.popup.hours_note') !== 'places.popup.hours_note') {
        hoursNoteEl.textContent = window.t('places.popup.hours_note');
    }
    if (currentActivePlace && currentActivePlace.social) fillPanelSocial(currentActivePlace.social);
    if (currentActivePlace && currentActivePlace.opening_hours) {
        const hoursData = formatOpeningHoursStatus(currentActivePlace.opening_hours);
        const hoursStatusEl = document.getElementById('ppHoursStatus');
        const hoursTableEl = document.getElementById('ppHoursTable');
        if (hoursData && hoursStatusEl) {
            hoursStatusEl.textContent = hoursData.statusText;
            hoursStatusEl.className = `panel-hours-status ${hoursData.isOpen ? 'open' : 'closed'}`;
        }
        if (hoursData && hoursData.hoursMap && hoursTableEl) {
            renderOpeningHoursTable(hoursData, hoursTableEl);
        }
    }
}
window.updatePlacePanelI18n = updatePlacePanelI18n;

window.addEventListener('calzada_lang_changed', () => {
    updatePlacePanelI18n();
    if (currentPlaceId) {
        fetchAndRenderReviews(currentPlaceId, true);
    }
});
