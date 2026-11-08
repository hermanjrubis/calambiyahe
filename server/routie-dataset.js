/**
 * server/routie-dataset.js
 *
 * Loads Routie's extra data and gives the matchers that use it:
 *   - allFaqs():            FAQS from routie-knowledge.js with FAQ_TRIGGER_FIXES applied, plus FAQS_EXTRA
 *                           (entries with needsConfirm: true are skipped), fare placeholders filled.
 *   - matchFaq(text):       whole-phrase trigger match; the longest matching trigger wins.
 *   - findAlias(text):      longest place alias found as a whole phrase in the text:
 *                           { slug } or { ambiguous: [slug, ...], alias } or null.
 *   - aliasFor(query):      the same, but the whole query must be the alias (for origin / destination names).
 *
 * Data: server/routie-faqs-extra.js, server/data/place-aliases.json, fare rates via fare-info.js.
 */
const fs = require('fs');
const path = require('path');
const { getFareData } = require('./fare-info');

let fareCalc = null;
try { fareCalc = require('../public/js/fare-calc.js'); } catch (_) { /* fares fall back to raw numbers */ }

let extra = { FAQS_EXTRA: [], FAQ_TRIGGER_FIXES: {} };
try { extra = require('./routie-faqs-extra'); } catch (err) { console.error('routie-faqs-extra.js not loaded:', err.message); }

let aliasDoc = { places: {}, ambiguous: {} };
try {
    aliasDoc = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/place-aliases.json'), 'utf8'));
} catch (err) {
    try { aliasDoc = require('./data/place-aliases.json'); } catch (_) { console.error('place-aliases.json not loaded:', err.message); }
}

// Same normalization as place-aliases.json: lowercase, no accents, & -> and, apostrophes removed
function normalizeText(text) {
    return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/&/g, ' and ').replace(/['’]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
const padded = (s) => ` ${s} `;

// ── Fare placeholders ────────────────────────────────────────────────────────────────────────
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_TL = ['Enero', 'Pebrero', 'Marso', 'Abril', 'Mayo', 'Hunyo', 'Hulyo', 'Agosto', 'Setyembre', 'Oktubre', 'Nobyembre', 'Disyembre'];
function fareVars(lang) {
    const { data } = getFareData();
    const peso = (n) => (fareCalc ? fareCalc.formatPeso(n) : `₱${Number(n).toFixed(2)}`);
    const [y, m, d] = String(data.effectiveDate || '').split('-').map(Number);
    const months = lang === 'tl' ? MONTHS_TL : MONTHS_EN;
    const discFirst = fareCalc ? fareCalc.fareFor(data.baseKm, 'discounted', data) : data.discounted.baseFare;
    return {
        baseFare: peso(data.regular.baseFare), perKm: peso(data.regular.perKm),
        discBaseFare: peso(data.discounted.baseFare), discPerKm: peso(data.discounted.perKm), discFirstFare: peso(discFirst),
        baseKm: data.baseKm, maxKm: data.maxKm, discountPercent: data.discountPercent,
        roundCentavos: Math.round(data.roundTo * 100),
        effectiveDate: y ? `${months[m - 1]} ${d}, ${y}` : String(data.effectiveDate || '')
    };
}
const fill = (text, vars) => String(text).replace(/\{(\w+)\}/g, (all, k) => (vars[k] !== undefined ? String(vars[k]) : all));

// ── FAQs ─────────────────────────────────────────────────────────────────────────────────────
let cache = null;
function allFaqs(baseFaqs) {
    const version = getFareData().version;
    if (cache && cache.version === version && cache.base === baseFaqs) return cache.list;
    const en = fareVars('en'), tl = fareVars('tl');
    const fixed = baseFaqs.map((f) => (extra.FAQ_TRIGGER_FIXES[f.id] ? { ...f, triggers: extra.FAQ_TRIGGER_FIXES[f.id] } : f));
    const added = extra.FAQS_EXTRA.filter((f) => !f.needsConfirm && !fixed.some((x) => x.id === f.id));
    const list = [...fixed, ...added].map((f) => ({
        ...f,
        en: fill(f.en, en),
        tl: fill(f.tl, tl),
        _triggers: (f.triggers || []).map(normalizeText).filter(Boolean)
    }));
    cache = { version, base: baseFaqs, list };
    return list;
}

function matchFaq(text, baseFaqs) {
    const t = padded(normalizeText(text));
    let best = null, bestLen = 0;
    for (const f of allFaqs(baseFaqs)) {
        for (const trig of f._triggers) {
            if (trig.length > bestLen && t.includes(padded(trig))) { best = f; bestLen = trig.length; }
        }
    }
    return best;
}

// ── Place aliases ────────────────────────────────────────────────────────────────────────────
const aliasIndex = [];   // [{ alias, slug } | { alias, ambiguous: [...] }], longest first
for (const [slug, r] of Object.entries(aliasDoc.places || {})) for (const a of r.aliases || []) aliasIndex.push({ alias: a, slug });
for (const [a, slugs] of Object.entries(aliasDoc.ambiguous || {})) aliasIndex.push({ alias: a, ambiguous: slugs });
aliasIndex.sort((x, y) => y.alias.length - x.alias.length);

function findAlias(text) {
    const t = padded(normalizeText(text));
    for (const e of aliasIndex) if (t.includes(padded(e.alias))) return e.slug ? { slug: e.slug, alias: e.alias } : { ambiguous: e.ambiguous, alias: e.alias };
    return null;
}
function aliasFor(query) {
    const q = normalizeText(query);
    const e = aliasIndex.find((x) => x.alias === q);
    if (!e) return null;
    return e.slug ? { slug: e.slug, alias: e.alias } : { ambiguous: e.ambiguous, alias: e.alias };
}

module.exports = { normalizeText, allFaqs, matchFaq, findAlias, aliasFor, fareVars };
