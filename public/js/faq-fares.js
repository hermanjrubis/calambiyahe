/**
 * Calzada - FAQ Jeepney Fare Dynamic Loader
 * Loads data/jeepney-fares.json to populate the fare question answer dynamically.
 * Fallback to text without numbers if fetch fails.
 */
(function () {
    'use strict';

    let fareData = null;

    function getLang() {
        return (window.getCurrentLang && window.getCurrentLang()) ||
            localStorage.getItem('calzada_lang') || 'en';
    }

    function translate(key) {
        if (typeof window.t === 'function') {
            return window.t(key);
        }
        const lang = getLang();
        const dict = (window.translations && window.translations[lang]) || {};
        return dict[key] || key;
    }

    function interpolate(template, vars) {
        if (!template) return '';
        return template.replace(/\{(\w+)\}/g, (match, key) => {
            return vars[key] !== undefined ? vars[key] : match;
        });
    }

    function updateFaqAnswer() {
        const textEl = document.getElementById('faqJeepneyFareText');
        if (!textEl) return;

        if (fareData) {
            const template = translate('faq_jeepney_fares.a');
            const vars = {
                baseFare: fareData.regular.baseFare.toFixed(2),
                baseKm: fareData.baseKm,
                perKm: fareData.regular.perKm.toFixed(2),
                discountPercent: fareData.discountPercent,
                roundCentavos: Math.round(fareData.roundTo * 100)
            };
            textEl.textContent = interpolate(template, vars) + ' ';
        } else {
            const fallback = translate('faq_jeepney_fares.a_fallback');
            textEl.textContent = fallback + ' ';
        }
    }

    async function init() {
        const paths = ['../data/jeepney-fares.json', '/data/jeepney-fares.json', 'data/jeepney-fares.json'];
        for (const p of paths) {
            try {
                const res = await fetch(p, { cache: 'no-cache' });
                if (res.ok) {
                    fareData = await res.json();
                    break;
                }
            } catch (e) {
                // Try next path
            }
        }
        updateFaqAnswer();
    }

    document.addEventListener('DOMContentLoaded', () => {
        init();
        window.addEventListener('calzada_lang_changed', updateFaqAnswer);
    });
})();
