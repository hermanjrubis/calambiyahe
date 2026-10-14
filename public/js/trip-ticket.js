/**
 * Calzada trip summary ticket + in-app confirm dialog
 * - Arrival ticket on the planner: Save (PNG image) + Done
 * - Save renders the ticket card to a 2x PNG (Web Share when it accepts files, else download)
 * - confirm(): Calzada-style confirm dialog (no window.confirm), used by My Trips
 *
 * Trip shape (times as epoch ms):
 *   { destName, originLabel, startedAt|null, arrivedAt, durationMin|null, estimatedMin,
 *     distanceKm, fare, mode: 'walk'|'jeepney',
 *     legs: [{ type: 'walk'|'jeepney', durationMin, distanceKm, fare, boardStop|null, alightStop|null }] }
 *
 * Exposed as window.CalzadaTicket. Styles live in css/trips.css, loaded on first use.
 */
(function () {
    'use strict';

    if (window.CalzadaTicket) return;

    const CSS_HREF = '/css/trips.css?v=1.1.1';
    const HTML_TO_IMAGE_SRC = '/vendor/html-to-image/html-to-image-1.11.11.js';
    const JEEPNEY_ICON = '/assets/icons/jeepney-icon.png';

    // English fallbacks for moments where i18n.js has not loaded yet.
    const EN = {
        'ticket.trip_complete': 'Trip complete',
        'ticket.from': 'from {origin}',
        'ticket.travel_time': 'Travel time',
        'ticket.distance': 'Distance',
        'ticket.total_fare': 'Total fare',
        'ticket.est': 'Est. {min}',
        'ticket.estimated': 'Estimated',
        'ticket.departed': 'Departed',
        'ticket.arrived': 'Arrived',
        'ticket.boarded': 'Boarded jeepney',
        'ticket.got_off': 'Got off',
        'ticket.save': 'Save',
        'ticket.done': 'Done',
        'ticket.save_failed': "Couldn't save the ticket. Try again.",
        'trips.cancel': 'Cancel',
        'planner.walk_leg': 'Walk {dist} · {time}',
        'planner.nav_jeepney': 'Jeepney',
        'planner.free': 'Free',
        'planner.my_location': 'My Location',
        'planner.pinned_location': 'Pinned location'
    };

    const tr = (key, params) => {
        let s = window.t ? window.t(key, params) : null;
        if (!s || s === key) {
            s = EN[key] || key;
            if (params) Object.entries(params).forEach(([k, v]) => { s = s.split(`{${k}}`).join(v); });
        }
        return s;
    };
    const isTagalog = () => { try { return localStorage.getItem('calzada_lang') === 'tl'; } catch (_) { return false; } };
    const esc = (str) => String(str == null ? '' : str).replace(/[&<>'"]/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

    // ── Formatting (also used by My Trips, so list and ticket read the same) ──
    // "1 min" (also for under a minute), "18 min", "1 hr 5 min"
    const fmtMinutes = (min) => {
        const m = Math.max(1, Math.round(min));
        if (m < 60) return `${m} min`;
        const h = Math.floor(m / 60), rest = m % 60;
        return rest ? `${h} hr ${rest} min` : `${h} hr`;
    };
    const fmtTime = (ms) => {
        const d = new Date(ms);
        if (isNaN(d.getTime())) return '--:--';
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };
    // Under 1 km in metres (nearest 10), else km with one decimal
    const fmtKm = (km) => {
        const m = (Number(km) || 0) * 1000;
        return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
    };
    const fmtDate = (ms) => new Date(ms).toLocaleDateString(isTagalog() ? 'fil-PH' : 'en-US',
        { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    const originText = (label) => {
        if (!label || label === 'My Location') return tr('planner.my_location');
        if (label === 'Pinned location') return tr('planner.pinned_location');
        return label;
    };
    const fareText = (mode, fare) => mode === 'jeepney' && fare > 0 ? `₱${fare}` : tr('planner.free');

    // ── Icons (ionicons glyphs inlined: shadow-DOM icons do not render into the PNG) ──
    const ICON_CHECK = '<svg width="14" height="14" viewBox="0 0 512 512" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="48" d="M416 128L192 384l-96-96"/></svg>';
    const ICON_SAVE = '<svg width="18" height="18" viewBox="0 0 512 512"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="40" d="M336 176h40a40 40 0 0140 40v208a40 40 0 01-40 40H136a40 40 0 01-40-40V216a40 40 0 0140-40h40"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="40" d="M176 272l80 80 80-80M256 48v288"/></svg>';
    const ICON_WALK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="#475569" aria-hidden="true"><path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/></svg>';

    // ── Stylesheet ───────────────────────────────────────────────────────────
    let cssPromise = null;
    const ensureStyles = () => cssPromise || (cssPromise = new Promise((resolve) => {
        if (document.querySelector('link[data-calzada-trips-css]')) { resolve(); return; }
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = CSS_HREF;
        link.setAttribute('data-calzada-trips-css', '');
        link.onload = () => resolve();
        link.onerror = () => resolve(); // unstyled beats blocked
        document.head.appendChild(link);
    }));

    // ── DOM ──────────────────────────────────────────────────────────────────
    let els = null;
    const ensureDom = () => {
        if (els) return els;
        const overlay = document.createElement('div');
        overlay.className = 'tkt-overlay';
        const dialog = document.createElement('div');
        dialog.className = 'trip-ticket';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', 'tktDest');
        dialog.setAttribute('aria-hidden', 'true');
        dialog.innerHTML = `
            <div class="tkt-card">
                <!-- .tkt-sheet is what Save renders to PNG (no buttons) -->
                <div class="tkt-sheet">
                    <div class="tkt-head">
                        <span class="tkt-chip">${ICON_CHECK}<span data-tkt="chip"></span></span>
                        <h2 class="tkt-dest" id="tktDest"></h2>
                        <p class="tkt-from" data-tkt="from"></p>
                    </div>
                    <div class="tkt-perf" aria-hidden="true"></div>
                    <div class="tkt-body">
                        <div class="tkt-stats">
                            <div class="tkt-stat">
                                <div class="tkt-stat-val" data-tkt="time"></div>
                                <div class="tkt-stat-lbl" data-tkt="timeLbl"></div>
                                <div class="tkt-stat-est" data-tkt="est"></div>
                            </div>
                            <div class="tkt-stat">
                                <div class="tkt-stat-val" data-tkt="dist"></div>
                                <div class="tkt-stat-lbl" data-tkt="distLbl"></div>
                            </div>
                            <div class="tkt-stat">
                                <div class="tkt-stat-val tkt-stat-fare" data-tkt="fare"></div>
                                <div class="tkt-stat-lbl" data-tkt="fareLbl"></div>
                            </div>
                        </div>
                        <div class="tkt-timeline" data-tkt="timeline"></div>
                        <div class="tkt-foot"><span>Salamat sa pagsakay!</span><span class="tkt-domain">calzadaph.com</span></div>
                    </div>
                </div>
                <div class="tkt-actions">
                    <div class="tkt-btn-row">
                        <button type="button" class="tkt-btn tkt-btn--secondary" data-tkt="save">
                            <span class="tkt-btn-icon" aria-hidden="true">${ICON_SAVE}</span>
                            <span class="tkt-btn-spinner" aria-hidden="true"></span>
                            <span data-tkt="saveLbl"></span>
                        </button>
                        <button type="button" class="tkt-btn tkt-btn--primary" data-tkt="done"></button>
                    </div>
                </div>
            </div>`;

        const confirmOverlay = document.createElement('div');
        confirmOverlay.className = 'tkt-confirm-overlay';
        confirmOverlay.innerHTML = `
            <div class="tkt-confirm" role="alertdialog" aria-modal="true" aria-labelledby="tktConfirmTitle" aria-describedby="tktConfirmMsg">
                <h3 class="tkt-confirm-title" id="tktConfirmTitle"></h3>
                <p class="tkt-confirm-msg" id="tktConfirmMsg"></p>
                <div class="tkt-btn-row">
                    <button type="button" class="tkt-btn tkt-btn--secondary" data-tkt="confirmCancel"></button>
                    <button type="button" class="tkt-btn tkt-btn--danger" data-tkt="confirmOk"></button>
                </div>
            </div>`;

        document.body.append(overlay, dialog, confirmOverlay);
        const q = (root, k) => root.querySelector(`[data-tkt="${k}"]`);
        els = {
            overlay, dialog, confirmOverlay,
            sheet: dialog.querySelector('.tkt-sheet'),
            dest: dialog.querySelector('#tktDest'),
            q: (k) => q(dialog, k),
            cq: (k) => q(confirmOverlay, k)
        };
        els.q('save').addEventListener('click', onSaveClick);
        els.q('done').addEventListener('click', () => close());
        return els;
    };

    // ── Rendering ────────────────────────────────────────────────────────────
    let current = null; // { trip, opts, pngPromise, returnFocus }

    const stopRow = (time, ring, name, sub) => `
        <div class="tkt-row tkt-stop">
            <div class="tkt-time">${esc(time)}</div>
            <div class="tkt-rail"><span class="tkt-ring tkt-ring--${ring}"></span></div>
            <div class="tkt-content">
                <div class="tkt-stop-name">${esc(name)}</div>
                <div class="tkt-stop-sub">${esc(sub)}</div>
            </div>
        </div>`;
    const legRow = (type, content) => `
        <div class="tkt-row tkt-leg">
            <div class="tkt-time"></div>
            <div class="tkt-rail"><div class="tkt-line--${type}"></div></div>
            <div class="tkt-content">${content}</div>
        </div>`;

    const render = () => {
        const { trip } = current;
        const e = els;
        const origin = originText(trip.originLabel);
        e.q('chip').textContent = tr('ticket.trip_complete');
        e.dest.textContent = trip.destName;
        e.q('from').textContent = `${tr('ticket.from', { origin })} · ${fmtDate(trip.arrivedAt)}`;

        const actual = trip.durationMin != null && trip.startedAt != null;
        e.q('time').textContent = fmtMinutes(actual ? trip.durationMin : trip.estimatedMin);
        e.q('timeLbl').textContent = tr(actual ? 'ticket.travel_time' : 'ticket.estimated');
        e.q('est').textContent = actual ? tr('ticket.est', { min: fmtMinutes(trip.estimatedMin) }) : '';
        e.q('dist').textContent = fmtKm(trip.distanceKm);
        e.q('distLbl').textContent = tr('ticket.distance');
        e.q('fare').textContent = fareText(trip.mode, trip.fare);
        e.q('fareLbl').textContent = tr('ticket.total_fare');

        // Only departure and arrival carry times: those two are measured, the stops between are not.
        let html = stopRow(trip.startedAt != null ? fmtTime(trip.startedAt) : '', 'origin', origin, tr('ticket.departed'));
        const legs = trip.legs || [];
        legs.forEach((leg, i) => {
            if (leg.type === 'walk') {
                const label = tr('planner.walk_leg', { dist: fmtKm(leg.distanceKm), time: `${Math.max(1, leg.durationMin)} min` });
                html += legRow('walk', `<div class="tkt-walk">${ICON_WALK}<span>${esc(label)}</span></div>`);
                return;
            }
            html += stopRow('', 'stop', leg.boardStop || 'National Highway', tr('ticket.boarded'));
            html += legRow('jeepney', `
                <div class="tkt-jeep">
                    <div class="tkt-jeep-left">
                        <span class="tkt-jeep-badge"><img src="${JEEPNEY_ICON}" alt=""><span>${esc(tr('planner.nav_jeepney'))}</span></span>
                        <span class="tkt-jeep-meta">${Math.max(1, leg.durationMin)} min · ${esc(fmtKm(leg.distanceKm))}</span>
                    </div>
                    <span class="tkt-jeep-fare">₱${leg.fare}</span>
                </div>`);
            // Alighting stop, unless the jeepney drops at the destination row itself
            if (leg.alightStop || legs[i + 1]) html += stopRow('', 'stop', leg.alightStop || leg.boardStop || 'National Highway', tr('ticket.got_off'));
        });
        html += stopRow(fmtTime(trip.arrivedAt), 'dest', trip.destName, tr('ticket.arrived'));
        e.q('timeline').innerHTML = html;

        e.q('saveLbl').textContent = tr('ticket.save');
        e.q('done').textContent = tr('ticket.done');
        e.dialog.classList.toggle('tkt-scrolls', e.sheet.scrollHeight > e.sheet.clientHeight + 1);
    };

    // ── Save as image ────────────────────────────────────────────────────────
    let htmlToImageLoad = null;
    const loadHtmlToImage = () => htmlToImageLoad || (htmlToImageLoad = new Promise((resolve, reject) => {
        if (window.htmlToImage) { resolve(window.htmlToImage); return; }
        const s = document.createElement('script');
        s.src = HTML_TO_IMAGE_SRC;
        s.onload = () => window.htmlToImage ? resolve(window.htmlToImage) : reject(new Error('html-to-image missing'));
        s.onerror = () => { htmlToImageLoad = null; reject(new Error('html-to-image failed to load')); };
        document.head.appendChild(s);
    }));

    // Font CSS for the PNG: only the Sora/Outfit weights the ticket uses, latin and
    // latin-ext subsets (the peso sign is in latin-ext), each woff2 inlined as a data URL.
    // The page's Google Fonts stylesheet is cross-origin, so html-to-image cannot read it.
    const FONT_CSS_URL = 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&family=Sora:wght@600;700&display=swap';
    let fontCssPromise = null;
    const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(blob);
    });
    const getFontCss = () => fontCssPromise || (fontCssPromise = (async () => {
        const css = await (await fetch(FONT_CSS_URL)).text();
        const faces = css.split(/(?=\/\*\s*[\w-]+\s*\*\/)/).filter(b => /^\/\*\s*latin(-ext)?\s*\*\//.test(b));
        const dataUrls = new Map();
        const inlined = await Promise.all(faces.map(async (face) => {
            const m = face.match(/url\((https:[^)]+?\.woff2)\)/);
            if (!m) return '';
            if (!dataUrls.has(m[1])) {
                dataUrls.set(m[1], fetch(m[1])
                    .then(r => { if (!r.ok) throw new Error(`font ${r.status}`); return r.blob(); })
                    .then(blobToDataUrl));
            }
            return face.replace(m[1], await dataUrls.get(m[1]));
        }));
        const out = inlined.join('\n');
        if (!out.includes('data:')) throw new Error('no font faces');
        return out;
    })().catch((e) => { fontCssPromise = null; throw e; }));

    const renderPng = async () => {
        const lib = await loadHtmlToImage();
        let fontEmbedCSS = '';
        try { fontEmbedCSS = await getFontCss(); } catch (e) { console.warn('Ticket fonts not embedded:', e); }
        // On short screens the sheet scrolls: render its full height, not the visible part.
        const sheet = els.sheet;
        const fullHeight = sheet.scrollHeight;
        const opts = {
            pixelRatio: 2,
            width: sheet.offsetWidth,
            height: fullHeight,
            fontEmbedCSS: fontEmbedCSS || undefined,
            skipFonts: !fontEmbedCSS,
            style: { borderRadius: '24px', overflow: 'hidden', height: `${fullHeight}px`, maxHeight: 'none', flex: 'none' }
        };
        // WebKit often paints fonts and images only on the second pass.
        const ua = navigator.userAgent;
        if (/iP(hone|ad|od)/.test(ua) || (/Safari\//.test(ua) && !/Chrome|Chromium|Android/.test(ua))) {
            await lib.toBlob(sheet, opts);
        }
        const blob = await lib.toBlob(sheet, opts);
        if (!blob) throw new Error('empty PNG');
        return blob;
    };

    const fileName = (ms) => {
        const d = new Date(ms), p = (n) => String(n).padStart(2, '0');
        return `calzada-trip-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.png`;
    };

    const downloadBlob = (blob, name) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    };

    const setBusy = (btn, on) => {
        btn.disabled = on;
        btn.classList.toggle('is-busy', on);
        btn.setAttribute('aria-busy', on ? 'true' : 'false');
    };

    // Error notice: the planner's toast when present, else a small notice of our own.
    const notify = (msg) => {
        if (typeof window.showToast === 'function') { window.showToast(msg, 'error'); return; }
        const n = document.createElement('div');
        n.setAttribute('role', 'alert');
        n.textContent = msg;
        n.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:100020;max-width:calc(100vw - 32px);'
            + 'background:#0E2A47;color:#FFFFFF;font:500 14px/1.4 Outfit,sans-serif;padding:12px 16px;border-radius:12px;'
            + 'box-shadow:0 8px 24px rgba(14,42,71,.3);';
        document.body.appendChild(n);
        setTimeout(() => n.remove(), 4000);
    };

    async function onSaveClick() {
        if (!current) return;
        const btn = els.q('save');
        if (btn.disabled) return;
        setBusy(btn, true);
        const forTrip = current;
        try {
            // Prefer the PNG rendered when the ticket opened: the share sheet then still has
            // this tap's user activation (iOS refuses navigator.share after a slow render).
            forTrip.pngPromise = forTrip.pngPromise ? forTrip.pngPromise.catch(() => renderPng()) : renderPng();
            const blob = await forTrip.pngPromise;
            const file = new File([blob], fileName(forTrip.trip.arrivedAt), { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({ files: [file], title: 'Calzada trip' });
                    return;
                } catch (e) {
                    if (e && e.name === 'AbortError') return; // the user closed the share sheet
                    if (!(e && e.name === 'NotAllowedError')) throw e;
                    // Activation expired anyway: fall through to a download.
                }
            }
            downloadBlob(blob, file.name);
        } catch (e) {
            console.error('Ticket save failed:', e);
            forTrip.pngPromise = null;
            notify(tr('ticket.save_failed'));
        } finally {
            setBusy(btn, false);
        }
    }

    // ── Confirm ──────────────────────────────────────────────────────────────
    let confirmState = null;
    function confirmDialog({ title, message, confirmLabel, cancelLabel }) {
        ensureDom();
        if (confirmState) confirmState.finish(false);
        return ensureStyles().then(() => new Promise((resolve) => {
            const c = els.confirmOverlay;
            c.querySelector('.tkt-confirm-title').textContent = title;
            c.querySelector('.tkt-confirm-msg').textContent = message;
            const ok = els.cq('confirmOk'), cancel = els.cq('confirmCancel');
            ok.textContent = confirmLabel;
            cancel.textContent = cancelLabel || tr('trips.cancel');
            const returnFocus = document.activeElement;
            const finish = (val) => {
                if (!confirmState) return;
                confirmState = null;
                c.classList.remove('visible');
                ok.removeEventListener('click', onOk);
                cancel.removeEventListener('click', onCancel);
                c.removeEventListener('click', onBackdrop);
                if (returnFocus && returnFocus.isConnected && returnFocus.focus) returnFocus.focus({ preventScroll: true });
                resolve(val);
            };
            const onOk = () => finish(true);
            const onCancel = () => finish(false);
            const onBackdrop = (e) => { if (e.target === c) finish(false); };
            ok.addEventListener('click', onOk);
            cancel.addEventListener('click', onCancel);
            c.addEventListener('click', onBackdrop);
            confirmState = { finish, buttons: [cancel, ok] };
            c.classList.add('visible');
            cancel.focus({ preventScroll: true }); // the safe choice has focus
        }));
    }

    // ── Open / close ─────────────────────────────────────────────────────────
    async function open(trip, opts = {}) {
        ensureDom();
        await ensureStyles();
        if (current) close({ silent: true });
        current = { trip, opts, pngPromise: null, returnFocus: document.activeElement };
        render();
        els.sheet.scrollTop = 0;
        setBusy(els.q('save'), false);
        els.overlay.classList.add('visible');
        els.dialog.classList.add('visible');
        els.dialog.setAttribute('aria-hidden', 'false');
        requestAnimationFrame(() => els.q('done').focus({ preventScroll: true }));
        // Render the PNG once the open animation has settled.
        const forTrip = current;
        setTimeout(() => {
            if (current === forTrip && !forTrip.pngPromise) {
                forTrip.pngPromise = renderPng();
                forTrip.pngPromise.catch(() => { /* retried on Save */ });
            }
        }, 400);
    }

    function close({ silent = false } = {}) {
        if (!current) return;
        const was = current;
        current = null;
        els.overlay.classList.remove('visible');
        els.dialog.classList.remove('visible');
        els.dialog.setAttribute('aria-hidden', 'true');
        if (!silent && was.returnFocus && was.returnFocus.isConnected && was.returnFocus.focus) {
            was.returnFocus.focus({ preventScroll: true });
        }
        if (!silent && typeof was.opts.onClose === 'function') was.opts.onClose();
    }

    // Escape closes the confirm first, then the ticket (= Done). Tab stays inside whichever is
    // on top. Capture phase on window, so page-level Escape handlers (e.g. account modals) do
    // not also fire.
    window.addEventListener('keydown', (e) => {
        if (!confirmState && !current) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            if (confirmState) confirmState.finish(false);
            else close();
        } else if (e.key === 'Tab') {
            const order = confirmState ? confirmState.buttons : [els.q('save'), els.q('done')].filter(b => !b.disabled);
            const i = order.indexOf(document.activeElement);
            e.preventDefault();
            order[(i + (e.shiftKey ? order.length - 1 : 1)) % order.length]?.focus();
        }
    }, true);

    window.addEventListener('calzada_lang_changed', () => {
        if (!current) return;
        render();
        current.pngPromise = null; // rendered again on Save, in the new language
    });

    // Fetch what Save needs while still online (called at START JOURNEY), so the arrival
    // ticket can still be saved as an image if the signal drops on the way.
    const preload = () => {
        ensureStyles();
        loadHtmlToImage().catch(() => {});
        getFontCss().catch(() => {});
    };

    window.CalzadaTicket = {
        open,
        preload,
        close,
        confirm: confirmDialog,
        isOpen: () => !!current || !!confirmState,
        ensureStyles,
        notify,
        format: { minutes: fmtMinutes, time: fmtTime, km: fmtKm, fare: fareText, origin: originText },
        tr
    };
})();
