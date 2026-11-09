/**
 * Calzada Category Icons
 * Centralized, crisp SVG icons and category-to-icon mapping for search results,
 * explore cards, place panels, and category filters.
 *
 * All icons follow the Tabler / Calzada design language:
 * - 24x24 viewBox
 * - fill: none, stroke: currentColor, stroke-width: 2 (or 1.75)
 * - stroke-linecap: round, stroke-linejoin: round
 */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.CalzadaCategoryIcons = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    // ── Canonical Category SVGs ──────────────────────────────────────────────
    // Each entry provides the inner SVG paths for a 24x24 viewBox.
    const SVG_PATHS = {
        // Eateries / Food / Dining (fork & knife cutlery)
        eatery: '<path d="M19 3v12h-5c-.023-3.681 .184-7.406 5-12zm0 12v6h-1v-3m-10-15v6m3-6v6m-3-4h3m-6-2v6a3 3 0 0 0 6 0v-6m-3 9v9"/>',

        // Malls / Supermarkets / Department Stores (storefront with awning)
        mall: '<path d="M3 21h18M3 7v1a3 3 0 0 0 6 0v-1m0 1a3 3 0 0 0 6 0v-1m0 1a3 3 0 0 0 6 0v-1h-18l2-4h14l2 4M5 21v-10.15M19 21v-10.15M9 21v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4"/>',

        // Schools / Universities / Education (mortarboard graduation cap)
        school: '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 2 3 3 6 3s6-1 6-3v-5"/>',

        // Terminals / Transit / Stations (bus / public transit vehicle)
        terminal: '<circle cx="6" cy="17" r="2"/><circle cx="18" cy="17" r="2"/><path d="M4 17h-2v-11a1 1 0 0 1 1-1h14a5 5 0 0 1 5 5v7h-2m-4 0h-8M16 5l1.5 7h4.5M2 10h15M7 5v5M12 5v5"/>',

        // Coffee Shops / Cafes (steaming cup)
        coffee: '<path d="M3 14c.83 .64 2.08 1 3.5 1s2.67-.36 3.5-1c.83-.64 2.08-1 3.5-1s2.67.36 3.5 1"/><path d="M8 3a2.4 2.4 0 0 0-1 2 2.4 2.4 0 0 0 1 2M12 3a2.4 2.4 0 0 0-1 2 2.4 2.4 0 0 0 1 2M3 10h14v5a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6v-5zM17 11a3 3 0 0 1 0 6"/>',

        // Government & Landmarks (civic building with columns)
        government: '<path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3"/>',

        // Health / Hospitals / Clinics (first-aid kit with cross)
        health: '<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M8 8v-2a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 14h4M12 12v4"/>',

        // Banks / Financial Services (bank facade with pillars & pediment)
        bank: '<path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3M12 7.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>',

        // Hotels & Stays / Lodging (bed with pillow and headboard)
        hotel: '<path d="M3 7v11M3 14h18M21 18v-8a2 2 0 0 0-2-2h-8v6"/><circle cx="7" cy="10" r="1.5"/>',

        // Shops & Services / Commercial (shopping tote bag)
        shop: '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0"/>',

        // Location Pin (fallback / general places)
        pin: '<path d="M9 11a3 3 0 1 0 6 0 3 3 0 0 0-6 0z"/><path d="M17.657 16.657L13.414 20.9a2 2 0 0 1-2.828 0l-4.243-4.243a8 8 0 1 1 11.314 0z"/>',

        // Recent Search (clock history)
        recent: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>'
    };

    // ── Category Mapping ──────────────────────────────────────────────────────
    // Maps raw categories, kinds, and common aliases to canonical keys.
    // Adding a new category alias is a single line addition here.
    const CATEGORY_MAP = {
        // Eateries / Food / Dining
        eateries: 'eatery',
        eatery: 'eatery',
        food: 'eatery',
        restaurant: 'eatery',
        restaurants: 'eatery',
        dining: 'eatery',
        bakery: 'eatery',
        bakeries: 'eatery',
        canteen: 'eatery',
        carinderia: 'eatery',
        karinderya: 'eatery',
        fastfood: 'eatery',

        // Malls / Shopping / Groceries
        malls: 'mall',
        mall: 'mall',
        supermarket: 'mall',
        supermarkets: 'mall',
        grocery: 'mall',
        groceries: 'mall',
        department_store: 'mall',

        // Schools / Universities / Education
        schools: 'school',
        school: 'school',
        university: 'school',
        universities: 'school',
        college: 'school',
        colleges: 'school',
        academy: 'school',
        education: 'school',

        // Terminals / Public Transit
        terminals: 'terminal',
        terminal: 'terminal',
        transport: 'terminal',
        transit: 'terminal',
        bus: 'terminal',
        jeep: 'terminal',
        jeepney: 'terminal',
        station: 'terminal',

        // Coffee Shops
        coffee: 'coffee',
        cafe: 'coffee',
        cafes: 'coffee',
        coffeeshop: 'coffee',

        // Government & Landmarks
        government: 'government',
        gov: 'government',
        landmark: 'government',
        landmarks: 'government',
        civic: 'government',
        hall: 'government',
        plaza: 'government',
        park: 'government',
        monument: 'government',
        church: 'government',

        // Health / Hospitals
        health: 'health',
        hospital: 'health',
        hospitals: 'health',
        clinic: 'health',
        clinics: 'health',
        pharmacy: 'health',
        pharmacies: 'health',
        medical: 'health',

        // Banks / ATMs
        banks: 'bank',
        bank: 'bank',
        atm: 'bank',
        finance: 'bank',

        // Hotels / Stays
        hotels: 'hotel',
        hotel: 'hotel',
        stays: 'hotel',
        stay: 'hotel',
        resort: 'hotel',
        resorts: 'hotel',
        inn: 'hotel',
        lodging: 'hotel',

        // Shops & Services
        establishments: 'shop',
        establishment: 'shop',
        shops: 'shop',
        shop: 'shop',
        services: 'shop',
        service: 'shop',
        commercial: 'shop',
        store: 'shop',
        stores: 'shop',
        retail: 'shop',

        // System
        recent: 'recent',
        clock: 'recent',
        pin: 'pin',
        location: 'pin'
    };

    /**
     * Normalize any category string, kind, or alias to a canonical key.
     */
    function normalizeCategory(cat) {
        if (!cat) return 'pin';
        const raw = String(cat).toLowerCase().trim().replace(/[^a-z0-9_]+/g, ' ');
        // Direct match
        if (CATEGORY_MAP[raw]) return CATEGORY_MAP[raw];
        const slug = raw.replace(/\s+/g, '_');
        if (CATEGORY_MAP[slug]) return CATEGORY_MAP[slug];

        // Fuzzy substring check
        for (const [key, canonical] of Object.entries(CATEGORY_MAP)) {
            if (raw.includes(key) || key.includes(raw)) return canonical;
        }
        return 'pin';
    }

    /**
     * Generate standard SVG markup for a given category.
     */
    function getSvg(categoryOrKind, opts = {}) {
        const canonical = normalizeCategory(categoryOrKind);
        const pathData = SVG_PATHS[canonical] || SVG_PATHS.pin;
        const size = opts.size || 24;
        const strokeWidth = opts.strokeWidth != null ? opts.strokeWidth : 2;
        const className = opts.className ? ` class="${esc(opts.className)}"` : '';
        const color = opts.color || 'currentColor';
        const ariaHidden = opts.ariaHidden !== false;

        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${ariaHidden ? ' aria-hidden="true"' : ''}${className}>${pathData}</svg>`;
    }

    /**
     * Gracefully handle broken or missing image URLs by replacing the failed
     * <img> inside a .cps-tile with the neutral category SVG, without collapsing
     * row height or disrupting surrounding text layout.
     */
    function handleImgError(imgEl, categoryOrKind) {
        if (!imgEl) return;
        imgEl.onerror = null;
        const parent = imgEl.parentElement;
        if (!parent) {
            imgEl.style.display = 'none';
            return;
        }

        // Search row thumbnail slot (.cps-tile)
        if (parent.classList.contains('cps-tile')) {
            parent.classList.remove('cps-tile--logo', 'cps-tile--photo');
            parent.innerHTML = getSvg(categoryOrKind, { size: 24, strokeWidth: 2 });
            return;
        }

        // Places grid card (.ref-img-container)
        if (parent.classList.contains('ref-img-container')) {
            parent.innerHTML = `<div class="ref-img-placeholder">${getSvg(categoryOrKind, { size: 36, strokeWidth: 1.75 })}</div>`;
            return;
        }

        imgEl.style.display = 'none';
    }

    /**
     * Render the thumbnail slot HTML for a search result row.
     * Guaranteed 48px fixed slot:
     * - Logo: contain with padding & clean white background
     * - Photo: cover
     * - Fallback: neutral, crisp category SVG
     */
    function renderSlot(opts = {}) {
        const {
            name = '',
            category = '',
            kind = '',
            logo = null,
            photo = null,
            isRecent = false
        } = opts;

        const catKey = category || kind || (isRecent ? 'recent' : 'pin');
        const altText = esc(name ? `${name}` : 'Place');

        // 1. Logo provided (explicit logo, or Cloudinary logo URL)
        if (typeof logo === 'string' && logo.trim()) {
            return `<span class="cps-tile cps-tile--logo"><img src="${esc(logo.trim())}" alt="${altText}" loading="lazy" decoding="async" onerror="if(window.CalzadaCategoryIcons)window.CalzadaCategoryIcons.handleImgError(this,'${esc(catKey)}');else this.style.display='none';"></span>`;
        }

        // 2. Front photo / storefront image provided
        if (typeof photo === 'string' && photo.trim()) {
            return `<span class="cps-tile cps-tile--photo"><img src="${esc(photo.trim())}" alt="${altText}" loading="lazy" decoding="async" onerror="if(window.CalzadaCategoryIcons)window.CalzadaCategoryIcons.handleImgError(this,'${esc(catKey)}');else this.style.display='none';"></span>`;
        }

        // 3. Fallback: Crisp category SVG
        const tileClass = `cps-tile${isRecent ? ' cps-tile--muted' : ''}`;
        return `<span class="${tileClass}">${getSvg(catKey, { size: 24, strokeWidth: 2 })}</span>`;
    }

    return {
        CATEGORY_MAP,
        SVG_PATHS,
        normalize: normalizeCategory,
        normalizeCategory,
        getSvg,
        handleImgError,
        renderSlot
    };
}));

