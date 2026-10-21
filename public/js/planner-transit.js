/**
 * Calzada planner: route options + transfer prompt (v1.0.0)
 *
 * UI only. planner.js plans with window.CalzadaTransit and calls:
 *   CalzadaTransitUI.renderOptions(options, selectedIndex, onSelect)
 *   CalzadaTransitUI.setOptionTime(index, totalMin)   (after real walks are known)
 *   CalzadaTransitUI.hideOptions()
 *   CalzadaTransitUI.showTransfer({ hubName, nextName, boardName, near }, onArrived, onLater)
 *   CalzadaTransitUI.hideTransfer()
 * DOM is built with createElement/textContent (route data never goes through innerHTML).
 */
(function () {
    'use strict';

    const TEXT = {
        en: {
            ways: (n) => `${n} ways`,
            oneWay: 'Route',
            recommended: 'Recommended',
            cheapest: 'Cheapest',
            fastest: 'Fastest',
            noTransfer: 'No transfer',
            transfers: (n) => `${n} transfer${n === 1 ? '' : 's'}`,
            walk: (m) => `${m} walk`,
            walkMin: (n) => `${n} min walk`,
            changeHere: 'Change here',
            min: (n) => `${n} min`,
            discounted: (p) => `${p} discounted`,
            getOffAt: 'Get off at',
            changeAt: 'Change at',
            nearDest: 'Get off near your destination',
            estimate: 'Times and fares are estimates. Tap an option to see its steps.',
            atHub: (h) => `At ${h}?`,
            changeAtHub: (h) => `Change jeeps at ${h}`,
            next: (j, b) => `Next: jeep to ${j}${b ? ` at ${b}` : ''}`,
            arrived: "I'm here · Recompute",
            later: 'Later',
            arrivedShort: "I'm here"
        },
        tl: {
            ways: (n) => `${n} paraan`,
            oneWay: 'Ruta',
            recommended: 'Recommended',
            cheapest: 'Pinakamura',
            fastest: 'Pinakamabilis',
            noTransfer: 'Walang lipat',
            transfers: (n) => `${n} lipat`,
            walk: (m) => `${m} lakad`,
            walkMin: (n) => `${n} min lakad`,
            changeHere: 'Lipat dito',
            min: (n) => `${n} min`,
            discounted: (p) => `${p} may discount`,
            getOffAt: 'Baba sa',
            changeAt: 'Lipat sa',
            nearDest: 'Baba malapit sa pupuntahan mo',
            estimate: 'Tantya ang oras at pamasahe. Pindutin ang option para makita ang mga hakbang.',
            atHub: (h) => `Nasa ${h} ka na?`,
            changeAtHub: (h) => `Lilipat ng jeep sa ${h}`,
            next: (j, b) => `Susunod: jeep na ${j}${b ? ` sa ${b}` : ''}`,
            arrived: 'Nandito na ako · I-recompute',
            later: 'Mamaya na',
            arrivedShort: 'Nandito na ako'
        }
    };
    const lang = () => {
        try { return (window.getCurrentLang && window.getCurrentLang()) === 'tl' ? 'tl' : 'en'; } catch (_) { return 'en'; }
    };
    const L = () => TEXT[lang()];

    const peso = (n) => (window.CalzadaFare ? window.CalzadaFare.formatPeso(n) : `₱${n}`);
    const fmtDur = (min) => {
        if (min < 60) return `${min} min`;
        const h = Math.floor(min / 60), m = min % 60;
        return m ? `${h} hr ${m} min` : `${h} hr`;
    };
    const fmtM = (m) => (m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1)} km`);

    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }

    const JEEP_ICON = '../assets/icons/jeepney-icon.png';

    function headsignText(leg) {
        const all = [leg.headsign].concat(leg.alsoHeadsigns || []).filter(Boolean);
        return all.join(' / ');
    }

    function stopLabel(ref) {
        if (!ref) return null;
        if (lang() === 'tl' && ref.name_tl) return ref.name_tl;
        return ref.name || null;
    }

    // ── Options list ────────────────────────────────────────────────────────────
    let container = null;
    let current = { options: [], selected: 0, onSelect: null };

    function ensureContainer() {
        if (container && document.body.contains(container)) return container;
        container = document.getElementById('transitOptions');
        if (!container) {
            container = el('div', 'czt-options');
            container.id = 'transitOptions';
            const modes = document.getElementById('transportModesBlock');
            if (modes && modes.parentNode) modes.parentNode.insertBefore(container, modes.nextSibling);
        }
        return container;
    }

    function tagEl(tag) {
        const t = L();
        const map = { recommended: ['czt-tag--rec', t.recommended], cheapest: ['czt-tag--cheap', t.cheapest], fastest: ['czt-tag--fast', t.fastest] };
        const m = map[tag];
        return m ? el('span', `czt-tag ${m[0]}`, m[1]) : null;
    }

    function pill(kind, text) {
        const p = el('span', `czt-pill czt-pill--${kind}`);
        if (kind === 'jeep') {
            const img = el('img');
            img.src = JEEP_ICON;
            img.alt = '';
            img.width = 15;
            img.height = 15;
            p.appendChild(img);
        }
        p.appendChild(el('span', null, text));
        return p;
    }

    function buildCard(opt, i, selected, showTags) {
        const t = L();
        const card = el('button', 'czt-opt' + (selected ? ' is-selected' : ''));
        card.type = 'button';
        card.dataset.index = String(i);
        card.setAttribute('aria-pressed', selected ? 'true' : 'false');

        if (showTags && opt.tags && opt.tags.length) {
            const tags = el('div', 'czt-tags');
            opt.tags.forEach((tg) => { const e = tagEl(tg); if (e) tags.appendChild(e); });
            card.appendChild(tags);
        }

        const top = el('div', 'czt-top');
        const time = el('div', 'czt-time', fmtDur(opt.totalMin));
        time.dataset.role = 'time';
        top.appendChild(time);
        const fare = el('div', 'czt-fare');
        fare.appendChild(el('span', 'czt-fare-reg', peso(opt.fare)));
        fare.appendChild(el('span', 'czt-fare-disc', t.discounted(peso(opt.fareDisc))));
        top.appendChild(fare);
        card.appendChild(top);

        // Rides and the walk between them
        const strip = el('div', 'czt-strip');
        const jeeps = opt.legs.filter((l) => l.type === 'jeep');
        opt.legs.forEach((leg, idx) => {
            if (leg.type === 'jeep') {
                if (strip.childNodes.length) strip.appendChild(el('span', 'czt-chev', '›'));
                strip.appendChild(pill('jeep', headsignText(leg)));
            } else if (leg.transfer && idx > 0 && idx < opt.legs.length - 1) {
                strip.appendChild(el('span', 'czt-chev', '›'));
                strip.appendChild(pill('walk', leg.distM > 0 ? t.walkMin(leg.min) : t.changeHere));
            }
        });
        card.appendChild(strip);

        const first = jeeps[0];
        const alightName = stopLabel(first && first.alight);
        const metaParts = [
            opt.transfers ? t.transfers(opt.transfers) : t.noTransfer,
            t.walk(fmtM(opt.walkM))
        ];
        const meta = el('div', 'czt-meta');
        if (alightName) {
            meta.appendChild(document.createTextNode(metaParts.join(' · ') + ' · ' + (opt.transfers ? t.changeAt : t.getOffAt) + ' '));
            meta.appendChild(el('b', null, alightName));
        } else {
            meta.appendChild(document.createTextNode(metaParts.concat(t.nearDest).join(' · ')));
        }
        card.appendChild(meta);
        return card;
    }

    function renderOptions(options, selectedIndex, onSelect) {
        const box = ensureContainer();
        if (!box) return;
        current = { options: options || [], selected: selectedIndex || 0, onSelect };
        box.textContent = '';
        if (!current.options.length) { box.hidden = true; return; }
        box.hidden = false;
        const t = L();
        const multi = current.options.length > 1;

        const hd = el('div', 'czt-hd');
        hd.appendChild(el('span', 'czt-hd-title', multi ? t.ways(current.options.length) : t.oneWay));
        box.appendChild(hd);

        if (multi) {
            const chips = el('div', 'czt-chips');
            ['recommended', 'cheapest', 'fastest'].forEach((tag) => {
                const idx = current.options.findIndex((o) => (o.tags || []).includes(tag));
                if (idx < 0) return;
                const c = el('button', 'czt-chip' + (idx === current.selected ? ' is-on' : ''), t[tag]);
                c.type = 'button';
                c.dataset.index = String(idx);
                chips.appendChild(c);
            });
            box.appendChild(chips);
        }

        const list = el('div', 'czt-list');
        current.options.forEach((o, i) => list.appendChild(buildCard(o, i, i === current.selected, multi)));
        box.appendChild(list);
        if (multi) box.appendChild(el('div', 'czt-note', t.estimate));

        const pick = (e) => {
            const target = e.target.closest('[data-index]');
            if (!target || !box.contains(target)) return;
            const i = Number(target.dataset.index);
            if (!Number.isFinite(i) || i === current.selected) return;
            if (typeof current.onSelect === 'function') current.onSelect(i);
        };
        if (!box._cztBound) {
            box.addEventListener('click', (e) => pick(e));
            box._cztBound = true;
        }
    }

    function setOptionTime(index, totalMin) {
        const box = ensureContainer();
        if (!box) return;
        const card = box.querySelector(`.czt-opt[data-index="${index}"] [data-role="time"]`);
        if (card && Number.isFinite(totalMin)) card.textContent = fmtDur(totalMin);
    }

    function hideOptions() {
        const box = document.getElementById('transitOptions');
        if (box) { box.textContent = ''; box.hidden = true; }
        current = { options: [], selected: 0, onSelect: null };
    }

    // ── Transfer prompt (during a journey) ─────────────────────────────────────
    let card = null;
    let handlers = { onArrived: null, onLater: null };
    let lastState = null;

    function ensureCard() {
        if (card && document.body.contains(card)) return card;
        card = el('div', 'czt-xfer');
        card.id = 'transitTransferCard';
        card.setAttribute('role', 'status');
        card.hidden = true;
        document.body.appendChild(card);
        card.addEventListener('click', (e) => {
            const b = e.target.closest('button[data-act]');
            if (!b) return;
            if (b.dataset.act === 'arrived' && handlers.onArrived) handlers.onArrived();
            if (b.dataset.act === 'later') {
                card.classList.add('is-compact');
                card.dataset.later = '1';
                if (handlers.onLater) handlers.onLater();
            }
        });
        window.addEventListener('resize', place);
        return card;
    }

    // Phone: above the bottom navigation sheet; desktop: inside the navigation panel's column
    function place() {
        if (!card || card.hidden) return;
        const isPhone = window.innerWidth <= 768;
        card.classList.toggle('is-phone', isPhone);
        if (isPhone) {
            const pillEl = document.getElementById('bottomStatusPill');
            const top = pillEl && getComputedStyle(pillEl).display !== 'none' ? pillEl.getBoundingClientRect().top : window.innerHeight - 110;
            card.style.bottom = `${Math.max(12, window.innerHeight - top + 10)}px`;
            card.style.top = '';
            card.style.left = '';
            card.style.width = '';
        } else {
            // Right under the navigation panel, same width
            const panel = document.getElementById('activeNavPanel');
            const r = panel && getComputedStyle(panel).display !== 'none' ? panel.getBoundingClientRect() : null;
            if (r && r.bottom + 12 + card.offsetHeight < window.innerHeight - 12) {
                card.style.top = `${Math.round(r.bottom + 12)}px`;
                card.style.bottom = '';
                card.style.left = `${Math.round(r.left)}px`;
                card.style.width = `${Math.round(r.width)}px`;
            } else {
                card.style.top = '';
                card.style.bottom = '24px';
                card.style.left = r ? `${Math.round(r.right + 16)}px` : '24px';
                card.style.width = '';
            }
        }
    }

    function showTransfer(state, onArrived, onLater) {
        const c = ensureCard();
        handlers = { onArrived, onLater };
        const t = L();
        const sig = JSON.stringify([state.hubName, state.nextName, state.boardName, !!state.near, lang()]);
        if (sig !== lastState) {
            lastState = sig;
            c.textContent = '';
            const row = el('div', 'czt-xfer-row');
            const ic = el('div', 'czt-xfer-ic');
            ic.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2272C3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/><path d="M17.66 16.66l-4.24 4.24a2 2 0 0 1 -2.83 0l-4.25 -4.24a8 8 0 1 1 11.32 0z"/></svg>';
            row.appendChild(ic);
            const txt = el('div', 'czt-xfer-txt');
            txt.appendChild(el('div', 'czt-xfer-title', state.near ? t.atHub(state.hubName) : t.changeAtHub(state.hubName)));
            txt.appendChild(el('div', 'czt-xfer-sub', t.next(state.nextName, state.boardName)));
            row.appendChild(txt);
            const compactBtn = el('button', 'czt-xfer-mini', t.arrivedShort);
            compactBtn.type = 'button';
            compactBtn.dataset.act = 'arrived';
            row.appendChild(compactBtn);
            c.appendChild(row);
            const go = el('button', 'czt-xfer-go', t.arrived);
            go.type = 'button';
            go.dataset.act = 'arrived';
            c.appendChild(go);
            const later = el('button', 'czt-xfer-later', t.later);
            later.type = 'button';
            later.dataset.act = 'later';
            c.appendChild(later);
        }
        // Near the hub the full card shows; before that only the compact row with its button
        if (state.near && c.dataset.later !== '1') c.classList.remove('is-compact');
        else if (!c.classList.contains('was-shown')) c.classList.add('is-compact');
        c.classList.add('was-shown');
        c.hidden = false;
        place();
    }

    function hideTransfer() {
        if (card) {
            card.hidden = true;
            card.classList.remove('was-shown', 'is-compact');
            delete card.dataset.later;
        }
        lastState = null;
    }

    // Language switch: redraw what is on screen in the new language
    window.addEventListener('calzada_lang_changed', () => {
        if (current.options.length) renderOptions(current.options, current.selected, current.onSelect);
        if (card && !card.hidden) lastState = null;
    });

    window.CalzadaTransitUI = { renderOptions, setOptionTime, hideOptions, showTransfer, hideTransfer, fmtDur, headsignText, stopLabel };
})();
