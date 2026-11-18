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
    check('context: good', JSON.stringify(chat.readContext({ v: 1, lastType: 'trip', trip: { origin: 'SM City Calamba', dest: 'Jollibee', board: 'crossing-grand-terminal' } }))
        === JSON.stringify({ lastType: 'trip', trip: { origin: 'SM City Calamba', dest: 'Jollibee', board: 'crossing-grand-terminal' } }));
    check('context: wrong version', chat.readContext({ v: 2, lastType: 'trip' }) === null);
    check('context: unknown type, bad board, long name', JSON.stringify(chat.readContext({ v: 1, lastType: 'admin', trip: { origin: 'x'.repeat(101), dest: 'B' } }))
        === JSON.stringify({ lastType: null, trip: null }));
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
                sessions
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
