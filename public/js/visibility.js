/**
 * public/js/visibility.js
 * Calzada Business Visibility & Ranking Algorithm
 *
 * Computes "New" and "Boosted" states at read time from paidAt and the plan.
 * Pure functions, zero stale database flags.
 */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        const exports = factory();
        root.CalzadaVisibility = exports;
        if (typeof window !== 'undefined') {
            // One namespace only: short globals like window.rank collide with page code
            window.CalzadaVisibility = exports;
        }
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const DEFAULT_PLANS = {
        listed:   { id: 'listed',   name: 'Listed',       price: 59,  newTagDays: 7,  boostDays: 0,  boostTier: 0 },
        plus360:  { id: 'plus360',  name: 'Listed + 360', price: 199, newTagDays: 14, boostDays: 7,  boostTier: 1 },
        featured: { id: 'featured', name: 'Featured',     price: 299, newTagDays: 30, boostDays: 30, boostTier: 2 }
    };

    function getPlanConfig(biz) {
        const plans = (typeof window !== 'undefined' && window.CALZADA_PLANS) ? window.CALZADA_PLANS : DEFAULT_PLANS;
        const planKey = biz && biz.plan ? biz.plan : 'listed';
        return plans[planKey] || plans.listed || DEFAULT_PLANS.listed;
    }

    function getPaidAtMillis(biz) {
        if (!biz || !biz.paidAt) return 0;
        const p = biz.paidAt;
        if (typeof p.toMillis === 'function') return p.toMillis();
        if (typeof p.toDate === 'function') return p.toDate().getTime();
        if (p instanceof Date) return p.getTime();
        if (typeof p === 'number') return p;
        const parsed = Date.parse(p);
        return isNaN(parsed) ? 0 : parsed;
    }

    function parseNowMillis(now) {
        if (!now) return Date.now();
        if (typeof now === 'number') return now;
        if (now instanceof Date) return now.getTime();
        const parsed = Date.parse(now);
        return isNaN(parsed) ? Date.now() : parsed;
    }

    function isNew(biz, now = new Date()) {
        const paidAtMs = getPaidAtMillis(biz);
        if (!paidAtMs) return false;
        const nowMs = parseNowMillis(now);
        const plan = getPlanConfig(biz);
        const newTagMs = (plan.newTagDays || 0) * 86400000;
        return nowMs < paidAtMs + newTagMs;
    }

    function isBoosted(biz, now = new Date()) {
        const paidAtMs = getPaidAtMillis(biz);
        if (!paidAtMs) return false;
        const nowMs = parseNowMillis(now);
        const plan = getPlanConfig(biz);
        const boostDays = plan.boostDays || 0;
        if (boostDays <= 0 || (plan.boostTier || 0) <= 0) return false;
        const boostMs = boostDays * 86400000;
        return nowMs < paidAtMs + boostMs;
    }

    function getManilaDateString(date = new Date()) {
        const d = typeof date === 'number' ? new Date(date) : (date instanceof Date ? date : new Date(Date.parse(date)));
        try {
            return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(d);
        } catch (_) {
            // Fallback: UTC + 8h
            const manilaTime = new Date(d.getTime() + (8 * 3600 * 1000));
            return manilaTime.toISOString().slice(0, 10);
        }
    }

    function hashString(str) {
        let hash = 2166136261;
        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        hash += (hash << 13);
        hash ^= (hash >>> 7);
        hash += (hash << 3);
        hash ^= (hash >>> 17);
        hash += (hash << 5);
        return (hash >>> 0);
    }

    function rank(list, now = new Date(), baseCompare = null) {
        if (!Array.isArray(list)) return [];
        const dateStr = getManilaDateString(now);

        return list.slice().sort((a, b) => {
            const aBoosted = isBoosted(a, now);
            const bBoosted = isBoosted(b, now);

            if (aBoosted && !bBoosted) return -1;
            if (!aBoosted && bBoosted) return 1;

            if (aBoosted && bBoosted) {
                const planA = getPlanConfig(a);
                const planB = getPlanConfig(b);
                const tierDiff = (planB.boostTier || 0) - (planA.boostTier || 0);
                if (tierDiff !== 0) return tierDiff;

                // Daily rotation within same tier
                const idA = String(a.id || a.businessId || '');
                const idB = String(b.id || b.businessId || '');
                const hashA = hashString(idA + '_' + dateStr);
                const hashB = hashString(idB + '_' + dateStr);
                if (hashA !== hashB) return hashA - hashB;
                return idA.localeCompare(idB);
            }

            if (typeof baseCompare === 'function') {
                return baseCompare(a, b);
            }
            return 0;
        });
    }

    function rankSearchResults(results, now = new Date(), maxLift = 3) {
        if (!Array.isArray(results)) return [];
        const items = results.map((item, originalIndex) => ({
            item,
            originalIndex,
            boosted: isBoosted(item, now),
            tier: isBoosted(item, now) ? (getPlanConfig(item).boostTier || 0) : 0
        }));

        for (let i = 0; i < items.length; i++) {
            if (items[i].boosted) {
                let curr = i;
                while (curr > 0 && curr > i - maxLift) {
                    const prev = curr - 1;
                    if (!items[prev].boosted || items[prev].tier < items[curr].tier) {
                        const temp = items[curr];
                        items[curr] = items[prev];
                        items[prev] = temp;
                        curr--;
                    } else {
                        break;
                    }
                }
            }
        }
        return items.map(x => x.item);
    }

    function renderLabelHtml(biz, now = new Date()) {
        // "Featured" only for the Featured plan while its boost runs; otherwise "New" while new.
        // Plain text next to the name, no pill.
        const plan = getPlanConfig(biz);
        if (plan.id === 'featured' && isBoosted(biz, now)) {
            return '<span class="cz-label-featured" style="color: #378ADD; font-weight: 700; font-size: 11px; letter-spacing: 0.02em;">Featured</span>';
        }
        if (isNew(biz, now)) {
            return '<span class="cz-label-new" style="color: #378ADD; font-weight: 500; font-size: 11px; letter-spacing: 0.02em;">New</span>';
        }
        return '';
    }

    return {
        isNew,
        isBoosted,
        rank,
        rankSearchResults,
        renderLabelHtml,
        getManilaDateString,
        hashString,
        getPlanConfig
    };
}));
