/**
 * Calzada planner: route options + terminal choice + transfer prompt (v1.3.0)
 *
 * UI only. planner.js plans with window.CalzadaTransit and calls:
 *   CalzadaTransitUI.renderOptions(options, selectedIndex, onSelect)
 *   CalzadaTransitUI.setOptionActual(index, totalMin, walkM)   (after real walks are known)
 *   CalzadaTransitUI.hideOptions()
 *   CalzadaTransitUI.showTransfer({ hubName, nextName, boardName, near }, onArrived, onLater)
 *   CalzadaTransitUI.hideTransfer()
 *   CalzadaTransitUI.renderTerminalChoices(tc, selectedIndex, onPick, { hereId })   (Real / Halang trips)
 *   CalzadaTransitUI.hideTerminalChoices()
 *   CalzadaTransitUI.showAutoSwitch({ terminalName, previousName, riding })   (switched terminal, no question)
 *   CalzadaTransitUI.hideAutoSwitch()
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
            arrivedShort: "I'm here",
            whereBoard: 'Where will you board?',
            termCount: (n, area) => `${n} terminals to ${area}`,
            changeHere: 'change jeeps here',
            termAria: 'Terminal to board at',
            youreHere: "You're here",
            longWalk: 'Long walk',
            autoTitle: (n) => `You're at ${n}`,
            autoBody: "You'll board here, so your route now starts here.",
            autoRideTitle: (n) => `You're on a jeep from ${n}`,
            autoRideBody: 'Your route now follows this jeep.',
            autoBefore: (n) => `Before: ${n}`,
            trafficDelay: (n) => `Traffic: +${n} min`,
            trafficNotice: (n) => `Includes traffic (TomTom) · updated ${n} min ago`
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
            arrivedShort: 'Nandito na ako',
            whereBoard: 'Saan ka sasakay?',
            termCount: (n, area) => `${n} terminal papuntang ${area}`,
            changeHere: 'dito lilipat',
            termAria: 'Terminal na sasakyan',
            youreHere: 'Nandito ka',
            longWalk: 'Malayong lakad',
            autoTitle: (n) => `Nasa ${n} ka na`,
            autoBody: 'Dito ka na sasakay, kaya inilipat na namin ang ruta mo.',
            autoRideTitle: (n) => `Nakasakay ka na mula sa ${n}`,
            autoRideBody: 'Inilipat na namin ang ruta mo sa jeep na ito.',
            autoBefore: (n) => `Dati: ${n}`,
            trafficDelay: (n) => `May trapiko: +${n} min`,
            trafficNotice: (n) => `Kasama ang trapiko (TomTom) · ${n} min ang nakalipas`
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

    const WALK_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/></svg>';
    function walkNote(text) {
        const w = el('span', 'czt-walk');
        const ic = el('span', 'czt-walk-ic');
        ic.innerHTML = WALK_SVG;
        w.appendChild(ic);
        w.appendChild(el('span', null, text));
        return w;
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
            } else if (leg.transfer && leg.distM > 0 && idx > 0 && idx < opt.legs.length - 1) {
                // The walk between the two jeeps (information, not a button)
                strip.appendChild(el('span', 'czt-chev', '›'));
                strip.appendChild(walkNote(t.walkMin(leg.min)));
            }
        });
        card.appendChild(strip);

        const first = jeeps[0];
        const alightName = stopLabel(first && first.alight);
        const meta = el('div', 'czt-meta');
        meta.appendChild(document.createTextNode((opt.transfers ? t.transfers(opt.transfers) : t.noTransfer) + ' · '));
        const walkSpan = el('span', null, t.walk(fmtM(opt.walkM)));
        walkSpan.dataset.role = 'walk';
        meta.appendChild(walkSpan);
        if (alightName) {
            meta.appendChild(document.createTextNode(' · ' + (opt.transfers ? t.changeAt : t.getOffAt) + ' '));
            meta.appendChild(el('b', null, alightName));
        } else {
            meta.appendChild(document.createTextNode(' · ' + t.nearDest));
        }
        card.appendChild(meta);

        if (opt.traffic && opt.traffic.delayMin >= 3) {
            const delayEl = el('div', 'czt-traffic-delay');
            delayEl.style.color = '#B45309';
            delayEl.style.fontSize = '12px';
            delayEl.style.fontWeight = '500';
            delayEl.style.marginTop = '4px';
            delayEl.textContent = t.trafficDelay(opt.traffic.delayMin);
            card.appendChild(delayEl);
        }
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

    // The picked option with its real walks (the list starts from estimates)
    function setOptionActual(index, totalMin, walkM) {
        const box = ensureContainer();
        if (!box) return;
        const opt = current.options[index];
        if (opt) {
            if (Number.isFinite(totalMin)) opt.totalMin = totalMin;
            if (Number.isFinite(walkM)) opt.walkM = walkM;
        }
        const time = box.querySelector(`.czt-opt[data-index="${index}"] [data-role="time"]`);
        if (time && Number.isFinite(totalMin)) time.textContent = fmtDur(totalMin);
        // The terminal card of the same option (its walk line is the walk to the terminal: unchanged)
        const tbox = document.getElementById('transitTerminalChoices');
        const ttime = tbox && !tbox.hidden ? tbox.querySelector(`.czt-term[data-index="${index}"] [data-role="time"]`) : null;
        if (ttime && Number.isFinite(totalMin)) ttime.textContent = fmtDur(totalMin);
        const walk = box.querySelector(`.czt-opt[data-index="${index}"] [data-role="walk"]`);
        if (walk && Number.isFinite(walkM)) walk.textContent = L().walk(fmtM(walkM));
    }

    function hideOptions() {
        const box = document.getElementById('transitOptions');
        if (box) { box.textContent = ''; box.hidden = true; }
        current = { options: [], selected: 0, onSelect: null };
    }


    // ── Terminal choice (destination in Real / Halang) ─────────────────────────
    // One radio card per terminal; the option of the picked card is the one routed. The usual
    // options list is hidden while this shows.
    let termBox = null;
    let currentTerm = { tc: null, selected: 0, onPick: null, opts: {} };

    function ensureTermBox() {
        if (termBox && document.body.contains(termBox)) return termBox;
        termBox = document.getElementById('transitTerminalChoices');
        if (!termBox) {
            termBox = el('div', 'czt-options czt-terms');
            termBox.id = 'transitTerminalChoices';
            termBox.hidden = true;
            const opts = ensureContainer();
            if (opts && opts.parentNode) opts.parentNode.insertBefore(termBox, opts);
        }
        return termBox;
    }

    function areaLabel(area) {
        return area === 'Real' || area === 'Halang' ? area : String(area || '');
    }

    // Compact row: name, door-to-door time and fare; one short line under it. The legs below show
    // the walks and jeeps in full, so the row does not repeat them.
    function buildTermCard(c, i, selected, hereId) {
        const t = L();
        const opt = c.option;
        const card = el('button', 'czt-term' + (selected ? ' is-selected' : ''));
        card.type = 'button';
        card.dataset.index = String(i);
        card.setAttribute('role', 'radio');
        card.setAttribute('aria-checked', selected ? 'true' : 'false');
        card.tabIndex = selected ? 0 : -1;

        const radio = el('span', 'czt-radio');
        radio.setAttribute('aria-hidden', 'true');
        card.appendChild(radio);

        const body = el('span', 'czt-term-body');
        const top = el('span', 'czt-term-top');
        const name = (lang() === 'tl' && c.name_tl) ? c.name_tl : c.name;
        top.appendChild(el('span', 'czt-term-name', name));
        const time = el('span', 'czt-term-time', fmtDur(opt.totalMin));
        time.dataset.role = 'time';
        top.appendChild(time);
        top.appendChild(el('span', 'czt-term-fare', peso(opt.fare)));
        body.appendChild(top);

        // e.g. "Recommended · 3 min lakad · Tanauan", or "lipat dito · Real" from farther away
        const sub = el('span', 'czt-term-sub');
        const bits = [];
        if (c.recommended) bits.push(el('b', 'czt-term-rec', t.recommended));
        if (c.stopId === hereId) bits.push(el('b', 'czt-term-rec', t.youreHere));
        const jeeps = opt.legs.filter((l) => l.type === 'jeep');
        const last = jeeps[jeeps.length - 1];
        if (opt.transfers) bits.push(document.createTextNode(t.changeHere));
        else if (c.walkM > 0) bits.push(document.createTextNode(t.walkMin(Math.max(1, c.walkMin))));
        if (last) bits.push(document.createTextNode(headsignText(last)));
        if (c.farWalk) bits.push(document.createTextNode(t.longWalk));
        bits.forEach((b, k) => {
            if (k) sub.appendChild(document.createTextNode(' · '));
            sub.appendChild(b);
        });
        body.appendChild(sub);

        if (opt && opt.traffic && opt.traffic.delayMin >= 3) {
            const delayEl = el('span', 'czt-traffic-delay');
            delayEl.style.color = '#B45309';
            delayEl.style.fontSize = '12px';
            delayEl.style.fontWeight = '500';
            delayEl.style.display = 'block';
            delayEl.style.marginTop = '4px';
            delayEl.textContent = t.trafficDelay(opt.traffic.delayMin);
            body.appendChild(delayEl);
        }

        card.appendChild(body);
        return card;
    }

    function renderTerminalChoices(tc, selectedIndex, onPick, opts) {
        const box = ensureTermBox();
        if (!box) return;
        currentTerm = { tc, selected: selectedIndex || 0, onPick, opts: opts || {} };
        box.textContent = '';
        if (!tc || !tc.choices || tc.choices.length < 2) { box.hidden = true; return; }
        // The usual options list stays empty while the terminal choice shows
        const optBox = ensureContainer();
        if (optBox) { optBox.textContent = ''; optBox.hidden = true; }
        current = { options: [], selected: 0, onSelect: null };
        box.hidden = false;
        const t = L();

        const hd = el('div', 'czt-term-hd');
        hd.appendChild(el('h3', 'czt-term-title', t.whereBoard));
        hd.appendChild(el('span', 'czt-term-count', t.termCount(tc.choices.length, areaLabel(tc.area))));
        box.appendChild(hd);

        const list = el('div', 'czt-list');
        list.setAttribute('role', 'radiogroup');
        list.setAttribute('aria-label', t.termAria);
        tc.choices.forEach((c, i) => list.appendChild(buildTermCard(c, i, i === currentTerm.selected, currentTerm.opts.hereId)));
        box.appendChild(list);

        if (!box._cztBound) {
            box.addEventListener('click', (e) => {
                const target = e.target.closest('[data-index]');
                if (!target || !box.contains(target)) return;
                const i = Number(target.dataset.index);
                if (!Number.isFinite(i) || i === currentTerm.selected) return;
                if (typeof currentTerm.onPick === 'function') currentTerm.onPick(i);
            });
            // Radio group keys: arrows move the choice
            box.addEventListener('keydown', (e) => {
                if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(e.key)) return;
                const n = currentTerm.tc ? currentTerm.tc.choices.length : 0;
                if (!n) return;
                e.preventDefault();
                const step = (e.key === 'ArrowDown' || e.key === 'ArrowRight') ? 1 : -1;
                const i = (currentTerm.selected + step + n) % n;
                if (typeof currentTerm.onPick === 'function') currentTerm.onPick(i);
                setTimeout(() => {
                    const b = box.querySelector(`.czt-term[data-index="${i}"]`);
                    if (b) b.focus();
                }, 0);
            });
            box._cztBound = true;
        }
    }

    function hideTerminalChoices() {
        const box = document.getElementById('transitTerminalChoices');
        if (box) { box.textContent = ''; box.hidden = true; }
        currentTerm = { tc: null, selected: 0, onPick: null, opts: {} };
    }

    // ── Switched terminal (the user is at another terminal): status only, no question ──
    let autoCard = null;
    let autoTimer = null;
    function showAutoSwitch(state) {
        if (!autoCard || !document.body.contains(autoCard)) {
            autoCard = el('div', 'czt-xfer czt-auto');
            autoCard.id = 'transitAutoSwitch';
            autoCard.setAttribute('role', 'status');
            autoCard.setAttribute('aria-live', 'polite');
            autoCard.hidden = true;
            document.body.appendChild(autoCard);
            window.addEventListener('resize', () => placeEl(autoCard, true));
        }
        const t = L();
        autoCard.textContent = '';
        const row = el('div', 'czt-xfer-row czt-auto-row');
        const ic = el('div', 'czt-auto-ic');
        ic.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/><path d="M17.66 16.66l-4.24 4.24a2 2 0 0 1 -2.83 0l-4.25 -4.24a8 8 0 1 1 11.32 0z"/></svg>';
        row.appendChild(ic);
        const txt = el('div', 'czt-xfer-txt');
        txt.appendChild(el('div', 'czt-xfer-title', state.riding ? t.autoRideTitle(state.terminalName) : t.autoTitle(state.terminalName)));
        txt.appendChild(el('div', 'czt-xfer-sub czt-auto-body', state.riding ? t.autoRideBody : t.autoBody));
        if (state.previousName && state.previousName !== state.terminalName) txt.appendChild(el('div', 'czt-auto-before', t.autoBefore(state.previousName)));
        row.appendChild(txt);
        autoCard.appendChild(row);
        autoCard.hidden = false;
        placeEl(autoCard, true);
        clearTimeout(autoTimer);
        autoTimer = setTimeout(hideAutoSwitch, 8000);
    }
    function hideAutoSwitch() {
        clearTimeout(autoTimer);
        if (autoCard) autoCard.hidden = true;
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
        placeEl(card, false);
        if (autoCard && !autoCard.hidden) placeEl(autoCard, true);
    }
    // stackOnTransfer: keep clear of the transfer card when both show
    function placeEl(card, stackOnTransfer) {
        if (!card || card.hidden) return;
        const isPhone = window.innerWidth <= 768;
        card.classList.toggle('is-phone', isPhone);
        const xfer = stackOnTransfer ? document.getElementById('transitTransferCard') : null;
        const xferH = xfer && !xfer.hidden ? xfer.offsetHeight + 10 : 0;
        if (isPhone) {
            const pillEl = document.getElementById('bottomStatusPill');
            const top = pillEl && getComputedStyle(pillEl).display !== 'none' ? pillEl.getBoundingClientRect().top : window.innerHeight - 110;
            card.style.bottom = `${Math.max(12, window.innerHeight - top + 10) + xferH}px`;
            card.style.top = '';
            card.style.left = '';
            card.style.width = '';
        } else {
            // Right under the navigation panel, same width
            const panel = document.getElementById('activeNavPanel');
            const r = panel && getComputedStyle(panel).display !== 'none' ? panel.getBoundingClientRect() : null;
            if (r && r.bottom + 12 + card.offsetHeight < window.innerHeight - 12) {
                card.style.top = `${Math.round(r.bottom + 12 + xferH)}px`;
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
        if (currentTerm.tc) renderTerminalChoices(currentTerm.tc, currentTerm.selected, currentTerm.onPick, currentTerm.opts);
        if (card && !card.hidden) lastState = null;
    });

    window.CalzadaTransitUI = {
        renderOptions, setOptionActual, hideOptions, showTransfer, hideTransfer, fmtDur, headsignText, stopLabel,
        renderTerminalChoices, hideTerminalChoices, showAutoSwitch, hideAutoSwitch
    };
})();
