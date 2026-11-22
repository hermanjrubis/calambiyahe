#!/usr/bin/env node
/**
 * scripts/test-routie-trips.mjs — Routie's trip answers, checked against the Planner (Nov 22, 2026).
 *
 *   node scripts/test-routie-trips.mjs            build the question set (scripts/routie-eval-trips.json) and run it
 *   node scripts/test-routie-trips.mjs --verbose  also print every failing reply
 *
 * The set is made from the data, the same every run (fixed seed), about 600 questions in English, Tagalog and
 * Taglish, with the short names and small typos people use:
 *   • trips inside Calzada's area (Brgy. Uno, Real, Halang): Routie must find both places and give the Planner's
 *     pick — walk or ride, and for a ride the same fare and minutes (terminal choice: the recommended terminal;
 *     else the first option; under 800 m or with no faster jeep: a walk). Every jeep fare must match the LTFRB
 *     formula (fare-calc.js) for its distance.
 *   • trips that end outside the area (other barangays, the Poblacion, nearby towns): "not applicable";
 *   • trips that start outside the area within ~25 km: allowed (a route, or "no jeep in our data" + the Planner);
 *   • places too far (Manila, Makati …) as a start or an end: "not applicable";
 *   • unknown places: "not in Calzada's data", never a made-up route;
 *   • questions that name places but are not trips: not answered as a trip.
 * No AI model, network or Firestore is used.
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');

const quiet = (fn) => { const o = [console.log, console.error, console.warn]; console.log = console.error = console.warn = () => {}; try { return fn(); } finally { [console.log, console.error, console.warn] = o; } };
const knowledge = quiet(() => require(path.join(ROOT, 'server/routie-knowledge.js')));
const engine = require(path.join(ROOT, 'public/js/transit-engine.js'));
const fareCalc = require(path.join(ROOT, 'public/js/fare-calc.js'));
const fareData = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/jeepney-fares.json'), 'utf8'));
const tp = quiet(() => engine.createPlanner(JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/transit-routes.json'), 'utf8')), JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/barangays.json'), 'utf8'))));
const places = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/data/places.json'), 'utf8'));
const aliasDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/data/place-aliases.json'), 'utf8'));
const outsideDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/data/outside-places.json'), 'utf8'));

// Fixed-seed random (mulberry32)
let seed = 20261122;
const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const hav = (a, b) => { const R = 6371000, r = Math.PI / 180; const dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r; const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(s))); };

// How people write a place: one of its other names (not an ambiguous one, not a one-word squashed form)
const ambiguousAliases = new Set([...Object.keys(aliasDoc.ambiguous || {}), 'puregold', 'palengke', 'market', 'public market']);
function sayPlace(p) {
    const al = ((aliasDoc.places[p.slug] || {}).aliases || []).filter((a) => !ambiguousAliases.has(a) && (a.includes(' ') || a.length <= 8) && a.length >= 3);
    return al.length ? pick(al) : p.name;
}
// A small typo: one letter dropped in a word of 6+ letters
function typo(s) {
    const w = s.split(' ');
    const i = w.findIndex((x) => x.length >= 6 && /^[a-z]+$/i.test(x));
    if (i < 0) return s;
    const k = 2 + Math.floor(rnd() * (w[i].length - 3));
    w[i] = w[i].slice(0, k) + w[i].slice(k + 1);
    return w.join(' ');
}

const T_EN = ['{O} to {D}', 'from {O} to {D}', 'How do I get to {D} from {O}?', 'what if {O} to {D}', 'I want to go to {D}, I\'m from {O}', 'how much is the fare from {O} to {D}?', '{O} → {D}', 'I\'m at {O}, going to {D}', 'i want to go {D} and im from {O}', 'directions to {D} from {O}'];
const T_TL = ['paano pumunta sa {D} galing {O}?', 'galing {O} papuntang {D}', 'mula {O} hanggang {D}', '{O} papuntang {D} magkano?', 'nasa {O} ako, pupunta ako sa {D}', 'pa-{D} ako from {O}', 'saan sasakay papuntang {D} galing {O}?', 'magkano pamasahe mula {O} papuntang {D}?', 'punta ako {D} galing {O}', 'eh kung {O} papuntang {D}?'];
const fill = (t, o, d) => t.replace('{O}', o).replace('{D}', d);

// The Planner's pick for a trip (public/js/planner.js): walk, or the option it shows first
function plannerPick(o, d, destBarangay) {
    const straight = hav(o, d);
    if (straight < 800) return { walk: true };
    const tc = tp.terminalChoices(o, d, destBarangay);
    if (tc && tc.choices && tc.choices.length) { const c = tc.choices.find((x) => x.recommended) || tc.choices[0]; return { opt: c.option }; }
    const opts = tp.plan(o, d);
    if (opts.length) return { opt: opts[0] };
    return { walk: true };
}

const cases = [];
// 1. Trips inside the area
const inside = places.filter((p) => p.lat != null && p.lng != null);
const pairs = new Set();
while (cases.length < 340) {
    const a = pick(inside), b = pick(inside);
    if (a.slug === b.slug || pairs.has(a.slug + '>' + b.slug)) continue;
    if (hav([a.lat, a.lng], [b.lat, b.lng]) < 300) continue;
    pairs.add(a.slug + '>' + b.slug);
    for (const tl of [false, true]) {
        let O = sayPlace(a), D = sayPlace(b);
        if (rnd() < 0.15) D = typo(D);
        if (rnd() < 0.5) { O = O.toLowerCase(); D = D.toLowerCase(); }
        cases.push({ kind: 'inside', lang: tl ? 'tl' : 'en', q: fill(pick(tl ? T_TL : T_EN), O, D), origin: a.slug, dest: b.slug });
    }
}
// An outside place as people write it ("brgy Punta" for names that are also everyday words)
function sayOutside(p) {
    const ok = p.aliases.filter((x) => !p.needsCue || /^(?:brgy|barangay) /.test(x) || x.includes(' '));
    return ok.length ? pick(ok) : (p.kind === 'barangay' ? `brgy ${p.aliases[0]}` : p.aliases[0]);
}
// 2. Trips that end outside the area
const outsideNear = outsideDoc.places.filter((p) => p.kind !== 'far');
for (const p of outsideNear) {
    const from = pick(inside);
    const D = sayOutside(p);
    cases.push({ kind: 'outside_dest', lang: 'en', q: fill(pick(['from {O} to {D}', '{O} to {D}', 'how do I get to {D} from {O}?']), sayPlace(from), D), outsideName: p.name });
    cases.push({ kind: 'outside_dest', lang: 'tl', q: fill(pick(['galing {O} papuntang {D}', 'paano pumunta sa {D} mula {O}?', 'mula {O} hanggang {D}']), sayPlace(from), D), outsideName: p.name });
}
// 3. Trips that start outside the area (within ~25 km): allowed
for (const p of outsideNear.filter((x) => x.coords)) {
    const to = pick(inside);
    const O = sayOutside(p);
    const tl = rnd() < 0.5;
    cases.push({ kind: 'outside_origin', lang: tl ? 'tl' : 'en', q: fill(pick(tl ? ['galing {O} papuntang {D}', 'paano pumunta sa {D} galing {O}?', 'mula {O} hanggang {D}'] : ['from {O} to {D}', 'How do I get to {D} from {O}?', '{O} to {D}']), O, sayPlace(to)), originName: p.name, dest: to.slug });
}
// 4. Too far, as a start or an end
const far = outsideDoc.places.filter((p) => p.kind === 'far' && !p.needsCue);
for (const p of far) {
    const x = sayPlace(pick(inside));
    cases.push({ kind: 'far', lang: 'en', q: rnd() < 0.5 ? `from ${p.aliases[0]} to ${x}` : `${x} to ${p.aliases[0]}` });
    cases.push({ kind: 'far', lang: 'tl', q: rnd() < 0.5 ? `galing ${p.aliases[0]} papuntang ${x}` : `paano pumunta sa ${p.aliases[0]} mula ${x}?` });
}
// 5. Places nobody has in the data
const UNKNOWN = ['Bahay ni Lola Iska', 'Tokyo Grill', 'Starbucks Real', 'Robinsons Calamba', 'Waltermart Calamba', 'Mang Pedro Lugawan', 'Puregold Paliparan', 'Shell Halang Station 2', 'Calamba Doctors Hospital', 'Jollibee Paseo'];
for (const u of UNKNOWN) {
    const x = sayPlace(pick(inside));
    cases.push({ kind: 'unknown', lang: 'en', q: `from ${x} to ${u}`, unknown: u });
    cases.push({ kind: 'unknown', lang: 'tl', q: `galing ${x} papuntang ${u}`, unknown: u });
}
// 6. Questions that name places but are not trips
const NOT_TRIPS = ['saan ang LBC sa Crossing?', 'anong oras bukas ng SM?', 'may Jollibee ba sa Real?', 'sakop ba ang Canlubang?', 'what time does STI close?', 'where is Chicken Joo?', 'saan ang City Hall?', 'is Tara Kape open now?', 'may kainan ba malapit sa SM?', 'ano ang address ng Calamba Medical Center?', 'saan sakayan papuntang Sta. Rosa?', 'what are the hours of JLT Fashion Boutique?', 'ilan ang terminal sa SM?', 'may parking ba sa SM City Calamba?', 'what is near STI Calamba?', 'magkano ang pamasahe sa jeep?', 'how much is the minimum fare?', 'magkano ang 5 km?', 'saan ang Puregold Halang?', 'may bangko ba sa Crossing?'];
for (const q of NOT_TRIPS) cases.push({ kind: 'not_trip', lang: /[?]$/.test(q) && /\b(saan|anong|may|ano|ilan|magkano|sakop)\b/i.test(q) ? 'tl' : 'en', q });

fs.writeFileSync(path.join(ROOT, 'scripts/routie-eval-trips.json'), JSON.stringify({
    about: 'Generated by scripts/test-routie-trips.mjs (fixed seed) from places.json, place-aliases.json and outside-places.json. Do not edit by hand; edit the generator.',
    generated: '2026-11-22', count: cases.length, cases
}, null, 1) + '\n');

// ── Run ─────────────────────────────────────────────────────────────────────────────────────
const bySlug = new Map(places.map((p) => [p.slug, p]));
const NA = /not applicable|hindi applicable/i;
const tally = {};
const fails = [];
for (const c of cases) {
    const ctx = await quiet(() => knowledge.resolveRoutieContext({ message: c.q, places: null, adminDb: null }));
    const text = String(ctx.directReply || ctx.instruction || '');
    const pr = ctx.planResult;
    const why = [];
    if (c.kind === 'inside') {
        const a = bySlug.get(c.origin), b = bySlug.get(c.dest);
        if (ctx.type !== 'route_plan' || !pr) why.push(`type ${ctx.type}`);
        else {
            const oSlug = pr.origin && pr.origin.place && pr.origin.place.slug, dSlug = pr.destination && pr.destination.place && pr.destination.place.slug;
            if (dSlug !== c.dest) why.push(`destination ${pr.destination && pr.destination.name}, want ${b.name}`);
            if (oSlug !== c.origin) why.push(`origin ${pr.origin && pr.origin.name}, want ${a.name}`);
            if (!why.length) {
                const want = plannerPick([+a.lat, +a.lng], [+b.lat, +b.lng], b.barangay);
                if (!!want.walk !== !!pr.isWalkOnly) why.push(`${pr.isWalkOnly ? 'walk' : 'ride'}, Planner shows ${want.walk ? 'walk' : 'ride'}`);
                else if (!want.walk) {
                    if (Math.abs(pr.summary.totalFare - want.opt.fare) > 0.001) why.push(`fare ₱${pr.summary.totalFare}, Planner ₱${want.opt.fare}`);
                    if (pr.summary.totalMinutes !== want.opt.totalMin) why.push(`${pr.summary.totalMinutes} min, Planner ${want.opt.totalMin} min`);
                }
                for (const l of pr.legs || []) {
                    if (l.type !== 'jeep') continue;
                    const f = fareCalc.fares(l.distanceM / 1000, fareData);
                    if (Math.abs(f.regular - l.fare) > 0.001 || Math.abs(f.discounted - l.fareDiscounted) > 0.001) why.push(`jeep fare ₱${l.fare}/₱${l.fareDiscounted} vs LTFRB ₱${f.regular}/₱${f.discounted} for ${l.distanceM} m`);
                }
            }
        }
        if (/don.?t have route data|no route data|wala.*route data/i.test(text)) why.push('says no route data');
    } else if (c.kind === 'outside_dest' || c.kind === 'far') {
        if (ctx.type !== 'out_of_scope' || !NA.test(text)) why.push(`type ${ctx.type}: ${text.slice(0, 90)}`);
    } else if (c.kind === 'outside_origin') {
        if (NA.test(text) || ctx.type === 'out_of_scope') why.push(`refused a start outside the area: ${text.slice(0, 90)}`);
        else if (!['route_plan', 'route_not_found'].includes(ctx.type)) why.push(`type ${ctx.type}`);
        else if (pr && pr.destination && pr.destination.place && pr.destination.place.slug !== c.dest) why.push(`destination ${pr.destination.name}`);
        else if (ctx.type === 'route_not_found' && !(pr && (pr.reason === 'no_route' || pr.reason === 'origin_no_coords'))) why.push(`not found: ${pr && pr.reason}`);
    } else if (c.kind === 'unknown') {
        if (ctx.type === 'route_plan') why.push(`made a route to ${pr && pr.destination && pr.destination.name}`);
        else if (!new RegExp(c.unknown.split(' ')[0], 'i').test(text) && ctx.type !== 'not_in_data') why.push(`type ${ctx.type}: ${text.slice(0, 90)}`);
    } else if (c.kind === 'not_trip') {
        if (ctx.type === 'route_plan' || ctx.type === 'route_not_found') why.push(`answered as a trip (${ctx.type})`);
    }
    if (c.lang === 'tl' && ctx.lang && ctx.lang !== 'tl' && c.kind !== 'not_trip') why.push(`reply language ${ctx.lang}`);
    const t = (tally[c.kind] = tally[c.kind] || { n: 0, ok: 0 });
    t.n++;
    if (why.length) fails.push({ c, why, text }); else t.ok++;
}
for (const f of fails) {
    console.log(`FAIL [${f.c.kind}] ${JSON.stringify(f.c.q)}\n       ${f.why.join('; ')}`);
    if (VERBOSE) console.log(`       reply: ${f.text.replace(/\s+/g, ' ').slice(0, 300)}`);
}
const total = cases.length, ok = total - fails.length;
console.log(`\nTrip questions: ${ok}/${total} pass`);
console.log('By kind: ' + Object.entries(tally).map(([k, v]) => `${k} ${v.ok}/${v.n}`).join(' · '));
process.exit(fails.length ? 1 : 0);
