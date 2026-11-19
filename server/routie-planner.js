/**
 * Routie Planner & Place Resolver (Server-side Routing Tool)
 * 
 * Provides:
 * 1. resolvePlace(query, places, options):
 *    - Fuzzy matching (Levenshtein)
 *    - Abbreviation and nickname dictionary (SM, RSM, Letran, Crossing, Halang, Real, etc.)
 *    - Out-of-Calamba awareness (San Isidro, Cabuyao, Sta. Rosa)
 *    - Ambiguity detection (e.g. "palengke" -> Calamba Public Market vs Canlubang Market)
 * 
 * 2. plan_route(origin, destination, options):
 *    - Structured multi-modal routing (jeep, walking, tricycle)
 *    - Exact fares from transit engine / LTFRB fare guide (regular & student/senior/PWD)
 *    - Boarding and alighting landmarks
 *    - Headsign and route name
 *    - Handles outside Calamba origins (Cabuyao corridor) with clear notes
 *    - Prefilled planner link if no route or missing place
 * 
 * 3. formatRouteReply(planResult, lang, passengerType):
 *    - Exact required format:
 *      Total: ₱[totalFare], around [totalMin] minutes, [N] transfer(s)
 *      1. [Walk/Ride...]
 *      2. [Board...]
 *      ...
 *      Note: student/senior discount, warnings.
 * 
 * 4. handleFollowUp(message, sessionContext, places):
 *    - "how about going back?" -> reverse previous trip
 *    - "what if student ako?" -> recompute discount for previous trip
 *    - "what if I take a tricycle?" -> provide tricycle breakdown
 */

const path = require('path');
const fs = require('fs');

let transitEngine = null;
let transitPlanner = null;
let transitRoutesData = null;
let barangaysData = null;
let fareCalc = null;

try {
    transitEngine = require('../public/js/transit-engine.js');
    transitRoutesData = require('../public/data/transit-routes.json');
    barangaysData = require('../public/data/barangays.json');
    fareCalc = require('../public/js/fare-calc.js');
    if (transitEngine && transitRoutesData && barangaysData) {
        transitPlanner = transitEngine.createPlanner(transitRoutesData, barangaysData);
    }
} catch (err) {
    console.error('[routie-planner] Init transit engine error:', err.message);
}

const { getFareData } = require('./fare-info');
const routieDataset = require('./routie-dataset');

function haversineDistM(a, b) {
    if (transitEngine && typeof transitEngine.haversineM === 'function') {
        return transitEngine.haversineM(a, b);
    }
    if (!a || !b) return Infinity;
    const R = 6371000;
    const toRad = deg => (deg * Math.PI) / 180;
    const dLat = toRad(b[0] - a[0]);
    const dLng = toRad(b[1] - a[1]);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// ── Known Terminals in Calamba ──────────────────────────────────────────
const KNOWN_TERMINALS = [
    {
        name: 'SM City Calamba Transport Terminal',
        aliases: ['sm transport terminal', 'sm calamba terminal', 'sm terminal', 'sm east terminal', 'sm sakayan', 'sm city calamba transport terminal', 'terminal papuntang halang', 'sm terminal halang', 'sakayan papuntang halang'],
        barangay: 'Uno',
        coords: [14.202953, 121.15715],
        note: 'East side of SM City Calamba. Terminal papuntang Halang at Los Baños (UPLB).'
    },
    {
        name: 'Crossing Grand Terminal',
        aliases: ['crossing terminal', 'crossing grand terminal', 'grand terminal', 'crossing', 'calamba crossing'],
        barangay: 'Uno',
        coords: [14.2061875, 121.1545625],
        note: 'West side of National Highway 1, north of Crossing triangle. Boarding for jeeps to Real, Halang, Sta. Rosa.'
    },
    {
        name: 'SM Calamba Inner Rd Terminal',
        aliases: ['calamba tagaytay terminal', 'tagaytay terminal', 'sm calamba inner rd terminal', 'sm inner rd terminal', 'sm calamba inner road terminal', 'sm inner road terminal', 'sm inner rd', 'sm inner road', 'sm cinema terminal', 'sm west terminal', 'terminal papuntang real', 'sm real terminal', 'sakayan papuntang real'],
        barangay: 'Uno',
        coords: [14.2032625, 121.1547031],
        note: 'SM City Calamba inner road / bypass road by SM Cinema (Google: "Calamba-Tagaytay Terminal"). Terminal papuntang Real (jeeps to Tanauan via Real).'
    },
    {
        name: 'SM Calamba (Cinema side Drop-off)',
        aliases: ['sm cinema drop off', 'sm west side', 'sm calamba west', 'sm drop off'],
        barangay: 'Uno',
        coords: [14.203297, 121.154669],
        note: 'West side driveway of SM City Calamba by SM Cinema. Primary drop-off for jeeps from Sta. Rosa and Los Baños.'
    },
    {
        name: 'New Calamba Transport Terminal',
        aliases: ['new calamba transport terminal', 'cmc terminal', 'new calamba terminal'],
        barangay: 'Real',
        coords: [14.207417, 121.154333],
        note: 'Near Calamba Medical Center (CMC Avenue / National Highway 1). Boarding for jeeps to Real.'
    }
];

// ── Known Key Areas / Barangays ────────────────────────────────────────
const KNOWN_AREAS = {
    // Real and Halang: their barangay halls (the earlier pins fell outside both barangays, so "SM papuntang Real" became a walk)
    'real': { name: 'Brgy. Real, Calamba', coords: [14.197837, 121.149711], barangay: 'Real' },
    'halang': { name: 'Brgy. Halang, Calamba', coords: [14.196813, 121.161062], barangay: 'Halang' },
    'uno': { name: 'Brgy. Uno (Poblacion / Crossing), Calamba', coords: [14.206, 121.155], barangay: 'Uno' },
    'crossing': { name: 'Calamba Crossing, Calamba', coords: [14.2061875, 121.1545625], barangay: 'Uno' },
    'calamba': { name: 'Calamba Crossing / Poblacion', coords: [14.206, 121.155], barangay: 'Uno' },
    'calamba city': { name: 'Calamba Crossing / Poblacion', coords: [14.206, 121.155], barangay: 'Uno' },
    'bayan': { name: 'Calamba Poblacion (Bayan)', coords: [14.211, 121.165], barangay: 'Uno' },
    'lecheria': { name: 'Brgy. Lecheria, Calamba', coords: [14.198, 121.161], barangay: 'Lecheria' },
    'bucal': { name: 'Brgy. Bucal, Calamba', coords: [14.188, 121.166], barangay: 'Bucal' },
    'parian': { name: 'Brgy. Parian, Calamba', coords: [14.215, 121.147], barangay: 'Parian' },
    'canlubang': { name: 'Brgy. Canlubang, Calamba', coords: [14.218, 121.105], barangay: 'Canlubang' },
    'mayapa': { name: 'Brgy. Mayapa, Calamba', coords: [14.218, 121.135], barangay: 'Mayapa' },
    'pansol': { name: 'Brgy. Pansol, Calamba', coords: [14.180, 121.180], barangay: 'Pansol' },
    'turbina': { name: 'Brgy. Turbina, Calamba', coords: [14.185, 121.142], barangay: 'Turbina' },
    // External served corridors
    'san isidro': { name: 'San Isidro, Cabuyao, Laguna', coords: [14.24195, 121.14168], barangay: 'San Isidro', outsideCalamba: true },
    'san isidro cabuyao': { name: 'San Isidro, Cabuyao, Laguna', coords: [14.24195, 121.14168], barangay: 'San Isidro', outsideCalamba: true },
    'cabuyao': { name: 'Cabuyao, Laguna', coords: [14.246, 121.132], barangay: 'Cabuyao', outsideCalamba: true },
    'pulo': { name: 'Pulo, Cabuyao', coords: [14.246, 121.135], barangay: 'Pulo', outsideCalamba: true },
    'uplb': { name: 'Los Baños (UPLB)', coords: [14.167, 121.243], barangay: 'Los Baños', outsideCalamba: true },
    'los banos': { name: 'Los Baños', coords: [14.175, 121.220], barangay: 'Los Baños', outsideCalamba: true },
    'sta rosa': { name: 'Sta. Rosa (Balibago)', coords: [14.298, 121.109], barangay: 'Sta. Rosa', outsideCalamba: true },
    'balibago': { name: 'Sta. Rosa (Balibago)', coords: [14.298, 121.109], barangay: 'Sta. Rosa', outsideCalamba: true },
    'tanauan': { name: 'Tanauan, Batangas', coords: [14.085, 121.150], barangay: 'Tanauan', outsideCalamba: true }
};

// ── Known Ambiguous Queries ───────────────────────────────────────────
const AMBIGUOUS_TARGETS = [
    {
        triggers: ['palengke', 'market', 'pamilihan', 'public market'],
        term: 'palengke',
        choices: [
            'Calamba Public Market (sa Crossing / Bayan, Brgy. 5)',
            'Canlubang Public Market (sa Canlubang)'
        ],
        question_tl: 'Aling palengke po ang inyong pupuntahan — ang Calamba Public Market (sa Crossing/Bayan) o ang Canlubang Public Market?',
        question_en: 'Which market are you heading to — Calamba Public Market (in Crossing/Bayan) or Canlubang Public Market?'
    },
    {
        triggers: ['puregold'],
        term: 'puregold',
        choices: [
            'Puregold – Halang, Calamba',
            'Puregold Calamba (Crossing / Poblacion)',
            'Puregold Jr. Parian'
        ],
        question_tl: 'Aling Puregold po ang inyong pupuntahan — ang Puregold Halang, Puregold Calamba (Crossing), o Puregold Jr. Parian?',
        question_en: 'Which Puregold branch are you heading to — Puregold Halang, Puregold Calamba (Crossing), or Puregold Jr. Parian?'
    }
];

// Normalize helper
function norm(str) {
    return String(str || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Levenshtein distance
function levenshteinDistance(s1, s2) {
    const a = norm(s1);
    const b = norm(s2);
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

// Strip conversational noise and routing particles from place query
function cleanPlaceQuery(raw) {
    let q = String(raw || '').trim();
    // Strip conversational fillers
    q = q.replace(/^(?:eh|uy|hi|hello|kuya|ate|routie)[,\s]+/i, '');
    q = q.replace(/^(?:what\s+about|how\s+about)[,\s]+/i, '');
    q = q.replace(/^(?:tanong\s+ko\s+lang|ask\s+ko\s+lang)[,\s]+/i, '');
    q = q.replace(/^(?:pwede\s+ba|maaari\s+bang|can\s+i|how\s+do\s+i)[,\s]+/i, '');
    q = q.replace(/^(?:saan\s+(?:ako\s+|ang\s+)?(?:sasakay|sakayan)\s+)?(?:paano\s+(?:ba\s+)?(?:pumunta|makapunta|sumakay)\s+(?:sa\s+)?)/i, '');
    q = q.replace(/^(?:magkano\s+(?:po\s+)?(?:ang\s+)?(?:pamasahe|pasahe|bayad)\s+(?:mula|galing|from|sa\s+)?)/i, '');
    q = q.replace(/^(?:how\s+much\s+(?:is\s+)?(?:the\s+)?fare\s+(?:from\s+)?)/i, '');
    q = q.replace(/^(?:mula|galing|from)\s+(?:sa\s+)?/i, '');
    q = q.replace(/^(?:papunta(?:ng)?|hanggang|to)\s+(?:sa\s+)?/i, '');
    q = q.replace(/^(?:yung\s+|ang\s+|sa\s+)/i, '');
    q = q.replace(/\s+(?:magkano\s+(?:po\s+)?(?:ang\s+)?(?:pamasahe|pasahe|bayad)|how\s+much(?:\s+fare)?)$/i, '');
    q = q.replace(/[\?\.\!]+$/, '').trim();
    return q;
}

// ── Place Resolver ─────────────────────────────────────────────────────
function resolvePlace(rawQuery, places = [], opts = {}) {
    if (!rawQuery) return null;
    const cleanQ = cleanPlaceQuery(rawQuery);
    const nq = norm(cleanQ);
    if (!nq) return null;

    // 0. "Chicken Joo sa Halang", "Jollibee at Crossing", "Mercury Drug in Real" (how people say it, often by voice):
    // the place in that area, when one is listed ("Chicken Joo Halang"), rather than the area itself
    const inArea = cleanQ.match(/^(.+?)\s+(?:sa|at|in|near|malapit sa|along)\s+(.+)$/i);
    if (inArea && !opts.noArea) {
        const joined = resolvePlace(`${inArea[1]} ${inArea[2]}`, places, { noArea: true });
        const first = norm(inArea[1]).split(' ')[0];
        if (joined && !joined.isAmbiguous && joined.found !== false && joined.name && first && norm(joined.name).split(' ').includes(first)) {
            return joined;
        }
    }

    // 1. Check Ambiguity first
    for (const amb of AMBIGUOUS_TARGETS) {
        for (const trig of amb.triggers) {
            if (nq === trig || nq === `${trig} calamba` || nq === `sm to ${trig}` || nq.endsWith(` to ${trig}`) || nq.endsWith(` papuntang ${trig}`)) {
                return {
                    isAmbiguous: true,
                    term: amb.term,
                    choices: amb.choices,
                    question_tl: amb.question_tl,
                    question_en: amb.question_en
                };
            }
        }
    }

    // 1b. Place aliases (server/data/place-aliases.json): the whole query is a known alias
    const aliasHit = routieDataset.aliasFor(cleanQ);
    if (aliasHit && aliasHit.ambiguous) {
        const choices = aliasHit.ambiguous.map(slug => places.find(p => p.slug === slug)).filter(Boolean).map(p => `${p.name} (Brgy. ${p.barangay})`);
        return {
            isAmbiguous: true, term: aliasHit.alias, choices,
            question_tl: `Alin po ang tinutukoy ninyo: ${choices.join(', o ')}?`,
            question_en: `Which one do you mean: ${choices.join(', or ')}?`
        };
    }
    if (aliasHit && aliasHit.slug && !['sm-city-calamba'].includes(aliasHit.slug)) {
        const p = places.find(x => x.slug === aliasHit.slug);
        if (p && p.lat != null && p.lng != null) {
            return { name: p.name, coords: [Number(p.lat), Number(p.lng)], barangay: p.barangay, place: p, outsideCalamba: false };
        }
    }

    // 2. High-priority Nicknames & Abbreviations
    // "SM", "SM Calamba", "SM City"
    if (nq === 'sm' || nq === 'sm calamba' || nq === 'sm city' || nq === 'sm city calamba' || nq === 'sm mall' || nq === 'sm kalamba') {
        const smPlace = places.find(p => p.name === 'SM City Calamba' || p.slug === 'sm-city-calamba');
        return {
            name: 'SM City Calamba',
            coords: smPlace?.lat != null && smPlace?.lng != null ? [Number(smPlace.lat), Number(smPlace.lng)] : [14.203928, 121.154516],
            barangay: 'Uno',
            place: smPlace,
            outsideCalamba: false
        };
    }

    // "RSM", "RSM Real", "RSM Lutong Bahay", "rsm, real"
    if (nq === 'rsm' || nq === 'rsm real' || nq === 'rsm lutong bahay' || nq === 'rsm real calamba' || nq === 'rsm restaurant' || nq === 'rsm eatery') {
        const rsmPlace = places.find(p => p.name.toLowerCase().includes('rsm') || p.slug === 'rsm-lutong-bahay');
        return {
            name: rsmPlace ? rsmPlace.name : 'RSM Lutong Bahay – Real, Calamba',
            coords: rsmPlace ? [rsmPlace.lat, rsmPlace.lng] : [14.194911, 121.143541],
            barangay: 'Real',
            place: rsmPlace,
            outsideCalamba: false
        };
    }

    // "Crossing", "Calamba Crossing"
    if (nq === 'crossing' || nq === 'calamba crossing' || nq === 'crossing terminal' || nq === 'grand terminal') {
        return {
            name: 'Crossing Grand Terminal',
            coords: [14.2061875, 121.1545625],
            barangay: 'Uno',
            outsideCalamba: false
        };
    }

    // "Calamba" / "Calamba City" when used as origin/dest -> refers to Crossing / Poblacion (Uno)
    if (nq === 'calamba' || nq === 'calamba city' || nq === 'calamba bayan' || nq === 'bayan ng calamba') {
        return {
            name: 'Calamba Crossing / Poblacion',
            coords: [14.206, 121.155],
            barangay: 'Uno',
            outsideCalamba: false
        };
    }

    // 3. Known Terminals
    for (const term of KNOWN_TERMINALS) {
        if (norm(term.name) === nq) {
            return { name: term.name, coords: term.coords, barangay: term.barangay, outsideCalamba: false };
        }
        for (const alias of term.aliases) {
            if (nq === alias || nq === norm(alias)) {
                return { name: term.name, coords: term.coords, barangay: term.barangay, outsideCalamba: false };
            }
        }
    }

    // 4. Known Areas & Barangays (and outside points like San Isidro, Cabuyao)
    for (const [key, area] of Object.entries(KNOWN_AREAS)) {
        if (nq === key || nq.startsWith(`${key} `) || nq.endsWith(` ${key}`) || nq === `brgy ${key}` || nq === `barangay ${key}`) {
            return {
                name: area.name,
                coords: area.coords,
                barangay: area.barangay,
                outsideCalamba: !!area.outsideCalamba
            };
        }
    }

    // 5. Match Places Database (Exact name or slug)
    let matchedPlace = places.find(p => norm(p.name) === nq || (p.slug && norm(p.slug) === nq));
    if (matchedPlace && matchedPlace.lat != null && matchedPlace.lng != null) {
        return {
            name: matchedPlace.name,
            coords: [matchedPlace.lat, matchedPlace.lng],
            barangay: matchedPlace.barangay,
            place: matchedPlace,
            outsideCalamba: false
        };
    }

    // 6. Substring match on place name (e.g. "Letran", "CityMall", "Puregold Halang")
    matchedPlace = places.find(p => {
        const pNorm = norm(p.name);
        return pNorm.includes(nq) || nq.includes(pNorm);
    });
    if (matchedPlace && matchedPlace.lat != null && matchedPlace.lng != null) {
        return {
            name: matchedPlace.name,
            coords: [matchedPlace.lat, matchedPlace.lng],
            barangay: matchedPlace.barangay,
            place: matchedPlace,
            outsideCalamba: false
        };
    }

    // 7. Fuzzy Match (Levenshtein distance <= 2 for words >= 5 characters)
    // Check known areas (e.g. "hallang" -> "halang", "kalamba" -> "calamba")
    for (const [key, area] of Object.entries(KNOWN_AREAS)) {
        if (key.length >= 4 && levenshteinDistance(nq, key) <= 2) {
            return {
                name: area.name,
                coords: area.coords,
                barangay: area.barangay,
                outsideCalamba: !!area.outsideCalamba
            };
        }
    }

    // Check places with fuzzy match
    for (const p of places) {
        const pNorm = norm(p.name);
        if (pNorm.length >= 5 && levenshteinDistance(nq, pNorm) <= 2) {
            return {
                name: p.name,
                coords: [p.lat, p.lng],
                barangay: p.barangay,
                place: p,
                outsideCalamba: false
            };
        }
    }

    // Not found
    return {
        found: false,
        name: cleanQ
    };
}

// ── Extract Origin and Destination ─────────────────────────────────────
// A long message (often spoken) with the trip somewhere in the middle: "Hello Routie, good morning! Gusto kong malaman
// kung paano pumunta mula SM City Calamba papuntang Chicken Joo sa Halang, tapos magkano kung student ako, at saan…"
// Finds the "mula X papuntang Y" (or "papuntang Y mula X") part and cuts each place at the end of its clause
// (a comma or period, or "tapos", "at", "kasi", "and", …), so the rest of the sentence is not taken as a place name.
// "at" (Tagalog "and") ends the place only before a lowercase word: "Halang at magkano…", not "Jollibee at Crossing"
const CLAUSE_END_RE = /[,.;!?]|\s(?:tapos|pagkatapos|at saka|kasi|dahil|kaya|para|pero|kung|then|and|so|because|but|since|please|pls|salamat|thanks|thank you)(?=\s|$)/i;
const cutClause = (s) => String(s).split(CLAUSE_END_RE)[0].split(/\sat\s(?=[a-zñ])/)[0]
    .replace(/(?:\s+(?:ako|kami|tayo|po|naman|lang|sana|ba|na|please|pls))+\s*$/i, '').trim();
function tripClause(raw) {
    if (raw.split(/\s+/).length <= 8 && !/[,.;!?]/.test(raw)) return null;
    const FROM = '(?:mula|galing|from|starting from)\\s+(?:sa\\s+|ng\\s+|the\\s+)?';
    const TO = '(?:papunta(?:ng)?|patungo(?:ng)?|hanggang|going to|to)\\s+(?:sa\\s+|the\\s+)?';
    let m = raw.match(new RegExp(`(?:^|[\\s,.;!?])${FROM}([^,.;!?]+?)\\s+${TO}(.+)$`, 'i'));
    if (m) {
        const origin = cutClause(m[1]), dest = cutClause(m[2]);
        if (origin && dest) return { origin, dest };
    }
    m = raw.match(new RegExp(`(?:^|[\\s,.;!?])${TO}([^,.;!?]+?)\\s+${FROM}(.+)$`, 'i'));
    if (m) {
        const dest = cutClause(m[1]), origin = cutClause(m[2]);
        if (origin && dest) return { origin, dest };
    }
    return null;
}

function extractOriginAndDestination(text) {
    let raw = String(text || '').trim();
    // A long message: just its trip part, when it has one
    const clause = tripClause(raw.replace(/[\?\.\!]+$/, ''));
    if (clause) return { origin: cleanPlaceQuery(clause.origin), dest: cleanPlaceQuery(clause.dest) };
    raw = raw.replace(/^(?:eh|uy|hi|hello|kuya|ate|routie)[,\s]+/i, '');
    raw = raw.replace(/^(?:what\s+about|how\s+about)[,\s]+/i, '');
    raw = raw.replace(/^(?:tanong\s+ko\s+lang|ask\s+ko\s+lang)[,\s]+/i, '');
    raw = raw.replace(/^(?:magkano\s+(?:po\s+)?(?:ang\s+)?(?:pamasahe|pasahe|bayad)\s+(?:sa\s+)?)/i, '');
    raw = raw.replace(/^(?:how\s+much\s+(?:is\s+)?(?:the\s+)?fare\s+(?:for\s+)?)/i, '');
    raw = raw.replace(/\s+(?:magkano\s+(?:po\s+)?(?:ang\s+)?(?:pamasahe|pasahe|bayad)|how\s+much(?:\s+fare)?)$/i, '');
    raw = raw.replace(/[\?\.\!]+$/, '').trim();

    // 1. "saan sasakay / paano pumunta / papuntang DEST mula / galing / from ORIGIN"
    let m = raw.match(/^(?:saan\s+(?:ako\s+|ang\s+)?(?:sasakay|sakayan)\s+)?(?:paano\s+(?:ba\s+)?(?:pumunta|makapunta|sumakay)\s+(?:sa\s+)?|how\s+(?:to\s+|do\s+i\s+)?get\s+to\s+|directions?\s+to\s+|papunta(?:ng)?\s+(?:sa\s+)?|byahe\s+papunta(?:ng)?\s+(?:sa\s+)?)(.+?)\s+(?:galing\s+(?:sa\s+)?|mula\s+(?:sa\s+)?|from\s+)(.+)$/i);
    if (m) {
        return { origin: cleanPlaceQuery(m[2]), dest: cleanPlaceQuery(m[1]) };
    }

    // 2. "mula / galing / from ORIGIN papunta / hanggang / to DEST"
    m = raw.match(/^(?:mula\s+(?:sa\s+)?|galing\s+(?:sa\s+)?|from\s+)(.+?)\s+(?:papunta(?:ng)?\s+(?:sa\s+)?|hanggang\s+(?:sa\s+)?|to\s+)(.+)$/i);
    if (m) {
        return { origin: cleanPlaceQuery(m[1]), dest: cleanPlaceQuery(m[2]) };
    }

    // 3. "ORIGIN to / papuntang DEST" (ensure not general questions or terminal inquiries)
    m = raw.match(/^(.+?)\s+(?:to|papunta(?:ng)?(?:\s+sa)?)\s+(.+)$/i);
    if (m && !/\b(what|ano|sino|who|can|pwede|may|is|are|which|how|where|kailan|bakit|saan|terminal|sakayan)\b/i.test(m[1])) {
        return { origin: cleanPlaceQuery(m[1]), dest: cleanPlaceQuery(m[2]) };
    }

    return null;
}

// ── Shared Routing Function: plan_route ────────────────────────────────
function plan_route(originInput, destInput, options = {}) {
    const places = options.places || [];
    const passengerType = options.passengerType || 'regular'; // 'regular' or 'discounted'

    // 1. Resolve places
    const originResolved = typeof originInput === 'object' && originInput.coords
        ? originInput
        : resolvePlace(originInput, places);
    const destResolved = typeof destInput === 'object' && destInput.coords
        ? destInput
        : resolvePlace(destInput, places);

    // Check ambiguity
    if (originResolved && originResolved.isAmbiguous) {
        return {
            success: false,
            reason: 'ambiguous',
            ambiguity: originResolved
        };
    }
    if (destResolved && destResolved.isAmbiguous) {
        return {
            success: false,
            reason: 'ambiguous',
            ambiguity: destResolved
        };
    }

    // Check not found
    if (!originResolved || originResolved.found === false || !destResolved || destResolved.found === false) {
        const missing = (!originResolved || originResolved.found === false) ? originInput : destInput;
        const validOrigName = originResolved && originResolved.name ? originResolved.name : originInput;
        const validDestName = destResolved && destResolved.name ? destResolved.name : destInput;
        return {
            success: false,
            reason: 'place_not_found',
            missingName: missing,
            originUnderstood: validOrigName,
            destUnderstood: validDestName,
            plannerUrl: `calzadaph.com/planner?origin=${encodeURIComponent(validOrigName)}&dest=${encodeURIComponent(validDestName)}`
        };
    }

    // 2. Handle Origin Outside Calamba (e.g. San Isidro, Cabuyao corridor)
    if (originResolved.outsideCalamba && norm(originResolved.name).includes('cabuyao')) {
        // Cabuyao Highway access point on the Sta. Rosa – Calamba route
        const cabuyaoHighwayPt = [14.238286, 121.133176];
        const destCoords = destResolved.coords;

        let jeepRide = null;
        if (transitPlanner) {
            const highwayPlans = transitPlanner.plan(cabuyaoHighwayPt, destCoords);
            if (highwayPlans && highwayPlans.length > 0) {
                jeepRide = highwayPlans[0];
            }
        }

        const jeepFareReg = jeepRide ? jeepRide.fare : 18.00;
        const jeepFareDisc = jeepRide ? jeepRide.fareDisc : 14.50;
        const jeepMin = jeepRide ? jeepRide.totalMin : 18;
        const jeepDistM = jeepRide ? (jeepRide.legs.find(l => l.type === 'jeep')?.distM || 5065) : 5065;
        const jeepLeg = jeepRide?.legs.find(l => l.type === 'jeep');

        const boardName = 'National Highway (Cabuyao / San Isidro access point)';
        const alightName = jeepLeg?.alight?.name || destResolved.name;
        const routeName = jeepLeg?.routeName || 'Sta. Rosa – Calamba';
        const headsign = jeepLeg?.headsign || 'SM Calamba';
        const signboard = jeepLeg?.signboard || 'SM Calamba / Crossing Terminal';

        const legs = [
            {
                step: 1,
                type: 'tricycle',
                title: 'Tricycle / Lakad papuntang National Highway',
                instruction_tl: `Mula sa San Isidro proper, sumakay ng tricycle (o maglakad) palabas patungo sa sakayan sa National Highway (Cabuyao / San Isidro highway access).`,
                instruction_en: `From San Isidro proper, take a local tricycle (or walk) to the National Highway boarding area.`,
                from: originResolved.name,
                to: boardName,
                distanceM: 1000,
                minutes: 10,
                fare: 0,
                fareNote: 'Tricycle fare estimate: ~₱20–₱40 (depende sa pasahero/special trip)',
                warning: 'Ang pamasahe sa tricycle ay lokal na tantiya at hindi sakop ng LTFRB jeepney tariff.'
            },
            {
                step: 2,
                type: 'jeep',
                title: `Jeep: ${routeName}`,
                instruction_tl: `Sa National Highway, sumakay ng jeep na may sign na "${signboard}" (karatula: ${headsign}) papuntang ${alightName}.`,
                instruction_en: `On the National Highway, board a jeepney with signboard "${signboard}" heading to ${alightName}.`,
                routeName,
                headsign,
                signboard,
                board: boardName,
                alight: alightName,
                distanceM: Math.round(jeepDistM),
                minutes: jeepMin,
                fare: jeepFareReg,
                fareDiscounted: jeepFareDisc
            }
        ];

        return {
            success: true,
            origin: originResolved,
            destination: destResolved,
            summary: {
                totalFare: jeepFareReg,
                totalFareDiscounted: jeepFareDisc,
                totalMinutes: 10 + jeepMin,
                totalDistanceM: 1000 + jeepDistM,
                walkingDistanceM: 100,
                transfers: 1,
                hasOutsideLeg: true
            },
            legs,
            outsideNote_tl: 'Nagsisimula ang ruta sa San Isidro, Cabuyao (sa labas ng Calamba). Sakop ng Calzada ang jeepney leg sa kahabaan ng National Highway patungong Calamba.',
            outsideNote_en: 'This trip originates in San Isidro, Cabuyao (outside Calamba). Calzada covers the jeepney route along the National Highway into Calamba.'
        };
    }

    // 3. Handle Destination Outside Calamba (e.g. Calamba to San Isidro, Cabuyao)
    if (destResolved.outsideCalamba && norm(destResolved.name).includes('cabuyao')) {
        const cabuyaoHighwayPt = [14.238286, 121.133176];
        const origCoords = originResolved.coords;

        let jeepRide = null;
        if (transitPlanner) {
            const highwayPlans = transitPlanner.plan(origCoords, cabuyaoHighwayPt);
            if (highwayPlans && highwayPlans.length > 0) {
                jeepRide = highwayPlans[0];
            }
        }

        const jeepFareReg = jeepRide ? jeepRide.fare : 18.00;
        const jeepFareDisc = jeepRide ? jeepRide.fareDisc : 14.50;
        const jeepMin = jeepRide ? jeepRide.totalMin : 18;
        const jeepLeg = jeepRide?.legs.find(l => l.type === 'jeep');

        const boardName = jeepLeg?.board?.name || 'Crossing Grand Terminal / SM Calamba West';
        const alightName = 'National Highway (Cabuyao / San Isidro access point)';
        const routeName = 'Sta. Rosa – Calamba';
        const headsign = 'Sta. Rosa';
        const signboard = 'Sta. Rosa / Cabuyao';

        const legs = [
            {
                step: 1,
                type: 'jeep',
                title: `Jeep: ${routeName}`,
                instruction_tl: `Mula ${originResolved.name}, sumakay sa ${boardName} ng jeep na may karatulang "${signboard}" papuntang Cabuyao.`,
                instruction_en: `From ${originResolved.name}, board a jeep at ${boardName} with headsign "${signboard}" towards Cabuyao.`,
                routeName,
                headsign,
                signboard,
                board: boardName,
                alight: alightName,
                distanceM: 5065,
                minutes: jeepMin,
                fare: jeepFareReg,
                fareDiscounted: jeepFareDisc
            },
            {
                step: 2,
                type: 'tricycle',
                title: 'Tricycle papasok sa San Isidro',
                instruction_tl: `Bumaba sa highway junction ng San Isidro, Cabuyao, at sumakay ng tricycle papasok sa iyong destinasyon.`,
                instruction_en: `Alight at the highway junction in Cabuyao, then take a local tricycle to San Isidro.`,
                from: alightName,
                to: destResolved.name,
                distanceM: 1000,
                minutes: 10,
                fare: 0,
                fareNote: 'Tricycle fare estimate: ~₱20–₱40',
                warning: 'Ang tricycle fare ay lokal na tantiya.'
            }
        ];

        return {
            success: true,
            origin: originResolved,
            destination: destResolved,
            summary: {
                totalFare: jeepFareReg,
                totalFareDiscounted: jeepFareDisc,
                totalMinutes: jeepMin + 10,
                totalDistanceM: 6065,
                walkingDistanceM: 100,
                transfers: 1,
                hasOutsideLeg: true
            },
            legs,
            outsideNote_tl: 'Ang destinasyon ay nasa San Isidro, Cabuyao. Sakop ng Calzada ang jeepney route hanggang sa highway junction ng Cabuyao.',
            outsideNote_en: 'The destination is in San Isidro, Cabuyao. Calzada covers the jeepney route up to the Cabuyao highway junction.'
        };
    }

    // 4. Standard In-Calamba Transit Routing
    let planOption = null;
    let suggestedTerminals = null;
    let chosenStopId = null;
    if (transitPlanner) {
        // Destination terminal choices (e.g. Real or Halang)
        const destBarangay = destResolved.barangay || (destResolved.place && destResolved.place.barangay);
        const tc = transitPlanner.terminalChoices(originResolved.coords, destResolved.coords, destBarangay);
        if (tc && tc.choices && tc.choices.length > 0) {
            // options.boardStopId: the commuter picked a terminal ("eh kung sa Crossing?"); else the recommended one
            const picked = options.boardStopId ? tc.choices.find(c => c.stopId === options.boardStopId) : null;
            planOption = (picked || tc.choices[0]).option;
            chosenStopId = (picked || tc.choices[0]).stopId;
            suggestedTerminals = tc.choices.map(c => ({
                stopId: c.stopId,
                name: c.name,
                name_tl: c.name_tl || c.name,
                recommended: !!c.recommended,
                fare: c.option.fare,
                totalMin: c.option.totalMin,
                walkMin: c.walkMin,
                // Whole trip from this terminal: minutes walking (all walks) and on the jeep (incl. the wait to board)
                tripWalkMin: c.option.legs.filter(l => l.type === 'walk').reduce((n, l) => n + (l.min || 0), 0),
                tripWalkM: Math.round(c.option.legs.filter(l => l.type === 'walk').reduce((n, l) => n + (l.distM || 0), 0)),
                rideMin: c.option.legs.filter(l => l.type === 'jeep').reduce((n, l) => n + (l.min || 0), 0),
                transfers: c.option.transfers || 0
            }));
        }
    }

    // A walk only, no jeep: short trips (and local trips with no jeep that helps, below)
    const walkOnlyTrip = (straightDistM, extra = {}) => {
        {
            const walkDistM = Math.round(straightDistM * 1.25);
            const walkMin = Math.max(1, Math.round((walkDistM / 1000 / 4.0) * 60));
            return {
                success: true,
                isWalkOnly: true,
                origin: originResolved,
                destination: destResolved,
                summary: {
                    totalFare: 0,
                    totalFareDiscounted: 0,
                    totalMinutes: walkMin,
                    totalDistanceM: walkDistM,
                    walkingDistanceM: walkDistM,
                    transfers: 0
                },
                legs: [
                    {
                        step: 1,
                        type: 'walk',
                        title: `Lakad (${walkDistM} m, ~${walkMin} min)`,
                        instruction_tl: `Maglakad nang humigit-kumulang ${walkDistM} m (~${walkMin} min).`,
                        instruction_en: `Walk about ${walkDistM} m (~${walkMin} min).`,
                        distanceM: walkDistM,
                        minutes: walkMin,
                        fare: 0
                    }
                ],
                plannerUrl: `calzadaph.com/planner?origin=${encodeURIComponent(originResolved.name)}&dest=${encodeURIComponent(destResolved.name)}`,
                ...extra
            };
        }
    };
    // Short trips: under 800m straight-line distance without terminal choices -> walk only, no jeep
    if (!suggestedTerminals && originResolved.coords && destResolved.coords) {
        const straightDistM = haversineDistM(originResolved.coords, destResolved.coords);
        if (straightDistM < 800) return walkOnlyTrip(straightDistM);
    }

    if (transitPlanner && !planOption) {
        const directOpts = transitPlanner.plan(originResolved.coords, destResolved.coords);
        if (directOpts && directOpts.length > 0) {
            planOption = directOpts[0];
        }
    }

    // A local trip (in or by Uno / Real / Halang) with no jeep option: every jeep that runs there is in the
    // route data, so the trip is a walk, as on the Planner ("No jeepney route makes this trip faster")
    if ((!planOption || !planOption.legs || !planOption.legs.length) && transitPlanner && transitPlanner.isLocal
        && originResolved.coords && destResolved.coords
        && transitPlanner.isLocal(originResolved.coords) && transitPlanner.isLocal(destResolved.coords)) {
        return walkOnlyTrip(haversineDistM(originResolved.coords, destResolved.coords), { noFasterJeep: true });
    }

    if (!planOption || !planOption.legs || planOption.legs.length === 0) {
        return {
            success: false,
            reason: 'no_route',
            originUnderstood: originResolved.name,
            destUnderstood: destResolved.name,
            plannerUrl: `calzadaph.com/planner?origin=${encodeURIComponent(originResolved.name)}&dest=${encodeURIComponent(destResolved.name)}`
        };
    }

    // Structure the legs cleanly
    const formattedLegs = [];
    let stepNum = 1;

    planOption.legs.forEach(leg => {
        if (leg.type === 'walk') {
            const distM = Math.round(leg.distM || 0);
            if (distM > 10) {
                formattedLegs.push({
                    step: stepNum++,
                    type: 'walk',
                    title: `Lakad (${distM} m, ~${leg.min || 1} min)`,
                    instruction_tl: `Maglakad nang humigit-kumulang ${distM} metro (~${leg.min || 1} minuto).`,
                    instruction_en: `Walk about ${distM} meters (~${leg.min || 1} minute${leg.min === 1 ? '' : 's'}).`,
                    distanceM: distM,
                    minutes: leg.min || 1,
                    fare: 0
                });
            }
        } else if (leg.type === 'jeep') {
            // A stop has a name; boarding on the road is described from the place it starts at
            const road = leg.board?.name ? null : roadside(leg.board && leg.board.pt, originResolved);
            const boardName = leg.board?.name || road.en;
            const boardNameTl = leg.board?.name_tl || leg.board?.name || road.tl;
            const alightName = leg.alight?.name || destResolved.name;
            const distM = Math.round(leg.distM || 0);
            const headsign = leg.headsign || '';
            // Only a recorded signboard (transit-routes.json); never the headsign or route name in its place
            const signboard = leg.signboard || null;

            formattedLegs.push({
                step: stepNum++,
                type: 'jeep',
                title: `Jeep: ${leg.routeName}`,
                instruction_tl: signboard ? `Sumakay sa ${boardNameTl} ng jeep na may karatulang "${signboard}" papuntang ${alightName}.` : `Sumakay sa ${boardNameTl} ng jeep na ${leg.routeName} papuntang ${alightName}.`,
                instruction_en: signboard ? `Board at ${boardName} on the "${signboard}" jeep towards ${alightName}.` : `Board at ${boardName} on the ${leg.routeName} jeep towards ${alightName}.`,
                routeName: leg.routeName,
                headsign,
                signboard,
                board: boardName,
                board_tl: boardNameTl,
                alight: alightName,
                distanceM: distM,
                minutes: leg.min,
                fare: leg.fare,
                fareDiscounted: leg.fareDisc
            });
        }
    });

    return {
        success: true,
        origin: originResolved,
        destination: destResolved,
        summary: {
            totalFare: planOption.fare,
            totalFareDiscounted: planOption.fareDisc,
            totalMinutes: planOption.totalMin,
            totalDistanceM: Math.round(planOption.legs.reduce((acc, l) => acc + (l.distM || 0), 0)),
            walkingDistanceM: Math.round(planOption.walkM || 0),
            transfers: planOption.transfers || 0
        },
        legs: formattedLegs,
        suggestedTerminals,
        chosenStopId
    };
}

// Where to wait on the road when a jeep is boarded between stops: "in front of X", or "about N m from X"
function roadside(pt, from) {
    const name = (from && from.name) || 'your starting point';
    const d = Array.isArray(pt) && from && Array.isArray(from.coords) ? Math.round(haversineDistM(pt, from.coords) / 10) * 10 : null;
    if (d == null || d <= 80) return { en: `the roadside in front of ${name}`, tl: `kalsada sa tapat ng ${name}` };
    return { en: `the roadside about ${d} m from ${name}`, tl: `kalsada, mga ${d} m mula sa ${name}` };
}
// The boarding point of a jeep leg in the reply's language
const boardOf = (l, isTl) => (isTl ? (l.board_tl || l.board) : l.board);

// ── Format Output Conversationally ─────────────────────────────────────
function formatRouteReply(planRes, lang = 'tl') {
    const isTl = lang === 'tl';

    if (!planRes.success) {
        if (planRes.reason === 'ambiguous') {
            const amb = planRes.ambiguity;
            return isTl ? amb.question_tl : amb.question_en;
        }

        if (planRes.reason === 'place_not_found') {
            const missing = planRes.missingName;
            const url = planRes.plannerUrl;
            return isTl
                ? `Pasensya na po, hindi ko sigurado dahil wala sa verified data ng Calzada ang "${missing}". Puwede po ninyong subukang hanapin o i-set ang ruta sa Planner sa ${url} o mag-email sa thecalzada@gmail.com.`
                : `Sorry, I am not sure because "${missing}" is not in Calzada's verified data. You may try searching or pinning the location directly in the Planner at ${url} or emailing thecalzada@gmail.com.`;
        }

        if (planRes.reason === 'no_route') {
            const orig = planRes.originUnderstood;
            const dest = planRes.destUnderstood;
            const url = planRes.plannerUrl;
            return isTl
                ? `Wala sa curated jeepney routes ng Calzada ang direktang ruta mula ${orig} papuntang ${dest}. Maaaring lakad ito o biyaheng may transfer. Paki-check po ang Planner sa ${url} para sa detalyadong mapa.`
                : `No direct jeepney route between ${orig} and ${dest} was found in Calzada's curated routes. It may be a walk, or a trip with a transfer. Please check the Planner at ${url} for the map.`;
        }
    }

    if (planRes.isWalkOnly) {
        const leg = (planRes.legs && planRes.legs[0]) || {};
        const dist = leg.distanceM != null ? leg.distanceM : Math.round(planRes.summary?.walkingDistanceM || 0);
        const mins = leg.minutes != null ? leg.minutes : Math.round(planRes.summary?.totalMinutes || 1);
        if (planRes.noFasterJeep) {
            return isTl
                ? `Maglakad nang humigit-kumulang ${dist} m (~${mins} min). Walang rutang jeep na magpapabilis sa biyaheng ito.`
                : `Walk about ${dist} m (~${mins} min). No jeepney route makes this trip faster.`;
        }
        return isTl
            ? `Maglakad nang humigit-kumulang ${dist} m (~${mins} min). Mas mainam maglakad para sa biyaheng ito.`
            : `Walk about ${dist} m (~${mins} min). Walking is better for this trip.`;
    }

    const { summary, legs, origin, destination, outsideNote_tl, outsideNote_en } = planRes;

    const summaryLine = isTl
        ? `Kabuuan: ₱${summary.totalFare.toFixed(2)}, mga ${summary.totalMinutes} minuto, ${summary.transfers} transfer`
        : `Total: ₱${summary.totalFare.toFixed(2)}, around ${summary.totalMinutes} minutes, ${summary.transfers} transfer${summary.transfers === 1 ? '' : 's'}`;

    const stepLines = legs.map(l => {
        if (l.type === 'walk') {
            return isTl
                ? `${l.step}. Maglakad nang humigit-kumulang ${l.distanceM}m (~${l.minutes} min).`
                : `${l.step}. Walk about ${l.distanceM}m (~${l.minutes} min).`;
        }
        if (l.type === 'jeep') {
            return isTl
                ? `${l.step}. Sumakay sa ${boardOf(l, true)} ng jeep na ${l.routeName}${l.signboard ? ` (signboard: "${l.signboard}")` : ''}, at bumaba sa ${l.alight}. Pamasahe: ₱${l.fare.toFixed(2)} (₱${l.fareDiscounted.toFixed(2)} student/senior/PWD), mga ${l.minutes} minuto.`
                : `${l.step}. Board at ${l.board} on the ${l.routeName} jeep${l.signboard ? ` (signboard: "${l.signboard}")` : ''}, and alight at ${l.alight}. Fare: ₱${l.fare.toFixed(2)} (₱${l.fareDiscounted.toFixed(2)} student/senior/PWD), ~${l.minutes} minutes.`;
        }
        if (l.type === 'tricycle') {
            return isTl
                ? `${l.step}. ${l.instruction_tl} (${l.fareNote}).`
                : `${l.step}. ${l.instruction_en} (${l.fareNote}).`;
        }
        return `${l.step}. ${l.instruction_tl || l.instruction_en}`;
    });

    const discountNote = isTl
        ? `May 20% discount para sa student, senior citizen, at PWD: ₱${summary.totalFareDiscounted.toFixed(2)} sa jeep.`
        : `Student, senior citizen, and PWD discount: ₱${summary.totalFareDiscounted.toFixed(2)} for the jeepney fare.`;

    const fareEstimateWarning = isTl
        ? `Paalala: Ang pamasahe sa jeep ay tantiya base sa LTFRB fare guide.`
        : `Note: Jeepney fares are estimates based on the LTFRB fare guide.`;

    let suggestedTerminalsNote = null;
    if (planRes.suggestedTerminals && planRes.suggestedTerminals.length > 1) {
        const termHeader = isTl
            ? 'Iba pang suggested terminal para sa biyaheng ito:'
            : 'Other suggested terminal choices for this trip:';
        const termItems = planRes.suggestedTerminals.map(t => {
            const tName = (isTl && t.name_tl) ? t.name_tl : t.name;
            const rec = t.recommended ? (isTl ? ' (Pinakamabilis)' : ' (Recommended)') : '';
            return `• ${tName}${rec} – mga ${t.totalMin} min, ₱${t.fare.toFixed(2)}`;
        }).join('\n');
        suggestedTerminalsNote = `${termHeader}\n${termItems}`;
    }

    const outsideNote = isTl ? outsideNote_tl : outsideNote_en;

    const parts = [
        summaryLine,
        '',
        ...stepLines,
        '',
        discountNote,
        fareEstimateWarning
    ];

    if (suggestedTerminalsNote) {
        parts.push('');
        parts.push(suggestedTerminalsNote);
    }

    if (outsideNote) {
        parts.push(outsideNote);
    }

    return parts.join('\n');
}

// ── Follow-ups on the last trip (conversation memory) ──────────────────
// Other words people use for the boarding terminals in a terminal choice
const TERMINAL_WORDS = {
    'crossing-grand-terminal': ['crossing grand terminal', 'crossing grand', 'crossing terminal', 'grand terminal', 'cgt', 'crossing'],
    'calamba-tagaytay-terminal': ['inner rd terminal', 'inner road', 'inner rd', 'calamba tagaytay', 'tagaytay terminal', 'tagaytay'],
    'sm-transport-terminal': ['sm city calamba transport terminal', 'sm transport terminal', 'sm transport', 'transport terminal'],
    'new-calamba-transport-terminal': ['new calamba transport terminal', 'new calamba transport', 'new calamba', 'phils corp', 'phils', 'cmc', 'calamba medical']
};

// The terminal of the last trip's choices that the message names, or null
function pickedTerminal(text, choices) {
    if (!Array.isArray(choices) || choices.length < 2) return null;
    const has = (w) => ` ${text} `.includes(` ${w} `);
    const hits = choices.filter(c => has(norm(c.name)) || (TERMINAL_WORDS[c.stopId] || []).some(has));
    if (hits.length === 1) return hits[0];
    // Plain "SM": fine when only one of the choices is at SM
    if (!hits.length && has('sm')) {
        const sm = choices.filter(c => /\bsm\b/.test(norm(c.name)));
        if (sm.length === 1) return sm[0];
    }
    return null;
}

// Short recap of a trip, from the plan itself (never from the model)
function tripRecap(trip, isTl) {
    const o = (trip.origin && trip.origin.name) || 'Origin';
    const d = (trip.destination && trip.destination.name) || 'Destination';
    const s = trip.summary || {};
    if (trip.isWalkOnly) {
        return isTl
            ? `Lakad lang ang biyaheng ${o} papuntang ${d}: mga ${s.walkingDistanceM} m, ~${s.totalMinutes} min, walang pamasahe.`
            : `The trip from ${o} to ${d} is a walk: about ${s.walkingDistanceM} m, ~${s.totalMinutes} min, no fare.`;
    }
    const jeeps = (trip.legs || []).filter(l => l.type === 'jeep');
    const board = jeeps[0] ? boardOf(jeeps[0], isTl) : null;
    const lines = [isTl
        ? `Mula ${o} papuntang ${d}: ₱${Number(s.totalFare).toFixed(2)} (₱${Number(s.totalFareDiscounted).toFixed(2)} student/senior/PWD), mga ${s.totalMinutes} minuto, ${s.transfers} transfer${board ? `, sasakay sa ${board}` : ''}.`
        : `From ${o} to ${d}: ₱${Number(s.totalFare).toFixed(2)} (₱${Number(s.totalFareDiscounted).toFixed(2)} student/senior/PWD), about ${s.totalMinutes} minutes, ${s.transfers} transfer${s.transfers === 1 ? '' : 's'}${board ? `, boarding at ${board}` : ''}.`];
    if (Array.isArray(trip.suggestedTerminals) && trip.suggestedTerminals.length > 1) {
        lines.push(isTl ? 'Mga terminal na puwedeng sakayan:' : 'Terminals you can board at:');
        for (const t of trip.suggestedTerminals) {
            const rec = t.recommended ? (isTl ? ' (Pinakamabilis)' : ' (Recommended)') : '';
            lines.push(`• ${(isTl && t.name_tl) ? t.name_tl : t.name}${rec} – ${isTl ? 'mga' : 'about'} ${t.totalMin} min, ₱${Number(t.fare).toFixed(2)}`);
        }
    }
    lines.push(isTl
        ? 'Tantiya ang pamasahe base sa LTFRB fare guide, at tantiya rin ang oras.'
        : 'Fares are estimates based on the LTFRB fare guide, and times are estimates too.');
    return lines.join('\n');
}

// Why the recommended terminal: compares the walk and the jeep ride of every choice, from the plan itself
const WHY_WORD_RE = /\b(?:bakit|why|how come)\b/;
const WHY_FILLER = new Set(('bakit why how come again ulit nga po ba naman ganun ganon ganyan yun iyon yan iyan is it that the this one ' +
    'mas mabilis faster fastest pinakamabilis recommended recommend naka ang yung sa si terminal terminals dun doon duon eh e pero but so ' +
    'ito siya sya better maganda kesa kaysa than choose chose pinili piliin mo you did ka ko ako i should dito there doon diyan dyan ' +
    'sakayan sasakay sumakay board boarding at from mula galing kasi because ah oh hmm hindi di not instead halip').split(' '));

function isTerminalWhy(text, choices) {
    if (!WHY_WORD_RE.test(text) || !Array.isArray(choices) || choices.length < 2) return false;
    const words = text.split(' ');
    if (words.length > 12) return false;
    const terminalWords = new Set();
    for (const c of choices) {
        for (const w of norm(c.name).split(' ')) terminalWords.add(w);
        for (const alt of TERMINAL_WORDS[c.stopId] || []) for (const w of alt.split(' ')) terminalWords.add(w);
    }
    return words.every(w => WHY_FILLER.has(w) || terminalWords.has(w));
}

function terminalWhy(trip, isTl) {
    const list = trip.suggestedTerminals;
    const rec = list.find(t => t.recommended) || list[0];
    const name = (t) => (isTl && t.name_tl) ? t.name_tl : t.name;
    const fastest = list.every(t => rec.totalMin <= t.totalMin);
    const lines = [isTl
        ? `${fastest ? 'Pinakamabilis' : 'Naka-recommend'} ang ${name(rec)} para sa biyaheng ${trip.origin.name} papuntang ${trip.destination.name}: mga ${rec.totalMin} minuto mula pag-alis hanggang pagdating.`
        : `${name(rec)} is ${fastest ? 'the fastest' : 'the recommended terminal'} for the trip from ${trip.origin.name} to ${trip.destination.name}: about ${rec.totalMin} minutes door to door.`];
    for (const t of list) {
        if (t === rec) continue;
        const walk = t.tripWalkMin - rec.tripWalkMin;   // > 0: the recommended one walks less
        const ride = t.rideMin - rec.rideMin;           // > 0: the recommended one rides less
        const good = [], bad = [];
        const w = isTl ? `ang lakad (${rec.tripWalkMin} vs ${t.tripWalkMin} min)` : `walk (${rec.tripWalkMin} vs ${t.tripWalkMin} min)`;
        const r = isTl ? `ang biyahe sa jeep (${rec.rideMin} vs ${t.rideMin} min)` : `jeepney ride (${rec.rideMin} vs ${t.rideMin} min)`;
        if (walk > 0) good.push(w); else if (walk < 0) bad.push(w);
        if (ride > 0) good.push(r); else if (ride < 0) bad.push(r);
        let line = isTl ? `Kumpara sa ${name(t)} (mga ${t.totalMin} min): ` : `Compared with ${name(t)} (about ${t.totalMin} min): `;
        if (isTl) {
            if (good.length) line += `mas maikli ${good.join(' at ')}`;
            if (good.length && bad.length) line += `, kahit mas mahaba ${bad.join(' at ')}`;
            else if (!good.length && bad.length) line += `mas mahaba ${bad.join(' at ')}, pero mas mababa ang kabuuang tantiya`;
            else if (!good.length) line += 'halos pareho ang lakad at biyahe';
        } else {
            if (good.length) line += `a shorter ${good.join(' and a shorter ')}`;
            if (good.length && bad.length) line += `, even though the ${bad.join(' and the ')} ${bad.length > 1 ? 'are' : 'is'} longer`;
            else if (!good.length && bad.length) line += `a longer ${bad.join(' and a longer ')}, but a lower overall estimate`;
            else if (!good.length) line += 'about the same walk and ride';
        }
        if ((t.transfers || 0) !== (rec.transfers || 0)) {
            line += isTl ? `; ${rec.transfers} vs ${t.transfers} transfer` : `; ${rec.transfers} vs ${t.transfers} transfers`;
        }
        lines.push(line + '.');
    }
    const fares = [...new Set(list.map(t => Number(t.fare).toFixed(2)))];
    lines.push(fares.length === 1
        ? (isTl ? `Pareho ang pamasahe: ₱${fares[0]}.` : `The fare is the same: ₱${fares[0]}.`)
        : list.map(t => `${name(t)}: ₱${Number(t.fare).toFixed(2)}`).join(' · '));
    lines.push(isTl
        ? 'Kasama sa oras ng jeep ang paghihintay bago umalis. Tantiya ang mga oras at maliit ang diperensya, kaya puwede mong piliin ang mas maginhawa sa iyo.'
        : 'The jeep time includes the wait before it leaves. These are estimates and the difference is small, so pick whichever is easier for you.');
    return lines.join('\n');
}

// The last trip as facts for the model's system prompt (English; figures straight from the plan)
function tripFacts(trip) {
    if (!trip || !trip.success || !trip.origin || !trip.destination) return '';
    const s = trip.summary || {};
    if (trip.isWalkOnly) {
        return `Trip: ${trip.origin.name} to ${trip.destination.name}. Walk only: about ${s.walkingDistanceM} m, ~${s.totalMinutes} min, no fare.`;
    }
    const out = [`Trip: ${trip.origin.name} to ${trip.destination.name}. Fare ₱${Number(s.totalFare).toFixed(2)} regular, ₱${Number(s.totalFareDiscounted).toFixed(2)} student/senior/PWD. About ${s.totalMinutes} min, ${s.transfers} transfer(s).`];
    out.push('Steps:');
    for (const l of trip.legs || []) {
        if (l.type === 'walk') out.push(`${l.step}. Walk about ${l.distanceM} m (~${l.minutes} min).`);
        else if (l.type === 'jeep') out.push(`${l.step}. Jeepney "${l.routeName}"${l.signboard ? ` (signboard "${l.signboard}")` : ''} from ${l.board} to ${l.alight}, ~${l.minutes} min including the wait, ₱${Number(l.fare).toFixed(2)}.`);
    }
    if (Array.isArray(trip.suggestedTerminals) && trip.suggestedTerminals.length > 1) {
        const chosen = trip.chosenStopId;
        out.push('Terminals the commuter can board at for this trip (walk = all walking, jeep = time on the jeep incl. the wait):');
        for (const t of trip.suggestedTerminals) {
            const tags = [t.recommended ? 'recommended' : '', t.stopId === chosen ? 'the plan above uses this one' : ''].filter(Boolean).join(', ');
            out.push(`- ${t.name}${tags ? ` (${tags})` : ''}: total ${t.totalMin} min, walk ${t.tripWalkMin} min (${t.tripWalkM} m), jeep ${t.rideMin} min, ₱${Number(t.fare).toFixed(2)}`);
        }
        out.push('The recommended terminal has the lowest overall estimate (fare first, then time, transfers and walking).');
    }
    return out.join('\n');
}

const CONFIRM_RE = /^(?:(?:oh|ah|uh|hmm+|wow|weh|ows|eh)\s+)*(?:really|talaga|totoo|seryoso|sure|sure ka|sure ba|sigurado|sigurado ka|sigurado ba|tama|tama ba|tama ba yan|tama ba iyan|correct|is that right|is that correct|is that true|are you sure|legit|for real|di nga|hindi nga)(?:\s+(?:ba|po|ka|yan|iyan|yun|iyon|nga|kayo))*$/;
// Short questions about the last trip's time or fare ("ilang minuto?", "ilang minutes nga?", "magkano ulit?",
// "how long again?"): every word is a time/fare word or a filler word. Discount words are not here (own answer).
const TIME_WORDS = new Set('ilang ilan minuto minutos minutes minute mins min oras hours hour gaano katagal tagal kabilis gaano how long many eta travel time byahe biyahe trip ride takes take duration'.split(' '));
const FARE_WORDS = new Set('magkano how much pamasahe pasahe fare fares bayad babayaran presyo price cost total kabuuan lahat all in'.split(' '));
const SHORT_FILLER = new Set('eh e so and at nga ulit again po ba yan iyan yun iyon ang the is it will does nun noon naman ulit pala ulitin repeat one more time lang only exactly mga about sa ng ito this that kaya kasi okay ok'.split(' '));
function shortAsk(text) {
    const words = text.split(' ').filter(Boolean);
    if (!words.length || words.length > 8) return null;
    let time = false, fare = false;
    for (const w of words) {
        if (TIME_WORDS.has(w)) time = true;
        else if (FARE_WORDS.has(w)) fare = true;
        else if (!SHORT_FILLER.has(w)) return null;
    }
    if (time && words.every(w => !TIME_WORDS.has(w) || ['how', 'many', 'gaano', 'ilang', 'ilan', 'time', 'trip', 'byahe', 'biyahe', 'take', 'takes'].includes(w))
        && !words.some(w => ['minuto', 'minutos', 'minutes', 'minute', 'mins', 'min', 'oras', 'hours', 'hour', 'katagal', 'tagal', 'kabilis', 'long', 'eta', 'duration'].includes(w))) {
        time = false; // "how many?", "ilang biyahe?" alone are not about the time
    }
    if (!time && !fare) return null;
    return { time, fare };
}

// One-line answers about the last trip (for follow-ups; the full route was already given)
function tripTimeLine(trip, isTl) {
    const s = trip.summary || {};
    const jeepMin = (trip.legs || []).filter(l => l.type === 'jeep').reduce((n, l) => n + (l.minutes || 0), 0);
    const walkMin = (trip.legs || []).filter(l => l.type === 'walk').reduce((n, l) => n + (l.minutes || 0), 0);
    const parts = trip.isWalkOnly ? '' : (isTl
        ? ` (${jeepMin} min sa jeep, kasama ang paghihintay${walkMin ? `, at ${walkMin} min na lakad` : ''})`
        : ` (${jeepMin} min on the jeep, including the wait${walkMin ? `, and ${walkMin} min walking` : ''})`);
    const jeeps = (trip.legs || []).filter(l => l.type === 'jeep');
    const pickedBoard = Array.isArray(trip.suggestedTerminals) && trip.suggestedTerminals.length > 1 && jeeps[0] ? jeeps[0].board : null;
    const via = pickedBoard ? (isTl ? `, kung sa ${pickedBoard} sasakay` : `, boarding at ${pickedBoard}`) : '';
    return isTl
        ? `Mga ${s.totalMinutes} minuto mula ${trip.origin.name} papuntang ${trip.destination.name}${via}${parts}.`
        : `About ${s.totalMinutes} minutes from ${trip.origin.name} to ${trip.destination.name}${via}${parts}.`;
}
function tripFareLine(trip, isTl) {
    const s = trip.summary || {};
    if (trip.isWalkOnly) return isTl ? `Walang pamasahe: lakad lang ang biyaheng ito.` : `No fare: this trip is a walk.`;
    return isTl
        ? `₱${Number(s.totalFare).toFixed(2)} ang pamasahe (₱${Number(s.totalFareDiscounted).toFixed(2)} kung student, senior, o PWD). Tantiya ito base sa LTFRB fare guide.`
        : `The fare is ₱${Number(s.totalFare).toFixed(2)} (₱${Number(s.totalFareDiscounted).toFixed(2)} for students, seniors and PWDs). It is an estimate based on the LTFRB fare guide.`;
}
// The other terminals in one line ("Puwede ring sumakay sa X (mga 25 min)")
function otherTerminalsLine(trip, isTl) {
    const others = (trip.suggestedTerminals || []).filter(t => t.stopId !== trip.chosenStopId);
    if (!others.length || !Array.isArray(trip.suggestedTerminals) || trip.suggestedTerminals.length < 2) return '';
    const list = others.map(t => `${(isTl && t.name_tl) ? t.name_tl : t.name} (${isTl ? 'mga' : 'about'} ${t.totalMin} min)`).join(isTl ? ' o ' : ' or ');
    return isTl ? `Puwede ring sumakay sa ${list}.` : `You can also board at ${list}.`;
}
// "saan ako sasakay?", "anong jeep sasakyan ko?", "where do I get off?" (short, about the trip just given; not a new trip)
const BOARD_ASK_RE = /\b(?:(?:saan|san|where)\b.*\b(?:sasakay|sakay|sumakay|sakayan|board|ride|get on|catch)|(?:anong|ano ang|aling|which|what) (?:jeep|jeepney|sasakyan|sakay|signboard|route|ruta))\b/;
const ALIGHT_ASK_RE = /\b(?:saan|san|where|kailan|when)\b.*\b(?:bababa|baba|bumaba|babaan|get off|alight|drop off|stop)\b/;
function rideAsk(text, rawMessage) {
    if (text.split(' ').length > 10) return null;
    if (/\b(?:papunta|papuntang|patungo|going to|hanggang|mula|galing|from)\b|\bto\b/.test(text) || extractOriginAndDestination(rawMessage)) return null;
    const board = BOARD_ASK_RE.test(text), alight = ALIGHT_ASK_RE.test(text);
    return board || alight ? { board, alight } : null;
}
function tripRideLine(trip, isTl, ask) {
    if (trip.isWalkOnly) return isTl ? `Lakad lang po ang biyaheng ito, walang jeep na sasakyan. ${tripTimeLine(trip, isTl)}` : `This trip is a walk, with no jeep to ride. ${tripTimeLine(trip, isTl)}`;
    const jeeps = (trip.legs || []).filter(l => l.type === 'jeep');
    if (!jeeps.length) return tripShortRecap(trip, isTl);
    const sign = (l) => (l.signboard ? ` (signboard: "${l.signboard}")` : '');
    const lines = [];
    if (ask.board) {
        jeeps.forEach((l, i) => lines.push(isTl
            ? `${i ? 'Tapos lumipat: s' : 'S'}umakay sa ${boardOf(l, true)} ng jeep na ${l.routeName}${sign(l)}.`
            : `${i ? 'Then transfer: b' : 'B'}oard at ${boardOf(l, false)}, the ${l.routeName} jeep${sign(l)}.`));
        const other = otherTerminalsLine(trip, isTl);
        if (other) lines.push(other);
    }
    if (ask.alight) {
        const last = jeeps[jeeps.length - 1];
        const legs = trip.legs || [];
        const end = legs[legs.length - 1];
        const walk = end && end.type === 'walk' && end.distanceM ? end : null;
        // "Bumaba sa Chicken Joo – Halang; 33m na lakad na lang mula roon" (no "papuntang Chicken Joo" twice)
        const sameStop = norm(last.alight) === norm(trip.destination.name);
        lines.push(isTl
            ? `Bumaba sa ${last.alight}${walk ? (sameStop ? `; mga ${walk.distanceM}m (~${walk.minutes} min) na lakad na lang mula roon` : `, tapos maglakad nang mga ${walk.distanceM}m (~${walk.minutes} min) papuntang ${trip.destination.name}`) : ''}.`
            : `Get off at ${last.alight}${walk ? (sameStop ? `; it is a ${walk.distanceM}m (~${walk.minutes} min) walk from there` : `, then walk about ${walk.distanceM}m (~${walk.minutes} min) to ${trip.destination.name}`) : ''}.`);
    }
    return lines.join(' ');
}

// A short confirmation of the trip: fare, time, where to board, the other terminals
function tripShortRecap(trip, isTl) {
    const s = trip.summary || {};
    if (trip.isWalkOnly) return tripTimeLine(trip, isTl) + ' ' + tripFareLine(trip, isTl);
    const jeeps = (trip.legs || []).filter(l => l.type === 'jeep');
    const board = jeeps[0] ? boardOf(jeeps[0], isTl) : null;
    const line = isTl
        ? `Mula ${trip.origin.name} papuntang ${trip.destination.name}: ₱${Number(s.totalFare).toFixed(2)}, mga ${s.totalMinutes} minuto${board ? `, sasakay sa ${board}` : ''}.`
        : `From ${trip.origin.name} to ${trip.destination.name}: ₱${Number(s.totalFare).toFixed(2)}, about ${s.totalMinutes} minutes${board ? `, boarding at ${board}` : ''}.`;
    const other = otherTerminalsLine(trip, isTl);
    return other ? `${line} ${other}` : line;
}

// ── Follow-Up Handler ──────────────────────────────────────────────────
// opts.lastType: what Routie's previous answer was ('trip' when it was this trip). The recap, time, fare and
// terminal follow-ups only answer right after the trip, so "talaga?" after an FAQ is not taken as being about the trip.
function handleFollowUp(rawMessage, lastTrip, places = [], lang = 'tl', opts = {}) {
    if (!lastTrip) return null;
    const isTl = lang === 'tl';
    const text = norm(rawMessage);
    const afterTrip = opts.lastType === 'trip' && lastTrip.success !== false && !!lastTrip.summary;

    // 0. "eh kung sa Crossing?", "what about from SM Transport Terminal?": the same trip, boarding at another terminal
    // Not when the message is a new trip ("mula SM papuntang Real") or asks why/what about a terminal
    const switchesTerminal = text.split(' ').length <= 12
        && !/\b(?:bakit|why|ano|what is|whats|where is|saan|nasaan|tricycle|trike|taxi|grab|angkas|motor)\b/.test(text)
        && !/\b(?:papunta|papuntang|going to|hanggang)\b|\bto\b/.test(text)
        && !extractOriginAndDestination(rawMessage);
    if (afterTrip && lastTrip.origin && lastTrip.destination && switchesTerminal) {
        const pick = pickedTerminal(text, lastTrip.suggestedTerminals);
        if (pick) {
            const plan = plan_route(lastTrip.origin, lastTrip.destination, { places, boardStopId: pick.stopId });
            if (plan && plan.success && plan.chosenStopId === pick.stopId) {
                const name = (isTl && pick.name_tl) ? pick.name_tl : pick.name;
                return {
                    type: 'terminal_pick',
                    planResult: plan,
                    reply: `${isTl ? `Kung sa ${name} ka sasakay:` : `If you board at ${name}:`}\n${formatRouteReply(plan, lang)}`
                };
            }
        }
    }

    // 0a. "bakit?", "why is SM faster?", "again, why?" right after a trip with a terminal choice: compare them
    if (afterTrip && isTerminalWhy(text, lastTrip.suggestedTerminals)) {
        return { type: 'terminal_why', reply: terminalWhy(lastTrip, isTl) };
    }

    // 0b. "oh, really?", "talaga?", "sure ka?" right after the trip: confirm it from the plan
    if (afterTrip && CONFIRM_RE.test(text)) {
        return {
            type: 'trip_confirm',
            reply: `${isTl ? 'Oo po, base sa data ng Calzada.' : 'Yes, based on Calzada\'s data.'} ${tripShortRecap(lastTrip, isTl)}`
        };
    }

    // 0c. "ilang minuto?", "ilang minutes nga?", "magkano ulit?", "how long?": just that, in one line
    const ask = afterTrip ? shortAsk(text) : null;
    if (ask) {
        const lines = [];
        if (ask.time) lines.push(tripTimeLine(lastTrip, isTl));
        if (ask.fare) lines.push(tripFareLine(lastTrip, isTl));
        return { type: 'trip_recap', reply: lines.join(' ') };
    }

    // 0d. "saan ako sasakay?", "anong jeep?", "saan bababa?", "where do I get off?": the ride part only, in a line or two
    const ride = afterTrip ? rideAsk(text, rawMessage) : null;
    if (ride) {
        return { type: 'trip_ride', reply: tripRideLine(lastTrip, isTl, ride) };
    }

    // 1. "how about going back?", "pabalik?", "reverse?", "pauwi?"
    const isReverse = /\b(going back|go back|pabalik|reverse|pauwi|pabalik naman|balik)\b/i.test(text);
    if (isReverse) {
        const newOrigin = lastTrip.destination;
        const newDest = lastTrip.origin;
        const revPlan = plan_route(newOrigin, newDest, { places });
        return {
            type: 'reverse_trip',
            planResult: revPlan,
            reply: formatRouteReply(revPlan, lang)
        };
    }

    // 2. "what if student ako?", "magkano kung student?", "senior?", "pwd?", "discount?"
    const isStudent = /\b(student|estudyante|senior|pwd|diskwento|discount)\b/i.test(text);
    if (isStudent && lastTrip.summary) {
        const regFare = lastTrip.summary.totalFare;
        const discFare = lastTrip.summary.totalFareDiscounted;
        const origName = lastTrip.origin.name || 'Origin';
        const destName = lastTrip.destination.name || 'Destination';

        // A walk-only trip has no fare, so there is no discount to compute
        if (lastTrip.isWalkOnly) {
            return {
                type: 'student_discount',
                reply: isTl
                    ? `Lakad lang ang biyaheng ${origName} papuntang ${destName}, kaya walang pamasahe. Ang 20% discount ng student, senior citizen, at PWD ay para sa pamasahe sa jeep.`
                    : `The trip from ${origName} to ${destName} is a walk, so there is no fare. The 20% student, senior citizen, and PWD discount applies to jeepney fares.`
            };
        }

        const reply = isTl
            ? `Kung student, senior citizen, o PWD ka po, may 20% discount base sa LTFRB fare guide:
Ang pamasahe para sa biyaheng ${origName} papuntang ${destName} ay magiging ₱${discFare.toFixed(2)} (mula sa ₱${regFare.toFixed(2)} regular fare sa jeep). Tantiya po ito base sa opisyal na fare guide.`
            : `If you are a student, senior citizen, or PWD, you are entitled to a 20% discount based on the LTFRB fare guide:
The jeepney fare from ${origName} to ${destName} will be ₱${discFare.toFixed(2)} (instead of the ₱${regFare.toFixed(2)} regular fare). Fares are estimates based on the official fare guide.`;

        return {
            type: 'student_discount',
            reply
        };
    }

    // 3. "what if I take a tricycle?", "paano kung mag-tricycle?"
    const isTricycle = /\b(tricycle|trike|mag tricycle|mag-tricycle)\b/i.test(text);
    // "magkano ang tricycle mula SM?" names its own places: not about the last trip (the FAQ answers it)
    const namesPlaces = /\b(?:mula|galing|from|papunta|papuntang|hanggang|going to)\b|\bto\s+\w/.test(text);
    if (isTricycle && afterTrip && !namesPlaces && lastTrip.origin && lastTrip.destination) {
        const origName = lastTrip.origin.name;
        const destName = lastTrip.destination.name;

        // Calzada has no tricycle fares (jeepney and walking only): never quote a number here.
        const reply = isTl
            ? `Jeep at paglalakad lang ang sakop ng Calzada, kaya wala akong pamasahe ng tricycle mula ${origName} papuntang ${destName}. Maaaring iba-iba ang pamasahe sa tricycle depende sa ruta, kaya magtanong muna sa drayber bago sumakay.`
            : `Calzada covers jeepney rides and walking only, so I don't have a tricycle fare from ${origName} to ${destName}. Tricycle fares can differ per route, so please ask the driver before you ride.`;

        return {
            type: 'tricycle_inquiry',
            reply
        };
    }

    return null;
}

module.exports = {
    plan_route,
    resolvePlace,
    extractOriginAndDestination,
    formatRouteReply,
    handleFollowUp,
    tripRecap,
    tripShortRecap,
    tripTimeLine,
    tripFareLine,
    tripFacts,
    terminalWhy,
    CONFIRM_RE,
    KNOWN_TERMINALS,
    KNOWN_AREAS,
    AMBIGUOUS_TARGETS
};
