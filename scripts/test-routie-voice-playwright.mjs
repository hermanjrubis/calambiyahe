#!/usr/bin/env node
/**
 * scripts/test-routie-voice-playwright.mjs — Routie's voice input in a real browser, with Chrome's fake microphone.
 *
 *   npm start                                  (local server on :5000, in another terminal)
 *   node scripts/test-routie-voice-playwright.mjs
 *
 * Env: BASE (default http://localhost:5000), CHROMIUM_PATH (a Chrome/Chromium binary), SHOTS=dir (save screenshots).
 * The transcription and chat APIs are stubbed in the page, so no AI key is needed. A stand-in speech recognizer
 * plays live words on desktop. Checks the sheet, live caption, timer, wave level, writing-it-down, the transcript
 * with its corrections note and Undo, Cancel / Escape / Type instead / hints, closing Routie while listening, errors,
 * Tagalog texts, the phone layout (no live caption) and the planner page. Exit code 1 when a check fails.
 */
import fs from 'fs';
import path from 'path';

const BASE = process.env.BASE || 'http://localhost:5000';
const SHOTS = process.env.SHOTS || '';
let chromium;
try { ({ chromium } = await import('playwright')); } catch (_) { ({ chromium } = await import('/opt/npm-tools/node_modules/playwright/index.mjs')); }

let checks = 0, failures = 0;
const check = (name, ok, detail = '') => { checks++; if (!ok) { failures++; console.log(`FAIL ${name}${detail ? `\n       ${detail}` : ''}`); } };

const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--no-sandbox']
});

// Stand-in speech recognizer: says "SM papuntang chicken" (heard so far), then "jo Halang"
const FAKE_SR = `
(() => {
  window.__srStarted = 0;
  window.__lastStream = null;
  const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (c) => { const s = await gum(c); window.__lastStream = s; return s; };
  class FakeSR {
    constructor() { this.onresult = null; this.onerror = null; this.onend = null; this._t = []; }
    start() {
      window.__srStarted++;
      const r = (parts) => { const res = parts.map(([t, f]) => Object.assign([{ transcript: t }], { isFinal: f })); return { results: res }; };
      this._t.push(setTimeout(() => this.onresult && this.onresult(r([['SM papuntang chicken', false]])), 400));
      this._t.push(setTimeout(() => this.onresult && this.onresult(r([['SM papuntang chicken', true], ['jo Halang', false]])), 900));
    }
    abort() { this._t.forEach(clearTimeout); if (this.onend) this.onend(); }
    stop() { this.abort(); }
  }
  window.SpeechRecognition = FakeSR;
  window.webkitSpeechRecognition = FakeSR;
})();`;

async function setupPage({ mobile = false, lang = 'en', transcribe = null, pagePath = '/' } = {}) {
    const context = await browser.newContext(mobile
        ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
            userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' }
        : { viewport: { width: 1280, height: 800 } });
    await context.grantPermissions(['microphone'], { origin: BASE });
    await context.addInitScript(FAKE_SR);
    await context.addInitScript((l) => { try { localStorage.setItem('calzada_lang', l); } catch (_) { } }, lang);
    const page = await context.newPage();
    const state = { uploads: [], chat: 0 };
    await page.route(/(tiles|openfreemap|cartocdn|basemaps|arcgis|nominatim|googleapis\.com\/maps|firebase|gstatic)/, r => r.abort());
    await page.route('**/api/voice/transcribe', async (route) => {
        const body = route.request().postDataBuffer() || Buffer.alloc(0);
        state.uploads.push({ bytes: body.length, hasAudio: /name="audio"/.test(body.toString('latin1')), lang: (body.toString('latin1').match(/name="lang"\r\n\r\n([a-z]+)/) || [])[1] });
        await new Promise(r => setTimeout(r, 700));
        const t = transcribe || { status: 200, body: { success: true, text: 'SM papuntang Chicken Joo Halang', raw: 'SM papuntang chicken jo Halang', corrections: [{ from: 'chicken jo', to: 'Chicken Joo' }] } };
        await route.fulfill({ status: t.status, contentType: 'application/json', body: JSON.stringify(t.body) });
    });
    await page.route('**/api/chat', async (route) => { state.chat++; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply: 'Kabuuan: ₱14.00', context: null }) }); });
    await page.goto(BASE + pagePath, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    await page.evaluate(() => { const b = document.getElementById('chatToggleBtn'); if (b) b.click(); else if (window.openChat) window.openChat(); });
    await page.waitForSelector('#chatWindow.open', { timeout: 8000 });
    await page.waitForTimeout(350);
    return { context, page, state };
}

const sheetOpen = (page) => page.evaluate(() => { const s = document.querySelector('#chatWindow .rv-sheet'); return !!s && !s.hidden && s.classList.contains('is-open'); });
const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); } };

// ── Desktop, English: the whole flow ─────────────────────────────────────────────────────────
{
    const { context, page, state } = await setupPage();
    await page.click('#micBtn');
    await page.waitForTimeout(250);
    check('desktop: sheet opens on mic', await sheetOpen(page));
    const first = await page.evaluate(() => ({
        title: document.getElementById('rvSheetTitle').textContent,
        caption: document.getElementById('rvCaption').textContent,
        hints: !document.getElementById('rvHints').hidden,
        hintText: [...document.querySelectorAll('.rv-hint')].map(b => b.textContent),
        focus: document.activeElement && document.activeElement.id,
        pressed: document.getElementById('micBtn').getAttribute('aria-pressed'),
        labels: ['rvCancelBtn', 'rvStopBtn', 'rvTypeBtn', 'rvCloseBtn'].map(id => document.getElementById(id).getAttribute('aria-label'))
    }));
    check('desktop: English title and prompt', first.title === 'Routie is listening' && first.caption === "Go ahead, I'm listening…", JSON.stringify(first));
    check('desktop: hints shown before speaking', first.hints && first.hintText[0] === '"SM to Jollibee Real"' && first.hintText[1] === '"Is SM open right now?"', JSON.stringify(first.hintText));
    check('desktop: focus on Stop, mic pressed', first.focus === 'rvStopBtn' && first.pressed === 'true', JSON.stringify(first));
    check('desktop: every button has a label', first.labels.every(Boolean) && first.labels[1] === 'Stop and write what I said', JSON.stringify(first.labels));
    await shot(page, 'desktop-listening-empty');
    await page.waitForTimeout(1500);
    const live = await page.evaluate(() => ({
        caption: document.getElementById('rvCaption').textContent,
        interim: (document.querySelector('#rvCaption .rv-interim') || {}).textContent,
        hints: document.getElementById('rvHints').hidden,
        timer: document.getElementById('rvTimer').textContent,
        amp: getComputedStyle(document.getElementById('rvWaves')).getPropertyValue('--rv-amp').trim(),
        sr: window.__srStarted
    }));
    check('desktop: live words appear, word in progress marked', live.caption === 'SM papuntang chicken jo Halang' && live.interim === 'jo Halang', JSON.stringify(live));
    check('desktop: hints hide once words come', live.hints === true);
    check('desktop: timer runs', live.timer === '0:01' || live.timer === '0:02', live.timer);
    check('desktop: wave follows the mic level', live.amp !== '' && Number(live.amp) >= 0.3, `--rv-amp=${live.amp}`);
    await shot(page, 'desktop-listening-words');
    await page.click('#rvStopBtn');
    await page.waitForTimeout(250);
    const writing = await page.evaluate(() => ({
        sheet: document.querySelector('#chatWindow .rv-sheet').hidden,
        cls: document.querySelector('#chatWindow .chat-input-area').classList.contains('is-transcribing'),
        text: document.getElementById('voiceTranscribingText').textContent,
        shown: getComputedStyle(document.querySelector('#chatWindow .chat-voice-transcribing')).display
    }));
    check('desktop: Stop closes the sheet and shows "writing it down"', writing.sheet && writing.cls && writing.text === 'Writing down what you said…' && writing.shown !== 'none', JSON.stringify(writing));
    await shot(page, 'desktop-transcribing');
    await page.waitForTimeout(1200);
    const done = await page.evaluate(() => ({
        value: document.getElementById('chatInput').value,
        note: !document.querySelector('#chatWindow .rv-fix-note').hidden,
        noteText: document.querySelector('#chatWindow .rv-fix-text').textContent,
        undo: document.querySelector('#chatWindow .rv-undo').textContent,
        cls: document.querySelector('#chatWindow .chat-input-area').classList.contains('is-transcribing'),
        tracks: window.__lastStream ? window.__lastStream.getTracks().map(t => t.readyState) : []
    }));
    check('desktop: transcript in the input box', done.value === 'SM papuntang Chicken Joo Halang' && !done.cls, JSON.stringify(done));
    check('desktop: corrections note with Undo', done.note && done.noteText === 'Fixed: "chicken jo" → Chicken Joo.' && done.undo === 'Undo', JSON.stringify(done));
    check('desktop: microphone released after Stop', done.tracks.length > 0 && done.tracks.every(s => s === 'ended'), JSON.stringify(done.tracks));
    check('desktop: audio uploaded with the language', state.uploads.length === 1 && state.uploads[0].hasAudio && state.uploads[0].bytes > 1000 && state.uploads[0].lang === 'en', JSON.stringify(state.uploads));
    await shot(page, 'desktop-ready');
    await page.click('#chatWindow .rv-undo');
    const undone = await page.evaluate(() => ({ value: document.getElementById('chatInput').value, note: document.querySelector('#chatWindow .rv-fix-note').hidden }));
    check('desktop: Undo puts back the words as heard', undone.value === 'SM papuntang chicken jo Halang' && undone.note, JSON.stringify(undone));
    // Send: the note goes away, the message is sent
    await page.click('#micBtn'); await page.waitForTimeout(1300); await page.click('#rvStopBtn'); await page.waitForTimeout(1300);
    await page.click('#sendMessageBtn'); await page.waitForTimeout(400);
    const sent = await page.evaluate(() => ({ note: document.querySelector('#chatWindow .rv-fix-note').hidden, value: document.getElementById('chatInput').value }));
    check('desktop: sending clears the note', sent.note && sent.value === '' && state.chat === 1, JSON.stringify({ ...sent, chat: state.chat }));

    // Escape cancels listening only (Routie stays open), nothing is uploaded
    const before = state.uploads.length;
    await page.click('#micBtn'); await page.waitForTimeout(500);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    const esc = await page.evaluate(() => ({ sheet: document.querySelector('#chatWindow .rv-sheet').hidden, open: document.getElementById('chatWindow').classList.contains('open'),
        tracks: window.__lastStream.getTracks().map(t => t.readyState), focus: document.activeElement && document.activeElement.id }));
    check('desktop: Escape cancels listening, Routie stays open', esc.sheet && esc.open && esc.tracks.every(s => s === 'ended') && esc.focus === 'micBtn' && state.uploads.length === before, JSON.stringify(esc));

    // Cancel button
    await page.click('#micBtn'); await page.waitForTimeout(500);
    await page.click('#rvCancelBtn'); await page.waitForTimeout(300);
    check('desktop: Cancel closes the sheet without uploading', !(await sheetOpen(page)) && state.uploads.length === before);

    // Type instead
    await page.click('#micBtn'); await page.waitForTimeout(500);
    await page.click('#rvTypeBtn'); await page.waitForTimeout(300);
    const typeInstead = await page.evaluate(() => ({ sheet: document.querySelector('#chatWindow .rv-sheet').hidden, focus: document.activeElement && document.activeElement.id }));
    check('desktop: Type instead focuses the input', typeInstead.sheet && typeInstead.focus === 'chatInput', JSON.stringify(typeInstead));

    // A hint fills the input
    await page.click('#micBtn'); await page.waitForTimeout(150);
    await page.click('.rv-hint[data-hint="2"]'); await page.waitForTimeout(300);
    const hint = await page.evaluate(() => document.getElementById('chatInput').value);
    check('desktop: a hint goes into the input', hint === 'Is SM open right now?', hint);

    // Closing Routie while listening stops the microphone
    await page.evaluate(() => { document.getElementById('chatInput').value = ''; });
    await page.click('#micBtn'); await page.waitForTimeout(500);
    await page.evaluate(() => window.closeChat());
    await page.waitForTimeout(300);
    const closed = await page.evaluate(() => ({ open: document.getElementById('chatWindow').classList.contains('open'), sheet: document.querySelector('#chatWindow .rv-sheet').hidden,
        tracks: window.__lastStream.getTracks().map(t => t.readyState) }));
    check('desktop: closing Routie stops the microphone', !closed.open && closed.sheet && closed.tracks.every(s => s === 'ended'), JSON.stringify(closed));
    await context.close();
}

// ── Errors ───────────────────────────────────────────────────────────────────────────────────
for (const [name, t, want] of [
    ['busy', { status: 429, body: { success: false, error: 'busy' } }, 'Voice is busy right now. Please try again in a minute.'],
    ['no speech', { status: 200, body: { success: true, text: '', raw: '', corrections: [] } }, 'No speech was detected. Please try speaking again.']
]) {
    const { context, page } = await setupPage({ transcribe: t });
    await page.click('#micBtn'); await page.waitForTimeout(1300);
    await page.click('#rvStopBtn'); await page.waitForTimeout(1300);
    const err = await page.evaluate(() => ({ text: (document.querySelector('#chatVoiceError .voice-error-text') || {}).textContent, input: document.getElementById('chatInput').value,
        cls: document.querySelector('#chatWindow .chat-input-area').classList.contains('is-transcribing') }));
    check(`error: ${name} shows its message`, err.text === want && !err.cls && err.input === '', JSON.stringify(err));
    await context.close();
}
{
    // The server fails but the browser heard the words: they are kept
    const { context, page } = await setupPage({ transcribe: { status: 500, body: { success: false, error: 'transcription_failed' } } });
    await page.click('#micBtn'); await page.waitForTimeout(1300);
    await page.click('#rvStopBtn'); await page.waitForTimeout(1300);
    const v = await page.evaluate(() => document.getElementById('chatInput').value);
    check('error: server failure keeps the live words', v === 'SM papuntang chicken jo Halang', v);
    await context.close();
}

// ── Tagalog ──────────────────────────────────────────────────────────────────────────────────
{
    const { context, page, state } = await setupPage({ lang: 'tl', transcribe: { status: 200, body: { success: true, text: 'Magkano papuntang Chicken Joo?', raw: 'Magkano papuntang chicken jo?', corrections: [{ from: 'chicken jo', to: 'Chicken Joo' }] } } });
    await page.click('#micBtn'); await page.waitForTimeout(200);
    const tl = await page.evaluate(() => ({ title: document.getElementById('rvSheetTitle').textContent, caption: document.getElementById('rvCaption').textContent,
        label: document.getElementById('rvHintsLabel').textContent, hints: [...document.querySelectorAll('.rv-hint')].map(b => b.textContent),
        stop: document.getElementById('rvStopBtn').getAttribute('aria-label'), type: document.getElementById('rvTypeBtn').getAttribute('aria-label') }));
    check('tagalog: sheet texts', tl.title === 'Nakikinig si Routie' && tl.caption === 'Magsalita ka na…' && tl.label === 'Subukang sabihin'
        && tl.hints[0] === '"SM papuntang Jollibee Real"' && tl.hints[1] === '"Bukas pa ba ang SM ngayon?"'
        && tl.stop === 'Ihinto at isulat ang sinabi ko' && tl.type === 'Mag-type na lang', JSON.stringify(tl));
    await shot(page, 'tagalog-listening');
    await page.waitForTimeout(1100);
    await page.click('#rvStopBtn'); await page.waitForTimeout(250);
    const w = await page.evaluate(() => document.getElementById('voiceTranscribingText').textContent);
    check('tagalog: writing-it-down text', w === 'Isinusulat ang sinabi mo…', w);
    await page.waitForTimeout(1200);
    const r = await page.evaluate(() => ({ note: document.querySelector('#chatWindow .rv-fix-text').textContent, undo: document.querySelector('#chatWindow .rv-undo').textContent }));
    check('tagalog: corrections note', r.note === 'Inayos: "chicken jo" → Chicken Joo.' && r.undo === 'Ibalik', JSON.stringify(r));
    check('tagalog: language sent', state.uploads[0] && state.uploads[0].lang === 'tl', JSON.stringify(state.uploads));
    await shot(page, 'tagalog-ready');
    await context.close();
}

// ── Phone: full-screen sheet, no live caption (it can take the mic from the recording) ─────
{
    const { context, page, state } = await setupPage({ mobile: true });
    await page.tap('#micBtn'); await page.waitForTimeout(1300);
    const ph = await page.evaluate(() => {
        const s = document.querySelector('#chatWindow .rv-sheet').getBoundingClientRect();
        const w = document.getElementById('chatWindow').getBoundingClientRect();
        const stop = document.getElementById('rvStopBtn').getBoundingClientRect();
        return { sr: window.__srStarted, caption: document.getElementById('rvCaption').textContent,
            cover: Math.abs(s.width - w.width) < 2 && Math.abs(s.height - w.height) < 2, stopVisible: stop.bottom <= window.innerHeight && stop.top >= 0,
            overflowX: document.documentElement.scrollWidth > window.innerWidth };
    });
    check('phone: no live caption, prompt shown', ph.sr === 0 && ph.caption === "Go ahead, I'm listening…", JSON.stringify(ph));
    check('phone: sheet covers the chat, Stop on screen', ph.cover && ph.stopVisible && !ph.overflowX, JSON.stringify(ph));
    await shot(page, 'phone-listening');
    await page.tap('#rvStopBtn'); await page.waitForTimeout(1300);
    const v = await page.evaluate(() => document.getElementById('chatInput').value);
    check('phone: transcript in the input', v === 'SM papuntang Chicken Joo Halang' && state.uploads.length === 1, v);
    await shot(page, 'phone-ready');
    await context.close();
}

// ── Planner page (its own stylesheet) ────────────────────────────────────────────────────────
{
    const { context, page } = await setupPage({ pagePath: '/planner' });
    await page.click('#micBtn'); await page.waitForTimeout(400);
    const p = await page.evaluate(() => {
        const s = document.querySelector('#chatWindow .rv-sheet');
        return { open: !!s && !s.hidden, pos: s ? getComputedStyle(s).position : null, z: s ? getComputedStyle(s).zIndex : null };
    });
    check('planner: sheet opens over the chat', p.open && p.pos === 'absolute' && p.z === '40', JSON.stringify(p));
    await page.waitForTimeout(900);
    await page.click('#rvStopBtn'); await page.waitForTimeout(250);
    const shown = await page.evaluate(() => getComputedStyle(document.querySelector('#chatWindow .chat-voice-transcribing')).display);
    check('planner: writing-it-down shows', shown !== 'none', shown);
    await page.waitForTimeout(1200);
    const v = await page.evaluate(() => ({ value: document.getElementById('chatInput').value, note: !document.querySelector('#chatWindow .rv-fix-note').hidden }));
    check('planner: transcript and note', v.value === 'SM papuntang Chicken Joo Halang' && v.note, JSON.stringify(v));
    await shot(page, 'planner-ready');
    await context.close();
}

await browser.close();
console.log(`\nChecks: ${checks - failures}/${checks} pass`);
process.exit(failures ? 1 : 0);
