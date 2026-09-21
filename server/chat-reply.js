// Reading and validating the Routie chatbot's reply.
//
// The model must answer with one JSON object: { "reply": "..." }. This module turns whatever it actually produced
// into a clean plain-text reply and always yields something usable: the reply itself, or a friendly fallback.
// The tolerant parsing stays because tutorial replies are multi-line: models often put raw line breaks inside the
// JSON string or run out of tokens mid-list, and neither should reach the visitor as a broken message.

const MAX_REPLY_CHARS = 800;
const MIN_PARTIAL_REPLY_CHARS = 30;
const MAX_JSON_CANDIDATES = 20;

const FALLBACK_REPLIES = {
    en: {
        unavailable: "I'm sorry, I'm having trouble right now. Please try again later.",
        busy: 'Routie is getting a lot of questions right now. Please try again in a minute.',
        timeout: 'The AI took too long to respond. The server may be waking up or busy - please try again.',
        unclear: "Sorry, I couldn't put together a good answer just now. Could you try asking again?"
    },
    tl: {
        unavailable: 'Pasensya na, may problema ang system ko ngayon. Try ulit mamaya.',
        busy: 'Maraming nagtatanong kay Routie ngayon. Pakisubukan ulit maya-maya, mga isang minuto.',
        timeout: 'Masyadong matagal ang response mula sa AI. Maaring cold start ito o busy ang server. Pakisubukan ulit.',
        unclear: 'Pasensya na, hindi ko nabuo nang maayos ang sagot. Puwede mo bang itanong ulit?'
    }
};

function normalizeLang(lang) {
    return lang === 'tl' ? 'tl' : 'en';
}

function fallbackReply(kind, lang) {
    const replies = FALLBACK_REPLIES[normalizeLang(lang)];
    return replies[kind] || replies.unavailable;
}

// --- text helpers ---------------------------------------------------------------------------------

function stripControlChars(text) {
    return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

// The chat shows plain text: drop markdown emphasis, headings and backticks, turn [text](url) into text and
// remove bare URLs, so a reply can never carry a link.
function stripFormatting(text) {
    return text
        .replace(/\[([^\]]+)\]\((?:https?:\/\/|www\.)[^)]*\)/gi, '$1')
        .replace(/(?:https?:\/\/|www\.)\S+/gi, '')
        .replace(/```[a-z]*\n?/gi, '')
        .replace(/[*_]{2,}([^*_]+)[*_]{2,}/g, '$1')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/`([^`]*)`/g, '$1');
}

// Index of the last sentence-ending punctuation mark in text, or -1.
function lastSentenceEnd(text) {
    const pattern = /[.!?](?=\s|$)/g;
    let end = -1;
    let match;
    while ((match = pattern.exec(text)) !== null) end = match.index;
    return end;
}

// Cuts text to at most max characters at a sentence end if possible, else a word boundary, marking a cut with "...".
function truncateAtBoundary(text, max) {
    if (text.length <= max) return text;
    let cut = text.slice(0, max);
    if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1); // never end on half of a surrogate pair
    const sentenceEnd = lastSentenceEnd(cut);
    if (sentenceEnd >= max * 0.5) return cut.slice(0, sentenceEnd + 1).trim();
    const wordEnd = cut.lastIndexOf(' ');
    if (wordEnd >= max * 0.5) cut = cut.slice(0, wordEnd);
    return cut.replace(/[\s,;:.\-]+$/, '') + '…';
}

// For a reply the model did not finish: keep whole sentences if there are any, otherwise whole words.
function trimIncomplete(text) {
    const sentenceEnd = lastSentenceEnd(text);
    if (sentenceEnd >= MIN_PARTIAL_REPLY_CHARS - 1) return text.slice(0, sentenceEnd + 1).trim();
    const wordEnd = text.lastIndexOf(' ');
    return (wordEnd > 0 ? text.slice(0, wordEnd) : text).replace(/[\s,;:.\-]+$/, '') + '…';
}

function cleanReply(value) {
    if (typeof value !== 'string') return '';
    const text = stripFormatting(stripControlChars(value))
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    return truncateAtBoundary(text, MAX_REPLY_CHARS);
}

// --- checking what the reply teaches -----------------------------------------------------------------

const NUMBERED_STEP = /^\s*\d+[.)]\s/gm;

function hasNumberedSteps(text) {
    return (text.match(NUMBERED_STEP) || []).length > 0;
}

function labelKey(text) {
    return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// Every on-screen label in a tutorial sits in curly quotes. Any quoted text that is not a known label means the
// model made up a button or page. Near-misses (case, spacing, punctuation) are corrected to the exact spelling.
// Returns the reply with its labels normalised, or null when it quotes something unknown.
function canonicalizeLabels(reply, labels) {
    const byKey = new Map(labels.map((label) => [labelKey(label), label]));
    let unknown = false;
    const fix = (whole, prefix, inner) => {
        const canonical = byKey.get(labelKey(inner));
        if (!canonical) {
            unknown = true;
            return whole;
        }
        return `${prefix}“${canonical}”`;
    };
    const fixed = reply
        // "label", curly-quoted labels and ‘label’ (the empty group keeps fix()'s arguments uniform)
        .replace(/()[“"‘]([^”"’\n]{1,60})[”"’]/g, fix)
        // 'label' - but not an apostrophe inside a word, as in "you're" or "'yan"
        .replace(/(^|[\s(])'([^'\n]{1,40})'(?=[\s).,:;!?]|$)/gm, fix);
    return unknown ? null : fixed;
}

// Rejects replies that quote an unknown label or list more steps than any tutorial has.
function checkReply(reply, { labels, maxSteps }) {
    if (maxSteps && (reply.match(NUMBERED_STEP) || []).length > maxSteps) return null;
    return labels ? canonicalizeLabels(reply, labels) : reply;
}

// --- reading the model's output -------------------------------------------------------------------

// Some models (e.g. Qwen) print their reasoning first; drop it, including an unfinished block.
function stripThinking(text) {
    return text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*$/i, '');
}

// The reply text of a parsed value, or null. A list of lines is joined, since models sometimes send steps that way.
function readReplyText(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    const reply = Array.isArray(value.reply) && value.reply.every((line) => typeof line === 'string')
        ? value.reply.join('\n')
        : value.reply;
    return typeof reply === 'string' && reply.trim() !== '' ? reply : null;
}

// Index of the "}" that closes the object opening at text[start], honouring strings; -1 if it never closes.
function findObjectEnd(text, start) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === '"') inString = false;
        } else if (ch === '"') {
            inString = true;
        } else if (ch === '{') {
            depth++;
        } else if (ch === '}' && --depth === 0) {
            return i;
        }
    }
    return -1;
}

// The reply text of the first JSON object in text that parses and has one (tolerates code fences and stray prose).
function extractReply(text) {
    try {
        const direct = readReplyText(JSON.parse(text));
        if (direct !== null) return direct;
    } catch (_) { /* not pure JSON - scan for an object below */ }

    let from = 0;
    for (let n = 0; n < MAX_JSON_CANDIDATES; n++) {
        const start = text.indexOf('{', from);
        if (start === -1) return null;
        const end = findObjectEnd(text, start);
        if (end !== -1) {
            try {
                const candidate = readReplyText(JSON.parse(text.slice(start, end + 1)));
                if (candidate !== null) return candidate;
            } catch (_) { /* not valid JSON - try the next brace */ }
        }
        from = start + 1;
    }
    return null;
}

const JSON_ESCAPES = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };

// Undoes JSON string escapes without insisting that the string is valid JSON (raw quotes and line breaks stay as is).
function unescapeLenient(body) {
    return body.replace(/\\(u[0-9a-fA-F]{4}|["\\/bfnrt])/g, (_, esc) =>
        esc[0] === 'u' ? String.fromCharCode(parseInt(esc.slice(1), 16)) : JSON_ESCAPES[esc]);
}

// Pulls the "reply" text out of JSON that would not parse: raw line breaks or unescaped quotes inside the string, or a
// token limit hit mid-reply. closed is false when the reply string itself was cut off.
function salvageReplyText(text) {
    // Complete but invalid JSON: take everything up to the final quote before the closing brace, so an unescaped quote
    // around a label does not cut the reply short.
    let match = /"reply"\s*:\s*"([\s\S]*)"\s*\}\s*$/.exec(text);
    let closed = true;
    if (!match) {
        match = /"reply"\s*:\s*"((?:[^"\\]|\\[\s\S])*)("?)/.exec(text);
        if (!match) return null;
        closed = match[2] === '"';
    }
    const body = closed ? match[1] : match[1].replace(/\\(?:u[0-9a-fA-F]{0,3})?$/, ''); // drop a dangling escape left by the cut
    return { value: unescapeLenient(body), closed };
}

// Turns raw model text into { reply, source }. It always yields a usable reply: the model's own text once it is
// tidied and checked, or a friendly fallback. source is 'json', 'salvaged', 'rejected' or 'fallback'.
// labels / maxSteps (optional) are the on-screen labels the tutorials may quote and the longest tutorial's step count;
// truncated is true when the model stopped at its token limit.
function interpretModelOutput(rawText, { lang, truncated = false, labels, maxSteps } = {}) {
    const fallback = (source = 'fallback') => ({ reply: fallbackReply('unclear', lang), source });
    const text = stripThinking(typeof rawText === 'string' ? rawText : '').trim();
    if (!text) return fallback();

    // Every route ends here: tidy the text, then make sure it only teaches what the tutorials define.
    const finish = (candidate, source) => {
        const reply = cleanReply(candidate);
        if (!reply) return fallback();
        const checked = checkReply(reply, { labels, maxSteps });
        return checked ? { reply: checked, source } : fallback('rejected');
    };
    // A cut-off procedure is worse than none: never show half of a list of steps.
    const salvage = (candidate, partial) => {
        if (partial && hasNumberedSteps(candidate)) return fallback();
        const trimmed = partial ? trimIncomplete(candidate) : candidate;
        if (partial && cleanReply(trimmed).length < MIN_PARTIAL_REPLY_CHARS) return fallback();
        return finish(trimmed, 'salvaged');
    };

    const parsed = extractReply(text);
    if (parsed !== null) return finish(parsed, 'json');

    const broken = salvageReplyText(text);
    if (broken) return salvage(broken.value, !broken.closed);

    // The model ignored the JSON instruction and just answered: show plain prose, but never JSON-looking text.
    const prose = text.replace(/```[a-z]*/gi, '').trim();
    if (prose && !/[{}[\]]|"reply"/.test(prose)) return salvage(prose, truncated);

    return fallback();
}

module.exports = {
    normalizeLang,
    fallbackReply,
    interpretModelOutput
};
