/**
 * site-drawer.js
 * The site menu (hamburger + side drawer) for pages that do not load script.js:
 * Updates, My Business and Admin. Same behaviour as the other pages:
 * opens from the right, closes on the X, the dimmed background, Escape,
 * a link tap or a swipe to the right, and marks the current page.
 * Any button with data-site-menu opens and closes it.
 */
(function () {
    function navKey(value) {
        const path = String(value || '').split('?')[0].split('#')[0];
        const last = path.split('/').filter(Boolean).pop() || '';
        const key = last.replace(/\.html$/i, '').toLowerCase();
        return (!key || key === 'index') ? 'home' : key;
    }

    function init() {
        const drawer = document.getElementById('sideDrawer');
        const overlay = document.getElementById('sideDrawerOverlay');
        if (!drawer || !overlay || drawer.dataset.ready === '1') return;
        drawer.dataset.ready = '1';
        const closeBtn = document.getElementById('drawerCloseBtn');
        const toggles = Array.from(document.querySelectorAll('[data-site-menu]'));
        let lastFocus = null;

        function markActive() {
            const current = navKey(window.location.pathname);
            drawer.querySelectorAll('.drawer-links a[href]').forEach(a => {
                const on = navKey(a.getAttribute('href')) === current;
                a.classList.toggle('active', on);
                if (on) a.setAttribute('aria-current', 'page');
                else a.removeAttribute('aria-current');
            });
        }

        function isOpen() { return drawer.classList.contains('open'); }

        function setOpen(open) {
            drawer.style.transition = '';
            overlay.style.transition = '';
            drawer.style.transform = '';
            overlay.style.opacity = '';
            void drawer.offsetWidth;
            drawer.classList.toggle('open', open);
            overlay.classList.toggle('visible', open);
            drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
            drawer.inert = !open;
            toggles.forEach(btn => {
                btn.setAttribute('aria-expanded', open ? 'true' : 'false');
                btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
                const icon = btn.querySelector('.menu-toggle-icon');
                if (icon) icon.classList.toggle('open', open);
            });
            document.body.classList.toggle('menu-open', open);
            document.body.style.overflow = open ? 'hidden' : '';
            if (open) {
                markActive();
                lastFocus = document.activeElement;
                setTimeout(() => { if (closeBtn) closeBtn.focus({ preventScroll: true }); }, 80);
            } else if (lastFocus && typeof lastFocus.focus === 'function' && toggles.includes(lastFocus)) {
                lastFocus.focus({ preventScroll: true });
            }
        }

        drawer.inert = true;
        drawer.setAttribute('aria-hidden', 'true');
        markActive();

        toggles.forEach(btn => btn.addEventListener('click', (e) => {
            e.preventDefault();
            setOpen(!isOpen());
        }));
        if (closeBtn) closeBtn.addEventListener('click', () => setOpen(false));
        overlay.addEventListener('click', () => setOpen(false));
        drawer.querySelectorAll('.drawer-links a').forEach(a => a.addEventListener('click', () => setOpen(false)));
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isOpen()) setOpen(false);
        });

        // Swipe right to close, like the other pages
        let startX = 0, lastX = 0, lastT = 0, velocity = 0, dragging = false;
        drawer.addEventListener('touchstart', (e) => {
            if (!isOpen()) return;
            startX = lastX = e.touches[0].clientX;
            lastT = Date.now();
            velocity = 0;
            dragging = true;
            drawer.style.transition = 'none';
        }, { passive: true });
        document.addEventListener('touchmove', (e) => {
            if (!dragging || !isOpen()) return;
            const x = e.touches[0].clientX;
            const now = Date.now();
            velocity = (x - lastX) / Math.max(1, now - lastT);
            lastX = x;
            lastT = now;
            const delta = Math.max(0, x - startX);
            drawer.style.transform = `translateX(${delta}px)`;
            overlay.style.opacity = String(1 - delta / drawer.offsetWidth);
        }, { passive: true });
        document.addEventListener('touchend', () => {
            if (!dragging) return;
            dragging = false;
            const far = lastX - startX > drawer.offsetWidth * 0.4;
            drawer.style.transition = 'transform 0.42s cubic-bezier(0.32, 0.72, 0, 1)';
            overlay.style.transition = 'opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1)';
            if (far || velocity > 0.5) {
                setOpen(false);
            } else {
                drawer.style.transform = 'translateX(0)';
                overlay.style.opacity = '1';
                setTimeout(() => {
                    drawer.style.transition = '';
                    overlay.style.transition = '';
                    overlay.style.opacity = '';
                    drawer.style.transform = '';
                }, 450);
            }
        });

        window.CalzadaSiteDrawer = { open: () => setOpen(true), close: () => setOpen(false) };
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
