/**
 * Calzada place search (planner "Where from?" / "Where to?").
 *
 * Sources, in this order:
 *   1. Calzada's own places, passed in by the planner (/api/places, or its built-in copy).
 *      Matched by name, ignoring case and accents, on partial words ("STI Cal") and small typos.
 *   2. Geoapify autocomplete through our own server (/api/geocode, so the API key never reaches the
 *      page), kept to a box around Laguna and biased to the user's position (or Calamba). The server
 *      rounds that position to about 1 km before passing it on.
 *   3. If /api/geocode has no key (204), fails or takes more than 3 s, the Esri geocoder (as before),
 *      so search never breaks.
 *
 * Mobile (up to 768 px): a full-screen page that slides up over the planner.
 * Desktop: the same content in a dropdown panel under the field.
 *
 * Recent picks stay on this device only (localStorage): name, short location, lat/lng. Nothing else,
 * and they are never sent anywhere.
 *
 * window.CalzadaPlaceSearch.open({ field, anchor, places, userFix, onSelect, onMyLocation, onPin })
 * window.CalzadaPlaceSearch.close()
 */
(function () {
    'use strict';

    const GEOCODE_URL = '/api/geocode';
    const CALAMBA = { lat: 14.2117, lng: 121.1652 };
    const GEOCODE_TIMEOUT_MS = 3000;
    const DEBOUNCE_MS = 300;
    const MIN_CHARS = 2;
    const RECENT_KEY = 'calzada_recent_places';
    const RECENT_MAX = 8;
    const DUPLICATE_RADIUS_M = 150;
    const SAME_ADDRESS_RADIUS_M = 400;
    // Review #02: where outside results may be. A destination must be in Calamba (the planner routes to
    // places in Calamba). A starting point may also be along the jeep routes into Calamba (Sta. Rosa,
    // Cabuyao, Los Baños, Tanauan side). Both boxes are approximate.
    const CALAMBA_BOX = { s: 14.10, w: 121.02, n: 14.27, e: 121.23 };
    const SERVICE_BOX = { s: 14.10, w: 120.95, n: 14.32, e: 121.26 };
    const inBox = (o, b) => o.lat >= b.s && o.lat <= b.n && o.lng >= b.w && o.lng <= b.e;
    const OTHER_TOWNS = /\b(santa rosa|sta\.? rosa|cabuyao|los ba(n|ñ)os|bay|binan|biñan|san pedro|tanauan|santo tomas|sto\.? tomas|tiaong|lipa|silang|tagaytay|alaminos|san pablo)\b/i;
    const MOBILE_MAX_W = 768;

    const CATEGORIES = [
        { id: 'malls', icon: 'ti-building-store', key: 'nav.explore.malls', fallback: 'Malls' },
        { id: 'eateries', icon: 'ti-tools-kitchen-2', key: 'nav.explore.eateries', fallback: 'Eateries' },
        { id: 'schools', icon: 'ti-school', key: 'nav.explore.schools', fallback: 'Schools' },
        { id: 'terminals', icon: 'ti-bus', key: 'nav.explore.terminals', fallback: 'Terminals' },
        { id: 'coffee', icon: 'ti-coffee', key: 'nav.explore.coffee', fallback: 'Coffee Shops' },
        { id: 'government', icon: 'ti-flag', key: 'nav.explore.government', fallback: 'Government & Landmarks' },
        { id: 'health', icon: 'ti-first-aid-kit', key: 'nav.explore.health', fallback: 'Health' },
        { id: 'banks', icon: 'ti-building-bank', key: 'nav.explore.banks', fallback: 'Banks' },
        { id: 'hotels', icon: 'ti-bed', key: 'nav.explore.hotels', fallback: 'Hotels & Stays' },
        { id: 'establishments', icon: 'ti-shopping-bag', key: 'nav.explore.establishments', fallback: 'Shops & Services' }
    ];
    const KIND_ICONS = { mall: 'ti-building-store', food: 'ti-tools-kitchen-2', school: 'ti-school', terminal: 'ti-bus', coffee: 'ti-coffee', building: 'ti-building', gov: 'ti-flag', health: 'ti-first-aid-kit', bank: 'ti-building-bank', hotel: 'ti-bed', shop: 'ti-shopping-bag', pin: 'ti-map-pin' };
    const CATEGORY_KIND = { malls: 'mall', eateries: 'food', schools: 'school', terminals: 'terminal', coffee: 'coffee', government: 'gov', health: 'health', banks: 'bank', hotels: 'hotel', establishments: 'shop' };

    // ── Helpers ─────────────────────────────────────────────────────────────
    const tr = (key, fallback, vars) => {
        let s = typeof window.t === 'function' ? window.t(key) : key;
        if (!s || s === key) s = fallback;
        if (vars) Object.entries(vars).forEach(([k, v]) => { s = String(s).split(`{${k}}`).join(v); });
        return s;
    };
    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const norm = (s) => fold(s).replace(/[^a-z0-9]+/g, ' ').trim();
    const words = (s) => norm(s).split(' ').filter(Boolean);
    const distM = (a, b) => {
        const R = 6371000, r = (x) => x * Math.PI / 180;
        const s = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(s));
    };
    const fmtDist = (m) => (m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`);

    // Edit distance, stopping early once it is over max
    const within = (a, b, max) => {
        if (Math.abs(a.length - b.length) > max) return false;
        let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
        for (let i = 1; i <= a.length; i++) {
            const cur = [i];
            let rowMin = i;
            for (let j = 1; j <= b.length; j++) {
                cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
                rowMin = Math.min(rowMin, cur[j]);
            }
            if (rowMin > max) return false;
            prev = cur;
        }
        return prev[b.length] <= max;
    };

    // How well one typed word matches one word of a name: 3 prefix, 2 inside, 1 small typo, 0 no match
    const tokenScore = (tok, word) => {
        if (word.startsWith(tok)) return 3;
        if (tok.length >= 3 && word.includes(tok)) return 2;
        if (tok.length >= 5 && (within(tok, word, 1) || within(tok, word.slice(0, tok.length), 1))) return 1;
        return 0;
    };

    // Score of a name for a query (every typed word must match some word of the name), or 0
    const nameScore = (query, name) => {
        const toks = words(query), ws = words(name);
        if (!toks.length || !ws.length) return 0;
        let total = 0;
        for (const tok of toks) {
            let best = 0;
            for (const w of ws) best = Math.max(best, tokenScore(tok, w));
            if (!best) return 0;
            total += best;
        }
        if (norm(name).startsWith(norm(query))) total += 5;
        return total;
    };

    // The name with the typed parts in bold (prefix and in-word matches)
    const highlight = (name, query) => {
        const toks = words(query).sort((a, b) => b.length - a.length);
        return String(name).split(/(\s+)/).map(chunk => {
            const f = fold(chunk);
            for (const tok of toks) {
                let at = f.startsWith(tok) ? 0 : (tok.length >= 3 ? f.indexOf(tok) : -1);
                if (at >= 0 && f.length === chunk.length) {
                    return `${esc(chunk.slice(0, at))}<b>${esc(chunk.slice(at, at + tok.length))}</b>${esc(chunk.slice(at + tok.length))}`;
                }
            }
            return esc(chunk);
        }).join('');
    };

    // ── Location lines (street/barangay, city; nothing else) ────────────────
    const isPlusCode = (s) => /^[0-9A-Z]{4}\+[0-9A-Z]{2,3}$/i.test(String(s).trim());
    const uniqueParts = (parts, name) => {
        const seen = new Set([norm(name)]);
        // A part can hold several ("Poblacion, Calamba"): split them so "Calamba" is not repeated
        return parts.flatMap(p => String(p || '').split(',')).map(p => p.trim()).filter(p => {
            const n = norm(p);
            if (!n || seen.has(n) || isPlusCode(p)) return false;
            seen.add(n);
            return true;
        });
    };
    const calzadaLocation = (p) => {
        const addr = String(p.full_address || '').split(',').map(s => s.trim());
        const street = addr[0] && !/^brgy\.?\s|^barangay\s/i.test(addr[0]) ? addr[0] : '';
        const barangay = p.barangay || (addr.find(a => /^brgy\.?\s|^barangay\s/i.test(a)) || '').replace(/^brgy\.?\s*|^barangay\s*/i, '');
        const city = p.municipality || p.city || 'Calamba';
        const streetIsCity = street && norm(street).replace(/\bcity\b/g, '').trim() === norm(city);
        return uniqueParts([streetIsCity ? '' : street, barangay, city], p.name).slice(0, 3).join(', ');
    };
    // Geoapify results come from /api/geocode already trimmed to street, area, city and a kind
    const geocodeLocation = (r, name) => uniqueParts([r.street, r.area, r.city], name).slice(0, 3).join(', ');

    // ── Recent picks (this device only) ──────────────────────────────────────
    const validEntry = (e) => e && typeof e.name === 'string' && Number.isFinite(e.lat) && Number.isFinite(e.lng);
    const readRecent = () => {
        try {
            const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
            return Array.isArray(list) ? list.filter(validEntry).slice(0, RECENT_MAX) : [];
        } catch (_) { return []; }
    };
    const writeRecent = (list) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (_) { /* private mode */ } };
    const addRecent = (item) => {
        const entry = {
            name: String(item.name).slice(0, 120),
            location: String(item.location || '').slice(0, 120),
            lat: Math.round(item.lat * 1e6) / 1e6,
            lng: Math.round(item.lng * 1e6) / 1e6
        };
        const rest = readRecent().filter(r => !(norm(r.name) === norm(entry.name) && distM(r, entry) < 50));
        writeRecent([entry, ...rest].slice(0, RECENT_MAX));
    };

    // ── State ────────────────────────────────────────────────────────────────
    let opts = null;
    let root = null, panel = null, input = null, clearBtn = null, chipsRow = null, list = null, footer = null, status = null;
    let debounceTimer = null;
    let controller = null;     // aborts the previous search when the user keeps typing
    let activeIndex = -1;
    let activeCategory = null;
    let lastQuery = '';

    const isMobile = () => window.innerWidth <= MOBILE_MAX_W;
    const userFix = () => {
        const f = opts && typeof opts.userFix === 'function' ? opts.userFix() : null;
        return f && Number.isFinite(f.lat) && Number.isFinite(f.lng) ? f : null;
    };
    const calzadaPlaces = () => {
        const p = opts && typeof opts.places === 'function' ? opts.places() : [];
        return (p || []).filter(x => x && x.name && Number.isFinite(+x.lat) && Number.isFinite(+x.lng));
    };

    // ── DOM ──────────────────────────────────────────────────────────────────
    const build = () => {
        root = document.createElement('div');
        root.className = 'cps-root';
        root.hidden = true;
        root.innerHTML = `
            <div class="cps-panel" role="dialog" aria-modal="true" aria-labelledby="cpsTitle">
                <h2 class="cps-sr" id="cpsTitle"></h2>
                <div class="cps-top">
                    <button type="button" class="cps-back" aria-label=""><i class="ti ti-arrow-left" aria-hidden="true"></i></button>
                    <div class="cps-field">
                        <i class="ti ti-search cps-field-icon" aria-hidden="true"></i>
                        <input type="text" class="cps-input" id="cpsInput" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="cpsList" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">
                        <button type="button" class="cps-clear" aria-label="" hidden><i class="ti ti-x" aria-hidden="true"></i></button>
                    </div>
                </div>
                <div class="cps-body">
                    <div class="cps-chips" role="group"></div>
                    <div class="cps-list" id="cpsList" role="listbox"></div>
                    <div class="cps-sr" role="status" aria-live="polite"></div>
                </div>
                <div class="cps-footer"></div>
            </div>`;
        document.body.appendChild(root);
        panel = root.querySelector('.cps-panel');
        input = root.querySelector('.cps-input');
        clearBtn = root.querySelector('.cps-clear');
        chipsRow = root.querySelector('.cps-chips');
        list = root.querySelector('.cps-list');
        footer = root.querySelector('.cps-footer');
        status = root.querySelector('[role="status"]');

        root.querySelector('.cps-back').addEventListener('click', () => close());
        clearBtn.addEventListener('click', () => { input.value = ''; onInput(); input.focus(); });
        input.addEventListener('input', onInput);
        input.addEventListener('keydown', onKeyDown);
        list.addEventListener('click', onListClick);
        list.addEventListener('mousemove', (e) => {
            const opt = e.target.closest('[role="option"]');
            if (opt) setActive([...list.querySelectorAll('[role="option"]')].indexOf(opt), false);
        });
        chipsRow.addEventListener('click', (e) => {
            const chip = e.target.closest('.cps-chip');
            if (!chip) return;
            activeCategory = activeCategory === chip.dataset.cat ? null : chip.dataset.cat;
            renderIdle();
        });
        // Desktop: a tap outside the panel (and outside the field that opened it) closes it
        document.addEventListener('pointerdown', (e) => {
            if (!root || root.hidden || isMobile()) return;
            if (panel.contains(e.target) || (opts && opts.anchor && opts.anchor.contains(e.target))) return;
            close({ restoreFocus: false });
        }, true);
        window.addEventListener('resize', () => { if (root && !root.hidden) place(); });
        window.addEventListener('calzada_lang_changed', () => { if (root && !root.hidden) { applyTexts(); render(); } });
    };

    const applyTexts = () => {
        const origin = opts && opts.field === 'origin';
        root.querySelector('#cpsTitle').textContent = origin ? tr('search.dialog_origin', 'Choose a starting point') : tr('search.dialog_dest', 'Choose a destination');
        root.querySelector('.cps-back').setAttribute('aria-label', tr('search.back', 'Back'));
        clearBtn.setAttribute('aria-label', tr('search.clear', 'Clear search'));
        input.placeholder = origin ? tr('search.placeholder_origin', 'Search a starting point') : tr('search.placeholder_dest', 'Search a destination');
        input.setAttribute('aria-label', input.placeholder);
        list.setAttribute('aria-label', tr('search.results', 'Search results'));
        chipsRow.setAttribute('aria-label', tr('search.categories', 'Categories'));
    };

    // Desktop: under the field that opened the search
    const place = () => {
        if (isMobile() || !opts || !opts.anchor) { panel.style.cssText = ''; return; }
        const r = opts.anchor.getBoundingClientRect();
        const width = Math.min(420, Math.max(340, r.width + 56));
        const left = Math.max(12, Math.min(r.left - 40, window.innerWidth - width - 12));
        const top = r.bottom + 8;
        panel.style.left = `${Math.round(left)}px`;
        panel.style.top = `${Math.round(top)}px`;
        panel.style.width = `${Math.round(width)}px`;
        panel.style.maxHeight = `${Math.round(Math.min(480, window.innerHeight - top - 16))}px`;
    };

    // ── Rendering ────────────────────────────────────────────────────────────
    let optionSeq = 0;
    const optionHtml = (o) => {
        const id = `cpsOpt${++optionSeq}`;
        o.id = id;
        if (o.type === 'shortcut') {
            return `<div class="cps-shortcut" role="option" id="${id}" aria-selected="false" data-idx="${o.idx}">
                <span class="cps-tile"><i class="ti ${o.icon}" aria-hidden="true"></i></span><span class="cps-shortcut-label">${esc(o.label)}</span></div>`;
        }
        if (o.type === 'pin') {
            return `<div class="cps-row cps-row--pin" role="option" id="${id}" aria-selected="false" data-idx="${o.idx}">
                <span class="cps-tile"><i class="ti ti-map-pin-plus" aria-hidden="true"></i></span>
                <span class="cps-row-text"><span class="cps-row-name">${esc(o.label)}</span></span></div>`;
        }
        const icon = o.type === 'recent' ? 'ti-clock' : (KIND_ICONS[o.kind] || KIND_ICONS.pin);
        const dist = o.distM != null ? `<span class="cps-row-dist">${fmtDist(o.distM)}</span>` : '';
        return `<div class="cps-row" role="option" id="${id}" aria-selected="false" data-idx="${o.idx}">
            <span class="cps-tile${o.type === 'recent' ? ' cps-tile--muted' : ''}"><i class="ti ${icon}" aria-hidden="true"></i></span>
            <span class="cps-row-text"><span class="cps-row-name">${o.nameHtml || esc(o.name)}</span>${o.location ? `<span class="cps-row-loc">${esc(o.location)}</span>` : ''}</span>${dist}</div>`;
    };

    let options = [];           // selectable items in the current view, in order
    const pinOption = () => ({ type: 'pin', label: tr('search.cant_find', "Can't find it? Pin it on the map") });

    const withDistance = (o) => {
        const f = userFix();
        if (f && Number.isFinite(o.lat)) o.distM = distM(f, o);
        return o;
    };

    const renderChips = (show) => {
        chipsRow.hidden = !show;
        if (!show) return;
        chipsRow.innerHTML = CATEGORIES.map(c => `<button type="button" class="cps-chip${activeCategory === c.id ? ' is-active' : ''}" data-cat="${c.id}" aria-pressed="${activeCategory === c.id}">
            <i class="ti ${c.icon}" aria-hidden="true"></i><span>${esc(tr(c.key, c.fallback))}</span></button>`).join('');
    };

    const setList = (html) => {
        list.innerHTML = html;
        list.querySelectorAll('[role="option"]').forEach(el => { const i = +el.dataset.idx; if (options[i]) options[i].el = el; });
        activeIndex = -1;
        input.removeAttribute('aria-activedescendant');
    };

    const section = (title, extra = '') => `<div class="cps-heading" role="presentation"><span>${esc(title)}</span>${extra}</div>`;

    // Before typing: categories, shortcuts and recent picks
    const renderIdle = () => {
        renderChips(true);
        options = [];
        const add = (o) => { o.idx = options.length; options.push(o); return optionHtml(o); };
        let html = '';
        if (activeCategory) {
            const cat = CATEGORIES.find(c => c.id === activeCategory);
            const places = calzadaPlaces().filter(p => String(p.category || '').toLowerCase() === activeCategory)
                .map(p => withDistance({ type: 'calzada', name: p.name, location: calzadaLocation(p), lat: +p.lat, lng: +p.lng, kind: CATEGORY_KIND[activeCategory] }))
                .sort((a, b) => (a.distM != null && b.distM != null) ? a.distM - b.distM : a.name.localeCompare(b.name));
            html += section(tr(cat.key, cat.fallback), `<span class="cps-verified"><i class="ti ti-circle-check" aria-hidden="true"></i>${esc(tr('search.verified', 'Verified'))}</span>`);
            html += places.length ? places.map(add).join('') : `<div class="cps-empty" role="presentation">${esc(tr('search.no_category', 'No places in this category yet.'))}</div>`;
            html += add(pinOption());
            setList(html);
            setFooter('calzada');
            return;
        }
        const shortcuts = [];
        if (opts.field === 'origin') shortcuts.push({ type: 'shortcut', action: 'mylocation', icon: 'ti-current-location', label: tr('search.your_location', 'Your location') });
        shortcuts.push({ type: 'shortcut', action: 'pin', icon: 'ti-map-pin-plus', label: tr('search.pin_on_map', 'Pin on map') });
        html += `<div class="cps-shortcuts${shortcuts.length === 1 ? ' is-single' : ''}" role="presentation">${shortcuts.map(add).join('')}</div>`;
        const recent = readRecent();
        if (recent.length) {
            html += section(tr('search.recent', 'Recent'), `<button type="button" class="cps-link" data-action="clear-recent">${esc(tr('search.recent_clear', 'Clear'))}</button>`);
            html += recent.map(r => add(withDistance({ type: 'recent', name: r.name, location: r.location, lat: r.lat, lng: r.lng }))).join('');
        }
        if (!navigator.onLine) html += `<div class="cps-note" role="presentation">${esc(tr('search.offline', "You're offline. Recent places still work."))}</div>`;
        setList(html);
        setFooter('calzada');
    };

    // Credits for whoever answered. Geoapify's free plan asks for "Powered by Geoapify" with a link,
    // and its data is OpenStreetMap's.
    const setFooter = (source) => {
        if (source === 'geoapify') {
            footer.innerHTML = `${esc(tr('search.attribution_by_calzada', 'Search by Calzada'))} · <a href="https://www.geoapify.com/" target="_blank" rel="noopener">Powered by Geoapify</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>`;
        } else if (source === 'esri') {
            footer.textContent = tr('search.attribution_esri', 'Search by Calzada and Esri');
        } else {
            footer.textContent = tr('search.attribution_calzada', 'Places from Calzada');
        }
    };

    const loadingRows = () => `<div class="cps-loading" role="presentation">${'<div class="cps-sk-row"><span class="skeleton cps-sk-tile"></span><span class="cps-sk-lines"><span class="skeleton cps-sk-line"></span><span class="skeleton cps-sk-line cps-sk-line--short"></span></span></div>'.repeat(2)}</div>`;

    // While typing: "In Calzada", then "More places"
    const renderResults = (query, local, external, state) => {
        renderChips(false);
        options = [];
        const add = (o) => { o.idx = options.length; options.push(o); return optionHtml(o); };
        let html = '';
        if (local.length) {
            html += section(tr('search.in_calzada', 'In Calzada'), `<span class="cps-verified"><i class="ti ti-circle-check" aria-hidden="true"></i>${esc(tr('search.verified', 'Verified'))}</span>`);
            html += local.map(add).join('');
        }
        if (state === 'loading') {
            html += section(tr('search.more_places', 'More places')) + loadingRows();
        } else if (external.length) {
            html += section(tr('search.more_places', 'More places')) + external.map(add).join('');
        }
        if (state === 'offline') {
            html += `<div class="cps-note" role="presentation">${esc(tr('search.offline_search', "You're offline, so only Calzada places are shown. Recent places still work."))}</div>`;
        } else if (state !== 'loading' && !local.length && !external.length) {
            html += `<div class="cps-empty" role="presentation">${esc(tr('search.no_results', 'No places found for "{q}"', { q: query }))}</div>`;
        }
        if (state !== 'loading') html += add(pinOption());
        setList(html);
        const n = local.length + external.length;
        if (state !== 'loading') status.textContent = n ? tr('search.count', '{n} places found', { n }) : tr('search.no_results', 'No places found for "{q}"', { q: query });
        setFooter(state === 'loading' ? 'calzada' : state);
    };

    const render = () => {
        const q = input.value.trim();
        clearBtn.hidden = !input.value;
        if (q.length < MIN_CHARS) renderIdle();
        else runSearch(q);
    };

    // ── Searching ────────────────────────────────────────────────────────────
    const searchCalzada = (query) => calzadaPlaces()
        .map(p => ({ p, score: nameScore(query, p.name) }))
        .filter(x => x.score > 0)
        .map(x => withDistance({ type: 'calzada', name: x.p.name, nameHtml: highlight(x.p.name, query), location: calzadaLocation(x.p), lat: +x.p.lat, lng: +x.p.lng, kind: CATEGORY_KIND[String(x.p.category || '').toLowerCase()] || 'pin', score: x.score,
            // kept for the visibility lift of listed businesses
            id: x.p.id, plan: x.p.source === 'business' ? x.p.plan : undefined, paidAt: x.p.source === 'business' ? x.p.paidAt : undefined }))
        .sort((a, b) => b.score - a.score || ((a.distM != null && b.distM != null) ? a.distM - b.distM : 0))
        .slice(0, 12);
    // A boosted business may move up at most 3 places above its text match
    const liftBoosted = (list) => (window.CalzadaVisibility
        ? window.CalzadaVisibility.rankSearchResults(list, new Date(), 3) : list).slice(0, 6);

    // Geoapify through our server. Throws (so Esri takes over) on no key (204), too many searches (429), an error or 3 s.
    const searchGeocode = async (query, signal) => {
        const bias = userFix() || CALAMBA;
        // POST body, so the search text never appears in a URL or request log
        const body = JSON.stringify({ q: query, lat: +bias.lat.toFixed(4), lng: +bias.lng.toFixed(4) });
        const timeout = new AbortController();
        const timer = setTimeout(() => timeout.abort(), GEOCODE_TIMEOUT_MS);
        const onAbort = () => timeout.abort();
        signal.addEventListener('abort', onAbort);
        try {
            const res = await fetch(GEOCODE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: timeout.signal });
            if (res.status === 204) throw new Error('no geocoder key');
            if (res.status === 429) throw new Error('too many searches'); // Esri takes over
            if (!res.ok) throw new Error(`geocode HTTP ${res.status}`);
            const data = await res.json();
            return (data.results || []).map(r => ({
                type: 'geoapify', name: r.name, nameHtml: highlight(r.name, query), location: geocodeLocation(r, r.name),
                lat: Number(r.lat), lng: Number(r.lng), kind: KIND_ICONS[r.kind] ? r.kind : 'pin', city: r.city || ''
            })).filter(o => o.name && Number.isFinite(o.lat) && Number.isFinite(o.lng));
        } finally {
            clearTimeout(timer);
            signal.removeEventListener('abort', onAbort);
        }
    };

    // The search the planner used before (Esri suggest; coordinates are looked up on selection)
    const searchEsri = async (query, signal) => {
        const url = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/suggest?text=${encodeURIComponent(query)}&location=121.1641,14.2045&distance=50000&countryCode=PHL&maxSuggestions=6&f=json`;
        const res = await fetch(url, { signal });
        const data = await res.json();
        return (data.suggestions || []).map(s => {
            const parts = s.text.split(',').map(x => x.trim());
            const name = parts[0];
            return { type: 'esri', name, nameHtml: highlight(name, query), location: uniqueParts(parts.slice(1), name).slice(0, 2).join(', '), address: s.text, kind: 'pin' };
        });
    };

    // Drop outside results that are a Calzada place already (similar name within 150 m)
    const isDuplicate = (o, local) => local.some(l => {
        // Esri suggestions have no coordinates until picked: only the same name counts there
        if (!Number.isFinite(o.lat)) return norm(o.name) === norm(l.name);
        if (distM(o, l) > DUPLICATE_RADIUS_M) return false;
        const a = norm(o.name), b = norm(l.name);
        if (!a || !b) return false;
        if (a.includes(b) || b.includes(a)) return true;
        const wa = new Set(words(a)), wb = words(b);
        const shared = wb.filter(w => wa.has(w)).length;
        return shared / Math.max(1, Math.min(wa.size, wb.length)) >= 0.6;
    });

    // Review #02: a destination must be in Calamba; a starting point may be anywhere along the jeep routes
    const inServiceArea = (o) => {
        const forOrigin = !!(opts && opts.field === 'origin');
        if (Number.isFinite(o.lat) && Number.isFinite(o.lng)) {
            if (!inBox(o, forOrigin ? SERVICE_BOX : CALAMBA_BOX)) return false;
            if (!forOrigin && o.city && !/calamba/i.test(o.city)) return false;
            return true;
        }
        // Esri suggestions have no coordinates yet: judge a destination by the town in its address
        if (!forOrigin && OTHER_TOWNS.test(o.address || o.location || '') && !/calamba/i.test(o.address || o.location || '')) return false;
        return true;
    };
    // Two results with the same address (street, area and town) close together are the same place
    const sameAddress = (a, b) => {
        const la = norm(a.location), lb = norm(b.location);
        if (!la || la !== lb) return false;
        if (!Number.isFinite(a.lat) || !Number.isFinite(b.lat)) return true;
        return distM(a, b) <= SAME_ADDRESS_RADIUS_M;
    };

    const runSearch = async (query) => {
        if (controller) controller.abort();
        controller = new AbortController();
        const { signal } = controller;
        lastQuery = query;
        const local = liftBoosted(searchCalzada(query));
        const allLocal = calzadaPlaces().map(p => ({ name: p.name, lat: +p.lat, lng: +p.lng }));
        if (!navigator.onLine) {
            renderResults(query, local, [], 'offline');
            console.info(`Place search "${query}": Calzada ${local.length} (offline)`);
            return;
        }
        renderResults(query, local, [], 'loading');
        let external = [], source = 'Geoapify';
        try {
            external = await searchGeocode(query, signal);
        } catch (e) {
            if (signal.aborted) return; // a newer search took over
            source = 'Esri (fallback)';
            try {
                external = await searchEsri(query, signal);
            } catch (e2) {
                if (signal.aborted) return;
                renderResults(query, local, [], navigator.onLine ? 'calzada' : 'offline');
                console.info(`Place search "${query}": Calzada ${local.length}, Geoapify and Esri failed`);
                return;
            }
        }
        if (signal.aborted || query !== lastQuery) return;
        // Not a Calzada place already, and not the same place twice (same name within 150 m)
        external = external.filter(o => !isDuplicate(o, allLocal))
            .filter((o, i, arr) => !arr.slice(0, i).some(p => norm(p.name) === norm(o.name) && (!Number.isFinite(o.lat) || distM(o, p) <= DUPLICATE_RADIUS_M)))
            .filter(inServiceArea)
            .filter((o, i, arr) => !arr.slice(0, i).some(p => sameAddress(o, p)));
        // Calzada's own places come first; outside results only fill in when there are few of them
        external = external.map(withDistance).slice(0, local.length >= 5 ? 3 : 8);
        console.info(`Place search "${query}": Calzada ${local.length}, ${source} ${external.length}`);
        renderResults(query, local, external, source === 'Geoapify' ? 'geoapify' : 'esri');
    };

    const onInput = () => {
        clearBtn.hidden = !input.value;
        clearTimeout(debounceTimer);
        const q = input.value.trim();
        if (q.length < MIN_CHARS) {
            if (controller) controller.abort();
            lastQuery = '';
            renderIdle();
            return;
        }
        debounceTimer = setTimeout(() => runSearch(q), DEBOUNCE_MS);
    };

    // ── Selection and keyboard ──────────────────────────────────────────────
    const setActive = (i, scroll = true) => {
        options.forEach(o => { if (o.el) { o.el.classList.remove('is-active'); o.el.setAttribute('aria-selected', 'false'); } });
        activeIndex = i;
        const o = options[i];
        if (!o || !o.el) { input.removeAttribute('aria-activedescendant'); return; }
        o.el.classList.add('is-active');
        o.el.setAttribute('aria-selected', 'true');
        input.setAttribute('aria-activedescendant', o.id);
        if (scroll) o.el.scrollIntoView({ block: 'nearest' });
    };

    const choose = async (o) => {
        if (!o || !opts) return;
        const o2 = opts;
        if (o.type === 'pin' || o.action === 'pin') { close({ restoreFocus: false }); o2.onPin && o2.onPin(); return; }
        if (o.action === 'mylocation') { close({ restoreFocus: false }); o2.onMyLocation && o2.onMyLocation(); return; }
        let lat = o.lat, lng = o.lng;
        if (o.type === 'esri') {
            // The suggestion's coordinates come from findAddressCandidates. Close the search right
            // away and let the field show the name as loading, instead of a screen that looks stuck.
            if (o2.onPending) { close(); o2.onPending(o.name); }
            try {
                const res = await fetch(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?SingleLine=${encodeURIComponent(o.address)}&location=121.1641,14.2045&distance=50000&countryCode=PHL&outFields=PlaceName,Place_addr&maxLocations=1&f=json`);
                const data = await res.json();
                const c = data.candidates && data.candidates[0];
                lat = c ? c.location.y : 14.2045;
                lng = c ? c.location.x : 121.1641;
            } catch (_) { lat = 14.2045; lng = 121.1641; }
        }
        addRecent({ name: o.name, location: o.location, lat, lng });
        if (root && !root.hidden) close();
        o2.onSelect && o2.onSelect(o.name, [lat, lng], o);
    };

    const onListClick = (e) => {
        const clear = e.target.closest('[data-action="clear-recent"]');
        if (clear) { writeRecent([]); renderIdle(); input.focus(); return; }
        const el = e.target.closest('[role="option"]');
        if (el) choose(options[+el.dataset.idx]);
    };

    const onKeyDown = (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!options.length) return;
            const step = e.key === 'ArrowDown' ? 1 : -1;
            setActive(activeIndex < 0 ? (step > 0 ? 0 : options.length - 1) : (activeIndex + step + options.length) % options.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIndex >= 0) choose(options[activeIndex]);
            else {
                const first = options.find(o => o.type === 'calzada' || o.type === 'geoapify' || o.type === 'esri');
                if (first) choose(first);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            close();
        }
    };

    // ── Open / close ─────────────────────────────────────────────────────────
    const open = (options_) => {
        if (!root) build();
        opts = options_ || {};
        activeCategory = null;
        lastQuery = '';
        input.value = '';
        applyTexts();
        root.classList.toggle('is-desktop', !isMobile());
        root.hidden = false;
        place();
        renderIdle();
        clearBtn.hidden = true;
        document.body.classList.add('cps-open');
        // next frame so the slide-up transition runs
        requestAnimationFrame(() => {
            root.classList.add('is-open');
            input.focus({ preventScroll: true });
        });
    };

    const close = ({ restoreFocus = true } = {}) => {
        if (!root || root.hidden) return;
        clearTimeout(debounceTimer);
        if (controller) controller.abort();
        root.classList.remove('is-open');
        document.body.classList.remove('cps-open');
        const anchor = opts && opts.anchor;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        setTimeout(() => { if (!root.classList.contains('is-open')) root.hidden = true; }, reduce || !isMobile() ? 0 : 260);
        if (restoreFocus && anchor && typeof anchor.focus === 'function') anchor.focus({ preventScroll: true });
    };

    const isOpen = () => !!root && !root.hidden && root.classList.contains('is-open');

    window.CalzadaPlaceSearch = { open, close, isOpen, _readRecent: readRecent };
})();
