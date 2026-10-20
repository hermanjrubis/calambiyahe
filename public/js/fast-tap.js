/**
 * Calzada Fast Tap Utility
 * Bypasses WebKit's cancelled synthetic clicks on iOS Safari for primary tap targets.
 * Triggers handler on pointerup (touch/pen) after validating gesture movement and scroll state,
 * while suppressing the trailing synthetic click.
 */
(function(window) {
    'use strict';

    // Global suppression tracking for synthetic clicks following a fast-tap
    let suppressedElement = null;
    let suppressedUntil = 0;
    let suppressedX = null;
    let suppressedY = null;
    let clickListenerAttached = false;

    function onSyntheticClickCapture(e) {
        const now = Date.now();
        let shouldSuppress = false;

        if (now < suppressedUntil) {
            if (suppressedElement && (e.target === suppressedElement || (suppressedElement.contains && suppressedElement.contains(e.target)))) {
                shouldSuppress = true;
            } else if (suppressedX != null && suppressedY != null) {
                // Intercept phantom synthetic clicks on newly opened overlays (e.g. backdrop)
                const dist = Math.hypot(e.clientX - suppressedX, e.clientY - suppressedY);
                if (dist <= 40) {
                    shouldSuppress = true;
                }
            }
        }

        if (!shouldSuppress) {
            let cur = e.target;
            while (cur && cur !== document) {
                if (cur.__calzadaFastTapSuppressedUntil && now < cur.__calzadaFastTapSuppressedUntil) {
                    shouldSuppress = true;
                    break;
                }
                cur = cur.parentElement;
            }
        }

        if (shouldSuppress) {
            e.preventDefault();
            e.stopImmediatePropagation();
            // Clear suppression once the synthetic click has been intercepted
            suppressedElement = null;
            suppressedUntil = 0;
            suppressedX = null;
            suppressedY = null;
        }
    }

    function ensureClickListener() {
        if (clickListenerAttached) return;
        clickListenerAttached = true;
        window.addEventListener('click', onSyntheticClickCapture, true);
    }

    function getNearestScrollableAncestor(el) {
        let cur = el && el.parentElement;
        while (cur && cur !== document.body && cur !== document.documentElement) {
            try {
                const style = window.getComputedStyle(cur);
                const overflow = (style.overflow || '') + (style.overflowY || '') + (style.overflowX || '');
                if (/(auto|scroll)/.test(overflow)) {
                    return cur;
                }
            } catch (_) {}
            cur = cur.parentElement;
        }
        return null;
    }

    // Active pointers Map: pointerId -> pointerData
    const activePointers = new Map();
    let globalPointerListenersAttached = false;

    function ensureGlobalPointerListeners() {
        if (globalPointerListenersAttached) return;
        globalPointerListenersAttached = true;

        window.addEventListener('pointermove', function(e) {
            const data = activePointers.get(e.pointerId);
            if (!data || data.cancelled) return;
            const dist = Math.hypot(e.clientX - data.startX, e.clientY - data.startY);
            if (dist > 10) {
                data.cancelled = true;
            }
        }, { passive: true });

        window.addEventListener('pointercancel', function(e) {
            const data = activePointers.get(e.pointerId);
            if (data) {
                data.cancelled = true;
                activePointers.delete(e.pointerId);
            }
        }, { passive: true });

        window.addEventListener('pointerup', function(e) {
            const data = activePointers.get(e.pointerId);
            if (!data) return;
            activePointers.delete(e.pointerId);

            if (data.cancelled) return;

            // Gesture validation: duration <= 600ms, movement <= 10px
            const duration = Date.now() - data.startTime;
            if (duration > 600) return;

            const dist = Math.hypot(e.clientX - data.startX, e.clientY - data.startY);
            if (dist > 10) return;

            // Scroll validation: window scroll unchanged
            const curWinScrollY = window.pageYOffset || window.scrollY || (document.documentElement ? document.documentElement.scrollTop : 0) || 0;
            const curWinScrollX = window.pageXOffset || window.scrollX || (document.documentElement ? document.documentElement.scrollLeft : 0) || 0;
            if (curWinScrollY !== data.winScrollY || curWinScrollX !== data.winScrollX) return;

            // Ancestor scroll unchanged
            if (data.ancestor) {
                if (data.ancestor.scrollTop !== data.ancScrollTop || data.ancestor.scrollLeft !== data.ancScrollLeft) return;
            }

            const matchedTarget = data.matchedTarget;
            if (!matchedTarget) return;

            // Ignore disabled elements
            if (matchedTarget.disabled || matchedTarget.getAttribute('aria-disabled') === 'true') return;

            // Mark element so next click within 700 ms is ignored
            const suppressUntil = Date.now() + 700;
            matchedTarget.__calzadaFastTapSuppressedUntil = suppressUntil;
            suppressedElement = matchedTarget;
            suppressedUntil = suppressUntil;
            suppressedX = e.clientX;
            suppressedY = e.clientY;

            try {
                data.handler.call(matchedTarget, e);
            } catch (err) {
                console.error('[fast-tap] Handler error:', err);
            }
        }, { passive: true });
    }

    /**
     * Bind fast tap handler to an element or selector via event delegation.
     * @param {Element|string} target Container element or selector
     * @param {string|Function} selectorOrHandler Selector for delegation or handler function
     * @param {Function} [maybeHandler] Handler function when using delegation
     */
    function bindTap(target, selectorOrHandler, maybeHandler) {
        if (!target) return;

        let container = null;
        let selector = null;
        let handler = null;

        if (typeof selectorOrHandler === 'function') {
            handler = selectorOrHandler;
            if (typeof target === 'string') {
                const found = document.querySelector(target);
                if (found) {
                    container = found;
                    selector = null;
                } else {
                    selector = target;
                    container = document;
                }
            } else {
                container = target;
                selector = null;
            }
        } else if (typeof selectorOrHandler === 'string' && typeof maybeHandler === 'function') {
            selector = selectorOrHandler;
            handler = maybeHandler;
            if (typeof target === 'string') {
                container = document.querySelector(target) || document;
            } else {
                container = target;
            }
        } else {
            return;
        }

        if (!container || typeof handler !== 'function') return;

        ensureClickListener();
        ensureGlobalPointerListeners();

        container.addEventListener('pointerdown', function(e) {
            // Only handle touch or pen
            if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;

            // If an inner container already claimed this pointerdown, ignore
            if (e.__calzadaFastTapClaimed) return;

            let matchedTarget = null;
            if (selector) {
                matchedTarget = e.target && e.target.closest ? e.target.closest(selector) : null;
                if (!matchedTarget || !container.contains(matchedTarget)) return;
            } else {
                matchedTarget = container;
                if (!container.contains(e.target)) return;
            }

            // Claim this event to avoid duplicate handling on nested bindTap containers
            e.__calzadaFastTapClaimed = true;

            const ancestor = getNearestScrollableAncestor(matchedTarget);
            const winScrollY = window.pageYOffset || window.scrollY || (document.documentElement ? document.documentElement.scrollTop : 0) || 0;
            const winScrollX = window.pageXOffset || window.scrollX || (document.documentElement ? document.documentElement.scrollLeft : 0) || 0;
            const ancScrollTop = ancestor ? ancestor.scrollTop : 0;
            const ancScrollLeft = ancestor ? ancestor.scrollLeft : 0;

            activePointers.set(e.pointerId, {
                pointerId: e.pointerId,
                startX: e.clientX,
                startY: e.clientY,
                startTime: Date.now(),
                matchedTarget: matchedTarget,
                ancestor: ancestor,
                winScrollY: winScrollY,
                winScrollX: winScrollX,
                ancScrollTop: ancScrollTop,
                ancScrollLeft: ancScrollLeft,
                handler: handler,
                cancelled: false
            });
        }, { passive: true });
    }

    window.bindTap = bindTap;
})(window);
