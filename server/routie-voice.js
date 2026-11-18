// Routie voice input: speech to text that is right for English, Tagalog and Taglish in Calamba.
//
//   1. Whisper (Groq whisper-large-v3) gets a vocabulary prompt with Calzada's own places and commuter phrases, so
//      "Chicken Joo", "Crossing Grand Terminal" or "pamasahe" are spelled the way Routie knows them.
//   2. The language is detected, never forced on the first try: forcing a language makes Whisper translate speech in
//      another language. Tagalog is often detected as Indonesian or Malay; then it is transcribed again as Tagalog.
//   3. Whisper writes text even for silence ("Thank you for watching"). Segments that are probably not speech are
//      dropped, and a transcript that is only such a stock phrase counts as no speech.
//   4. Place names that came out slightly wrong are corrected against Calzada's places ("chicken jo" → "Chicken Joo",
//      "jolibee" → "Jollibee"). Every change is returned, so the widget can show it and the user can undo it.

'use strict';

const MODEL = 'whisper-large-v3';
// Live words while the commuter is still talking: the faster model, one call, no retry
const PARTIAL_MODELS = ['whisper-large-v3-turbo', 'whisper-large-v3'];
const OK_LANGUAGES = new Set(['english', 'tagalog', 'filipino', 'en', 'tl', 'fil']);

// What Routie hears most: names and words only. No example sentences: Whisper echoes prompt sentences into short or
// cut-off audio (a live preview ending in "Saan?" that nobody said). Kept short (Whisper reads ~224 tokens of prompt).
const VOICE_PROMPT = 'Hi Routie! Calzada, Calamba, Laguna, SM City Calamba, Crossing Grand Terminal, SM City Calamba Transport Terminal, '
    + 'New Calamba Transport Terminal, Calamba Medical Center, Calamba City Hall, Chicken Joo, Jollibee, Mang Inasal, Andok\'s, '
    + 'Puregold, Mercury Drug, 7-Eleven, Barangay Uno, Real, Halang, Crossing, jeep, jeepney, pamasahe, papuntang, sasakay, '
    + 'terminal, student, senior.';

// Stock lines Whisper writes over silence or noise
const NOT_SPEECH = new Set([
    'thank you', 'thank you very much', 'thanks for watching', 'thank you for watching', 'please subscribe', 'subscribe',
    'like and subscribe', 'bye', 'bye bye', 'you', 'music', 'applause', 'silence', 'subtitles by the amara org community',
    'salamat sa panonood', 'salamat po sa panonood', 'maraming salamat sa panonood', 'salamat po', 'salamat'
]);

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

// ── Is it speech? ────────────────────────────────────────────────────────────────────────────
// A segment is probably not speech when Whisper itself thinks so, is very unsure, or repeats itself.
function speechSegments(segments) {
    if (!Array.isArray(segments)) return null;
    return segments.filter(s => {
        const noSpeech = Number(s.no_speech_prob) || 0;
        const logprob = Number.isFinite(Number(s.avg_logprob)) ? Number(s.avg_logprob) : 0;
        const compression = Number(s.compression_ratio) || 0;
        if (noSpeech > 0.6 && logprob < -0.5) return false;
        if (logprob < -1.2) return false;
        if (compression > 2.6) return false;
        return true;
    });
}

// Whisper repeats itself at a cut or a pause: "Hello? Hello? What's up? Saan? Saan papuntang …". A word (or a run of
// up to four words) said twice in a row is kept once: the later copy, which carries on the sentence.
function collapseRepeats(text) {
    let words = String(text || '').split(/\s+/).filter(Boolean);
    for (let n = 4; n >= 1; n--) {
        const out = [];
        for (let i = 0; i < words.length; i++) {
            const a = words.slice(i, i + n), b = words.slice(i + n, i + 2 * n);
            const same = b.length === n && norm(a.join(' ')) === norm(b.join(' ')) && norm(a.join(' ')).length >= 2;
            // one short word twice ("po po", "ano ano") can be real speech; drop it only when Whisper split it off
            const short = n === 1 && norm(a[0]).length < 3 && !/[?!.,]$/.test(a[0]);
            if (same && !short) {
                // keep the later copy (with the capital the sentence started with)
                if (/^[A-Z]/.test(a[0]) && b[0]) words[i + n] = b[0].charAt(0).toUpperCase() + b[0].slice(1);
                i += n - 1;
                continue;
            }
            out.push(words[i]);
        }
        words = out;
    }
    return words.join(' ');
}

// The text Whisper heard, without what is probably not speech ('' = nothing was said)
function cleanTranscript(result) {
    if (!result) return '';
    const segs = speechSegments(result.segments);
    let text = segs ? segs.map(s => String(s.text || '')).join(' ') : String(result.text || '');
    text = text.replace(/\s+/g, ' ').trim();
    // A lone stock phrase is noise when Whisper had doubts about it (a real "salamat po" passes)
    if (NOT_SPEECH.has(norm(text))) {
        const all = Array.isArray(result.segments) ? result.segments : [];
        const doubtful = !all.length || all.some(s => (Number(s.no_speech_prob) || 0) > 0.3 || (Number(s.avg_logprob) || 0) < -0.6);
        if (doubtful) return '';
    }
    // Whisper sometimes wraps the whole line in quotes or ends with "..."
    return collapseRepeats(text.replace(/^["“]+|["”]+$/g, '').replace(/\s*\.{3,}$/, '').trim());
}

// ── Place-name corrections ───────────────────────────────────────────────────────────────────
// Words that are ordinary words, never "misspelled place names"
const COMMON = new Set(('a an the to from at in on of for and or is are was be it this that what where when how why who which '
    + 'can do does did i you we they my your our me us go get going ride take near open close closed now today tomorrow '
    + 'much many fare fares time long minutes jeep jeepney terminal station mall school hall city road street highway '
    + 'sa ng ang mga si ni kay ako ikaw ka siya kami tayo kayo sila ko mo niya namin natin ninyo nila ba po pa na nga lang '
    + 'mula galing papunta papuntang hanggang saan nasaan paano pano magkano ilang ilan anong ano bakit kailan gaano '
    + 'dito diyan doon dun yan yun iyan iyon ito bukas sarado ngayon mamaya kanina oras minuto pamasahe pasahe sakay sasakay '
    + 'sakayan baba bababa lakad maglakad jeep dyip student estudyante senior pwd discount libre salamat sige oo hindi wala '
    + 'meron may gusto kong kung kasi pero tapos eh e yung lugar kainan malapit layo real '
    + 'kalsada kalye daan kanto tawid sasakyan sakyan sasakayan babaan terminal trapik traffic').split(' '));

// Spelling that sounds the same: "kalamba" = "calamba", "jolibee" ~ "jollibee"
function soundKey(s) {
    return norm(s).replace(/ph/g, 'f').replace(/c(?=[aou])/g, 'k').replace(/ck/g, 'k').replace(/q/g, 'k')
        .replace(/y/g, 'i').replace(/(.)\1+/g, '$1').replace(/\s+/g, ' ');
}

function similarity(a, b) {
    if (a === b) return 1;
    const m = a.length, n = b.length;
    if (!m || !n) return 0;
    const prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
        let diag = prev[0];
        prev[0] = i;
        for (let j = 1; j <= n; j++) {
            const tmp = prev[j];
            prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
            diag = tmp;
        }
    }
    return 1 - prev[n] / Math.max(m, n);
}

// The names a commuter says: the short form of each place name ("Chicken Joo – Halang" → "Chicken Joo"),
// the terminals and the barangays in Calzada's coverage
const EXTRA_NAMES = ['SM City Calamba', 'Crossing Grand Terminal', 'SM City Calamba Transport Terminal', 'New Calamba Transport Terminal',
    'Calamba Medical Center', 'Calamba', 'Calzada', 'Routie', 'Halang', 'Crossing', 'Lecheria', 'Parian'];

// How some names are said out loud ("seven eleven" for 7-Eleven)
const SPOKEN = { 'seven eleven': '7-Eleven', 'mc donalds': "McDonald's", 'mcdonalds': "McDonald's", 'mcdo': "McDonald's",
    'mc do': "McDonald's", 'jabee': 'Jollibee', 'mercury': 'Mercury Drug',
    // Routie's own name as Whisper writes it
    'ruti': 'Routie', 'rooti': 'Routie', 'routi': 'Routie', 'routy': 'Routie', 'ruty': 'Routie', 'rauti': 'Routie',
    'rowti': 'Routie', 'rooty': 'Routie', 'ruoti': 'Routie', 'route e': 'Routie', 'root e': 'Routie' };

function buildLexicon(places) {
    const seen = new Map();
    const add = (display, spoken) => {
        const d = String(display || '').replace(/\s+/g, ' ').trim();
        const n = norm(spoken || d);
        if (!n || n.length < 4 || seen.has(n)) return;
        seen.set(n, { display: d, norm: n, key: soundKey(n), words: n.split(' ').length, spoken: !!spoken });
    };
    for (const p of places || []) {
        if (!p || !p.name) continue;
        add(String(p.name).split(/\s[–—-]\s|,|\(/)[0]);
    }
    EXTRA_NAMES.forEach(n => add(n));
    for (const [spoken, display] of Object.entries(SPOKEN)) add(display, spoken);
    return [...seen.values()];
}

// Fixes place names that came out slightly wrong. Returns { text, corrections: [{ from, to }] }.
function correctPlaceNames(text, lexicon) {
    const tokens = String(text || '').split(/(\s+)/); // keeps the spaces
    const words = [];
    tokens.forEach((t, i) => { if (t.trim()) words.push({ i, t }); });
    const corrections = [];
    const used = new Set();
    // Longest names first, so "SM City Calamba Transport Terminal" wins over "SM City Calamba"
    const entries = [...lexicon].sort((a, b) => b.words - a.words || b.norm.length - a.norm.length);
    for (const entry of entries) {
        const len = entry.words;
        for (let s = 0; s + len <= words.length; s++) {
            const span = words.slice(s, s + len);
            if (span.some(w => used.has(w.i))) continue;
            const raw = span.map(w => w.t).join(' ');
            // Keep sentence punctuation outside the name: "jo?" → "Joo?"
            const tail = (raw.match(/[?!.,;:]+$/) || [''])[0];
            const core = tail ? raw.slice(0, -tail.length) : raw;
            const n = norm(core);
            if (!n || n.split(' ').length !== len) continue;
            if (n === entry.norm && !entry.spoken) { span.forEach(w => used.add(w.i)); continue; } // already right
            if (len === 1 && !(entry.spoken && n === entry.norm) && (n.length < 5 || COMMON.has(n))) continue;
            // An ordinary word at either end must be the name's own word there ("... terminal" in "Crossing Grand Terminal")
            const nw = n.split(' '), ew = entry.norm.split(' ');
            if (len > 1 && ((COMMON.has(nw[0]) && nw[0] !== ew[0]) || (COMMON.has(nw[len - 1]) && nw[len - 1] !== ew[len - 1]))) continue;
            const key = soundKey(n);
            if (key[0] !== entry.key[0]) continue;
            const sim = similarity(key, entry.key);
            if (sim < (entry.norm.length <= 6 ? 0.85 : 0.8)) continue;
            // Replace: first word gets the name, the rest of the span is emptied
            tokens[span[0].i] = entry.display + tail;
            for (let k = 1; k < span.length; k++) {
                tokens[span[k].i] = '';
                if (span[k].i - 1 >= 0 && !tokens[span[k].i - 1].trim()) tokens[span[k].i - 1] = '';
            }
            span.forEach(w => used.add(w.i));
            corrections.push({ from: core, to: entry.display });
        }
    }
    return { text: tokens.join('').replace(/\s+/g, ' ').trim(), corrections };
}

// ── Transcribe ───────────────────────────────────────────────────────────────────────────────
async function whisper(client, buffer, mime, ext, language, model = MODEL) {
    const { toFile } = require('groq-sdk'); // loaded here so the text helpers work (and test) without it
    const file = await toFile(buffer, `voice_${Date.now()}.${ext}`, { type: mime });
    const opts = { file, model, prompt: VOICE_PROMPT, temperature: 0, response_format: 'verbose_json' };
    if (language) opts.language = language;
    return client.audio.transcriptions.create(opts);
}

// → { text, raw, corrections, language, retried }
async function transcribeVoice(client, { buffer, mime = 'audio/webm', ext = 'webm', places = [], lexicon = null }) {
    let result = await whisper(client, buffer, mime, ext, null);
    let retried = false;
    const lang = String((result && result.language) || '').toLowerCase();
    // Tagalog heard as Indonesian, Malay, Javanese…: transcribe it again as Tagalog
    if (lang && !OK_LANGUAGES.has(lang)) {
        try {
            result = await whisper(client, buffer, mime, ext, 'tl');
            retried = true;
        } catch (err) {
            console.log(`Voice: Tagalog retry failed (${err.status || err.message}); keeping the first transcript.`);
        }
    }
    const raw = cleanTranscript(result);
    const fixed = raw ? correctPlaceNames(raw, lexicon || buildLexicon(places)) : { text: '', corrections: [] };
    return { text: fixed.text, raw, corrections: fixed.corrections, language: retried ? 'tagalog' : lang || null, retried };
}

// The words so far, while recording (the audio from the start of the recording up to now). Shown live only:
// the transcript the commuter gets is always transcribeVoice() on the whole recording. → { text }
async function transcribeVoicePartial(client, { buffer, mime = 'audio/webm', ext = 'webm', places = [], lexicon = null }) {
    let lastErr = null;
    for (const model of PARTIAL_MODELS) {
        try {
            const result = await whisper(client, buffer, mime, ext, null, model);
            const raw = cleanTranscript(result);
            return { text: raw ? correctPlaceNames(raw, lexicon || buildLexicon(places)).text : '' };
        } catch (err) {
            lastErr = err;
            if (err.status !== 404 && err.status !== 400) throw err; // a missing model: try the next one
        }
    }
    throw lastErr;
}

module.exports = { transcribeVoice, transcribeVoicePartial, cleanTranscript, collapseRepeats, correctPlaceNames, buildLexicon, soundKey, VOICE_PROMPT, NOT_SPEECH };
