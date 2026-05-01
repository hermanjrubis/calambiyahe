/**
 * Calzada – Smooth Page Transitions (Cube Loader)
 */
(function () {
    const overlay = document.getElementById('page-transition');
    if (!overlay) return;

    // Inject cube loader content if not already there
    if (!overlay.querySelector('.pt-cubes')) {
        overlay.innerHTML = `
            <div class="pt-cubes">
                <div class="pt-cube"><span class="pt-cube__inner"></span></div>
                <div class="pt-cube"><span class="pt-cube__inner"></span></div>
                <div class="pt-cube"><span class="pt-cube__inner"></span></div>
            </div>
            <div class="pt-label">Loading…</div>
        `;
    }

    // Fade IN on page load — remove overlay
    function fadeOut() {
        overlay.classList.remove('fade-in');
    }

    if (document.readyState === 'complete') {
        fadeOut();
    } else {
        window.addEventListener('pageshow', fadeOut);
        window.addEventListener('load', fadeOut);
    }

    // Intercept internal link clicks → fade-in overlay, then navigate
    document.addEventListener('click', (e) => {
        const link = e.target.closest('a[href]');
        if (!link) return;

        const href = link.getAttribute('href');

        // Ignore: external, anchors, javascript:, mailto:, target=_blank
        if (
            !href ||
            href.startsWith('#') ||
            href.startsWith('javascript') ||
            href.startsWith('http') ||
            href.startsWith('mailto') ||
            link.target === '_blank'
        ) return;

        e.preventDefault();
        overlay.classList.add('fade-in');

        setTimeout(() => {
            window.location.href = href;
        }, 400);
    });
})();
