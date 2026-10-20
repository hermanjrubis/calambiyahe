/**
 * Calzada Planner — category results list + flat place card.
 *
 * planner.js renders the category markers and calls into this module:
 *   CalzadaPlannerCategory.show(category, places, markersBySlug)
 *   CalzadaPlannerCategory.hide()
 *   CalzadaPlannerCategory.select(slug)
 * This module owns the results card / place card (desktop) and the bottom sheet (mobile),
 * the selected-pin ring, and fitting the map to the results.
 *
 * All DOM is built with createElement/textContent (no HTML strings with place data).
 */
(function (window, document) {
    'use strict';

    const MOBILE_MAX = 768;
    const NEARBY_RADIUS_M = 250;
    const SVG_NS = 'http://www.w3.org/2000/svg';

    // Tabler icon paths (stroke icons, 24x24)
    const ICONS = {
        malls: 'M3 21l18 0M3 7v1a3 3 0 0 0 6 0v-1m0 1a3 3 0 0 0 6 0v-1m0 1a3 3 0 0 0 6 0v-1h-18l2 -4h14l2 4M5 21l0 -10.15M19 21l0 -10.15M9 21v-4a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v4',
        eateries: 'M19 3v12h-5c-.023 -3.681 .184 -7.406 5 -12zm0 12v6h-1v-3m-10 -14v17m-3 -17v3a3 3 0 1 0 6 0v-3',
        schools: 'M22 9l-10 -4l-10 4l10 4l10 -4v6M6 10.6v5.4a6 3 0 0 0 12 0v-5.4',
        terminals: 'M6 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M14 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M4 17v-11a1 1 0 0 1 1 -1h14a1 1 0 0 1 1 1v11h-2m-4 0h-4M4 11h16M8 5v6M16 5v6',
        coffee: 'M3 14c.83 .642 2.077 1.017 3.5 1c1.423 .017 2.67 -.358 3.5 -1c.83 -.642 2.077 -1.017 3.5 -1c1.423 -.017 2.67 .358 3.5 1M8 3a2.4 2.4 0 0 0 -1 2a2.4 2.4 0 0 0 1 2M12 3a2.4 2.4 0 0 0 -1 2a2.4 2.4 0 0 0 1 2M3 10h14v5a6 6 0 0 1 -6 6h-2a6 6 0 0 1 -6 -6v-5zM16.746 16.726a3 3 0 1 0 .252 -5.555',
        establishments: 'M3 21l18 0M9 8l1 0M9 12l1 0M9 16l1 0M14 8l1 0M14 12l1 0M14 16l1 0M5 21v-16a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16',
        pin: 'M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0z',
        route: 'M3 19a2 2 0 1 0 4 0a2 2 0 0 0 -4 0M19 7a2 2 0 1 0 0 -4a2 2 0 0 0 0 4zM11 19h5.5a3.5 3.5 0 0 0 0 -7h-8a3.5 3.5 0 0 1 0 -7h4.5',
        x: 'M18 6l-12 12M6 6l12 12',
        chev: 'M9 6l6 6l-6 6',
        back: 'M15 6l-6 6l6 6',
        v360: 'M17 15.328c2.414 -.718 4 -1.94 4 -3.328c0 -2.21 -4.03 -4 -9 -4s-9 1.79 -9 4s4.03 4 9 4M9 13l3 3l-3 3',
        clock: 'M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0M12 7v5l3 3',
        phone: 'M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a16 16 0 0 1 -15 -15a2 2 0 0 1 2 -2',
        web: 'M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0M3.6 9h16.8M3.6 15h16.8M11.5 3a17 17 0 0 0 0 18M12.5 3a17 17 0 0 1 0 18'
    };

    const TEXT = {
        en: {
            cat: { malls: 'Malls', eateries: 'Eateries', schools: 'Schools', terminals: 'Terminals', coffee: 'Coffee Shops', establishments: 'Establishments' },
            places: (n) => `${n} ${n === 1 ? 'place' : 'places'}`,
            empty: 'No places in this category yet.',
            results: (c) => `${c} results`,
            photo: 'Photo', photo360: 'Photo · 360',
            view360: '360° view', view360Sub: 'Look around before you go',
            nearby: 'Nearby', plan: 'Plan route', view: 'View place',
            close: 'Close', backTo: (c, n) => `${c} (${n})`, open360: 'Open 360° view'
        },
        tl: {
            cat: { malls: 'Mga Mall', eateries: 'Mga Kainan', schools: 'Mga Paaralan', terminals: 'Mga Terminal', coffee: 'Mga Coffee Shop', establishments: 'Mga Establisyimento' },
            places: (n) => `${n} lugar`,
            empty: 'Wala pang lugar sa kategoryang ito.',
            results: (c) => `Mga resulta: ${c}`,
            photo: 'Larawan', photo360: 'Larawan · 360',
            view360: '360° view', view360Sub: 'Tingnan ang paligid bago pumunta',
            nearby: 'Malapit dito', plan: 'Planuhin ang ruta', view: 'Tingnan ang lugar',
            close: 'Isara', backTo: (c, n) => `${c} (${n})`, open360: 'Buksan ang 360° view'
        }
    };

    const lang = () => {
        try {
            if (typeof window.getCurrentLang === 'function') return window.getCurrentLang() === 'tl' ? 'tl' : 'en';
            return localStorage.getItem('calzada_lang') === 'tl' ? 'tl' : 'en';
        } catch (_) { return 'en'; }
    };
    const T = () => TEXT[lang()];
    const catLabel = (cat) => T().cat[cat] || TEXT.en.cat[cat] || cat;
    const isMobile = () => window.innerWidth <= MOBILE_MAX;

    // ── state ────────────────────────────────────────────────────────────
    const state = {
        category: null,
        places: [],          // results of the active category (sorted)
        markers: {},         // slug -> { marker, el }
        selected: null,      // slug
        tempMarker: null,    // marker for a nearby place outside the category
        mobileView: 'list',  // 'list' | 'place'
        sheetPeek: false
    };

    // ── helpers ──────────────────────────────────────────────────────────
    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }
    function icon(name, size, color) {
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('width', size);
        svg.setAttribute('height', size);
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', color || 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('aria-hidden', 'true');
        const p = document.createElementNS(SVG_NS, 'path');
        p.setAttribute('d', ICONS[name] || ICONS.pin);
        svg.appendChild(p);
        return svg;
    }
    function onTap(node, fn) {
        node.addEventListener('click', fn);
        if (typeof window.bindTap === 'function') window.bindTap(node, fn);
    }
    function imgUrl(path) {
        if (!path || typeof path !== 'string') return null;
        const p = path.trim();
        if (!p) return null;
        if (/^(https?:)?\/\//.test(p) || p.startsWith('/') || p.startsWith('../') || p.startsWith('data:')) return p;
        if (p.startsWith('./')) return '.' + p;
        return '/' + p.replace(/^\/+/, '');
    }
    function photoOf(place) { return imgUrl(place.photo || place.image_path); }
    function focusOf(place) {
        const f = place && typeof place.photo_focus === 'string' ? place.photo_focus.trim() : '';
        return /^\d{1,3}% \d{1,3}%$/.test(f) ? f : '50% 55%';
    }
    function haversine(aLat, aLng, bLat, bLng) {
        const R = 6371000, toR = (x) => x * Math.PI / 180;
        const dLat = toR(bLat - aLat), dLng = toR(bLng - aLng);
        const q = Math.sin(dLat / 2) ** 2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(q));
    }
    function fmtDist(m) {
        if (m < 1000) return `${Math.max(5, Math.round(m / 5) * 5)} m`;
        return `${(m / 1000).toFixed(1)} km`;
    }
    function allPlaces() {
        return Array.isArray(window.FALLBACK_PLACES) ? window.FALLBACK_PLACES : [];
    }
    function findPlace(slug) {
        return state.places.find(p => p.slug === slug) || allPlaces().find(p => p.slug === slug) || null;
    }
    function referencePoint() {
        const o = window.selectedCoords && window.selectedCoords.origin;
        if (Array.isArray(o) && isFinite(o[0]) && isFinite(o[1])) return { lat: Number(o[0]), lng: Number(o[1]) };
        const u = window._calzadaUserLatLng;
        if (u && isFinite(u.lat) && isFinite(u.lng)) return u;
        return null;
    }
    function shortDomain(url) {
        try { return new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return url; }
    }
    function catOf(place) {
        const c = String(place.category || '').toLowerCase();
        return ICONS[c] ? c : 'establishments';
    }

    // ── DOM roots ────────────────────────────────────────────────────────
    let resultsCard, placeCard, sheet, sheetBody;
    function ensureDom() {
        if (resultsCard) return;
        resultsCard = el('section', 'czc-card czc-results');
        resultsCard.setAttribute('role', 'region');
        resultsCard.hidden = true;
        placeCard = el('div', 'czc-card czc-place');
        placeCard.setAttribute('role', 'dialog');
        placeCard.hidden = true;
        sheet = el('section', 'czc-sheet');
        sheet.hidden = true;
        const grab = el('button', 'czc-grab');
        grab.type = 'button';
        grab.setAttribute('aria-label', 'Resize');
        grab.appendChild(el('span', 'czc-grab-bar'));
        sheet.appendChild(grab);
        sheetBody = el('div', 'czc-sheet-body');
        sheet.appendChild(sheetBody);
        document.body.appendChild(resultsCard);
        document.body.appendChild(placeCard);
        document.body.appendChild(sheet);
        setupSheetDrag(grab);
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape' || !state.category) return;
            if (state.selected) { deselect(); } else { requestClear(); }
        });
        window.addEventListener('resize', () => { if (state.category) render(); }, { passive: true });
        window.addEventListener('calzada_lang_changed', () => { if (state.category) render(); });
    }

    // ── layout metrics ───────────────────────────────────────────────────
    function topBarBottom() {
        const bar = document.getElementById('mapCategoryBar') || document.getElementById('mapTopBar');
        const r = bar ? bar.getBoundingClientRect() : null;
        return r && r.bottom > 0 ? r.bottom : 80;
    }
    function panelRight() {
        const dc = document.getElementById('directionsCard');
        if (!dc || getComputedStyle(dc).display === 'none') return 0;
        const r = dc.getBoundingClientRect();
        return r.right > 0 && r.right < window.innerWidth * 0.6 ? r.right : 0;
    }
    function positionDesktop() {
        const top = Math.round(topBarBottom() + 16);
        resultsCard.style.top = top + 'px';
        resultsCard.style.left = Math.round(panelRight() + 16) + 'px';
        placeCard.style.top = top + 'px';
    }

    // ── map helpers ──────────────────────────────────────────────────────
    function map() { return window._calzadaMap || window.map || null; }
    // Visible map area (in map-container coordinates) not covered by the pill, cards, panel or sheet
    function visiblePadding(extraPlaceCard) {
        const m = map();
        const c = m && m.getContainer ? m.getContainer().getBoundingClientRect() : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
        const PIN_H = 40; // pins are anchored at the bottom: keep room for the pin head
        let left = c.left, right = c.right, top = topBarBottom() + 24 + PIN_H, bottom = c.bottom - 40;
        if (isMobile()) {
            const sh = sheet && !sheet.hidden ? sheet.getBoundingClientRect().top : window.innerHeight * 0.5;
            left = c.left + 40; right = c.right - 40; bottom = sh - 24;
        } else {
            left = Math.max(c.left, panelRight()) + 32;
            if (resultsCard && !resultsCard.hidden) left = resultsCard.getBoundingClientRect().right + 32;
            right = c.right - 92; // map controls
            if (placeCard && (!placeCard.hidden || extraPlaceCard)) {
                const pr = placeCard.hidden ? (c.right - 76 - 370) : placeCard.getBoundingClientRect().left;
                right = pr - 32;
            }
        }
        const pad = {
            left: Math.max(0, left - c.left),
            right: Math.max(0, c.right - right),
            top: Math.max(0, top - c.top),
            bottom: Math.max(0, c.bottom - bottom)
        };
        const w = c.right - c.left, h = c.bottom - c.top;
        if (pad.left + pad.right > w - 60) { const k = (w - 60) / (pad.left + pad.right); pad.left *= k; pad.right *= k; }
        if (pad.top + pad.bottom > h - 60) { const k = (h - 60) / (pad.top + pad.bottom); pad.top *= k; pad.bottom *= k; }
        return pad;
    }
    function fitToResults() {
        const m = map();
        if (!m || !state.places.length || !window.maplibregl) return;
        const bounds = new window.maplibregl.LngLatBounds();
        state.places.forEach(p => {
            const lat = Number(p.lat), lng = Number(p.lng);
            if (isFinite(lat) && isFinite(lng)) bounds.extend([lng, lat]);
        });
        if (bounds.isEmpty()) return;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        try {
            m.fitBounds(bounds, { padding: visiblePadding(false), maxZoom: 16, duration: reduced ? 0 : 450 });
        } catch (_) {}
    }
    function easeToPlace(place) {
        const m = map();
        if (!m || !place) return;
        const lat = Number(place.lat), lng = Number(place.lng);
        if (!isFinite(lat) || !isFinite(lng)) return;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        try {
            m.easeTo({ center: [lng, lat], zoom: Math.max(m.getZoom(), 16.5), padding: visiblePadding(true), duration: reduced ? 0 : 450 });
        } catch (_) {}
    }

    // ── pins ─────────────────────────────────────────────────────────────
    function setRing(slug) {
        Object.entries(state.markers).forEach(([s, entry]) => {
            if (entry && entry.el) entry.el.classList.toggle('czc-pin-selected', s === slug);
        });
    }
    function hoverPin(slug, on) {
        const entry = state.markers[slug];
        if (entry && entry.el) entry.el.classList.toggle('czc-pin-hover', !!on);
    }
    function removeTempMarker() {
        if (state.tempMarker) {
            try { state.tempMarker.marker.remove(); } catch (_) {}
            delete state.markers[state.tempMarker.slug];
            state.tempMarker = null;
        }
    }
    function ensureMarkerFor(place) {
        if (state.markers[place.slug]) return;
        if (typeof window._calzadaBuildPlaceMarker !== 'function') return;
        removeTempMarker();
        const entry = window._calzadaBuildPlaceMarker(place);
        if (!entry) return;
        state.markers[place.slug] = entry;
        state.tempMarker = { slug: place.slug, marker: entry.marker };
    }

    // ── builders ─────────────────────────────────────────────────────────
    function closeButton(onClose) {
        const b = el('button', 'czc-x');
        b.type = 'button';
        b.setAttribute('aria-label', T().close);
        b.appendChild(icon('x', 16, '#475569'));
        onTap(b, (e) => { if (e && e.stopPropagation) e.stopPropagation(); onClose(); });
        return b;
    }
    function badge360() {
        const b = el('span', 'czc-b360');
        b.appendChild(icon('v360', 13, '#2272C3'));
        b.appendChild(document.createTextNode('360'));
        return b;
    }
    function thumb(place, size, cls) {
        const wrap = el('span', cls);
        const src = photoOf(place);
        if (src) {
            const img = el('img');
            img.alt = '';
            img.loading = 'lazy';
            img.decoding = 'async';
            img.src = src;
            img.style.objectPosition = focusOf(place);
            img.addEventListener('error', () => { img.remove(); wrap.appendChild(icon(catOf(place), Math.round(size * 0.42), '#94A3B8')); }, { once: true });
            wrap.appendChild(img);
        } else {
            wrap.appendChild(icon(catOf(place), Math.round(size * 0.42), '#94A3B8'));
        }
        return wrap;
    }
    function buildHeader() {
        const head = el('div', 'czc-head');
        const tile = el('span', 'czc-tile');
        tile.appendChild(icon(state.category, 20, '#2272C3'));
        const txt = el('div', 'czc-head-text');
        txt.appendChild(el('div', 'czc-title', catLabel(state.category)));
        txt.appendChild(el('div', 'czc-meta', T().places(state.places.length)));
        head.appendChild(tile);
        head.appendChild(txt);
        head.appendChild(closeButton(requestClear));
        return head;
    }
    function buildList() {
        const list = el('div', 'czc-list');
        list.setAttribute('role', 'list');
        if (!state.places.length) {
            list.appendChild(el('p', 'czc-empty', T().empty));
            return list;
        }
        const ref = referencePoint();
        state.places.forEach(place => {
            const row = el('button', 'czc-row');
            row.type = 'button';
            row.setAttribute('role', 'listitem');
            row.dataset.slug = place.slug;
            row.setAttribute('aria-label', `${place.name}, ${place.barangay || ''}`.trim());
            if (place.slug === state.selected) row.classList.add('is-selected');
            row.appendChild(thumb(place, 56, 'czc-thumb'));
            const info = el('span', 'czc-row-info');
            info.appendChild(el('span', 'czc-row-name', place.name));
            info.appendChild(el('span', 'czc-row-sub', `${place.barangay ? place.barangay + ', ' : ''}${place.municipality || 'Calamba'}`));
            if (ref) {
                const d = haversine(ref.lat, ref.lng, Number(place.lat), Number(place.lng));
                if (isFinite(d)) info.appendChild(el('span', 'czc-row-dist', fmtDist(d)));
            }
            if (place.pano) {
                const bw = el('span', 'czc-row-badges');
                bw.appendChild(badge360());
                info.appendChild(bw);
            }
            row.appendChild(info);
            const chev = el('span', 'czc-chev');
            chev.appendChild(icon('chev', 18, '#94A3B8'));
            row.appendChild(chev);
            onTap(row, () => select(place.slug));
            row.addEventListener('mouseenter', () => hoverPin(place.slug, true));
            row.addEventListener('mouseleave', () => hoverPin(place.slug, false));
            list.appendChild(row);
        });
        return list;
    }
    function infoRow(iconName, content) {
        const r = el('div', 'czc-info');
        r.appendChild(icon(iconName, 18, '#94A3B8'));
        if (typeof content === 'string') r.appendChild(el('span', null, content)); else r.appendChild(content);
        return r;
    }
    function openPopup(place, slide) {
        loadPlacePanel().then(() => {
            if (typeof window.openPlacePanel === 'function') {
                window.openPlacePanel(place.name, Number(place.lat), Number(place.lng), slide ? { slide } : undefined);
            }
        }).catch(() => {});
    }
    function planRoute(place) {
        const lat = Number(place.lat), lng = Number(place.lng);
        closePanels();
        if (typeof window._calzadaSetDestination === 'function') {
            window._calzadaSetDestination(place.name, [lat, lng]);
        } else if (typeof window._setPlannerDestination === 'function') {
            window._setPlannerDestination(place.name, lat, lng);
        }
    }
    function buildPlace(place, mobile) {
        const frag = document.createDocumentFragment();
        const t = T();
        const src = photoOf(place);
        if (src) {
            const ph = el('button', 'czc-photo');
            ph.type = 'button';
            ph.setAttribute('aria-label', t.view);
            const img = el('img');
            img.alt = place.name;
            img.decoding = 'async';
            img.src = src;
            img.style.objectPosition = focusOf(place);
            img.addEventListener('error', () => { ph.remove(); }, { once: true });
            ph.appendChild(img);
            ph.appendChild(el('span', 'czc-tag', place.pano ? t.photo360 : t.photo));
            onTap(ph, () => openPopup(place));
            frag.appendChild(ph);
        }
        const head = el('div', 'czc-phead');
        const tile = el('span', 'czc-tile czc-tile-sm');
        tile.appendChild(icon(catOf(place), 20, '#2272C3'));
        const txt = el('div', 'czc-head-text');
        txt.appendChild(el('div', 'czc-ptitle', place.name));
        txt.appendChild(el('div', 'czc-meta', `${catLabel(catOf(place))} · ${place.barangay ? place.barangay + ', ' : ''}${place.municipality || 'Calamba'}`));
        head.appendChild(tile);
        head.appendChild(txt);
        if (!mobile) head.appendChild(closeButton(deselect));
        frag.appendChild(head);

        if (place.full_address) frag.appendChild(infoRow('pin', place.full_address));
        if (place.opening_hours && typeof place.opening_hours === 'string') frag.appendChild(infoRow('clock', place.opening_hours));
        if (place.phone) {
            const a = el('a', 'czc-link', String(place.phone));
            const first = String(place.phone).split('/')[0].replace(/[^\d+]/g, '');
            if (first) a.href = 'tel:' + first;
            frag.appendChild(infoRow('phone', a));
        }
        if (place.website && /^https?:\/\//i.test(place.website)) {
            const a = el('a', 'czc-link', shortDomain(place.website));
            a.href = place.website;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            frag.appendChild(infoRow('web', a));
        }

        if (place.pano) {
            const v = el('button', 'czc-360');
            v.type = 'button';
            v.setAttribute('aria-label', t.open360);
            const thumbSrc = imgUrl(place.pano_thumb);
            if (thumbSrc) {
                const ti = el('img');
                ti.alt = '';
                ti.loading = 'lazy';
                ti.decoding = 'async';
                ti.src = thumbSrc;
                ti.addEventListener('error', () => ti.remove(), { once: true });
                v.appendChild(ti);
            }
            const vt = el('span', 'czc-360-text');
            vt.appendChild(el('span', 'czc-360-title', t.view360));
            vt.appendChild(el('span', 'czc-360-sub', t.view360Sub));
            v.appendChild(vt);
            const ch = el('span', 'czc-chev');
            ch.appendChild(icon('chev', 18, '#94A3B8'));
            v.appendChild(ch);
            onTap(v, () => openPopup(place, '360'));
            frag.appendChild(v);
        }

        const lat = Number(place.lat), lng = Number(place.lng);
        const near = allPlaces()
            .filter(p => p.slug !== place.slug && isFinite(Number(p.lat)) && isFinite(Number(p.lng)))
            .map(p => ({ p, d: haversine(lat, lng, Number(p.lat), Number(p.lng)) }))
            .filter(x => x.d <= NEARBY_RADIUS_M)
            .sort((a, b) => a.d - b.d)
            .slice(0, mobile ? 2 : 3);
        if (near.length) {
            frag.appendChild(el('div', 'czc-sec', t.nearby));
            near.forEach(({ p, d }) => {
                const r = el('button', 'czc-near');
                r.type = 'button';
                r.setAttribute('aria-label', `${p.name}, ${fmtDist(d)}`);
                r.appendChild(thumb(p, 36, 'czc-near-thumb'));
                const nt = el('span', 'czc-near-text');
                nt.appendChild(el('span', 'czc-near-name', p.name));
                nt.appendChild(el('span', 'czc-near-cat', catLabel(catOf(p))));
                r.appendChild(nt);
                r.appendChild(el('span', 'czc-near-dist', fmtDist(d)));
                onTap(r, () => select(p.slug));
                frag.appendChild(r);
            });
        }

        const btns = el('div', 'czc-btns');
        const plan = el('button', 'czc-btn czc-btn-primary');
        plan.type = 'button';
        plan.appendChild(icon('route', 18, '#FFFFFF'));
        plan.appendChild(document.createTextNode(t.plan));
        onTap(plan, () => planRoute(place));
        const view = el('button', 'czc-btn czc-btn-secondary', t.view);
        view.type = 'button';
        onTap(view, () => openPopup(place));
        btns.appendChild(plan);
        btns.appendChild(view);
        frag.appendChild(btns);
        return frag;
    }

    // ── render ───────────────────────────────────────────────────────────
    function render() {
        ensureDom();
        const mobile = isMobile();
        document.body.classList.toggle('czc-open', !!state.category);
        document.body.classList.toggle('czc-mobile-open', !!state.category && mobile);
        if (!state.category) {
            resultsCard.hidden = true; placeCard.hidden = true; sheet.hidden = true;
            return;
        }
        const t = T();
        if (mobile) {
            resultsCard.hidden = true;
            placeCard.hidden = true;
            sheet.hidden = false;
            sheetBody.textContent = '';
            const place = state.selected ? findPlace(state.selected) : null;
            if (place && state.mobileView === 'place') {
                sheet.setAttribute('role', 'dialog');
                sheet.setAttribute('aria-label', place.name);
                const top = el('div', 'czc-sheet-top');
                const back = el('button', 'czc-back');
                back.type = 'button';
                back.appendChild(icon('back', 18, '#2272C3'));
                back.appendChild(document.createTextNode(t.backTo(catLabel(state.category), state.places.length)));
                onTap(back, () => { state.mobileView = 'list'; render(); });
                top.appendChild(back);
                top.appendChild(closeButton(requestClear));
                sheetBody.appendChild(top);
                const wrap = el('div', 'czc-place-body');
                wrap.appendChild(buildPlace(place, true));
                sheetBody.appendChild(wrap);
                sheet.classList.add('is-place');
            } else {
                sheet.setAttribute('role', 'region');
                sheet.setAttribute('aria-label', t.results(catLabel(state.category)));
                sheetBody.appendChild(buildHeader());
                sheetBody.appendChild(buildList());
                sheet.classList.remove('is-place');
            }
            sheet.classList.toggle('is-peek', state.sheetPeek);
            updateSheetVar();
            return;
        }
        // desktop
        sheet.hidden = true;
        resultsCard.hidden = false;
        resultsCard.textContent = '';
        resultsCard.setAttribute('aria-label', t.results(catLabel(state.category)));
        resultsCard.appendChild(buildHeader());
        resultsCard.appendChild(buildList());
        const place = state.selected ? findPlace(state.selected) : null;
        if (place) {
            placeCard.hidden = false;
            placeCard.textContent = '';
            placeCard.setAttribute('aria-label', place.name);
            const body = el('div', 'czc-place-body');
            body.appendChild(buildPlace(place, false));
            placeCard.appendChild(body);
        } else {
            placeCard.hidden = true;
        }
        positionDesktop();
    }
    function updateSheetVar() {
        requestAnimationFrame(() => {
            const h = sheet && !sheet.hidden ? sheet.getBoundingClientRect().height : 0;
            document.documentElement.style.setProperty('--czc-sheet-h', Math.round(h) + 'px');
        });
    }

    // ── mobile sheet drag (peek <-> open) ────────────────────────────────
    function setupSheetDrag(handle) {
        let startY = null, moved = 0;
        handle.addEventListener('pointerdown', (e) => { startY = e.clientY; moved = 0; try { handle.setPointerCapture(e.pointerId); } catch (_) {} });
        handle.addEventListener('pointermove', (e) => { if (startY != null) moved = e.clientY - startY; });
        const end = () => {
            if (startY == null) return;
            if (moved > 30) state.sheetPeek = true;
            else if (moved < -30) state.sheetPeek = false;
            else state.sheetPeek = !state.sheetPeek;
            startY = null;
            sheet.classList.toggle('is-peek', state.sheetPeek);
            updateSheetVar();
        };
        handle.addEventListener('pointerup', end);
        handle.addEventListener('pointercancel', () => { startY = null; });
    }

    // ── public actions ───────────────────────────────────────────────────
    function show(category, places, markersBySlug) {
        ensureDom();
        removeTempMarker();
        state.category = category;
        state.markers = Object.assign({}, markersBySlug || {});
        state.selected = null;
        state.mobileView = 'list';
        state.sheetPeek = false;
        const ref = referencePoint();
        const list = (places || []).filter(p => p && p.slug);
        if (ref) {
            list.sort((a, b) => haversine(ref.lat, ref.lng, +a.lat, +a.lng) - haversine(ref.lat, ref.lng, +b.lat, +b.lng));
        } else {
            list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
        }
        state.places = list;
        setRing(null);
        render();
        requestAnimationFrame(fitToResults);
    }
    function hide() {
        removeTempMarker();
        state.category = null;
        state.places = [];
        state.markers = {};
        state.selected = null;
        render();
        document.documentElement.style.removeProperty('--czc-sheet-h');
    }
    function select(slug) {
        const place = findPlace(slug);
        if (!place || !state.category) return;
        if (!state.places.some(p => p.slug === slug)) ensureMarkerFor(place);
        else if (state.tempMarker && state.tempMarker.slug !== slug) removeTempMarker();
        state.selected = slug;
        state.mobileView = 'place';
        state.sheetPeek = false;
        setRing(slug);
        render();
        // highlight + scroll the row on desktop
        if (!isMobile() && resultsCard) {
            const row = resultsCard.querySelector(`.czc-row[data-slug="${CSS.escape(slug)}"]`);
            if (row) row.scrollIntoView({ block: 'nearest' });
        }
        requestAnimationFrame(() => easeToPlace(place));
    }
    function deselect() {
        removeTempMarker();
        state.selected = null;
        state.mobileView = 'list';
        setRing(null);
        render();
    }
    function requestClear() {
        if (typeof window._calzadaClearCategory === 'function') window._calzadaClearCategory();
        else hide();
    }
    // Close the cards/sheet but keep the category markers (used after "Plan route")
    function closePanels() {
        removeTempMarker();
        state.selected = null;
        setRing(null);
        if (resultsCard) resultsCard.hidden = true;
        if (placeCard) placeCard.hidden = true;
        if (sheet) sheet.hidden = true;
        document.body.classList.remove('czc-open', 'czc-mobile-open');
        document.documentElement.style.removeProperty('--czc-sheet-h');
        state.panelsClosed = true;
    }

    // Lazy-load the Explore place popup (place-panel.js + css) the first time it is needed
    let panelPromise = null;
    function loadPlacePanel() {
        if (typeof window.openPlacePanel === 'function') return Promise.resolve();
        if (panelPromise) return panelPromise;
        const v = window.CALZADA_PLACE_PANEL_VERSION || '2.9.8';
        const cssV = window.CALZADA_PLACE_PANEL_CSS_VERSION || '16';
        panelPromise = new Promise((resolve, reject) => {
            if (!document.querySelector('link[data-czc-place-panel]')) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = `../css/place-panel.css?v=${cssV}`;
                link.setAttribute('data-czc-place-panel', '');
                document.head.appendChild(link);
            }
            const s = document.createElement('script');
            s.src = `../js/place-panel.js?v=${v}`;
            s.onload = () => resolve();
            s.onerror = () => { panelPromise = null; reject(new Error('place-panel load failed')); };
            document.body.appendChild(s);
        });
        return panelPromise;
    }

    window.CalzadaPlannerCategory = {
        show, hide, select, deselect, closePanels,
        isOpen: () => !!state.category,
        _state: state
    };
})(window, document);
