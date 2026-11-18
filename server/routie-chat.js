// Routie chat: one message in, one reply out, with the conversation so far.
//
// What this adds on top of routie-knowledge.js (the verified answers) and the Groq model chain:
//   1. Memory. The widget sends the last HISTORY_TURNS messages; they go to the model as real user/assistant turns,
//      so "oh, really?" or "bakit?" is read against Routie's previous reply instead of on its own.
//   2. The last trip and the type of the last reply travel with the chat (`context`, returned with every reply and
//      sent back by the widget). The in-memory session map is only a cache: a cold start or another server
//      instance no longer loses the trip. Only place names and a terminal id are kept, never the user's position.
//   3. Follow-up rewriting. A short or referring message ("eh kung sa Crossing?", "magkano?", "eh pabalik?") is
//      turned into a full question by one small model call, then answered by the same verified resolvers.
//      The rewrite may only use places already in the chat; anything else is thrown away.
//
// Fares, times and routes still come only from the planner and the fare table, never from the model.

'use strict';

const knowledge = require('./routie-knowledge');
const routiePlanner = require('./routie-planner');
const { normalizeLang, fallbackReply, interpretModelOutput } = require('./chat-reply');
const routieHours = require('./routie-hours');

const HISTORY_TURNS = 6;          // messages kept as context: the last 3 questions and 3 replies
const MAX_TURN_CHARS = 600;       // per message; longer ones keep their start and end
const MAX_HISTORY_CHARS = 3600;   // all kept messages together (about 1k tokens)
const REWRITE_TURNS = 4;          // messages the rewrite call sees
const REWRITE_TURN_CHARS = 300;
const REWRITE_BUDGET_MS = 4000;   // the rewrite gives up after this; the original message is used then
const REWRITE_MODELS = [
    { model: 'qwen/qwen3.8-27b', options: { max_tokens: 150, reasoning_effort: 'none', response_format: { type: 'json_object' } } },
    { model: 'openai/gpt-oss-20b', options: { max_tokens: 400, reasoning_effort: 'low', response_format: { type: 'json_object' } } }
];
const REWRITE_TAG = '[routie-rewrite]'; // first line of the rewrite prompt (lets tests tell the two calls apart)

// Types answered straight from the data, without the model
const DIRECT_TYPES = new Set(['route_plan', 'follow_up', 'ambiguous', 'route_not_found', 'out_of_scope', 'faq', 'place_hours']);
// What the previous reply was ('trip' = a trip plan or a follow-up on it)
const LAST_TYPES = new Set(['trip', 'route_not_found', 'ambiguous', 'faq', 'fare_info', 'place_details', 'category_places',
    'business_posts', 'greeting', 'acknowledgement', 'out_of_scope', 'not_in_data', 'planned_route_context', 'other']);
const STOP_ID_RE = /^[a-z0-9-]{1,60}$/;
const MAX_TRIPS = 4;              // trips remembered by name for the whole chat (beyond the 6 messages)

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

// Long messages keep their start and their end (a route reply ends with the terminal list)
function clip(text, max) {
    const t = String(text || '').trim();
    if (t.length <= max) return t;
    const head = Math.round(max * 0.6);
    return `${t.slice(0, head).trimEnd()} … ${t.slice(t.length - (max - head - 3)).trimStart()}`;
}

// ── History from the widget ─────────────────────────────────────────────────────────────────
// Accepts { role: 'user'|'assistant', text } and the older { text, isUser }. Drops error notices (kind 'system'),
// empty items, and the current message when an older widget sent it twice. Returns the last HISTORY_TURNS turns.
function normalizeHistory(history, currentText) {
    if (!Array.isArray(history)) return [];
    let turns = [];
    for (const item of history.slice(-(HISTORY_TURNS + 4))) {
        if (!item || typeof item !== 'object' || item.kind === 'system') continue;
        const role = item.role === 'user' || item.role === 'assistant' ? item.role
            : (typeof item.isUser === 'boolean' ? (item.isUser ? 'user' : 'assistant') : null);
        if (!role) continue;
        const raw = typeof item.text === 'string' ? item.text : (typeof item.content === 'string' ? item.content : '');
        const text = role === 'user' ? knowledge.cleanUserMessage(raw) : raw.trim();
        if (!text) continue;
        turns.push({ role, text: clip(text, MAX_TURN_CHARS) });
    }
    const last = turns[turns.length - 1];
    if (last && last.role === 'user' && norm(last.text) === norm(currentText)) turns.pop();
    turns = turns.slice(-HISTORY_TURNS);
    let total = turns.reduce((n, t) => n + t.text.length, 0);
    while (turns.length && total > MAX_HISTORY_CHARS) total -= turns.shift().text.length;
    return turns;
}

// ── Context sent back by the widget ─────────────────────────────────────────────────────────
// { v: 1, lastType, trip: { origin, dest, board } }. Anything malformed is ignored (returns null).
function readContext(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== 1) return null;
    const okName = (s) => typeof s === 'string' && s.trim().length > 0 && s.length <= 100;
    const trips = Array.isArray(raw.trips)
        ? raw.trips.filter(x => x && okName(x.origin) && okName(x.dest)).slice(-MAX_TRIPS)
            .map(x => ({ origin: x.origin.trim(), dest: x.dest.trim() }))
        : [];
    const place = raw.place && typeof raw.place === 'object' && okName(raw.place.name)
        ? { name: raw.place.name.trim(), slug: typeof raw.place.slug === 'string' && STOP_ID_RE.test(raw.place.slug) ? raw.place.slug : null }
        : null;
    const out = { lastType: LAST_TYPES.has(raw.lastType) ? raw.lastType : null, trip: null, trips, place };
    const t = raw.trip;
    if (t && typeof t === 'object' && okName(t.origin) && okName(t.dest)) {
        out.trip = {
            origin: t.origin.trim(),
            dest: t.dest.trim(),
            board: typeof t.board === 'string' && STOP_ID_RE.test(t.board) ? t.board : null,
            originPin: readPin(t.originPin),
            destPin: readPin(t.destPin)
        };
    }
    return out;
}

// The pin of a named place or area (from Calzada's place list, never the user's GPS): [lat, lng, barangay?]
// Only inside the Calamba area; anything else is ignored and the name is looked up instead.
function readPin(p) {
    if (!Array.isArray(p) || p.length < 2) return null;
    const lat = Number(p[0]), lng = Number(p[1]);
    if (!(lat >= 13.95 && lat <= 14.55 && lng >= 120.95 && lng <= 121.65)) return null;
    const barangay = typeof p[2] === 'string' && p[2].length <= 40 ? p[2] : null;
    return [lat, lng, barangay];
}
const pinOf = (r) => (r && Array.isArray(r.coords) && r.coords.length >= 2
    ? [Number(r.coords[0].toFixed(6)), Number(r.coords[1].toFixed(6)),
        r.barangay || (r.place && r.place.barangay) || null]
    : null);
// A resolved place rebuilt from the context (name + pin), as plan_route takes it
const placeFromPin = (name, pin, places = []) => (pin ? {
    found: true, name, coords: [pin[0], pin[1]], barangay: pin[2] || undefined,
    place: places.find(p => p.name === name) || undefined   // keeps the place's details (hours) for follow-ups
} : name);

// Adds a trip to the chat's list of trips (most recent last, no repeat of the same trip in a row)
function addTrip(trips, trip) {
    if (!trip || !trip.success || !trip.origin || !trip.destination) return trips;
    const item = { origin: String(trip.origin.name || ''), dest: String(trip.destination.name || '') };
    const last = trips[trips.length - 1];
    if (last && last.origin === item.origin && last.dest === item.dest) return trips;
    return [...trips, item].slice(-MAX_TRIPS);
}

function contextFor(lastTrip, lastType, trips = [], lastPlace = null) {
    const ok = lastTrip && lastTrip.success && lastTrip.origin && lastTrip.destination;
    return {
        v: 1,
        lastType: LAST_TYPES.has(lastType) ? lastType : 'other',
        trips,
        place: lastPlace && lastPlace.name ? { name: String(lastPlace.name), slug: lastPlace.slug || null } : null,
        trip: ok ? {
            origin: String(lastTrip.origin.name || ''),
            dest: String(lastTrip.destination.name || ''),
            board: lastTrip.chosenStopId || null,
            // Area names like "Brgy. Real, Calamba" do not look up back to the same pin, so the pins travel too
            originPin: lastTrip.origin.outsideCalamba ? null : pinOf(lastTrip.origin),
            destPin: lastTrip.destination.outsideCalamba ? null : pinOf(lastTrip.destination)
        } : null
    };
}

function lastTypeOf(kctx) {
    if (kctx.type === 'route_plan') return 'trip';
    if (kctx.type === 'place_hours') return 'place_details'; // still about that place
    if (kctx.type === 'follow_up') return kctx.planResult && kctx.planResult.success === false ? 'route_not_found' : 'trip';
    return LAST_TYPES.has(kctx.type) ? kctx.type : 'other';
}

// ── When to rewrite ─────────────────────────────────────────────────────────────────────────
const LEAD_RE = /^(?:eh|e|so|and|at|tapos|then|edi|eh di|pano kung|paano kung|paano naman|pano naman|what about|how about|what if|kung|yung|iyong|yun|iyon|ito|this|that|same|ganun)\b/;
const REF_RE = /\b(?:doon|dun|duon|roon|diyan|dyan|iyon|yun|yan|iyan|ganun|ganon|pareho|same|ulit|again|that one|that place|there|it|the other|other one|yung isa|isa pa|pangalawa|second one|first one|nabanggit|sinabi mo|you said|you mentioned|earlier|kanina|pabalik|going back)\b/;
// "ano napag-usapan natin?", "what did we talk about?": a summary of this chat, from the trip list and the history
const RECALL_RE = /\b(?:napag ?usapan|pinag ?usapan|usapan natin|pinagusapan|talked about|did we (?:talk|discuss)|we (?:talked|discussed)|our (?:chat|conversation)|itinanong ko|tinanong ko|what did i ask|i asked (?:you|earlier|before)|recap|summary|ibuod|buod)\b/;
// Asking for the route itself again ("paano ulit?", "steps nga", "ulitin mo ang ruta")
const WANTS_STEPS_RE = /\b(?:paano|pano|steps?|directions?|ruta|route|detalye|details|ulitin|repeat|buong|full|saan (?:ako )?sasakay|where do i (?:board|ride))\b/;
const sameTrip = (a, b) => !!(a && b && a.success && b.success && a.origin && b.origin && a.destination && b.destination
    && a.origin.name === b.origin.name && a.destination.name === b.destination.name);
const WHY_RE = /^(?:bakit|why|how come|paano nangyari|ano ang dahilan)\b/;
// Answers from the rewritten question that replace the first try
const USE_AFTER_REWRITE = new Set(['route_plan', 'follow_up', 'faq', 'fare_info', 'ambiguous', 'route_not_found', 'category_places', 'place_details']);
const CONFIDENT_TYPES = new Set(['route_plan', 'faq', 'place_details', 'category_places', 'planned_route_context']);

function needsRewrite(rawText, turns, kctx) {
    if (!turns.some(t => t.role === 'assistant')) return false;
    if (['follow_up', 'out_of_scope', 'acknowledgement', 'greeting', 'planned_route_context', 'place_hours'].includes(kctx.type)) return false;
    const t = norm(rawText);
    if (!t) return false;
    if (routiePlanner.CONFIRM_RE.test(t)) return false; // "talaga?" has nothing to fill in; the model answers it with the history
    if (RECALL_RE.test(t)) return false;                 // "ano napag-usapan natin?" is about the whole chat
    const words = t.split(' ').length;
    if (words > 18) return false;
    const refers = REF_RE.test(t);
    if (kctx.type === 'route_plan' && !refers) return false; // already a full trip question
    if (LEAD_RE.test(t) || refers) return true;
    return words <= 4 && !CONFIDENT_TYPES.has(kctx.type);
}

// ── The rewrite call ────────────────────────────────────────────────────────────────────────
function rewriteMessages(rawText, turns, lastTrip, lastPlace) {
    const system = `${REWRITE_TAG}
You turn a commuter's latest chat message into ONE full, standalone question for Routie, the commuting guide for Calamba, Laguna (Calzada). Use the conversation to fill in what the message leaves out.
Rules:
- Keep the commuter's language (Tagalog, Taglish or English). Keep it short.
- Take places, terminals and the trip only from the conversation, spelled as they are there. Never add a place that is not in the conversation.
- Do not answer. Never add fares, times, distances or any other facts.
- If the latest message is already a full question, or is not about the conversation, return it unchanged.
- If it only reacts to or doubts the previous reply ("really?", "talaga?", "sure ka?"), return it unchanged.
Reply with JSON only: {"standalone": "<the question>"}
Examples (last trip SM City Calamba to Jollibee Real):
"eh pabalik?" -> {"standalone": "Paano pumunta mula Jollibee Real papuntang SM City Calamba?"}
"magkano kung student?" -> {"standalone": "Magkano ang pamasahe ng student mula SM City Calamba papuntang Jollibee Real?"}
"eh papuntang Chicken Joo Halang?" -> {"standalone": "Paano pumunta mula SM City Calamba papuntang Chicken Joo Halang?"}
"what about from Crossing Grand Terminal?" -> {"standalone": "How do I get from Crossing Grand Terminal to Jollibee Real?"}
"is Calzada free?" -> {"standalone": "is Calzada free?"}`;
    const lines = [];
    if (lastTrip && lastTrip.success && lastTrip.origin && lastTrip.destination) {
        lines.push(`Last trip: from ${lastTrip.origin.name} to ${lastTrip.destination.name}`);
    }
    if (lastPlace && lastPlace.name) lines.push(`Last place asked about: ${lastPlace.name}`);
    lines.push('Conversation:');
    for (const t of turns.slice(-REWRITE_TURNS)) {
        lines.push(`${t.role === 'user' ? 'User' : 'Routie'}: ${clip(t.text, REWRITE_TURN_CHARS).replace(/\s*\n\s*/g, ' / ')}`);
    }
    lines.push(`Latest message: ${rawText}`);
    return [{ role: 'system', content: system }, { role: 'user', content: lines.join('\n') }];
}

function parseRewrite(content) {
    const text = String(content || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
        const obj = JSON.parse(text.slice(start, end + 1));
        const s = typeof obj.standalone === 'string' ? obj.standalone.trim().replace(/^["']|["']$/g, '') : '';
        return s.length >= 2 && s.length <= 300 ? s : null;
    } catch (_) {
        return null;
    }
}

// Returns the rewritten question, or null (no client, timeout, rate limit, unreadable reply)
async function rewriteFollowUp(client, rawText, turns, lastTrip, lastPlace) {
    if (!client) return null;
    const messages = rewriteMessages(rawText, turns, lastTrip, lastPlace);
    const startedAt = Date.now();
    for (const { model, options } of REWRITE_MODELS) {
        const left = REWRITE_BUDGET_MS - (Date.now() - startedAt);
        if (left < 800) break;
        const controller = new AbortController();
        let timer = null;
        try {
            const call = client.chat.completions.create({ messages, model, temperature: 0, ...options }, { signal: controller.signal });
            call.catch(() => {});
            const timeout = new Promise((_, reject) => {
                timer = setTimeout(() => { reject(new Error('rewrite timeout')); controller.abort(); }, left);
            });
            const res = await Promise.race([call, timeout]);
            const content = res && res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content;
            const out = parseRewrite(content);
            if (out) return out;
            console.log(`Routie rewrite: unreadable reply from ${model}.`);
            return null;
        } catch (err) {
            if (err.status === 404 || err.status === 429 || err.status === 400) {
                console.log(`Routie rewrite: ${model} unavailable (${err.status}), trying next.`);
                continue;
            }
            console.log(`Routie rewrite skipped (${err.message === 'rewrite timeout' ? 'timeout' : (err.status || err.message)}).`);
            return null;
        } finally {
            clearTimeout(timer);
        }
    }
    return null;
}

// The rewrite may only name places that are already in the chat (the message, earlier turns, the last trip)
function rewriteIsGrounded(standalone, rawText, turns, lastTrip, places, lastPlace) {
    const texts = [rawText, ...turns.map(t => t.text)];
    if (lastPlace && lastPlace.name) texts.push(lastPlace.name);
    const mentioned = new Set();
    if (lastTrip && lastTrip.origin) mentioned.add(norm(lastTrip.origin.name));
    if (lastTrip && lastTrip.destination) mentioned.add(norm(lastTrip.destination.name));
    for (const t of (lastTrip && lastTrip.suggestedTerminals) || []) { texts.push(t.name); mentioned.add(norm(t.name)); }
    for (const tx of texts) {
        const p = knowledge.findPlaceByName(tx, places);
        if (p && p.name) mentioned.add(norm(p.name));
    }
    const corpus = ` ${norm(texts.join(' '))} `;
    const inChat = (s) => { const n = norm(s); return !!n && (corpus.includes(` ${n} `) || mentioned.has(n)); };

    const ods = [routiePlanner.extractOriginAndDestination(standalone), knowledge.extractOriginAndDestination(standalone)]
        .filter(o => o && o.origin && o.dest);
    for (const od of ods) {
        for (const end of [od.origin, od.dest]) {
            if (inChat(end)) continue;
            const r = routiePlanner.resolvePlace(end, places);
            if (r && !r.isAmbiguous && r.found !== false && r.name && inChat(r.name)) continue;
            return false;
        }
    }
    const p = knowledge.findPlaceByName(standalone, places);
    return !(p && p.name && !inChat(p.name));
}

// Puts a new user text into the message, keeping the planner's [ROUTE INFO] block if there is one
function withUserText(message, text) {
    const m = String(message || '');
    const i = m.lastIndexOf('User Message:');
    return i === -1 ? text : `${m.slice(0, i)}User Message: ${text}`;
}

// The last trip mentioned in the user's own earlier messages (older widgets send no context)
function tripFromTurns(turns, places) {
    for (let i = turns.length - 1; i >= 0; i--) {
        if (turns[i].role !== 'user') continue;
        const od = routiePlanner.extractOriginAndDestination(turns[i].text);
        if (od && od.origin && od.dest) {
            const r = routiePlanner.plan_route(od.origin, od.dest, { places });
            if (r && r.success) return r;
        }
    }
    return null;
}

// ── The handler ─────────────────────────────────────────────────────────────────────────────
// deps: getPlaces() → places (async ok), getAdminDb() → Firestore or null, getClient() → Groq client or null,
//       callModel(client, messages) → completion (the server's model chain), sessions: Map
function createChatHandler(deps) {
    const sessions = deps.sessions || new Map();

    return async function handleChat(body, meta = {}) {
        const { message, route, lang, history, sessionId, context } = body || {};
        const replyLang = normalizeLang(lang);
        const rawText = knowledge.cleanUserMessage(message);
        const turns = normalizeHistory(history, rawText);
        const sessionKey = (typeof sessionId === 'string' && sessionId.slice(0, 80)) || meta.ip || 'default';
        let outContext = null;
        const fail = (status, error, kind) => ({
            status, body: { error, reply: fallbackReply(kind, replyLang), ...(outContext ? { context: outContext } : {}) }
        });

        try {
            const places = await deps.getPlaces();
            let adminDb = null;
            try { adminDb = deps.getAdminDb ? deps.getAdminDb() : null; } catch (_) { /* no Firestore */ }

            // The last trip and the previous reply's type: session cache, else the widget's context, else the history
            const sess = sessions.get(sessionKey);
            const clientCtx = readContext(context);
            let lastType = (sess && sess.lastType) || (clientCtx && clientCtx.lastType) || null;
            let trips = (sess && sess.trips) || (clientCtx && clientCtx.trips) || [];
            // The last place asked about (hours, address): looked up again in the place list by slug or exact name
            let lastPlace = (sess && sess.lastPlace) || null;
            if (!lastPlace && clientCtx && clientCtx.place) {
                const cp = clientCtx.place;
                lastPlace = places.find(p => cp.slug && p.slug === cp.slug) || places.find(p => p.name === cp.name) || null;
            }
            const now = deps.now ? deps.now() : new Date();
            let lastTrip = (sess && sess.lastTrip) || null;
            if (!lastTrip && clientCtx && clientCtx.trip) {
                const ct = clientCtx.trip;
                const r = routiePlanner.plan_route(placeFromPin(ct.origin, ct.originPin, places), placeFromPin(ct.dest, ct.destPin, places),
                    { places, boardStopId: ct.board || undefined });
                if (r && r.success) lastTrip = r;
            }
            if (!lastTrip) {
                lastTrip = tripFromTurns(turns, places);
                // Older widget (no context): the previous reply was this trip when it is a route reply
                const prev = [...turns].reverse().find(t => t.role === 'assistant');
                if (lastTrip && !lastType && prev && /^(?:Total: ₱|Kabuuan: ₱|Mula .+:\n|From .+:\n)/.test(prev.text)) lastType = 'trip';
            }

            const base = { message, route, lang: replyLang, places, adminDb, history: turns, lastTrip, lastType, lastPlace, now, sessionId: sessionKey };
            let kctx = await knowledge.resolveRoutieContext(base);
            let meaning = null;
            if (turns.length && RECALL_RE.test(norm(rawText)) && !DIRECT_TYPES.has(kctx.type)) {
                const isTl = kctx.lang === 'tl';
                kctx = {
                    type: 'chat_recall',
                    lang: kctx.lang || replyLang,
                    instruction: isTl
                        ? 'Ibuod nang maikli ang usapang ito para sa commuter: bawat biyaheng itinanong (nasa TRIPS ASKED ABOUT), at ang iba pang tanong at sagot sa mga naunang mensahe. Gamitin lang ang nasa usapan at data; huwag magdagdag.'
                        : 'Briefly sum up this chat for the commuter: every trip they asked about (listed under TRIPS ASKED ABOUT) and the other questions and answers in the earlier messages. Use only what is in the chat and the data; add nothing.'
                };
            }

            const client = deps.getClient();
            if (client && needsRewrite(rawText, turns, kctx)) {
                const standalone = await rewriteFollowUp(client, rawText, turns, lastTrip, lastPlace);
                if (standalone && norm(standalone) !== norm(rawText)) {
                    if (rewriteIsGrounded(standalone, rawText, turns, lastTrip, places, lastPlace)) {
                        meaning = standalone;
                        // A why-question stays with the model (with the history); the resolvers would only look up a place
                        const k2 = WHY_RE.test(norm(standalone)) ? null
                            : await knowledge.resolveRoutieContext({ ...base, message: withUserText(message, standalone) });
                        if (k2 && USE_AFTER_REWRITE.has(k2.type)) {
                            kctx = k2;
                            // The same trip again ("ilang minutes nga?" rewritten to the full trip question): a short
                            // reminder, not the whole route, unless they ask for the steps
                            if (k2.type === 'route_plan' && sameTrip(k2.planResult, lastTrip)) {
                                const isTl = k2.lang === 'tl';
                                const reply = WANTS_STEPS_RE.test(norm(rawText))
                                    // the steps of the trip as they were planned (keeps a terminal the commuter picked)
                                    ? `${isTl ? `Mula ${lastTrip.origin.name} papuntang ${lastTrip.destination.name}:` : `From ${lastTrip.origin.name} to ${lastTrip.destination.name}:`}\n${routiePlanner.formatRouteReply(lastTrip, k2.lang)}`
                                    : routiePlanner.tripShortRecap(lastTrip, isTl);
                                kctx = { ...k2, planResult: lastTrip, directReply: reply };
                            } else if (k2.type === 'route_plan' && k2.planResult && k2.planResult.success && k2.directReply) {
                                // Say which trip a rewritten question was answered for
                                const o = k2.planResult.origin.name, d = k2.planResult.destination.name;
                                const head = k2.lang === 'tl' ? `Mula ${o} papuntang ${d}:` : `From ${o} to ${d}:`;
                                kctx = { ...k2, directReply: `${head}\n${k2.directReply}` };
                            }
                        }
                    } else {
                        console.log('Routie rewrite dropped: it named a place not in the chat.');
                    }
                }
            }

            // Remember the trip and what this reply was
            if (!trips.length) trips = addTrip(trips, lastTrip);
            if (kctx.planResult && kctx.planResult.success) {
                lastTrip = kctx.planResult;
                trips = addTrip(trips, lastTrip);
            }
            if (kctx.place && kctx.place.name) lastPlace = kctx.place;
            lastType = lastTypeOf(kctx);
            sessions.set(sessionKey, { lastTrip, lastType, trips, lastPlace, updatedAt: Date.now() });
            outContext = contextFor(lastTrip, lastType, trips, lastPlace);

            if (kctx.directReply && DIRECT_TYPES.has(kctx.type)) {
                return { status: 200, body: { reply: kctx.directReply, context: outContext } };
            }

            if (!client) {
                if (kctx.directReply) return { status: 200, body: { reply: kctx.directReply, context: outContext } };
                console.error('GROQ_API_KEY is not configured on the server. Please check your .env file.');
                return fail(500, 'not_configured', 'unavailable');
            }

            // The model gets the facts of the last trip and the trips asked about, so it never has to guess them
            const systemPrompt = knowledge.buildRoutieSystemPrompt(kctx, {
                hasHistory: turns.length > 0,
                meaning,
                nowLabel: routieHours.manilaNow(now).label,
                tripFacts: routiePlanner.tripFacts(lastTrip),
                trips: trips.map(t => `${t.origin} to ${t.dest}`)
            });
            const completion = await deps.callModel(client, [
                { role: 'system', content: systemPrompt },
                ...turns.map(t => ({ role: t.role, content: t.text })),
                { role: 'user', content: String(message || '') }
            ]);
            const choice = completion.choices && completion.choices[0];
            const { source, ...out } = interpretModelOutput(choice && choice.message && choice.message.content, {
                lang: kctx.lang || replyLang,
                truncated: !!choice && choice.finish_reason === 'length'
            });
            if (source !== 'json') console.log(`Chat reply needed repair or was replaced (${source}).`);
            return { status: 200, body: { ...out, context: outContext } };
        } catch (error) {
            console.log('Final Error Handler:', error.message);
            if (error.message === 'Groq Timeout') return fail(504, 'timeout', 'timeout');
            if (error.status === 429) return fail(429, 'rate_limited', 'busy');
            return fail(500, 'ai_unavailable', 'unavailable');
        }
    };
}

module.exports = {
    createChatHandler,
    normalizeHistory,
    readContext,
    contextFor,
    needsRewrite,
    rewriteMessages,
    parseRewrite,
    rewriteFollowUp,
    rewriteIsGrounded,
    withUserText,
    HISTORY_TURNS,
    REWRITE_TAG
};
