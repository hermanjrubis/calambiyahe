/**
 * Calzada - Fares Page Logic
 * Renders LTFRB Traditional Jeepney Fare Guide & Live Calculator
 * Single source of truth: ../data/jeepney-fares.json
 * Floating-point-safe rounding, dynamic templates, no hardcoded numbers/dates.
 */

(function () {
    'use strict';

    let fareData = null;
    const PDF_FALLBACK_URL = '/assets/docs/Fare-Guide_Traditional-PUJ-Provisional-Fare-Increase_08Oct2023.pdf';

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

    function formatEffectiveDate(dateStr, lang) {
        try {
            const parts = dateStr.split('-');
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10);
            const day = parseInt(parts[2], 10);
            const date = new Date(Date.UTC(year, month - 1, day));
            const locale = (lang === 'tl' || lang === 'fil') ? 'tl-PH' : 'en-US';
            return new Intl.DateTimeFormat(locale, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                timeZone: 'UTC'
            }).format(date);
        } catch (e) {
            return dateStr;
        }
    }

    /**
     * Floating-point-safe fare computation
     * fare(km, tier) = roundToNearest(roundTo, tier.baseFare + max(0, km - baseKm) * tier.perKm)
     */
    function computeFare(km, tier, baseKm, roundTo) {
        const raw = tier.baseFare + Math.max(0, km - baseKm) * tier.perKm;
        const rounded = Math.round((raw + Number.EPSILON) / roundTo) * roundTo;
        return rounded.toFixed(2);
    }

    async function loadFareData() {
        const paths = ['../data/jeepney-fares.json', '/data/jeepney-fares.json', 'data/jeepney-fares.json'];
        for (const p of paths) {
            try {
                const res = await fetch(p, { cache: 'no-cache' });
                if (res.ok) {
                    fareData = await res.json();
                    return fareData;
                }
            } catch (err) {
                // Try next path
            }
        }
        throw new Error('Failed to load jeepney-fares.json');
    }

    function renderAll() {
        if (!fareData) return;

        const lang = getLang();
        const effectiveDateFormatted = formatEffectiveDate(fareData.effectiveDate, lang);
        const roundCentavos = Math.round(fareData.roundTo * 100);
        const maxKm = fareData.maxKm;
        const discFirstFare = computeFare(fareData.baseKm, fareData.discounted, fareData.baseKm, fareData.roundTo);

        const templateVars = {
            effectiveDate: effectiveDateFormatted,
            date: effectiveDateFormatted,
            baseKm: fareData.baseKm,
            baseFare: fareData.regular.baseFare.toFixed(2),
            perKm: fareData.regular.perKm.toFixed(2),
            discBaseFare: fareData.discounted.baseFare.toFixed(2),
            discPerKm: fareData.discounted.perKm.toFixed(2),
            discountPercent: fareData.discountPercent,
            roundCentavos: roundCentavos,
            discFirstFare: discFirstFare,
            maxKm: maxKm,
            source: fareData.source,
            vehicle: fareData.vehicle,
            region: fareData.region,
            sourceNote: fareData.sourceNote
        };

        // 1. Effective Note
        const effectiveEl = document.getElementById('fareEffectiveNote');
        if (effectiveEl) {
            effectiveEl.textContent = interpolate(translate('fares_page.effective_note'), templateVars);
        }

        // 2. Calculator Input Setup
        const calcInput = document.getElementById('fareKmInput');
        if (calcInput) {
            calcInput.maxLength = String(maxKm).length;
            calcInput.setAttribute('aria-label', translate('fares_page.calc_label'));
        }

        // 3. Computed Text Columns
        const compRegEl = document.getElementById('fareCompRegular');
        if (compRegEl) {
            compRegEl.textContent = interpolate(translate('fares_page.computed_regular'), templateVars);
        }

        const compDiscEl = document.getElementById('fareCompDiscounted');
        if (compDiscEl) {
            compDiscEl.textContent = interpolate(translate('fares_page.computed_discounted'), templateVars);
        }

        const compNoteEl = document.getElementById('fareCompNote');
        if (compNoteEl) {
            compNoteEl.textContent = interpolate(translate('fares_page.computed_note'), templateVars);
        }

        // 4. Source text and Download PDF link
        const sourceTextEl = document.getElementById('fareSourceStatement');
        if (sourceTextEl) {
            sourceTextEl.textContent = interpolate(translate('fares_page.source_statement'), templateVars);
        }

        const pdfBtn = document.getElementById('fareDownloadPdfBtn');
        if (pdfBtn) {
            pdfBtn.href = fareData.guidePdf || PDF_FALLBACK_URL;
            pdfBtn.textContent = translate('fares_page.source_btn');
        }

        // 5. Table Rendering
        renderTables(lang, templateVars);

        // 6. Update Calculator Output
        updateCalculator();
    }

    /**
     * Fills #fareTablesWrap with a shaped placeholder while jeepney-fares.json is in
     * flight. Presentation only - it renders no fare figures and is overwritten wholesale
     * by renderTables(). Row counts mirror the current maxKm (50, split into two halves)
     * so the real tables drop into the space already reserved instead of shoving the page
     * down. If the fetch fails, renderErrorState() hides the whole .fares-dynamic-section,
     * so this can never be left spinning.
     */
    const SKELETON_MAX_KM = 50;

    function renderTableSkeleton() {
        const tableContainer = document.getElementById('fareTablesWrap');
        if (!tableContainer) return;

        const half = Math.ceil(SKELETON_MAX_KM / 2);

        function skeletonHalf(rowCount) {
            let rows = '';
            for (let i = 0; i < rowCount; i++) {
                rows += '<div class="sk-fare-row"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';
            }
            return `
                <div class="fare-table-half">
                    <div class="sk-fare-head"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>
                    ${rows}
                </div>`;
        }

        tableContainer.innerHTML = `
            <div class="sk-fare-tables" role="status" aria-live="polite" aria-busy="true" aria-label="Loading fare table">
                ${skeletonHalf(half)}
                ${skeletonHalf(SKELETON_MAX_KM - half)}
            </div>`;
    }

    function renderTables(lang, vars) {
        const tableContainer = document.getElementById('fareTablesWrap');
        if (!tableContainer || !fareData) return;

        const maxKm = fareData.maxKm;
        const half = Math.ceil(maxKm / 2);
        const colKm = translate('fares_page.table_col_km');
        const colReg = translate('fares_page.table_col_regular');
        const colDisc = translate('fares_page.table_col_discounted');
        const colDiscShort = translate('fares_page.table_col_disc');
        const caption = translate('fares_page.table_caption');

        function createTableHtml(startKm, endKm) {
            let rowsHtml = '';
            for (let km = startKm; km <= endKm; km++) {
                const reg = computeFare(km, fareData.regular, fareData.baseKm, fareData.roundTo);
                const disc = computeFare(km, fareData.discounted, fareData.baseKm, fareData.roundTo);
                rowsHtml += `
                    <tr data-km="${km}">
                        <th scope="row" class="km-cell">${km}</th>
                        <td class="num-cell">${reg}</td>
                        <td class="num-cell">${disc}</td>
                    </tr>`;
            }

            return `
                <table class="fare-table" role="table">
                    <caption class="sr-only">${caption} (${startKm}-${endKm} km)</caption>
                    <thead>
                        <tr>
                            <th scope="col" class="km-col-head">${colKm}</th>
                            <th scope="col" class="num-col-head">${colReg}</th>
                            <th scope="col" class="num-col-head disc-col-head">
                                <span class="desktop-col-label">${colDisc}</span>
                                <span class="mobile-col-label">${colDiscShort}</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>`;
        }

        tableContainer.innerHTML = `
            <div class="fare-table-half">${createTableHtml(1, half)}</div>
            <div class="fare-table-half">${createTableHtml(half + 1, maxKm)}</div>
        `;
    }

    function updateCalculator() {
        if (!fareData) return;

        const calcInput = document.getElementById('fareKmInput');
        const hintEl = document.getElementById('fareKmHint');
        const regValEl = document.getElementById('fareResultRegular');
        const discValEl = document.getElementById('fareResultDiscounted');
        if (!calcInput || !hintEl || !regValEl || !discValEl) return;

        const maxKm = fareData.maxKm;
        const rawVal = calcInput.value.trim();
        const parsed = parseInt(rawVal, 10);
        const isValid = rawVal !== '' && !isNaN(parsed) && parsed >= 1 && parsed <= maxKm;

        const vars = { maxKm: maxKm };

        if (!isValid) {
            hintEl.textContent = interpolate(translate('fares_page.calc_hint_error'), vars);
            hintEl.classList.add('is-error');
            regValEl.textContent = '—';
            discValEl.textContent = '—';
            clearTableHighlights();
        } else {
            hintEl.textContent = interpolate(translate('fares_page.calc_hint'), vars);
            hintEl.classList.remove('is-error');
            const regFare = computeFare(parsed, fareData.regular, fareData.baseKm, fareData.roundTo);
            const discFare = computeFare(parsed, fareData.discounted, fareData.baseKm, fareData.roundTo);
            regValEl.textContent = '₱' + regFare;
            discValEl.textContent = '₱' + discFare;
            highlightTableRow(parsed);
        }
    }

    function clearTableHighlights() {
        document.querySelectorAll('.fare-table tbody tr.is-active-fare-row').forEach(tr => {
            tr.classList.remove('is-active-fare-row');
        });
    }

    function highlightTableRow(km) {
        clearTableHighlights();
        const row = document.querySelector(`.fare-table tbody tr[data-km="${km}"]`);
        if (row) {
            row.classList.add('is-active-fare-row');
        }
    }

    function setupCalculatorInput() {
        const calcInput = document.getElementById('fareKmInput');
        if (!calcInput) return;

        calcInput.addEventListener('input', function () {
            // Keep only digits
            let clean = this.value.replace(/\D/g, '');
            if (fareData && clean.length > String(fareData.maxKm).length) {
                clean = clean.slice(0, String(fareData.maxKm).length);
            }
            this.value = clean;
            updateCalculator();
        });

        calcInput.addEventListener('keydown', function (e) {
            // Allow arrows, backspace, tab, delete, enter
            if (['ArrowUp', 'ArrowDown'].includes(e.key)) {
                e.preventDefault();
                let current = parseInt(this.value, 10) || 0;
                if (e.key === 'ArrowUp') current = Math.min((fareData ? fareData.maxKm : 50), current + 1);
                if (e.key === 'ArrowDown') current = Math.max(1, current - 1);
                this.value = current;
                updateCalculator();
            }
        });
    }

    function renderErrorState() {
        const shell = document.querySelector('.fares-shell');
        if (!shell) return;

        // Hide dynamic sections that rely on fare data
        document.querySelectorAll('.fares-dynamic-section').forEach(el => {
            el.style.display = 'none';
        });

        // Hide effective note in intro
        const effectiveNote = document.getElementById('fareEffectiveNote');
        if (effectiveNote) effectiveNote.style.display = 'none';

        // Show or update global error section
        let errorSec = document.getElementById('fareGlobalErrorSection');
        if (!errorSec) {
            errorSec = document.createElement('section');
            errorSec.id = 'fareGlobalErrorSection';
            errorSec.className = 'fares-section';
            const introSec = document.querySelector('.fares-intro-section');
            if (introSec && introSec.nextSibling) {
                shell.insertBefore(errorSec, introSec.nextSibling);
            } else {
                shell.appendChild(errorSec);
            }
        }
        errorSec.style.display = 'block';
        errorSec.innerHTML = `
            <div class="fare-error-box" role="alert">
                <p class="fare-error-msg">${translate('fares_page.error_loading')}</p>
                <a href="${PDF_FALLBACK_URL}" class="btn-fare-source" target="_blank" rel="noopener">
                    ${translate('fares_page.source_btn')}
                </a>
            </div>
        `;
    }

    document.addEventListener('DOMContentLoaded', async () => {
        setupCalculatorInput();
        renderTableSkeleton();

        try {
            await loadFareData();
            renderAll();
        } catch (err) {
            console.error('Error loading fare data:', err);
            renderErrorState();
        }

        // Listen for language change events
        window.addEventListener('calzada_lang_changed', () => {
            if (fareData) {
                renderAll();
            } else {
                renderErrorState();
            }
        });
    });

})();
