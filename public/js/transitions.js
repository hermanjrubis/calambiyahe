/**
 * Calzada – Modernized Skeleton Loading System
 */
(function () {
    const path = window.location.pathname;
    const page = path.split('/').pop() || '/';

    // Shared Navbar Skeleton
    const navSkeleton = `
        <div style="height: 76px; width: 100%; position: absolute; top: 0; left: 0; display: flex; align-items: center; justify-content: space-between; padding: 0 5%; z-index: 10;">
            <div class="skeleton" style="width: 130px; height: 32px; border-radius: 8px;"></div>
            <div style="display: flex; gap: 24px; align-items: center;" class="nav-desktop-only">
                <div class="skeleton" style="width: 50px; height: 16px; border-radius: 4px;"></div>
                <div class="skeleton" style="width: 80px; height: 16px; border-radius: 4px;"></div>
                <div class="skeleton" style="width: 40px; height: 16px; border-radius: 4px;"></div>
                <div class="skeleton" style="width: 120px; height: 44px; border-radius: 22px;"></div>
            </div>
        </div>
        <style>
            @media (max-width: 768px) {
                #skeleton-overlay .nav-desktop-only { display: none !important; }
            }
        </style>
    `;

    // Skeleton Templates matching actual Calzada Layouts
    const SKELETONS = {
        '/': `
            ${navSkeleton}
            <div style="height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 5%; background: linear-gradient(135deg, #f0f6fc 0%, #e2eaf5 100%);">
                <div class="skeleton sk-circle" style="width: 90px; height: 90px; margin-bottom: 24px; box-shadow: 0 8px 24px rgba(0,0,0,0.05);"></div>
                <div class="skeleton" style="width: 80%; max-width: 500px; height: 48px; border-radius: 12px; margin-bottom: 16px;"></div>
                <div class="skeleton" style="width: 60%; max-width: 380px; height: 20px; border-radius: 6px; margin-bottom: 40px;"></div>
                
                <div class="skeleton" style="width: 100%; max-width: 650px; height: 64px; border-radius: 32px; box-shadow: 0 12px 32px rgba(26,143,255,0.1);"></div>
            </div>
        `,
        '/planner': `
            <div style="display: flex; height: 100vh; width: 100vw; overflow: hidden; background: #f8fafc;">
                <!-- Sidebar -->
                <div class="planner-sidebar-sk" style="width: 400px; background: #ffffff; padding: 24px; display: flex; flex-direction: column; gap: 20px; border-right: 1px solid #e2eaf5; z-index: 5;">
                    <div class="skeleton" style="width: 100%; height: 140px; border-radius: 20px; margin-top: 60px;"></div>
                    <div class="skeleton" style="width: 140px; height: 36px; border-radius: 18px;"></div>
                    <div style="display: flex; gap: 12px;">
                        <div class="skeleton" style="flex: 1; height: 44px; border-radius: 12px;"></div>
                        <div class="skeleton" style="flex: 1; height: 44px; border-radius: 12px;"></div>
                        <div class="skeleton" style="flex: 1; height: 44px; border-radius: 12px;"></div>
                    </div>
                    <div class="skeleton" style="width: 100%; height: 100px; border-radius: 16px; margin-top: 10px;"></div>
                    <div class="skeleton" style="width: 100%; height: 100px; border-radius: 16px;"></div>
                </div>
                <!-- Map Area -->
                <div style="flex: 1; position: relative;">
                    <div class="skeleton" style="width: 100%; height: 100%; border-radius: 0;"></div>
                    <!-- Top Right Controls -->
                    <div style="position: absolute; top: 24px; right: 24px; display: flex; gap: 12px;">
                        <div class="skeleton" style="width: 60px; height: 44px; border-radius: 22px;"></div>
                        <div class="skeleton" style="width: 120px; height: 44px; border-radius: 22px;"></div>
                        <div class="skeleton sk-circle" style="width: 44px; height: 44px;"></div>
                    </div>
                </div>
            </div>
            <style>
                @media (max-width: 768px) {
                    #skeleton-overlay .planner-sidebar-sk { width: 100% !important; position: absolute; bottom: 0; height: 60vh; border-radius: 24px 24px 0 0; padding-top: 40px !important; }
                }
            </style>
        `,
        '/places': `
            ${navSkeleton}
            <!-- Hero -->
            <div style="padding: 120px 5% 60px; text-align: center; background: #f0f6fc;">
                <div class="skeleton" style="width: 60%; max-width: 450px; height: 40px; border-radius: 12px; margin: 0 auto 16px;"></div>
                <div class="skeleton" style="width: 80%; max-width: 550px; height: 20px; border-radius: 6px; margin: 0 auto 40px;"></div>
                <div class="skeleton" style="width: 100%; max-width: 600px; height: 60px; border-radius: 30px; margin: 0 auto;"></div>
            </div>
            <!-- Main Content -->
            <div style="padding: 40px 5%; max-width: 1200px; margin: auto;">
                <!-- Tabs -->
                <div style="display: flex; gap: 12px; margin-bottom: 40px; overflow: hidden;">
                    <div class="skeleton" style="width: 110px; height: 42px; border-radius: 21px; flex-shrink: 0;"></div>
                    <div class="skeleton" style="width: 130px; height: 42px; border-radius: 21px; flex-shrink: 0;"></div>
                    <div class="skeleton" style="width: 140px; height: 42px; border-radius: 21px; flex-shrink: 0;"></div>
                    <div class="skeleton" style="width: 100px; height: 42px; border-radius: 21px; flex-shrink: 0;"></div>
                    <div class="skeleton" style="width: 120px; height: 42px; border-radius: 21px; flex-shrink: 0;"></div>
                </div>
                <!-- Section Label -->
                <div class="skeleton" style="width: 150px; height: 24px; border-radius: 6px; margin-bottom: 24px;"></div>
                <!-- Grid -->
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 24px;">
                    <div class="skeleton" style="height: 280px; border-radius: 24px;"></div>
                    <div class="skeleton" style="height: 280px; border-radius: 24px;"></div>
                    <div class="skeleton" style="height: 280px; border-radius: 24px;"></div>
                    <div class="skeleton" style="height: 280px; border-radius: 24px;"></div>
                    <div class="skeleton" style="height: 280px; border-radius: 24px;"></div>
                    <div class="skeleton" style="height: 280px; border-radius: 24px;"></div>
                </div>
            </div>
        `,
        '/login': `
            ${navSkeleton}
            <div style="display: flex; align-items: center; justify-content: center; height: 100vh; padding: 20px; background: #f8fafc;">
                <div style="background: #ffffff; width: 100%; max-width: 480px; padding: 40px 32px; border-radius: 24px; box-shadow: 0 10px 40px rgba(0,0,0,0.04);">
                    <div style="display: flex; gap: 12px; margin-bottom: 32px;">
                        <div class="skeleton" style="flex: 1; height: 44px; border-radius: 12px;"></div>
                        <div class="skeleton" style="flex: 1; height: 44px; border-radius: 12px;"></div>
                    </div>
                    <div class="skeleton" style="width: 200px; height: 32px; border-radius: 8px; margin-bottom: 12px;"></div>
                    <div class="skeleton" style="width: 80%; height: 16px; border-radius: 4px; margin-bottom: 32px;"></div>
                    
                    <div class="skeleton" style="width: 100%; height: 56px; border-radius: 14px; margin-bottom: 16px;"></div>
                    <div class="skeleton" style="width: 100%; height: 56px; border-radius: 14px; margin-bottom: 24px;"></div>
                    
                    <div class="skeleton" style="width: 100%; height: 52px; border-radius: 26px; margin-bottom: 32px;"></div>
                    
                    <div class="skeleton" style="width: 100%; height: 52px; border-radius: 14px;"></div>
                </div>
            </div>
        `,
        '/faq': `
            ${navSkeleton}
            <div style="padding: 120px 5% 60px; max-width: 800px; margin: auto;">
                <div class="skeleton" style="width: 60%; max-width: 400px; height: 40px; border-radius: 12px; margin: 0 auto 48px;"></div>
                
                <div class="skeleton" style="width: 100%; height: 72px; border-radius: 16px; margin-bottom: 16px;"></div>
                <div class="skeleton" style="width: 100%; height: 72px; border-radius: 16px; margin-bottom: 16px;"></div>
                <div class="skeleton" style="width: 100%; height: 72px; border-radius: 16px; margin-bottom: 16px;"></div>
                <div class="skeleton" style="width: 100%; height: 72px; border-radius: 16px; margin-bottom: 16px;"></div>
                <div class="skeleton" style="width: 100%; height: 72px; border-radius: 16px; margin-bottom: 16px;"></div>
                <div class="skeleton" style="width: 100%; height: 72px; border-radius: 16px;"></div>
            </div>
        `,
        '/about': `
            ${navSkeleton}
            <div style="padding: 120px 5% 60px; max-width: 800px; margin: auto;">
                <!-- Main Header Title -->
                <div class="skeleton" style="width: 180px; height: 42px; border-radius: 12px; margin-bottom: 40px;"></div>
                
                <!-- Float Right Wordmark + Text -->
                <div style="overflow: hidden; margin-bottom: 40px;">
                    <div class="skeleton" style="float: right; width: 160px; height: 40px; border-radius: 8px; margin: 6px 0 15px 25px;"></div>
                    <div class="skeleton" style="width: 100%; height: 16px; border-radius: 4px; margin-bottom: 12px;"></div>
                    <div class="skeleton" style="width: 100%; height: 16px; border-radius: 4px; margin-bottom: 12px;"></div>
                    <div class="skeleton" style="width: 75%; height: 16px; border-radius: 4px; margin-bottom: 12px;"></div>
                </div>
                
                <!-- Float Left Mockup + Text Wrap -->
                <div style="overflow: hidden; margin-bottom: 40px;">
                    <div class="skeleton" style="float: left; width: 290px; height: 400px; border-radius: 24px; margin: 10px 35px 25px 0;"></div>
                    <div class="skeleton" style="width: 100%; height: 16px; border-radius: 4px; margin-bottom: 12px;"></div>
                    <div class="skeleton" style="width: 100%; height: 16px; border-radius: 4px; margin-bottom: 12px;"></div>
                    <div class="skeleton" style="width: 100%; height: 16px; border-radius: 4px; margin-bottom: 12px;"></div>
                    <div class="skeleton" style="width: 100%; height: 16px; border-radius: 4px; margin-bottom: 12px;"></div>
                    <div class="skeleton" style="width: 80%; height: 16px; border-radius: 4px; margin-bottom: 32px;"></div>
                    
                    <div class="skeleton" style="width: 100%; height: 16px; border-radius: 4px; margin-bottom: 12px;"></div>
                    <div class="skeleton" style="width: 100%; height: 16px; border-radius: 4px; margin-bottom: 12px;"></div>
                    <div class="skeleton" style="width: 90%; height: 16px; border-radius: 4px; margin-bottom: 32px;"></div>
                </div>
                
                <!-- Goal Section Header -->
                <div class="skeleton" style="width: 120px; height: 32px; border-radius: 8px; margin-bottom: 20px; clear: both;"></div>
                <div class="skeleton" style="width: 100%; height: 16px; border-radius: 4px; margin-bottom: 12px;"></div>
                <div class="skeleton" style="width: 100%; height: 16px; border-radius: 4px; margin-bottom: 12px;"></div>
                <div class="skeleton" style="width: 60%; height: 16px; border-radius: 4px; margin-bottom: 60px;"></div>
                
                <!-- Supported Modes Grid -->
                <div class="skeleton" style="width: 200px; height: 32px; border-radius: 8px; margin: 0 auto 24px;"></div>
                <div style="display: flex; flex-wrap: wrap; gap: 16px; justify-content: center; margin-bottom: 60px;">
                    <div class="skeleton" style="width: 130px; height: 48px; border-radius: 16px;"></div>
                    <div class="skeleton" style="width: 110px; height: 48px; border-radius: 16px;"></div>
                    <div class="skeleton" style="width: 130px; height: 48px; border-radius: 16px;"></div>
                    <div class="skeleton" style="width: 120px; height: 48px; border-radius: 16px;"></div>
                    <div class="skeleton" style="width: 110px; height: 48px; border-radius: 16px;"></div>
                </div>

                <!-- Bakit Calzada cards -->
                <div class="skeleton" style="width: 180px; height: 32px; border-radius: 8px; margin: 0 auto 32px;"></div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 24px; margin-bottom: 80px;">
                    <div class="skeleton" style="height: 180px; border-radius: 24px;"></div>
                    <div class="skeleton" style="height: 180px; border-radius: 24px;"></div>
                    <div class="skeleton" style="height: 180px; border-radius: 24px;"></div>
                </div>

                <!-- Glowing Bottom CTA -->
                <div class="skeleton" style="width: 100%; height: 220px; border-radius: 32px;"></div>
            </div>
        `
    };

    // DOMContentLoaded: Inject skeleton and show body
    document.addEventListener('DOMContentLoaded', () => {
        // FOUC Fix: allow body to become visible. Skeleton covers it immediately.
        document.body.classList.add('fouc-ready');

        // Fallback for root path matching index.html
        const pageKey = (page === '' || page === '/') ? '/' : page;

        if (SKELETONS[pageKey]) {
            const skWrap = document.createElement('div');
            skWrap.id = 'skeleton-overlay';
            skWrap.innerHTML = SKELETONS[pageKey];
            document.body.appendChild(skWrap);

            // Hide actual main content elements initially to prevent layout shifts underneath
            const mainContentSelectors = ['main', '.scrollable-content', '.planner-gui-container', '.places-page', '.auth-page-container', '.ref-hero'];
            mainContentSelectors.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => {
                    el.style.opacity = '0';
                });
            });
        }
    });

    // Fade IN on window load (fonts & images ready)
    function fadeOut() {
        // Fade out skeleton
        const skWrap = document.getElementById('skeleton-overlay');
        if (skWrap) {
            skWrap.classList.add('hidden');
            setTimeout(() => skWrap.remove(), 500);

            // Reveal main content smoothly
            const mainContentSelectors = ['main', '.scrollable-content', '.planner-gui-container', '.places-page', '.auth-page-container', '.ref-hero'];
            mainContentSelectors.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => {
                    el.style.transition = 'opacity 0.4s ease';
                    el.style.opacity = '1';
                });
            });
        }
    }

    if (document.readyState === 'complete') {
        fadeOut();
    } else {
        window.addEventListener('pageshow', fadeOut);
        window.addEventListener('load', fadeOut);
    }

    // ── PAGE EXIT TRANSITION ────────────────────────────────────────────────
    // Intercept internal same-origin link clicks to choreograph a smooth exit:
    // 1. Instantly dismiss any open drawer/overlay (prevents frozen blur artifacts)
    // 2. Fade out the page body via .page-is-exiting CSS class
    // 3. Navigate after the fade completes (150ms)

    function isInternalLink(anchor) {
        if (!anchor || !anchor.href) return false;
        // Skip hash-only, javascript:, mailto:, tel:, legal modals, and external links
        if (anchor.hasAttribute('data-open-legal')) return false;
        if (anchor.getAttribute('href').startsWith('#')) return false;
        if (anchor.getAttribute('href').startsWith('javascript:')) return false;
        if (anchor.getAttribute('href').startsWith('mailto:')) return false;
        if (anchor.getAttribute('href').startsWith('tel:')) return false;
        // Must be same origin
        try {
            const url = new URL(anchor.href, window.location.origin);
            if (url.origin !== window.location.origin) return false;
            // Must be a page, not an asset or an API endpoint. Pages are served on clean
            // extension-less URLs now (/about), so identify them by the absence of a file
            // extension rather than by a .html suffix; /api/* is never a page.
            const lastSegment = url.pathname.split('/').pop();
            if (url.pathname.startsWith('/api/')) return false;
            if (lastSegment && /\.[a-zA-Z0-9]{2,5}$/.test(lastSegment) && !lastSegment.endsWith('.html')) return false;
            return true;
        } catch (e) {
            return false;
        }
    }

    document.addEventListener('click', function (e) {
        // Find closest <a> ancestor (handles clicks on child spans/icons inside links)
        const anchor = e.target.closest('a');
        if (!anchor || !isInternalLink(anchor)) return;

        // Skip if modifier keys are held (open in new tab, etc.)
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        // Skip if target="_blank"
        if (anchor.target === '_blank') return;

        e.preventDefault();
        const href = anchor.href;

        // 1. Instantly dismiss any open drawer/overlay to prevent frozen blur
        const sd = document.getElementById('sideDrawer');
        const so = document.getElementById('sideDrawerOverlay');
        if (sd && sd.classList.contains('open')) {
            sd.style.transition = 'none';
            sd.classList.remove('open');
        }
        if (so && so.classList.contains('visible')) {
            so.style.transition = 'none';
            so.classList.remove('visible');
        }
        // Also dismiss nav-center floating card if open
        const nc = document.getElementById('navLinks');
        if (nc && nc.classList.contains('active')) {
            nc.classList.remove('active');
        }
        document.body.style.overflow = '';

        // 2. Fade out the page
        document.body.classList.add('page-is-exiting');

        // 3. Navigate after fade completes
        setTimeout(function () {
            window.location.href = href;
        }, 160);
    }, true); // Use capture phase to intercept before other handlers

    // ── BFCACHE & VISIBILITY SAFEGUARDS ────────────────────────────────────
    // Ensure page-is-exiting is always cleared when the page becomes visible again

    window.addEventListener('pageshow', function (e) {
        if (e.persisted) {
            // Restored from bfcache — remove exit class and ensure body is visible
            document.body.classList.remove('page-is-exiting');
            document.body.classList.add('fouc-ready');
            // Remove skeleton overlay if it was left over
            const skWrap = document.getElementById('skeleton-overlay');
            if (skWrap) skWrap.remove();
        }
    });

    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') {
            document.body.classList.remove('page-is-exiting');
        }
    });
})();
