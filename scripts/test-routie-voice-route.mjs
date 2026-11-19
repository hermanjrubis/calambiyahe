#!/usr/bin/env node
/**
 * scripts/test-routie-voice-route.mjs — planning a trip with Routie by voice, end to end, in a real browser.
 *
 *   node scripts/test-routie-voice-route.mjs
 *
 * Env: CHROMIUM_PATH (a Chrome/Chromium binary), SHOTS=dir (save screenshots), CDN_DIR (see below).
 * Port 5000 must be free (stop `npm start` first): on localhost the widget always calls the API at :5000.
 *
 * Runs the real Calzada server in this process with a stand-in for Groq (GROQ_BASE_URL points at a small local
 * server here), so no AI key or network is needed: the stand-in answers Whisper with the words the test "says"
 * (live partials growing while talking, then the full pass, as the real API does in verbose_json), and answers
 * chat completions by echoing the question (so a reply that came from the AI instead of Calzada's data shows up).
 * Everything else is real: the page and widget, Chrome's fake microphone, the upload, the server's transcript
 * cleanup and place-name corrections, and Routie's trip planning from Calzada's data and its follow-ups.
 *
 * Phone (Tagalog): a long spoken message (words flow in one at a time, the box scrolls and follows the newest
 * line; after Stop the transcript is all there, scrollable, without popping up the keyboard) → Send → the full
 * route; then "Saan ako sasakay?" and "Saan ako bababa?" by voice. Computer (English): a trip and "where do I get
 * off?". A short message stays one line. Exit code 1 when a check fails.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.SHOTS || '';
const PORT = 5000;
// No internet for CDNs (a sandbox): CDN_DIR=dir with maplibre-gl-5.1.0/ and flatpickr-4.6.13/ unpacked from npm,
// served in place of unpkg/jsdelivr (the Planner needs MapLibre). Left unset, the CDNs are used as on the site.
const CDN_DIR = process.env.CDN_DIR || '';
const CDN_FILES = [
    [/maplibre-gl@[\d.]+\/dist\/maplibre-gl\.js/, 'maplibre-gl-5.1.0/dist/maplibre-gl.js'],
    [/maplibre-gl@[\d.]+\/dist\/maplibre-gl\.css/, 'maplibre-gl-5.1.0/dist/maplibre-gl.css'],
    [/npm\/flatpickr(?:@[\d.]+)?(?:\/dist\/flatpickr(?:\.min)?\.js)?$/, 'flatpickr-4.6.13/dist/flatpickr.min.js'],
    [/flatpickr(?:@[\d.]+)?\/dist\/flatpickr\.min\.css/, 'flatpickr-4.6.13/dist/flatpickr.min.css']
];
let chromium;
try { ({ chromium } = await import('playwright')); } catch (_) { ({ chromium } = await import('/opt/npm-tools/node_modules/playwright/index.mjs')); }

let checks = 0, failures = 0;
const check = (name, ok, detail = '') => { checks++; if (!ok) { failures++; console.log(`FAIL ${name}${detail ? `\n       ${detail}` : ''}`); } else console.log(`ok   ${name}`); };

// ── Stand-in for Groq ────────────────────────────────────────────────────────────────────────
const groq = { partials: [], final: '', partialCalls: 0, fullCalls: 0, chatCalls: 0, models: new Set() };
function say(final, partials) { groq.final = final; groq.partials = partials || [final]; groq.partialCalls = 0; }
const seg = (text) => ({ id: 0, start: 0, end: 3, text: ' ' + text, avg_logprob: -0.18, compression_ratio: 1.3, no_speech_prob: 0.01 });
const standIn = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
        const body = Buffer.concat(chunks).toString('latin1');
        const send = (obj, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
        if (req.url.endsWith('/audio/transcriptions')) {
            const model = (body.match(/name="model"\r\n\r\n([^\r]+)/) || [])[1] || '';
            const language = (body.match(/name="language"\r\n\r\n([^\r]+)/) || [])[1] || 'tl';
            groq.models.add(model);
            let text;
            if (/turbo/.test(model)) { text = groq.partials[Math.min(groq.partialCalls, groq.partials.length - 1)]; groq.partialCalls++; }
            else { text = groq.final; groq.fullCalls++; }
            const lang = /[a-z]/i.test(text) && /\b(ko|ang|sa|po|saan|papuntang|ako)\b/i.test(text) ? 'tagalog' : (language === 'tl' ? 'tagalog' : 'english');
            return send({ text: ' ' + text, language: lang, duration: 3, segments: [seg(text)] });
        }
        if (req.url.endsWith('/chat/completions')) {
            groq.chatCalls++;
            let q = '';
            try { const j = JSON.parse(Buffer.concat(chunks).toString('utf8')); const u = j.messages.filter(m => m.role === 'user').pop(); q = u ? String(u.content) : ''; } catch (_) { }
            return send({ id: 'x', object: 'chat.completion', created: 0, model: 'stand-in', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: q } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
        }
        send({ error: { message: 'not here' } }, 404);
    });
});
await new Promise(r => standIn.listen(0, '127.0.0.1', r));
process.env.GROQ_API_KEY = 'stand-in-key';
process.env.GROQ_BASE_URL = `http://127.0.0.1:${standIn.address().port}`;

// ── The real server ─────────────────────────────────────────────────────────────────────────
const log = console.log, err = console.error, warn = console.warn;
console.log = console.error = console.warn = () => {};
const app = require(path.join(ROOT, 'server.js'));
const server = await new Promise(r => { const s = app.listen(PORT, () => r(s)); });
console.log = log; console.error = err; console.warn = warn;
const BASE = `http://localhost:${PORT}`;

const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--no-sandbox']
});
const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); } };

async function openRoutie({ mobile, lang, size = { width: 390, height: 844 } }) {
    const context = await browser.newContext(mobile
        ? { viewport: size, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
            userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' }
        : { viewport: { width: 1280, height: 800 } });
    await context.grantPermissions(['microphone'], { origin: BASE });
    // A fresh chat for each test, kept across reloads within it
    await context.addInitScript((l) => { try { localStorage.setItem('calzada_lang', l); if (!sessionStorage.getItem('__routieTest')) { sessionStorage.clear(); sessionStorage.setItem('__routieTest', '1'); } } catch (_) { } }, lang);
    const page = await context.newPage();
    await page.route(/(tiles|openfreemap|cartocdn|basemaps|arcgis|nominatim|googleapis\.com\/maps|firebase|gstatic)/, r => r.abort());
    if (CDN_DIR) await page.route(/^https:\/\/(unpkg\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com)\//, (r) => {
        const local = CDN_FILES.find(([re]) => re.test(r.request().url()));
        if (!local) return r.abort();
        const file = path.join(CDN_DIR, local[1]);
        return r.fulfill({ status: 200, contentType: file.endsWith('.css') ? 'text/css' : 'application/javascript', body: fs.readFileSync(file) });
    });
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);
    await page.evaluate(() => document.getElementById('chatToggleBtn').click());
    await page.waitForSelector('#chatWindow.open', { timeout: 8000 });
    await page.waitForTimeout(300);
    return { context, page, press: (sel) => (mobile ? page.tap(sel) : page.click(sel)) };
}

// The "Tingnan sa Planner" buttons in the chat: which reply has one, its text, label and link
const plannerButtons = (page) => page.evaluate(() => [...document.querySelectorAll('#chatMessages .bot-message')].map((m, i) => {
    const a = m.querySelector('.routie-planner-btn');
    if (!a) return null;
    const r = a.getBoundingClientRect(), u = new URL(a.href);
    return { i, text: a.textContent.trim(), label: a.getAttribute('aria-label'), path: u.pathname, q: Object.fromEntries(u.searchParams), h: Math.round(r.height), w: Math.round(r.width) };
}).filter(Boolean));
const botCount = (page) => page.evaluate(() => document.querySelectorAll('#chatMessages .bot-message').length);
// The reply is typed out letter by letter: wait until it is complete (no typing cursor left)
async function lastBotReplyAfter(page, before, timeout = 40000) {
    await page.waitForFunction((n) => {
        const b = document.querySelectorAll('#chatMessages .bot-message');
        const last = b[b.length - 1];
        return b.length > n && !last.querySelector('.typing-cursor') && last.textContent.trim().length > 0;
    }, before, { timeout });
    await page.waitForTimeout(300);
    return page.evaluate(() => {
        const b = document.querySelectorAll('#chatMessages .bot-message'), last = b[b.length - 1].cloneNode(true);
        last.querySelectorAll('.routie-planner-btn').forEach(x => x.remove());
        return last.innerText.trim();
    });
}

// Speak (the stand-in hears `final`, with `partials` while talking), Stop, wait for the transcript in the box
async function speak(page, press, final, partials, talkMs) {
    say(final, partials);
    const fullBefore = groq.fullCalls;
    await press('#micBtn');
    await page.waitForTimeout(talkMs);
    await press('#rvStopBtn');
    await page.waitForFunction(() => !document.querySelector('.chat-input-area').classList.contains('is-transcribing') && document.getElementById('chatInput').value.trim(), null, { timeout: 15000 });
    await page.waitForTimeout(400);
    return groq.fullCalls > fullBefore;
}

// About 30 seconds of talking: more than fits in the sheet on a small phone
const LONG_HEARD = 'Hello Routie, good morning! Gusto ko sanang malaman kung paano pumunta mula SM City Calamba papuntang chicken jo sa Halang, tapos magkano ang pamasahe kung student ako, at saan ako dapat sumakay ng jeep, sa SM terminal ba o sa Crossing Grand Terminal, kasi first time ko lang pupunta doon at hindi ko alam kung saan bababa. '
    + 'Tsaka po pala, gabi na siguro ako makakaalis galing school, mga alas siyete o alas otso na, kaya sana po kasama na rin kung gaano katagal ang biyahe para alam ko kung anong oras ako darating. Salamat po!';
const LONG_WORDS = LONG_HEARD.split(' ');
const LONG_PARTIALS = [8, 18, 30, 42, 54, 66, 78, 90, LONG_WORDS.length].map(n => LONG_WORDS.slice(0, n).join(' '));

// ── Phone, Tagalog: a long spoken trip question, then follow-ups by voice ───────────────────
// A small phone (360 × 640), where a long message does not fit in the sheet
{
    const { context, page, press } = await openRoutie({ mobile: true, lang: 'tl', size: { width: 360, height: 640 } });
    say(LONG_HEARD, LONG_PARTIALS);
    await press('#micBtn');
    // Watch the words come in: how many are on screen, every 120 ms, for about 21 seconds (all nine live updates)
    const samples = await page.evaluate(async () => {
        const out = [];
        for (let i = 0; i < 175; i++) {
            await new Promise(r => setTimeout(r, 120));
            const cap = document.getElementById('rvCaption');
            out.push(cap.querySelectorAll('.rv-word').length);
        }
        return out;
    });
    const steps = samples.filter((n, i) => i && n > samples[i - 1]).length;
    const biggestJump = Math.max(...samples.map((n, i) => (i ? n - samples[i - 1] : 0)));
    check('phone: live words flow in a few at a time, not in big jumps', steps >= 12 && biggestJump <= 3, `steps=${steps} biggestJump=${biggestJump} samples=${samples.join(',')}`);
    const listening = await page.evaluate(() => {
        const cap = document.getElementById('rvCaption'), center = document.querySelector('#chatWindow .rv-center');
        const words = cap.querySelectorAll('.rv-word'); const last = words[words.length - 1];
        const cr = cap.getBoundingClientRect(), lr = last.getBoundingClientRect(), centerR = center.getBoundingClientRect();
        return {
            words: words.length, scrolls: cap.scrollHeight > cap.clientHeight + 4, long: document.querySelector('#chatWindow .rv-sheet').classList.contains('is-long'),
            newestInView: lr.bottom <= cr.bottom + 2 && lr.top >= cr.top - 2, centerFits: center.scrollHeight <= center.clientHeight + 1,
            captionInsideSheet: cr.top >= centerR.top - 1 && cr.bottom <= centerR.bottom + 1,
            noSideScroll: document.documentElement.scrollWidth <= window.innerWidth
        };
    });
    check('phone: a long message scrolls inside the words box', listening.scrolls && listening.centerFits && listening.captionInsideSheet, JSON.stringify(listening));
    check('phone: the newest words stay in view, Routie makes room', listening.newestInView && listening.long && listening.noSideScroll, JSON.stringify(listening));
    await shot(page, 'route-phone-1-listening-long');
    await press('#rvStopBtn');
    await page.waitForFunction(() => document.getElementById('chatInput').value.trim().length > 0, null, { timeout: 15000 });
    await page.waitForTimeout(500);
    const box = await page.evaluate(() => {
        const i = document.getElementById('chatInput'), r = i.getBoundingClientRect();
        const before = i.scrollTop; i.scrollTop = 40; const moved = i.scrollTop !== before; i.scrollTop = before;
        const note = document.querySelector('#chatWindow .rv-fix-note');
        return { value: i.value, h: Math.round(r.height), scrollH: i.scrollHeight, overflowY: getComputedStyle(i).overflowY, moved,
            focused: document.activeElement === i, send: !document.getElementById('sendMessageBtn').disabled,
            note: note && !note.hidden ? note.textContent.trim() : '', visible: r.top >= 0 && r.bottom <= window.innerHeight };
    });
    check('phone: the whole spoken message is in the box, place name fixed', box.value.includes('papuntang Chicken Joo sa Halang') && box.value.endsWith('Salamat po!') && /"chicken jo" → Chicken Joo/.test(box.note), JSON.stringify({ value: box.value.slice(0, 90), note: box.note }));
    check('phone: the box grows (up to ~6 lines here) and scrolls with a finger', box.h >= 110 && box.h <= 172 && box.overflowY === 'auto' && box.scrollH > box.h && box.moved && box.visible, JSON.stringify(box));
    check('phone: the keyboard does not pop up over it; ready to send', !box.focused && box.send, JSON.stringify(box));
    await shot(page, 'route-phone-2-transcript');

    let n = await botCount(page);
    await press('#sendMessageBtn');
    let reply = await lastBotReplyAfter(page, n);
    const afterSend = await page.evaluate(() => {
        const i = document.getElementById('chatInput'), m = document.getElementById('chatMessages');
        return { value: i.value, h: Math.round(i.getBoundingClientRect().height), atBottom: m.scrollHeight - m.clientHeight - m.scrollTop < 60,
            note: !document.querySelector('#chatWindow .rv-fix-note').hidden };
    });
    check('phone: Routie answers the spoken trip with the route', /Kabuuan: ₱14\.00/.test(reply) && reply.includes('Chicken Joo – Halang') && reply.includes('₱11.25') && /SM City Calamba Transport Terminal/.test(reply), reply.slice(0, 300));
    check('phone: the box is cleared and small again, the reply in view', afterSend.value === '' && afterSend.h <= 30 && afterSend.atBottom && !afterSend.note, JSON.stringify(afterSend));
    await shot(page, 'route-phone-3-route-reply');
    let btns = await plannerButtons(page);
    const b0 = btns[0] || {};
    check('phone: the route reply has "Tingnan sa Planner"', btns.length === 1 && b0.text === 'Tingnan sa Planner' && b0.h >= 40
        && b0.label === 'Buksan ang rutang ito sa Planner: SM City Calamba papuntang Chicken Joo – Halang', JSON.stringify(btns));
    check('phone: its link sets the trip in the Planner (names and pins)', b0.path === '/planner' && b0.q && b0.q.originName === 'SM City Calamba' && b0.q.destName === 'Chicken Joo – Halang'
        && Math.abs(Number(b0.q.originLat) - 14.2039) < 0.001 && Math.abs(Number(b0.q.destLng) - 121.1628) < 0.001, JSON.stringify(b0.q));

    await speak(page, press, 'Saan ako sasakay?', ['Saan ako', 'Saan ako sasakay?'], 3600);
    const small = await page.evaluate(() => ({ value: document.getElementById('chatInput').value, h: Math.round(document.getElementById('chatInput').getBoundingClientRect().height) }));
    check('phone: a short message stays one line', small.value === 'Saan ako sasakay?' && small.h <= 30, JSON.stringify(small));
    n = await botCount(page);
    await press('#sendMessageBtn');
    reply = await lastBotReplyAfter(page, n);
    check('phone: "Saan ako sasakay?" by voice → where to ride, from the data', /^Sumakay sa SM City Calamba Transport Terminal ng jeep na/.test(reply) && reply.length < 400, reply);

    await speak(page, press, 'Saan ako bababa?', ['Saan ako bababa?'], 2600);
    n = await botCount(page);
    await press('#sendMessageBtn');
    reply = await lastBotReplyAfter(page, n);
    check('phone: "Saan ako bababa?" by voice → where to get off', /^Bumaba sa Chicken Joo – Halang/.test(reply) && reply.length < 300, reply);

    await speak(page, press, 'Magkano kung student ako?', ['Magkano kung', 'Magkano kung student ako?'], 3600);
    n = await botCount(page);
    await press('#sendMessageBtn');
    reply = await lastBotReplyAfter(page, n);
    check('phone: "Magkano kung student ako?" → the discounted fare', reply.includes('₱11.25'), reply);
    await shot(page, 'route-phone-4-follow-ups');
    btns = await plannerButtons(page);
    check('phone: follow-ups about the same trip add no second button', btns.length === 1, JSON.stringify(btns.map(b => b.i)));

    // A new trip gets its own button
    await speak(page, press, 'Eh mula Chicken Joo Halang papuntang Calamba City Hall?', ['Eh mula Chicken Joo', 'Eh mula Chicken Joo Halang papuntang Calamba City Hall?'], 3600);
    n = await botCount(page);
    await press('#sendMessageBtn');
    reply = await lastBotReplyAfter(page, n);
    btns = await plannerButtons(page);
    check('phone: a new trip gets its own button', btns.length === 2 && btns[1].q.originName === 'Chicken Joo – Halang' && btns[1].q.destName === 'Calamba City Hall', JSON.stringify(btns.map(b => b.q)));

    // Still there after the page reloads (chat history restored)
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);
    await page.evaluate(() => document.getElementById('chatToggleBtn').click());
    await page.waitForSelector('#chatWindow.open');
    await page.waitForTimeout(300);
    btns = await plannerButtons(page);
    check('phone: the buttons come back with the chat after a reload', btns.length === 2 && btns[0].text === 'Tingnan sa Planner', JSON.stringify(btns.map(b => b.text)));

    // Tap the first one: the Planner opens with that trip and plans it
    await page.locator('#chatMessages .routie-planner-btn').first().scrollIntoViewIfNeeded();
    await Promise.all([page.waitForURL(/\/planner\?/, { timeout: 15000 }), page.locator('#chatMessages .routie-planner-btn').first().tap()]);
    let planner = null;
    try {
        await page.waitForFunction(() => {
            const o = document.getElementById('openOriginModal'), d = document.getElementById('openDestModal');
            return o && d && /SM City Calamba/.test(o.textContent) && /Chicken Joo/.test(d.textContent);
        }, null, { timeout: 15000 });
        await page.waitForTimeout(2500);
        planner = await page.evaluate(() => ({
            origin: document.getElementById('openOriginModal').textContent.replace(/\s+/g, ' ').trim(),
            dest: document.getElementById('openDestModal').textContent.replace(/\s+/g, ' ').trim(),
            summary: (() => { const s = document.getElementById('routeSummaryBlock'); return s && getComputedStyle(s).display !== 'none' ? s.innerText.replace(/\s+/g, ' ').trim() : ''; })()
        }));
    } catch (e) { planner = { error: e.message.split('\n')[0] }; }
    check('phone: "Tingnan sa Planner" opens the Planner with the trip set', !!planner && /SM City Calamba/.test(planner.origin || '') && /Chicken Joo – Halang/.test(planner.dest || ''), JSON.stringify(planner));
    check('phone: the Planner plans the route right away', !!planner && /₱/.test(planner.summary || ''), JSON.stringify(planner));
    await shot(page, 'route-phone-5-planner');
    await context.close();
}

// ── Computer, English ───────────────────────────────────────────────────────────────────────
{
    const { context, page, press } = await openRoutie({ mobile: false, lang: 'en' });
    await speak(page, press, 'From Calamba City Hall to SM City Calamba, how much is the fare?', ['From Calamba City Hall', 'From Calamba City Hall to SM City Calamba, how much'], 3800);
    const box = await page.evaluate(() => ({ value: document.getElementById('chatInput').value, focused: document.activeElement === document.getElementById('chatInput') }));
    check('computer: transcript in the box, cursor in it to edit', box.value === 'From Calamba City Hall to SM City Calamba, how much is the fare?' && box.focused, JSON.stringify(box));
    let n = await botCount(page);
    await page.keyboard.press('Enter');
    let reply = await lastBotReplyAfter(page, n);
    check('computer: Routie answers with the route', /^Total: ₱14\.00/.test(reply) && reply.includes('SM Calamba (Cinema side)'), reply.slice(0, 260));
    await speak(page, press, 'Where do I get off?', ['Where do I get off?'], 2600);
    n = await botCount(page);
    await page.keyboard.press('Enter');
    reply = await lastBotReplyAfter(page, n);
    check('computer: "Where do I get off?" by voice', /^Get off at SM Calamba \(Cinema side\)/.test(reply), reply);
    const enBtns = await plannerButtons(page);
    check('computer: English button "Open in Planner", once', enBtns.length === 1 && enBtns[0].text === 'Open in Planner'
        && enBtns[0].label === 'Open this route in the Planner: Calamba City Hall to SM City Calamba', JSON.stringify(enBtns));
    await shot(page, 'route-desktop');
    await context.close();
}

check('stand-in: live words used the fast model, the transcript the full one', groq.models.has('whisper-large-v3-turbo') && groq.models.has('whisper-large-v3'), [...groq.models].join(', '));
log(`(chat completions asked of the stand-in: ${groq.chatCalls}; every reply above came from Calzada's data)`);

await browser.close();
server.close();
standIn.close();
console.log(`\nChecks: ${checks - failures}/${checks} pass`);
process.exit(failures ? 1 : 0);
