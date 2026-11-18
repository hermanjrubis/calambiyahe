#!/usr/bin/env node
/**
 * scripts/test-routie-voice.mjs — Routie's voice transcripts (server/routie-voice.js), without a real model or network.
 *
 *   node scripts/test-routie-voice.mjs
 *
 * Checks: silence and stock Whisper lines give no text; place names are corrected only when they were misheard
 * (and ordinary English/Tagalog/Taglish sentences are left alone); Tagalog detected as another language is
 * transcribed again as Tagalog; the vocabulary prompt carries Calzada's places. Exit code 1 when a check fails.
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const voice = require(path.join(ROOT, 'server/routie-voice.js'));
const places = require(path.join(ROOT, 'server/data/places.json'));
const lexicon = voice.buildLexicon(places);

let checks = 0, failures = 0;
function check(name, ok, detail = '') {
    checks++;
    if (!ok) { failures++; console.log(`FAIL ${name}${detail ? `\n       ${detail}` : ''}`); }
}
const seg = (text, o = {}) => ({ text, avg_logprob: -0.2, no_speech_prob: 0.02, compression_ratio: 1.2, ...o });

// ── Silence and noise ───────────────────────────────────────────────────────────────────────
check('silence: "Thank you for watching" over silence is no text',
    voice.cleanTranscript({ text: ' Thank you for watching.', segments: [seg(' Thank you for watching.', { no_speech_prob: 0.82, avg_logprob: -0.9 })] }) === '');
check('silence: "Salamat po sa panonood" with doubts is no text',
    voice.cleanTranscript({ text: 'Salamat po sa panonood.', segments: [seg('Salamat po sa panonood.', { no_speech_prob: 0.4 })] }) === '');
check('speech: a clear "Salamat po" is kept',
    voice.cleanTranscript({ text: 'Salamat po.', segments: [seg('Salamat po.')] }) === 'Salamat po.');
check('noise: a very unsure segment is dropped, the rest kept',
    voice.cleanTranscript({ segments: [seg(' SM papuntang Real'), seg(' ka ka ka ka', { avg_logprob: -1.6 })] }) === 'SM papuntang Real');
check('noise: a repeating segment is dropped',
    voice.cleanTranscript({ segments: [seg(' magkano magkano magkano magkano magkano', { compression_ratio: 3.1 })] }) === '');
check('speech: without segments the text is used',
    voice.cleanTranscript({ text: ' Paano pumunta sa Halang? ' }) === 'Paano pumunta sa Halang?');
check('speech: wrapping quotes and trailing dots are removed',
    voice.cleanTranscript({ text: '"Bukas pa ba ang SM ngayon..."' }) === 'Bukas pa ba ang SM ngayon');

// ── Whisper repeating itself ───────────────────────────────────────────────────────────────
for (const [heard, want] of [
    ["Hello? Hello? What's up? Saan? Saan papuntang Calamba City Hall?", "Hello? What's up? Saan papuntang Calamba City Hall?"],
    ['Saan papuntang Halang papuntang Halang?', 'Saan papuntang Halang?'],
    ['Magkano magkano ang pamasahe', 'Magkano ang pamasahe'],
    ['How do I get, how do I get to SM?', 'How do I get to SM?'],
    ['salamat po po', 'salamat po po'],
    ['SM papuntang Real', 'SM papuntang Real']
]) {
    const got = voice.collapseRepeats(heard);
    check(`repeat: "${heard}"`, got === want, `got "${got}"`);
}
check('repeat: applied to transcripts', voice.cleanTranscript({ segments: [seg(' Hello? Hello? Saan papuntang Real?')] }) === 'Hello? Saan papuntang Real?');
check('prompt: names only, no example questions to echo', !/\?/.test(voice.VOICE_PROMPT), voice.VOICE_PROMPT);

// ── Place names: fixed when misheard ────────────────────────────────────────────────────────
const fixes = [
    ['SM papuntang chicken jo Halang', 'SM papuntang Chicken Joo Halang', ['chicken jo → Chicken Joo']],
    ['magkano mula kalamba crossing papuntang jolibee real?', 'magkano mula Calamba crossing papuntang Jollibee real?', ['jolibee → Jollibee', 'kalamba → Calamba']],
    ['puregould halang po', 'Puregold halang po', ['puregould → Puregold']],
    ['crosing grand terminal papuntang real', 'Crossing Grand Terminal papuntang real', ['crosing grand terminal → Crossing Grand Terminal']],
    ['ano oras bukas ng mercury drag', 'ano oras bukas ng Mercury Drug', ['mercury drag → Mercury Drug']],
    ['magkano pamasahe papuntang calamba medical centre', 'magkano pamasahe papuntang Calamba Medical Center', ['calamba medical centre → Calamba Medical Center']],
    ['punta ako sa seven eleven', 'punta ako sa 7-Eleven', ['seven eleven → 7-Eleven']],
    ['papuntang mcdo crossing', "papuntang McDonald's crossing", ["mcdo → McDonald's"]],
    ['gusto ko pumunta sa kalamba city hall', 'gusto ko pumunta sa Calamba City Hall', ['kalamba city hall → Calamba City Hall']],
    ['how do I get to chicken jo?', 'how do I get to Chicken Joo?', ['chicken jo → Chicken Joo']],
    ['Hello Ruti, how are you?', 'Hello Routie, how are you?', ['Ruti → Routie']],
    ['uy rooti saan sakayan papuntang Halang', 'uy Routie saan sakayan papuntang Halang', ['rooti → Routie']]
];
for (const [said, want, wantFixes] of fixes) {
    const r = voice.correctPlaceNames(said, lexicon);
    const got = r.corrections.map(c => `${c.from} → ${c.to}`).sort();
    check(`fix: "${said}"`, r.text === want && JSON.stringify(got) === JSON.stringify([...wantFixes].sort()),
        `got "${r.text}" ${JSON.stringify(got)}`);
}

// ── Left alone: right already, or ordinary words ────────────────────────────────────────────
const keep = [
    'How do I get to Chicken Joo from Crossing?',
    'saan sasakay papuntang halang',
    'bukas pa ba ang sm ngayon',
    'papuntang mang inasal halang',
    'is that real',
    'parang malayo yung parian',
    'Saan ang terminal papuntang Real?',
    'we are going to the terminal near sm',
    'ilang minuto papuntang halang',
    'magkano ang pamasahe kung student ako',
    'Is Calzada free?',
    'paano kung sa SM City Calamba Transport Terminal ako sasakay',
    'what time does it close tonight',
    'pakisabi kung saan ako bababa',
    'thank you Routie',
    'saan ang kalsada papuntang Real',
    'ang daming sasakyan sa kalsada'
];
for (const said of keep) {
    const r = voice.correctPlaceNames(said, lexicon);
    check(`keep: "${said}"`, r.text === said.replace(/\s+/g, ' ').trim() && r.corrections.length === 0, `got "${r.text}" ${JSON.stringify(r.corrections)}`);
}

// ── Language: detected, retried as Tagalog when misheard ───────────────────────────────────
function fakeClient(replies) {
    const calls = [];
    return {
        calls,
        audio: { transcriptions: { create: async (opts) => {
            calls.push({ language: opts.language || null, prompt: opts.prompt, format: opts.response_format, temperature: opts.temperature });
            const r = replies[calls.length - 1];
            if (r instanceof Error) throw r;
            return r;
        } } }
    };
}
const buffer = Buffer.from('fake-audio');
{
    const c = fakeClient([{ text: 'Berapa ongkos dari SM ke Real?', language: 'indonesian', segments: [seg('Berapa ongkos dari SM ke Real?')] },
        { text: 'Magkano ang pamasahe mula SM papuntang Real?', language: 'tagalog', segments: [seg('Magkano ang pamasahe mula SM papuntang Real?')] }]);
    const r = await voice.transcribeVoice(c, { buffer, lexicon });
    check('language: Indonesian is redone as Tagalog', c.calls.length === 2 && c.calls[0].language === null && c.calls[1].language === 'tl'
        && r.text === 'Magkano ang pamasahe mula SM papuntang Real?' && r.retried === true, JSON.stringify({ calls: c.calls.map(x => x.language), r }));
}
{
    const c = fakeClient([{ text: 'How do I get to chicken jo from SM?', language: 'english', segments: [seg('How do I get to chicken jo from SM?')] }]);
    const r = await voice.transcribeVoice(c, { buffer, lexicon });
    check('language: English is one call, no forced language', c.calls.length === 1 && c.calls[0].language === null);
    check('language: English place name fixed', r.text === 'How do I get to Chicken Joo from SM?' && r.raw === 'How do I get to chicken jo from SM?' && r.corrections.length === 1);
}
{
    const c = fakeClient([{ text: 'Eh paano kung sa Crossing ako sasakay?', language: 'tagalog', segments: [seg('Eh paano kung sa Crossing ako sasakay?')] }]);
    const r = await voice.transcribeVoice(c, { buffer, lexicon });
    check('language: Taglish heard as Tagalog stays as is', c.calls.length === 1 && r.text === 'Eh paano kung sa Crossing ako sasakay?');
}
{
    const busy = Object.assign(new Error('rate limited'), { status: 429 });
    const c = fakeClient([{ text: 'Magkano po papuntang Halang', language: 'malay', segments: [seg('Magkano po papuntang Halang')] }, busy]);
    const r = await voice.transcribeVoice(c, { buffer, lexicon });
    check('language: a failed retry keeps the first transcript', c.calls.length === 2 && r.text === 'Magkano po papuntang Halang' && r.retried === false);
}
{
    const c = fakeClient([{ text: ' Thank you.', language: 'english', segments: [seg(' Thank you.', { no_speech_prob: 0.9, avg_logprob: -0.8 })] }]);
    const r = await voice.transcribeVoice(c, { buffer, lexicon });
    check('silence: no text and no corrections', r.text === '' && r.corrections.length === 0);
}
{
    const c = fakeClient([{ text: 'x', language: 'english', segments: [seg('x')] }]);
    await voice.transcribeVoice(c, { buffer, lexicon });
    const p = c.calls[0];
    check('request: Calzada vocabulary, verbose JSON, temperature 0', /Chicken Joo/.test(p.prompt) && /Crossing Grand Terminal/.test(p.prompt)
        && /pamasahe/.test(p.prompt) && p.format === 'verbose_json' && p.temperature === 0);
    check('request: prompt stays short for Whisper', voice.VOICE_PROMPT.length < 700, `${voice.VOICE_PROMPT.length} chars`);
}

// ── Live words (partial): fast model, one call, names fixed ────────────────────────────────
{
    const c = fakeClient([{ text: 'SM papuntang chicken jo', language: 'tagalog', segments: [seg('SM papuntang chicken jo')] }]);
    const models = [];
    const orig = c.audio.transcriptions.create;
    c.audio.transcriptions.create = async (opts) => { models.push(opts.model); return orig(opts); };
    const r = await voice.transcribeVoicePartial(c, { buffer, lexicon });
    check('live: one call on the fast model, names fixed', models.length === 1 && models[0] === 'whisper-large-v3-turbo' && r.text === 'SM papuntang Chicken Joo', JSON.stringify({ models, r }));
}
{
    const missing = Object.assign(new Error('model not found'), { status: 404 });
    const c = fakeClient([missing, { text: 'Magkano', language: 'tagalog', segments: [seg('Magkano')] }]);
    const models = [];
    const orig = c.audio.transcriptions.create;
    c.audio.transcriptions.create = async (opts) => { models.push(opts.model); return orig(opts); };
    const r = await voice.transcribeVoicePartial(c, { buffer, lexicon });
    check('live: falls back when the fast model is missing', models.join(',') === 'whisper-large-v3-turbo,whisper-large-v3' && r.text === 'Magkano', JSON.stringify({ models, r }));
}
{
    const busy = Object.assign(new Error('rate limited'), { status: 429 });
    const c = fakeClient([busy]);
    let threw = null;
    try { await voice.transcribeVoicePartial(c, { buffer, lexicon }); } catch (err) { threw = err.status; }
    check('live: busy is passed on (the widget stops asking)', threw === 429 && c.calls.length === 1);
}
{
    const c = fakeClient([{ text: ' Thank you.', language: 'english', segments: [seg(' Thank you.', { no_speech_prob: 0.9, avg_logprob: -0.8 })] }]);
    const r = await voice.transcribeVoicePartial(c, { buffer, lexicon });
    check('live: silence shows no words', r.text === '');
}

console.log(`\nChecks: ${checks - failures}/${checks} pass`);
process.exit(failures ? 1 : 0);
