// Jeepney fare knowledge for the Routie assistant.
//
// The rates come from public/data/jeepney-fares.json, the same file the Fares page and the Planner read, and the
// formula from public/js/fare-calc.js, the same code they run, so Routie can never quote a different fare. The file
// is read at startup and again at most every REFRESH_MS; if it cannot be read, the built-in copy of the current
// rates (fare-calc.js FALLBACK_FARES) is used.

const fs = require('fs');
const path = require('path');

let fareCalc = null;
try {
    fareCalc = require('../public/js/fare-calc.js');
} catch (error) {
    console.error('fare-calc.js could not be loaded; Routie will quote the built-in fare rates only:', error.message);
}

// Used only if fare-calc.js itself is missing (LTFRB PUJ General Fare Guide, effective September 28, 2026).
const BUILT_IN_FARES = fareCalc ? fareCalc.FALLBACK_FARES : {
    source: 'LTFRB PUJ General Fare Guide',
    effectiveDate: '2026-09-28',
    baseKm: 4,
    regular: { baseFare: 14.00, perKm: 2.00 },
    discounted: { baseFare: 11.20, perKm: 1.60 },
    discountPercent: 20,
    roundTo: 0.25,
    maxKm: 50
};
// Modern jeepneys are not in the fare guide PDF; this is the announced minimum fare.
const MODERN_JEEPNEY_MINIMUM = 17;

const REFRESH_MS = 10 * 60 * 1000;
const DATA_PATHS = [
    path.join(__dirname, '../public/data/jeepney-fares.json'),
    path.join(process.cwd(), 'public/data/jeepney-fares.json')
];

let cache = { data: null, loadedAt: 0, version: 0, source: 'none' };

// The file is read from disk (so a long-running server picks up edits). The static require below is a second
// route to the same file: it makes bundlers such as Vercel's include public/data/jeepney-fares.json in the server
// function, so the file is there even where the public/ folder is not deployed next to the function.
function readFareFile() {
    for (const file of DATA_PATHS) {
        try {
            const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
            return { data: fareCalc ? fareCalc.normalize(parsed) : parsed, source: file };
        } catch (_) { /* try the next location */ }
    }
    try {
        const bundled = require('../public/data/jeepney-fares.json');
        return { data: fareCalc ? fareCalc.normalize(bundled) : bundled, source: 'bundled public/data/jeepney-fares.json' };
    } catch (_) { /* not bundled either: built-in rates */ }
    return null;
}

// Current fare data (cached). version changes whenever the rates actually change, so callers can rebuild prompts.
function getFareData() {
    if (cache.data && Date.now() - cache.loadedAt < REFRESH_MS) return cache;
    const read = readFareFile();
    const data = read ? read.data : BUILT_IN_FARES;
    if (!read && cache.source !== 'built-in') console.warn('jeepney-fares.json could not be read; Routie uses the built-in fare rates.');
    const changed = JSON.stringify(data) !== JSON.stringify(cache.data);
    cache = {
        data,
        loadedAt: Date.now(),
        version: changed ? cache.version + 1 : cache.version,
        source: read ? read.source : 'built-in'
    };
    return cache;
}

// Startup line for the server logs (e.g. Vercel), saying where Routie's fare rates came from.
{
    const startup = getFareData();
    console.log(startup.source === 'built-in'
        ? 'fare-info: using built-in fallback'
        : `fare-info: loaded from file (${startup.source}), effective ${startup.data.effectiveDate}`);
}

const peso = (n) => `₱${Number(n).toFixed(2)}`;

function countedKm(km) {
    return fareCalc ? fareCalc.countedKm(km) : Math.max(1, Math.ceil(Math.round(Number(km) * 1000) / 1000));
}

function fareFor(km, tierName, data) {
    if (fareCalc) return fareCalc.fareFor(km, tierName, data);
    const tier = tierName === 'discounted' ? data.discounted : data.regular;
    const raw = tier.baseFare + Math.max(0, countedKm(km) - data.baseKm) * tier.perKm;
    const step = Math.round(data.roundTo * 100);
    return (Math.round(Math.round(raw * 100) / step) * step) / 100;
}

function formatDate(isoDate, lang) {
    const [y, m, d] = String(isoDate).split('-').map(Number);
    const months = lang === 'tl'
        ? ['Enero', 'Pebrero', 'Marso', 'Abril', 'Mayo', 'Hunyo', 'Hulyo', 'Agosto', 'Setyembre', 'Oktubre', 'Nobyembre', 'Disyembre']
        : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return months[m - 1] ? `${months[m - 1]} ${d}, ${y}` : String(isoDate);
}

// The FARE FACTS section of the system prompt (English and Tagalog wording of the same facts).
function fareFactsSection() {
    const { data } = getFareData();
    const minDiscounted = fareFor(data.baseKm, 'discounted', data);
    const centavos = Math.round(data.roundTo * 100);
    const minRegular = fareFor(data.baseKm, 'regular', data);
    return `FARE FACTS (traditional jeepney; ${data.source}, effective ${formatDate(data.effectiveDate, 'en')} / epektibo ${formatDate(data.effectiveDate, 'tl')})
- Minimum fare (first ${data.baseKm} km), the amounts to quote: regular ${peso(minRegular)}; student, senior citizen or PWD ${peso(minDiscounted)}.
- Each succeeding km adds ${peso(data.regular.perKm)} (regular) or ${peso(data.discounted.perKm)} (student, senior citizen or PWD, a ${data.discountPercent}% discount), and every fare is rounded to the nearest ${centavos} centavos. The guide's unrounded student minimum (${peso(data.discounted.baseFare)}) is never the fare to quote: say ${peso(minDiscounted)}.
- Distance counts in whole km: any part of a km counts as a full km (4.2 km counts as 5 km).
- Modern jeepneys: ₱${MODERN_JEEPNEY_MINIMUM} minimum fare. Mention this ONLY if the user asks about modern jeeps.
- Every fare you give is an estimate based on the LTFRB fare guide; say so.`;
}

// The user's own words, without the [ROUTE INFO] block the website prepends.
function userText(message) {
    const text = String(message || '');
    const marker = text.lastIndexOf('User Message:');
    return (marker === -1 ? text : text.slice(marker + 'User Message:'.length)).trim();
}

const DISTANCE = /(\d+(?:[.,]\d+)?)\s*(?:km|kms|kilometers?|kilometres?|kilometro|kilometros)\b/i;
const DISCOUNT_WORDS = /\b(student|students|estudyante|senior|seniors|elderly|matanda|pwd|discount|discounted|diskwento|may diskwento|lolo|lola)\b/i;

const FARE_QUESTION = /\b(magkano|how much|pamasahe|pasahe|fare|fares|bayad|price|cost)\b/i;

// Exact figures for the model, so it quotes them instead of working them out:
// - the user names a distance: a [FARE ESTIMATE] block computed with the Planner's formula;
// - the user asks about a fare without a distance (and no planned route is attached): a [FARE MINIMUM] block.
// Otherwise ''.
function fareEstimateBlock(message) {
    const text = userText(message);
    const match = DISTANCE.exec(text);
    if (!match) {
        if (!FARE_QUESTION.test(text) || String(message || '').includes('[ROUTE INFO]')) return '';
        const { data } = getFareData();
        return `[FARE MINIMUM]
Minimum fare for the first ${data.baseKm} km: regular ${peso(fareFor(data.baseKm, 'regular', data))}; student, senior citizen or PWD ${peso(fareFor(data.baseKm, 'discounted', data))}
Basis: ${data.source}, effective ${formatDate(data.effectiveDate, 'en')}. This is an estimate; the total depends on the distance.

`;
    }
    const km = parseFloat(match[1].replace(',', '.'));
    if (!isFinite(km) || km <= 0) return '';
    const { data } = getFareData();
    const counted = countedKm(km);
    const wantsDiscount = DISCOUNT_WORDS.test(text);
    const beyondTable = counted > data.maxKm
        ? `\nNote: the LTFRB fare table only goes up to ${data.maxKm} km; this figure follows the same formula past it.`
        : '';
    return `[FARE ESTIMATE]
Distance asked: ${km} km (counted as ${counted} km)
Regular fare: ${peso(fareFor(km, 'regular', data))}
Student, senior citizen or PWD fare: ${peso(fareFor(km, 'discounted', data))}
The user asked about: ${wantsDiscount ? 'the student/senior/PWD discount' : 'the fare (give the regular fare; add the discounted fare only if useful)'}
Basis: ${data.source}, effective ${formatDate(data.effectiveDate, 'en')}. This is an estimate.${beyondTable}

`;
}

module.exports = { getFareData, fareFactsSection, fareEstimateBlock, userText, MODERN_JEEPNEY_MINIMUM };
