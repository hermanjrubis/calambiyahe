#!/usr/bin/env node
/**
 * scripts/test-routie.mjs — checks Routie's answers without an AI model, network or Firestore.
 *
 *   node scripts/test-routie.mjs              run every case in scripts/routie-eval.json, then the data checks
 *   node scripts/test-routie.mjs --tag fare   only cases with that tag
 *   node scripts/test-routie.mjs --baseline   print the results but always exit 0 (to record the "before" score)
 *   node scripts/test-routie.mjs --verbose    also print the reply text of failing cases
 *
 * Each case goes to resolveRoutieContext({ message, places: null, adminDb: null }) and the returned context is
 * compared with "expect" (see the about field in routie-eval.json). Exit code 1 when a case or data check fails.
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const tagFilter = args.includes('--tag') ? args[args.indexOf('--tag') + 1] : null;
const BASELINE = args.includes('--baseline');
const VERBOSE = args.includes('--verbose');

// Quiet the modules' startup logs
const origLog = console.log, origErr = console.error, origWarn = console.warn;
console.log = console.error = console.warn = () => {};
const knowledge = require(path.join(ROOT, 'server/routie-knowledge.js'));
let extra = null;
try { extra = require(path.join(ROOT, 'server/routie-faqs-extra.js')); } catch (_) { /* not added yet */ }
console.log = origLog; console.error = origErr; console.warn = origWarn;

const places = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/data/places.json'), 'utf8'));
const bySlug = new Map(places.map((p) => [p.slug, p]));
const evalSet = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/routie-eval.json'), 'utf8'));
let aliasDoc = null;
try { aliasDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/data/place-aliases.json'), 'utf8')); } catch (_) { /* not added yet */ }

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const low = (s) => String(s || '').toLowerCase();

// ── Cases ───────────────────────────────────────────────────────────────────────────────────
const cases = evalSet.cases.filter((c) => !tagFilter || (c.tags || []).includes(tagFilter));
const results = [];
for (const c of cases) {
    const e = c.expect || {};
    const fails = [];
    let ctx;
    try {
        console.log = console.error = console.warn = () => {};
        ctx = await knowledge.resolveRoutieContext({ message: c.q, lang: c.lang, places: null, adminDb: null, history: [], lastTrip: null });
    } catch (err) {
        ctx = { type: 'ERROR', error: err.message };
    } finally {
        console.log = origLog; console.error = origErr; console.warn = origWarn;
    }
    const text = `${ctx.directReply || ''}\n${ctx.instruction || ''}`;
    const faqId = ctx.data && ctx.data.faq ? ctx.data.faq.id : null;

    const types = Array.isArray(e.type) ? e.type : (e.type ? [e.type] : []);
    if (types.length && !types.includes(ctx.type)) fails.push(`type ${ctx.type}${faqId ? ` (${faqId})` : ''}, want ${types.join('|')}`);
    if (e.faq && faqId !== e.faq) fails.push(`faq ${faqId || 'none'}, want ${e.faq}`);
    if (e.notFaq && faqId && e.notFaq.includes(faqId)) fails.push(`answered by faq ${faqId}`);
    if (e.lang && ctx.lang !== e.lang) fails.push(`lang ${ctx.lang}, want ${e.lang}`);
    if (e.place) {
        const want = bySlug.get(e.place);
        const got = ctx.data && ctx.data.name;
        if (!want) fails.push(`unknown slug ${e.place} in routie-eval.json`);
        else if (got !== want.name) fails.push(`place "${got || 'none'}", want "${want.name}"`);
    }
    for (const s of e.contains || []) if (!low(text).includes(low(s))) fails.push(`missing "${s}"`);
    for (const s of e.notContains || []) if (low(text).includes(low(s))) fails.push(`has "${s}"`);
    if (/\{[a-zA-Z]+\}/.test(text)) fails.push('unfilled {placeholder} in reply');
    results.push({ c, ctx, fails, text });
}

// ── Data checks ─────────────────────────────────────────────────────────────────────────────
const dataFails = [];
// Single words allowed as triggers: distinctive, never part of a place name or a normal route question
const SINGLE_WORD_OK = new Set(['tricycle', 'traysikel', 'trike', 'angkas', 'footbridge', 'signboard', 'karatula', 'dpo', 'gcash']);
// The FAQs Routie actually uses: through server/routie-dataset.js once it is added (trigger fixes applied),
// else the old FAQS plus FAQS_EXTRA as they are.
let allFaqs;
try {
    console.log = console.error = console.warn = () => {};
    const dataset = require(path.join(ROOT, 'server/routie-dataset.js'));
    allFaqs = dataset.allFaqs(knowledge.FAQS || []);
} catch (_) {
    allFaqs = [...(knowledge.FAQS || [])];
    if (extra && extra.FAQS_EXTRA) for (const f of extra.FAQS_EXTRA) if (!allFaqs.some((x) => x.id === f.id)) allFaqs.push(f);
} finally { console.log = origLog; console.error = origErr; console.warn = origWarn; }
for (const f of allFaqs) for (const lang of ['en', 'tl']) if (/\{[a-zA-Z]+\}/.test(String(f[lang] || ''))) dataFails.push(`FAQ ${f.id} (${lang}): unfilled {placeholder}`);

const aliasSet = new Map();
if (aliasDoc) {
    for (const [slug, r] of Object.entries(aliasDoc.places || {})) {
        if (!bySlug.has(slug)) dataFails.push(`place-aliases.json: unknown slug ${slug}`);
        for (const a of r.aliases || []) {
            if (aliasSet.has(a) && aliasSet.get(a) !== slug) dataFails.push(`place-aliases.json: "${a}" is listed for ${aliasSet.get(a)} and ${slug} (move it to ambiguous)`);
            aliasSet.set(a, slug);
            if (a !== norm(a)) dataFails.push(`place-aliases.json: "${a}" is not normalized`);
        }
    }
    for (const p of places) if (!aliasDoc.places[p.slug]) dataFails.push(`place-aliases.json: no entry for ${p.slug} (rebuild it)`);
    for (const [a, slugs] of Object.entries(aliasDoc.ambiguous || {})) {
        for (const s of slugs) if (!bySlug.has(s)) dataFails.push(`place-aliases.json ambiguous "${a}": unknown slug ${s}`);
        if (aliasSet.has(a)) dataFails.push(`place-aliases.json: "${a}" is both an alias and ambiguous`);
    }
}
const barangayWords = new Set(Object.keys(knowledge.CALAMBA_AREAS || {}));
const seenTrig = new Map();
for (const f of allFaqs) {
    for (const t of f.triggers || []) {
        const n = norm(t);
        const words = n.split(' ').filter(Boolean);
        if (words.length < 2 && !SINGLE_WORD_OK.has(n)) dataFails.push(`FAQ ${f.id}: single-word trigger "${t}"`);
        if (seenTrig.has(n) && seenTrig.get(n) !== f.id) dataFails.push(`FAQ trigger "${t}" is in ${seenTrig.get(n)} and ${f.id}`);
        seenTrig.set(n, f.id);
        if (aliasSet.has(n)) dataFails.push(`FAQ ${f.id}: trigger "${t}" is also a place alias (${aliasSet.get(n)})`);
        if (barangayWords.has(n)) dataFails.push(`FAQ ${f.id}: trigger "${t}" is a barangay/area name`);
    }
}
// Kinds of places (server/data/category-terms.json): every kind must match at least one place, and no word is used twice
try {
    const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/data/category-terms.json'), 'utf8'));
    const seenTerm = new Map();
    const note = (t, where) => { const n = norm(t); if (seenTerm.has(n) && seenTerm.get(n) !== where) dataFails.push(`category-terms.json: "${t}" is in ${seenTerm.get(n)} and ${where}`); seenTerm.set(n, where); };
    for (const [c, terms] of Object.entries(cat.categories || {})) {
        if (!places.some((p) => p.category === c)) dataFails.push(`category-terms.json: no place has category ${c}`);
        for (const t of terms) note(t, `category ${c}`);
    }
    for (const k of cat.kinds || []) {
        let re; try { re = new RegExp(k.namePattern, 'i'); } catch (_) { dataFails.push(`category-terms.json kind ${k.id}: bad namePattern`); continue; }
        const hits = places.filter((p) => (!k.cats || !k.cats.length || k.cats.includes(p.category)) && re.test(norm(p.name)));
        if (!hits.length) dataFails.push(`category-terms.json kind ${k.id}: no place matches "${k.namePattern}"`);
        for (const t of k.terms || []) note(t, `kind ${k.id}`);
    }
} catch (err) {
    if (err.code !== 'ENOENT') dataFails.push(`category-terms.json: ${err.message}`);
}
// Plan prices in the business_plans answer must match public/js/plans-config.js
try {
    const cfg = fs.readFileSync(path.join(ROOT, 'public/js/plans-config.js'), 'utf8');
    const prices = [...cfg.matchAll(/price:\s*(\d+)/g)].map((m) => m[1]);
    const bp = allFaqs.find((f) => f.id === 'business_plans');
    if (bp) for (const p of prices) for (const lang of ['en', 'tl']) if (!String(bp[lang]).includes(`₱${p}`)) dataFails.push(`FAQ business_plans (${lang}): ₱${p} from plans-config.js is missing`);
} catch (_) { /* plans-config.js not found */ }

// ── Report ──────────────────────────────────────────────────────────────────────────────────
const pass = results.filter((r) => !r.fails.length).length;
const byTag = {};
for (const r of results) for (const t of r.c.tags || ['untagged']) {
    byTag[t] = byTag[t] || { pass: 0, total: 0 };
    byTag[t].total++; if (!r.fails.length) byTag[t].pass++;
}
for (const r of results) {
    if (!r.fails.length) continue;
    console.log(`FAIL ${r.c.id.padEnd(4)} ${JSON.stringify(r.c.q)}\n       ${r.fails.join('; ')}`);
    if (VERBOSE) console.log('       reply: ' + r.text.replace(/\s+/g, ' ').slice(0, 240));
}
console.log('');
for (const f of dataFails) console.log(`DATA ${f}`);
console.log(`\nCases: ${pass}/${results.length} pass`);
console.log('By tag: ' + Object.entries(byTag).map(([t, v]) => `${t} ${v.pass}/${v.total}`).join(' · '));
console.log(`Data checks: ${dataFails.length ? dataFails.length + ' problem(s)' : 'ok'}`);
process.exit(BASELINE ? 0 : (pass === results.length && !dataFails.length ? 0 : 1));
