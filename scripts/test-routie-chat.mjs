#!/usr/bin/env node
/**
 * scripts/test-routie-chat.mjs — Routie's conversation memory and follow-up rewriting, without a real model,
 * network or Firestore.
 *
 *   node scripts/test-routie-chat.mjs            unit checks of server/routie-chat.js, then every conversation in
 *                                                scripts/routie-eval.json (conversations), each run twice:
 *                                                  warm = the server's session cache is kept between turns
 *                                                  cold = a new session cache every turn (cold start / another
 *                                                         server instance): only the context the widget sends back
 *   node scripts/test-routie-chat.mjs --verbose  also print the replies of failing turns
 *
 * The model is a stand-in: the rewrite call returns the turn's "rewrite" (or the message unchanged), the answer call
 * returns a fixed reply. What is checked is what reaches the model and what comes back to the widget.
 * Exit code 1 when anything fails.
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');

const quiet = (fn) => async (...a) => {
    const l = console.log, e = console.error, w = console.warn;
    console.log = console.error = console.warn = () => {};
    try { return await fn(...a); } finally { console.log = l; console.error = e; console.warn = w; }
};
const chat = await quiet(() => require(path.join(ROOT, 'server/routie-chat.js')))();
const places = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/data/places.json'), 'utf8'));
const evalSet = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/routie-eval.json'), 'utf8'));
const low = (s) => String(s || '').toLowerCase();

let failures = 0;
let checks = 0;
function check(name, ok, detail = '') {
    checks++;
    if (!ok) { failures++; console.log(`FAIL ${name}${detail ? `\n       ${detail}` : ''}`); }
}

// ── Unit checks ─────────────────────────────────────────────────────────────────────────────
{
    // History: both shapes, notices left out, the current message not sent twice, the limit kept
    const h = chat.normalizeHistory([
        { text: 'SM papuntang Real', isUser: true },
        { text: 'Total: ₱14.00 …', isUser: false },
        { text: 'Routie closed after 5 minutes', isUser: false, kind: 'system' },
        { role: 'user', text: '[ROUTE INFO]\nOrigin: A\n\nUser Message: talaga?' },
        { role: 'bogus', text: 'x' },
        { text: '   ', isUser: true },
        { text: 'bakit?', isUser: true }
    ], 'bakit?');
    check('history: shapes, notices, duplicate', JSON.stringify(h.map(t => [t.role, t.text])) ===
        JSON.stringify([['user', 'SM papuntang Real'], ['assistant', 'Total: ₱14.00 …'], ['user', 'talaga?']]), JSON.stringify(h));
    const many = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `m${i}` }));
    check('history: last 6 only', chat.normalizeHistory(many, 'x').length === chat.HISTORY_TURNS);
    const long = chat.normalizeHistory([{ role: 'assistant', text: 'a'.repeat(400) + 'MIDDLE' + 'z'.repeat(400) }], 'x')[0].text;
    check('history: long message keeps start and end', long.length <= 600 && long.startsWith('aaa') && long.endsWith('zzz') && !long.includes('MIDDLE'));
    check('history: not an array', chat.normalizeHistory('nope', 'x').length === 0);

    // Context from the widget is validated
    check('context: good', JSON.stringify(chat.readContext({ v: 1, lastType: 'trip', trip: { origin: 'SM City Calamba', dest: 'Jollibee', board: 'crossing-grand-terminal', destPin: [14.1955, 121.1435, 'Real'] } }))
        === JSON.stringify({ lastType: 'trip', trip: { origin: 'SM City Calamba', dest: 'Jollibee', board: 'crossing-grand-terminal', originPin: null, destPin: [14.1955, 121.1435, 'Real'] }, trips: [], place: null }));
    check('context: pin outside Calamba is dropped', chat.readContext({ v: 1, trip: { origin: 'A', dest: 'B', destPin: [10.3, 123.9] } }).trip.destPin === null);
    const ctxTrips = chat.readContext({ v: 1, trips: [{ origin: 'A', dest: 'B' }, { origin: 'x'.repeat(200), dest: 'C' }, 'junk', { origin: 'D', dest: 'E' }] }).trips;
    check('context: trip list kept, bad items dropped', JSON.stringify(ctxTrips) === JSON.stringify([{ origin: 'A', dest: 'B' }, { origin: 'D', dest: 'E' }]), JSON.stringify(ctxTrips));
    check('context: wrong version', chat.readContext({ v: 2, lastType: 'trip' }) === null);
    check('context: unknown type, bad board, long name', JSON.stringify(chat.readContext({ v: 1, lastType: 'admin', trip: { origin: 'x'.repeat(101), dest: 'B' } }))
        === JSON.stringify({ lastType: null, trip: null, trips: [], place: null }));
    check('context: bad board id is dropped', chat.readContext({ v: 1, trip: { origin: 'A', dest: 'B', board: '../x' } }).trip.board === null);
    check('context: not an object', chat.readContext('{"v":1}') === null);

    // When to rewrite
    const T = [{ role: 'user', text: 'SM papuntang Real' }, { role: 'assistant', text: 'Total…' }];
    const nr = (q, type, turns = T) => chat.needsRewrite(q, turns, { type });
    check('rewrite: "eh kung sa Crossing?"', nr('eh kung sa Crossing?', 'not_in_data'));
    check('rewrite: "magkano?" (general fare)', nr('magkano?', 'fare_info'));
    check('rewrite: "eh doon?"', nr('eh doon?', 'not_in_data'));
    check('rewrite: not without an earlier reply', !nr('eh kung sa Crossing?', 'not_in_data', [{ role: 'user', text: 'hi' }]));
    check('rewrite: not a full trip question', !nr('Crossing papuntang Jollibee Real', 'route_plan'));
    check('rewrite: not an FAQ', !nr('is Calzada free?', 'faq'));
    check('rewrite: not "talaga?"', !nr('talaga?', 'not_in_data'));
    check('rewrite: not out of scope', !nr('eh sa Batangas?', 'out_of_scope'));
    check('rewrite: not a long message', !nr('eh ' + 'salita '.repeat(20), 'not_in_data'));

    // Reading the rewrite
    check('parse: json', chat.parseRewrite('{"standalone": "Magkano mula SM papuntang Real?"}') === 'Magkano mula SM papuntang Real?');
    check('parse: fenced', chat.parseRewrite('```json\n{"standalone":"x y"}\n```') === 'x y');
    check('parse: junk', chat.parseRewrite('sure! here it is') === null);
    check('parse: too long', chat.parseRewrite(JSON.stringify({ standalone: 'a'.repeat(301) })) === null);

    // Only places already in the chat
    const turns = [{ role: 'user', text: 'SM papuntang Chicken Joo Halang' }, { role: 'assistant', text: 'Sumakay sa Crossing Grand Terminal…' }];
    const g = (s, raw = 'eh pabalik?') => chat.rewriteIsGrounded(s, raw, turns, null, places);
    check('grounded: same places', g('Paano pumunta mula Chicken Joo Halang papuntang SM?'));
    check('grounded: new place dropped', !g('Paano pumunta mula SM papuntang Jollibee Real?'));
    check('grounded: new place the user typed', g('Paano pumunta mula SM papuntang Jollibee Real?', 'eh papuntang Jollibee Real?'));

    // Barangay pins Routie uses for "Real", "Halang", "Uno" must sit inside those barangays
    const planner = await quiet(() => require(path.join(ROOT, 'server/routie-planner.js')))();
    const engine = require(path.join(ROOT, 'public/js/transit-engine.js'));
    const tp = await quiet(() => engine.createPlanner(require(path.join(ROOT, 'public/data/transit-routes.json')), require(path.join(ROOT, 'public/data/barangays.json'))))();
    for (const [key, a] of Object.entries(planner.KNOWN_AREAS)) {
        if (!['real', 'halang', 'uno'].includes(key)) continue; // the barangay pins (crossing/bayan are other places)
        check(`area pin "${key}" is inside ${a.barangay}`, tp.areaOf(a.coords) === a.barangay, `areaOf = ${tp.areaOf(a.coords)}`);
    }

    // Opening hours in Calamba time
    const hours = await quiet(() => require(path.join(ROOT, 'server/routie-hours.js')))();
    const at = (iso) => hours.manilaNow(new Date(iso));
    const wed2214 = at('2026-11-18T14:14:00Z');
    check('hours: Manila time', wed2214.day === 'wed' && wed2214.minutes === 22 * 60 + 14 && wed2214.label.startsWith('Wednesday, November 18, 2026'), JSON.stringify(wed2214));
    const jb = { mon: '6:00 AM - 9:00 PM', tue: '6:00 AM - 9:00 PM', wed: '6:00 AM - 9:00 PM', thu: '6:00 AM - 9:00 PM', fri: '6:00 AM - 9:00 PM', sat: '6:00 AM - 9:00 PM', sun: '6:00 AM - 8:45 PM' };
    const st = (h, iso) => hours.openStatus(h, at(iso));
    check('hours: closed at night, opens tomorrow 6 AM', JSON.stringify(st(jb, '2026-11-18T14:14:00Z')) === JSON.stringify({ known: true, open: false, today: '6:00 AM - 9:00 PM', opensAt: '6:00 AM', opensDay: 'thu', tomorrow: true }));
    check('hours: open in the morning until 9 PM', st(jb, '2026-11-18T02:00:00Z').open === true && st(jb, '2026-11-18T02:00:00Z').closesAt === '9:00 PM');
    check('hours: before opening, opens later today', st(jb, '2026-11-17T21:30:00Z').opensDay === 'today');
    const night = { mon: '8:00 PM - 2:00 AM', tue: '8:00 PM - 2:00 AM', wed: 'Closed', thu: 'Closed', fri: 'Closed', sat: 'Closed', sun: 'Closed' };
    check('hours: open past midnight from yesterday', st(night, '2026-11-17T17:00:00Z').open === true && st(night, '2026-11-17T17:00:00Z').closesAt === '2:00 AM');
    check('hours: closed day, next opening next Monday', st(night, '2026-11-19T04:00:00Z').opensDay === 'mon');
    check('hours: "5:00 PM - 12:00 AM" open at 11:30 PM', st({ wed: '5:00 PM - 12:00 AM' }, '2026-11-18T15:30:00Z').open === true);
    check('hours: open 24 hours', st({ wed: 'Open 24 hours' }, '2026-11-18T04:00:00Z').always === true);
    check('hours: free text is unknown', st({ wed: 'depende' }, '2026-11-18T04:00:00Z').known === false && st(null, '2026-11-18T04:00:00Z').known === false);
    for (const q of ['ngayon yan', 'bukas pa ba', 'open now', 'is it open now', 'hanggang anong oras', 'sarado na ba', 'until what time'])
        check(`hours: "${q}" asks if open`, hours.isOpenNowAsk(q));
    for (const q of ['ilang oras', 'anong oras', 'bukas ng umaga papuntang sm', 'paano pumunta'])
        check(`hours: "${q}" is not an open-now ask`, !hours.isOpenNowAsk(q));

    check('user text: keeps [ROUTE INFO]', chat.withUserText('[ROUTE INFO]\nOrigin: A\n\nUser Message: eh?', 'full?') === '[ROUTE INFO]\nOrigin: A\n\nUser Message: full?');
    check('user text: plain', chat.withUserText('eh?', 'full?') === 'full?');
}

// ── Conversations ───────────────────────────────────────────────────────────────────────────
function stubClient(state) {
    return {
        chat: {
            completions: {
                create: async (req) => {
                    const sys = req.messages[0].content;
                    if (sys.startsWith(chat.REWRITE_TAG)) {
                        state.rewrite = true;
                        const latest = req.messages[1].content.split('Latest message: ').pop();
                        const content = state.turn.rewrite === null ? 'Sure! Here is the question.'
                            : JSON.stringify({ standalone: state.turn.rewrite || latest });
                        return { choices: [{ message: { content } }] };
                    }
                    state.llm = true;
                    state.historySeen = req.messages.length - 2;
                    state.prompt = sys;
                    return { choices: [{ message: { content: JSON.stringify({ reply: 'Stand-in model reply.' }) }, finish_reason: 'stop' }] };
                }
            }
        }
    };
}

// An older widget (cached script.js): { text, isUser } history with the current message in it, no context
{
    const state = { turn: {}, rewrite: false, llm: false };
    const deps = { getPlaces: async () => places, getAdminDb: () => null, getClient: () => stubClient(state),
        callModel: (c, m) => c.chat.completions.create({ messages: m }), sessions: new Map() };
    const first = await quiet(chat.createChatHandler(deps))({ message: 'SM papuntang Chicken Joo Halang', lang: 'tl', history: [], sessionId: 'a' }, {});
    const res = await quiet(chat.createChatHandler({ ...deps, sessions: new Map() }))({
        message: '\n\nUser Message: eh kung sa Crossing?', lang: 'tl', sessionId: 'b',
        history: [{ text: 'SM papuntang Chicken Joo Halang', isUser: true }, { text: first.body.reply, isUser: false }, { text: 'eh kung sa Crossing?', isUser: true }]
    }, {});
    check('older widget: terminal follow-up still works', /Kung sa Crossing Grand Terminal/.test(res.body.reply) && !state.llm, res.body.reply.slice(0, 120));
}

let convPass = 0, convTotal = 0;
for (const conv of evalSet.conversations || []) {
    for (const mode of ['warm', 'cold']) {
        convTotal++;
        let sessions = new Map();
        const history = [];
        let context = null;
        let convOk = true;
        for (const [i, turn] of conv.turns.entries()) {
            if (mode === 'cold') sessions = new Map();
            const state = { turn, rewrite: false, llm: false, historySeen: null, prompt: '' };
            const handler = chat.createChatHandler({
                getPlaces: async () => places,
                getAdminDb: () => null,
                getClient: () => stubClient(state),
                callModel: (client, messages) => client.chat.completions.create({ messages }),
                sessions,
                now: () => new Date(conv.now || '2026-11-18T14:14:00Z')
            });
            const res = await quiet(handler)({
                message: `\n\nUser Message: ${turn.q}`, lang: conv.lang, history: history.slice(-6), sessionId: `test-${conv.id}`, context
            }, { ip: '127.0.0.1' });
            const reply = res.body.reply || '';
            const ctx = res.body.context || {};
            const e = turn.expect || {};
            const fails = [];
            if (res.status !== 200) fails.push(`status ${res.status}`);
            if (!reply.trim()) fails.push('empty reply');
            for (const s of e.contains || []) if (!low(reply).includes(low(s))) fails.push(`missing "${s}"`);
            for (const s of e.notContains || []) if (low(reply).includes(low(s))) fails.push(`has "${s}"`);
            if (e.maxChars && reply.length > e.maxChars) fails.push(`reply is ${reply.length} chars, want at most ${e.maxChars}`);
            if (e.llm !== undefined && state.llm !== e.llm) fails.push(`model ${state.llm ? 'called' : 'not called'}`);
            if (e.rewrite !== undefined && state.rewrite !== e.rewrite) fails.push(`rewrite ${state.rewrite ? 'called' : 'not called'}`);
            if (e.historySeen !== undefined && state.historySeen !== e.historySeen) fails.push(`model saw ${state.historySeen} history messages, want ${e.historySeen}`);
            for (const s of e.promptContains || []) if (!state.prompt.includes(s)) fails.push(`system prompt lacks "${s}"`);
            const trip = ctx.trip || {};
            if (e.contextBoard && trip.board !== e.contextBoard) fails.push(`context board ${trip.board}, want ${e.contextBoard}`);
            if (e.contextOrigin && !low(trip.origin).includes(low(e.contextOrigin))) fails.push(`context origin "${trip.origin}"`);
            if (e.contextDest && !low(trip.dest).includes(low(e.contextDest))) fails.push(`context dest "${trip.dest}"`);
            check(`${conv.id} ${mode} turn ${i + 1} ${JSON.stringify(turn.q)}`, !fails.length,
                fails.join('; ') + (VERBOSE ? `\n       reply: ${reply.replace(/\s+/g, ' ').slice(0, 240)}` : ''));
            if (fails.length) convOk = false;
            // What the widget does: keep the exchange and the context for the next message
            history.push({ role: 'user', text: turn.q }, { role: 'assistant', text: reply });
            context = res.body.context || context;
        }
        if (convOk) convPass++;
    }
}

console.log(`\nConversations: ${convPass}/${convTotal} pass (each run warm and cold)`);
console.log(`Checks: ${checks - failures}/${checks} pass`);
process.exit(failures ? 1 : 0);
