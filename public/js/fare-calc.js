/**
 * Calzada jeepney fare calculator (shared)
 *
 * One formula for the Fares page, the Planner (and so the ticket and My Trips) and the
 * Routie assistant on the server, so they always agree. The rates come from
 * /data/jeepney-fares.json (the single source of truth); FALLBACK_FARES below is used
 * only when that file cannot be loaded, so a fare can always be shown.
 *
 *   counted km = the distance in whole km, any part of a km rounded UP (4.2 km -> 5 km)
 *   fare       = baseFare for the first baseKm km + perKm for each further counted km,
 *                rounded to the nearest roundTo (0.25)
 *
 * Browser: window.CalzadaFare. Node: require('.../public/js/fare-calc.js').
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.CalzadaFare = api;
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // LTFRB PUJ General Fare Guide, effective September 28, 2026 (same values as jeepney-fares.json)
    const FALLBACK_FARES = Object.freeze({
        vehicle: 'traditional jeepney',
        region: 'Mega Manila',
        source: 'LTFRB PUJ General Fare Guide',
        sourceNote: 'This is the fare increase that took effect on September 28, 2026.',
        sourceNoteTl: 'Ito ang dagdag-pasahe na ipinatupad noong Setyembre 28, 2026.',
        effectiveDate: '2026-09-28',
        baseKm: 4,
        regular: Object.freeze({ baseFare: 14.00, perKm: 2.00 }),
        discounted: Object.freeze({ baseFare: 11.20, perKm: 1.60 }),
        discountPercent: 20,
        roundTo: 0.25,
        maxKm: 50,
        guidePdf: '/assets/docs/Fare-Guide_Traditional-PUJ_28Sep2026.pdf'
    });

    const isPositive = (n) => typeof n === 'number' && isFinite(n) && n > 0;
    const isTier = (t) => !!t && isPositive(t.baseFare) && typeof t.perKm === 'number' && isFinite(t.perKm) && t.perKm >= 0;

    // Fare data with every rate it needs, or the fallback when the file is incomplete.
    function normalize(data) {
        if (!data || !isTier(data.regular) || !isTier(data.discounted) || !isPositive(data.baseKm) || !isPositive(data.roundTo)) {
            return FALLBACK_FARES;
        }
        return Object.assign({}, FALLBACK_FARES, data);
    }

    // Whole kilometres, any part of a km counted as a full one (at least 1). Measured to the metre
    // first, so floating-point noise such as 4.0000000001 km still counts as 4.
    function countedKm(distanceKm) {
        const km = Number(distanceKm);
        if (!isFinite(km) || km <= 0) return 1;
        const metres = Math.round(km * 1000);
        return Math.max(1, Math.ceil(metres / 1000));
    }

    // Nearest multiple of step, worked in centavos so 0.1 + 0.2-style float errors cannot move a fare.
    function roundToStep(value, step) {
        const cents = Math.round(value * 100);
        const stepCents = Math.round(step * 100);
        return (Math.round(cents / stepCents) * stepCents) / 100;
    }

    // Fare for a distance in km for one tier ('regular' or 'discounted').
    function fareFor(distanceKm, tierName, data) {
        const d = normalize(data);
        const tier = tierName === 'discounted' ? d.discounted : d.regular;
        const km = countedKm(distanceKm);
        const raw = tier.baseFare + Math.max(0, km - d.baseKm) * tier.perKm;
        return roundToStep(raw, d.roundTo);
    }

    // { km (counted), regular, discounted } for a distance.
    function fares(distanceKm, data) {
        return {
            km: countedKm(distanceKm),
            regular: fareFor(distanceKm, 'regular', data),
            discounted: fareFor(distanceKm, 'discounted', data)
        };
    }

    // Peso amount as shown in the app: whole pesos without decimals (₱16), centavos when there are any (₱16.25).
    function formatPeso(amount) {
        const value = roundToStep(Number(amount) || 0, 0.01);
        return Number.isInteger(value) ? `₱${value}` : `₱${value.toFixed(2)}`;
    }

    // Browser only: fetch /data/jeepney-fares.json once and cache it; resolves to the fallback if it fails.
    let loadPromise = null;
    let loaded = null;
    function load() {
        if (loadPromise) return loadPromise;
        if (typeof fetch !== 'function') {
            loaded = FALLBACK_FARES;
            loadPromise = Promise.resolve(loaded);
            return loadPromise;
        }
        const paths = ['/data/jeepney-fares.json', '../data/jeepney-fares.json'];
        loadPromise = (async () => {
            for (const p of paths) {
                try {
                    const res = await fetch(p, { cache: 'no-cache' });
                    if (res.ok) {
                        loaded = normalize(await res.json());
                        return loaded;
                    }
                } catch (_) { /* try the next path */ }
            }
            loaded = FALLBACK_FARES;
            return loaded;
        })();
        return loadPromise;
    }

    // The loaded data if load() has finished, else the fallback (same values), so callers never wait.
    function current() {
        return loaded || FALLBACK_FARES;
    }

    return { FALLBACK_FARES, normalize, countedKm, roundToStep, fareFor, fares, formatPeso, load, current };
}));
