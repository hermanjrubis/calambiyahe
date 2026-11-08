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
        aliases: ['sm calamba inner rd terminal', 'sm inner rd terminal', 'sm calamba inner road terminal', 'sm inner road terminal', 'sm inner rd', 'sm inner road', 'calamba tagaytay terminal', 'tagaytay terminal', 'sm cinema terminal', 'sm west terminal', 'terminal papuntang real', 'sm real terminal', 'sakayan papuntang real'],
        barangay: 'Uno',
        coords: [14.2032625, 121.1547031],
        note: 'SM City Calamba inner road / bypass road by SM Cinema. Terminal papuntang Real (jeeps to Tagaytay and Tanauan via Real).'
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
    'real': { name: 'Brgy. Real, Calamba', coords: [14.201, 121.148], barangay: 'Real' },
    'halang': { name: 'Brgy. Halang, Calamba', coords: [14.192, 121.166], barangay: 'Halang' },
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
    'tagaytay': { name: 'Tagaytay', coords: [14.115, 120.962], barangay: 'Tagaytay', outsideCalamba: true },
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
function resolvePlace(rawQuery, places = []) {
    if (!rawQuery) return null;
    const cleanQ = cleanPlaceQuery(rawQuery);
    const nq = norm(cleanQ);
    if (!nq) return null;

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
function extractOriginAndDestination(text) {
    let raw = String(text || '').trim();
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
    if (transitPlanner) {
        // Destination terminal choices (e.g. Real or Halang)
        const destBarangay = destResolved.barangay || (destResolved.place && destResolved.place.barangay);
        const tc = transitPlanner.terminalChoices(originResolved.coords, destResolved.coords, destBarangay);
        if (tc && tc.choices && tc.choices.length > 0) {
            planOption = tc.choices[0].option;
            suggestedTerminals = tc.choices.map(c => ({
                stopId: c.stopId,
                name: c.name,
                name_tl: c.name_tl || c.name,
                recommended: !!c.recommended,
                fare: c.option.fare,
                totalMin: c.option.totalMin,
                walkMin: c.walkMin
            }));
        }
    }

    // Short trips: under 800m straight-line distance without terminal choices -> walk only, no jeep
    if (!suggestedTerminals && originResolved.coords && destResolved.coords) {
        const straightDistM = haversineDistM(originResolved.coords, destResolved.coords);
        if (straightDistM < 800) {
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
                plannerUrl: `calzadaph.com/planner?origin=${encodeURIComponent(originResolved.name)}&dest=${encodeURIComponent(destResolved.name)}`
            };
        }
    }

    if (transitPlanner && !planOption) {
        const directOpts = transitPlanner.plan(originResolved.coords, destResolved.coords);
        if (directOpts && directOpts.length > 0) {
            planOption = directOpts[0];
        }
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
            const boardName = leg.board?.name || (originResolved.name.includes('SM') ? 'SM Transport Terminal' : 'Sakayan sa Highway');
            const alightName = leg.alight?.name || destResolved.name;
            const distM = Math.round(leg.distM || 0);
            const headsign = leg.headsign || '';
            // Only a recorded signboard (transit-routes.json); never the headsign or route name in its place
            const signboard = leg.signboard || null;

            formattedLegs.push({
                step: stepNum++,
                type: 'jeep',
                title: `Jeep: ${leg.routeName}`,
                instruction_tl: signboard ? `Sumakay sa ${boardName} ng jeep na may karatulang "${signboard}" papuntang ${alightName}.` : `Sumakay sa ${boardName} ng jeep na ${leg.routeName} papuntang ${alightName}.`,
                instruction_en: signboard ? `Board at ${boardName} on the "${signboard}" jeep towards ${alightName}.` : `Board at ${boardName} on the ${leg.routeName} jeep towards ${alightName}.`,
                routeName: leg.routeName,
                headsign,
                signboard,
                board: boardName,
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
        suggestedTerminals
    };
}

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
        return isTl
            ? `Maglakad nang humigit-kumulang ${dist} m (~${mins} min). Mas mainam maglakad para sa biyaheng ito.`
            : `Walk about ${dist} m (~${mins} min). Walking is better for this trip.`;
    }

    const { summary, legs, origin, destination, outsideNote_tl, outsideNote_en } = planRes;

    const summaryLine = isTl
        ? `Total: ₱${summary.totalFare.toFixed(2)}, around ${summary.totalMinutes} minutes, ${summary.transfers} transfer${summary.transfers === 1 ? '' : 's'}`
        : `Total: ₱${summary.totalFare.toFixed(2)}, around ${summary.totalMinutes} minutes, ${summary.transfers} transfer${summary.transfers === 1 ? '' : 's'}`;

    const stepLines = legs.map(l => {
        if (l.type === 'walk') {
            return isTl
                ? `${l.step}. Maglakad nang humigit-kumulang ${l.distanceM}m (~${l.minutes} min).`
                : `${l.step}. Walk about ${l.distanceM}m (~${l.minutes} min).`;
        }
        if (l.type === 'jeep') {
            return isTl
                ? `${l.step}. Sumakay sa ${l.board} ng jeep na ${l.routeName}${l.signboard ? ` (signboard: "${l.signboard}")` : ''}, at bumaba sa ${l.alight}. Pamasahe: ₱${l.fare.toFixed(2)} (₱${l.fareDiscounted.toFixed(2)} student/senior/PWD), mga ${l.minutes} minuto.`
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

// ── Follow-Up Handler ──────────────────────────────────────────────────
function handleFollowUp(rawMessage, lastTrip, places = [], lang = 'tl') {
    if (!lastTrip) return null;
    const isTl = lang === 'tl';
    const text = norm(rawMessage);

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
    if (isTricycle && lastTrip.origin && lastTrip.destination) {
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
    KNOWN_TERMINALS,
    KNOWN_AREAS,
    AMBIGUOUS_TARGETS
};
