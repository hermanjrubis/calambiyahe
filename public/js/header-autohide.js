/**
 * header-autohide.js
 * Auto-hiding header module for Calzada.
 * Opt-in via <body data-header-autohide="true">.
 */
(function () {
    'use strict';

    function initHeaderAutohide() {
        if (typeof document === 'undefined') return;
        if (document.body.getAttribute('data-header-autohide') !== 'true') return;

        const navbar = document.getElementById('navbar') || document.querySelector('.navbar');
        if (!navbar) return;

        let lastScrollY = window.scrollY || 0;
        let ticking = false;
        let isHidden = false;

        function isAnyMenuOrOverlayOpen() {
            // Explore dropdown menu
            const exploreMenu = document.getElementById('exploreDropdown');
            if (exploreMenu && exploreMenu.classList.contains('open')) return true;

            // Language menu
            const langContainer = document.querySelector('.lang-dropdown-container.open') ||
                                  document.querySelector('.mobile-lang-container.open') ||
                                  document.querySelector('.lang-dropdown-menu.show');
            if (langContainer) return true;

            // Activity feed / alerts menu
            const alertsMenu = document.getElementById('alertsDropdownMenu');
            if (alertsMenu && (alertsMenu.classList.contains('open') || alertsMenu.classList.contains('show'))) return true;

            // User profile dropdown menu
            const userPill = document.getElementById('userAvatarPill');
            const userMenu = document.getElementById('userProfileMenu');
            if ((userPill && userPill.classList.contains('open')) || (userMenu && userMenu.classList.contains('open'))) return true;

            // Mobile side drawer
            const drawer = document.getElementById('sideDrawer');
            if (drawer && (drawer.classList.contains('open') || drawer.classList.contains('active')) || document.body.classList.contains('drawer-open')) return true;

            // Search panel
            const searchPanel = document.getElementById('headerSearchPanel');
            if (searchPanel && searchPanel.classList.contains('open')) return true;

            // Place popup panel
            const placePanel = document.getElementById('placePanel');
            if (placePanel && (placePanel.classList.contains('active') || placePanel.classList.contains('open'))) return true;
            if (document.querySelector('.place-panel-backdrop.active') || document.querySelector('.place-panel-container.active')) return true;

            // Any expanded ARIA state inside the navbar
            if (navbar.querySelector('[aria-expanded="true"]')) return true;

            // Keyboard focus inside navbar
            if (navbar.contains(document.activeElement)) return true;

            return false;
        }

        function getVisibleHeaderOffset() {
            const rect = navbar.getBoundingClientRect();
            // Visible bottom edge of the header in pixels
            return Math.max(0, Math.round(rect.bottom));
        }

        function updateHeaderOffset() {
            if (isHidden) {
                document.documentElement.style.setProperty('--header-offset', '0px');
            } else {
                const offset = getVisibleHeaderOffset() || 80;
                document.documentElement.style.setProperty('--header-offset', `${offset}px`);
            }
        }

        function showHeader() {
            if (!isHidden) {
                updateHeaderOffset();
                return;
            }
            isHidden = false;
            navbar.classList.remove('header-hidden');
            updateHeaderOffset();
            window.dispatchEvent(new CustomEvent('calzada_header_visibility_changed', { detail: { hidden: false } }));
        }

        function hideHeader() {
            if (isHidden) return;
            if (isAnyMenuOrOverlayOpen()) {
                showHeader();
                return;
            }
            isHidden = true;
            navbar.classList.add('header-hidden');
            updateHeaderOffset();
            window.dispatchEvent(new CustomEvent('calzada_header_visibility_changed', { detail: { hidden: true } }));
        }

        function onScroll() {
            const currentScrollY = window.scrollY || 0;

            if (isAnyMenuOrOverlayOpen()) {
                showHeader();
                lastScrollY = currentScrollY;
                ticking = false;
                return;
            }

            if (currentScrollY < 80) {
                // Near top of page: always show
                showHeader();
            } else if (currentScrollY > lastScrollY && currentScrollY > 80) {
                // Scrolling down past 80px: hide
                hideHeader();
            } else if (lastScrollY - currentScrollY >= 8) {
                // Scrolling up by at least 8px: show
                showHeader();
            }

            lastScrollY = currentScrollY;
            ticking = false;
        }

        window.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(onScroll);
                ticking = true;
            }
        }, { passive: true });

        // Ensure header becomes visible if keyboard focus enters it
        navbar.addEventListener('focusin', () => {
            showHeader();
        });

        // Recalculate on resize
        window.addEventListener('resize', () => {
            if (!isHidden) updateHeaderOffset();
        });

        // Listen for external requests to show/hide header
        window.addEventListener('calzada_force_show_header', showHeader);

        // Initial setup
        updateHeaderOffset();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHeaderAutohide);
    } else {
        initHeaderAutohide();
    }
})();
