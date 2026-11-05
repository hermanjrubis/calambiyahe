/**
 * public/js/validators.js
 *
 * Name and password rules for sign-up, account settings and password reset.
 * One copy of the rules, used by login.html and user-stats.js (ES module imports) and by classic
 * scripts through window.CalzadaValidators.
 *
 * Names (decided Nov 2026, "wider rule"): letters from any language, single spaces, and the
 * marks real Filipino names use: a period (Ma., Jr., Sto.), a hyphen (Juan-Carlos) and an
 * apostrophe (D'Souza, O'Connor; straight or curly). No digits or other symbols. 2 to 60
 * characters after tidying.
 *   pass: "Ma. Theresa Dela Cruz", "Juan-Carlos Niño", "D'Souza", "Jose Rizal Jr.", "José Ma. Sto. Tomas"
 *   fail: "John2 Doe", "J", "--", "Ana  .", "Ana@Cruz"
 *
 * Passwords (matches the Firebase Authentication password policy, set to Enforce):
 *   8 to 64 characters, at least one lowercase letter, one uppercase letter, one number and one
 *   special character from Firebase's list, and no spaces.
 *   pass: "Calzada#2026"
 *   fail: "calzada#2026" (no upper), "Calzada2026" (no special), "Calz#1" (short),
 *         "Calzada-2026" ("-" is not on Firebase's list), "Calzada 2026!" (space)
 *
 * These checks are for the person's convenience. Firebase enforces the password policy on its side,
 * so a page that skips this file still cannot create a weak password.
 */

// ── Names ─────────────────────────────────────────────────────────────────────────────────────

export const NAME_MIN = 2;
export const NAME_MAX = 60;

/** Unicode NFC, trimmed, runs of whitespace made one space, curly apostrophe kept as typed. */
export const normalizeName = (s) => String(s == null ? '' : s).normalize('NFC').trim().replace(/\s+/g, ' ');

/**
 * Words of letters, each optionally ending in a period, joined by one space, hyphen or apostrophe.
 * \p{L} covers ñ, é and other letters; \p{M} keeps combining accents typed as separate marks.
 */
export const NAME_RE = /^[\p{L}\p{M}]+\.?(?:[ '’-][\p{L}\p{M}]+\.?)*$/u;

const NAME_MSG = {
    en: {
        empty: 'Please enter your full name.',
        short: `Please enter at least ${NAME_MIN} letters.`,
        long: `Please keep your name to ${NAME_MAX} characters or fewer.`,
        digits: 'Names can’t contain numbers.',
        chars: 'Use letters and spaces only. A period ( . ), hyphen ( - ) or apostrophe ( \' ) is fine, as in “Ma. Dela Cruz-Reyes”.'
    },
    tl: {
        empty: 'Pakilagay ang iyong buong pangalan.',
        short: `Maglagay ng hindi bababa sa ${NAME_MIN} letra.`,
        long: `Hanggang ${NAME_MAX} character lang ang pangalan.`,
        digits: 'Hindi puwedeng may numero ang pangalan.',
        chars: 'Letra at espasyo lang ang gamitin. Puwede ang tuldok ( . ), gitling ( - ) o kudlit ( \' ), gaya ng “Ma. Dela Cruz-Reyes”.'
    }
};

/**
 * @param {string} raw  what the person typed
 * @param {'en'|'tl'} [lang]
 * @returns {{ ok: boolean, value: string, code?: string, message?: string }}
 *   value is the tidied name to save (always returned, also when not ok)
 */
export function validateFullName(raw, lang) {
    const m = NAME_MSG[lang === 'tl' ? 'tl' : 'en'];
    const value = normalizeName(raw);
    const fail = (code) => ({ ok: false, value, code, message: m[code] });
    if (!value) return fail('empty');
    if (/\d/u.test(value)) return fail('digits');
    const letters = (value.match(/[\p{L}]/gu) || []).length;
    if (value.length > NAME_MAX) return fail('long');
    if (!NAME_RE.test(value)) return fail('chars');
    if (letters < NAME_MIN) return fail('short');
    return { ok: true, value };
}

// ── Passwords ─────────────────────────────────────────────────────────────────────────────────

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 64;

/** The special characters Firebase's password policy accepts (and only these). */
export const PASSWORD_SPECIALS = '^$*.[]{}()?"!@#%&/\\,><\':;|_~`';
const SPECIAL_RE = /[\^$*.\[\]{}()?"!@#%&\/\\,><':;|_~`]/;

/** Whole rule in one expression (for server code or tests that want a single check). */
export const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\^$*.\[\]{}()?"!@#%&\/\\,><':;|_~`])\S{8,64}$/;

/** Each rule on its own, in the order shown in the live checklist under the password field. */
export const PASSWORD_RULES = [
    { id: 'length', test: (p) => p.length >= PASSWORD_MIN && p.length <= PASSWORD_MAX,
        label: { en: `${PASSWORD_MIN} to ${PASSWORD_MAX} characters`, tl: `${PASSWORD_MIN} hanggang ${PASSWORD_MAX} character` } },
    { id: 'lower', test: (p) => /[a-z]/.test(p),
        label: { en: 'Lowercase letter (a–z)', tl: 'Maliit na titik (a–z)' } },
    { id: 'upper', test: (p) => /[A-Z]/.test(p),
        label: { en: 'Uppercase letter (A–Z)', tl: 'Malaking titik (A–Z)' } },
    { id: 'number', test: (p) => /\d/.test(p),
        label: { en: 'Number (0–9)', tl: 'Numero (0–9)' } },
    { id: 'special', test: (p) => SPECIAL_RE.test(p),
        label: { en: 'Symbol, like ! @ # ?', tl: 'Simbolo, gaya ng ! @ # ?' } },
    { id: 'nospace', test: (p) => p.length > 0 && !/\s/.test(p),
        label: { en: 'No spaces', tl: 'Walang espasyo' } }
];

const PASSWORD_MSG = {
    en: {
        empty: 'Please enter a password.',
        weak: 'Your password needs: ',
        same: 'Use a password different from your email address.'
    },
    tl: {
        empty: 'Pakilagay ang password.',
        weak: 'Kailangan ng password mo ng: ',
        same: 'Gumamit ng password na iba sa iyong email.'
    }
};

/**
 * @param {string} password
 * @param {{ lang?: 'en'|'tl', email?: string }} [opts]
 * @returns {{ ok: boolean, results: {id:string, ok:boolean, label:string}[], missing: string[], message?: string }}
 */
export function validatePassword(password, opts = {}) {
    const lang = opts.lang === 'tl' ? 'tl' : 'en';
    const p = String(password == null ? '' : password);
    const results = PASSWORD_RULES.map((r) => ({ id: r.id, ok: r.test(p), label: r.label[lang] }));
    const missing = results.filter((r) => !r.ok).map((r) => r.id);
    if (!p) return { ok: false, results, missing, message: PASSWORD_MSG[lang].empty };
    if (missing.length) {
        const list = results.filter((r) => !r.ok).map((r) => r.label.charAt(0).toLowerCase() + r.label.slice(1)).join(', ');
        return { ok: false, results, missing, message: PASSWORD_MSG[lang].weak + list + '.' };
    }
    const email = String(opts.email || '').trim().toLowerCase();
    if (email && (p.toLowerCase() === email || p.toLowerCase() === email.split('@')[0])) {
        return { ok: false, results, missing: ['email'], message: PASSWORD_MSG[lang].same };
    }
    return { ok: true, results, missing: [] };
}

/**
 * Draws (and keeps updating) the checklist under a password field.
 *
 * Accessible without colour: each rule shows a different shape for its state
 *   not typed yet  ○ hollow circle      met  ✔ solid check      not met  ✖ cross
 * plus hidden words ("met" / "not met") read with the rule, and a polite live region after the
 * list that sums it up a moment after typing stops ("4 of 6 password rules met. Still needed: ...").
 *
 * @param {HTMLInputElement} input
 * @param {HTMLElement} listEl  an empty <ul>; gets one <li> per rule
 * @param {() => ('en'|'tl')} [getLang]
 * @returns {() => boolean} call to re-check; returns whether every rule passes
 */
const PW_ICONS = {
    idle: '<svg viewBox="0 0 16 16" width="14" height="14" focusable="false"><circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    met: '<svg viewBox="0 0 16 16" width="14" height="14" focusable="false"><circle cx="8" cy="8" r="8" fill="currentColor"/><path d="M4.4 8.3l2.3 2.3 4.9-5.2" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    unmet: '<svg viewBox="0 0 16 16" width="14" height="14" focusable="false"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>'
};
const PW_WORDS = {
    en: { met: 'met', unmet: 'not met', idle: 'not checked yet', all: 'All password rules met.', some: (n, t) => `${n} of ${t} password rules met.`, need: 'Still needed: ' },
    tl: { met: 'pasado', unmet: 'kulang pa', idle: 'hindi pa nasusuri', all: 'Pasado na ang lahat ng patakaran sa password.', some: (n, t) => `${n} sa ${t} patakaran sa password ang pasado.`, need: 'Kulang pa: ' }
};

export function attachPasswordChecklist(input, listEl, getLang) {
    if (!input || !listEl) return () => false;
    const lang = () => (getLang && getLang() === 'tl' ? 'tl' : 'en');
    listEl.setAttribute('role', 'list'); // list-style: none drops list semantics in some browsers
    // Live summary right after the list (visually hidden; screen readers hear it)
    let live = document.getElementById(`${listEl.id || 'pwRules'}Status`);
    if (!live) {
        live = document.createElement('p');
        live.id = `${listEl.id || 'pwRules'}Status`;
        live.className = 'pw-sr';
        live.setAttribute('aria-live', 'polite');
        live.setAttribute('aria-atomic', 'true');
        listEl.insertAdjacentElement('afterend', live);
    }
    let announceTimer = null;
    let lastAnnounced = '';

    const render = () => {
        const words = PW_WORDS[lang()];
        const { results } = validatePassword(input.value, { lang: lang() });
        if (listEl.children.length !== results.length) {
            listEl.innerHTML = '';
            results.forEach((r) => {
                const li = document.createElement('li');
                li.dataset.rule = r.id;
                li.setAttribute('role', 'listitem');
                li.innerHTML = '<span class="pw-rule-icon" aria-hidden="true"></span><span class="pw-rule-text"></span><span class="pw-sr pw-rule-state"></span>';
                listEl.appendChild(li);
            });
        }
        const touched = input.value.length > 0;
        results.forEach((r, i) => {
            const li = listEl.children[i];
            const state = !touched ? 'idle' : (r.ok ? 'met' : 'unmet');
            if (li.dataset.state !== state) {
                li.dataset.state = state;
                li.querySelector('.pw-rule-icon').innerHTML = PW_ICONS[state];
            }
            li.classList.toggle('is-met', state === 'met');
            li.classList.toggle('is-unmet', state === 'unmet');
            li.querySelector('.pw-rule-text').textContent = r.label;
            li.querySelector('.pw-rule-state').textContent = `: ${words[state]}`;
        });
        const allOk = results.every((r) => r.ok);

        // Announce once typing pauses, and only when the sum changed
        clearTimeout(announceTimer);
        announceTimer = setTimeout(() => {
            let msg = '';
            if (touched) {
                const missing = results.filter((r) => !r.ok);
                msg = allOk ? words.all
                    : `${words.some(results.length - missing.length, results.length)} ${words.need}${missing.map((r) => r.label).join(', ')}.`;
            }
            if (msg !== lastAnnounced) { live.textContent = msg; lastAnnounced = msg; }
        }, 700);
        return allOk;
    };
    input.addEventListener('input', render);
    render();
    return render;
}

// ── Email ─────────────────────────────────────────────────────────────────────────────────────

/** Same shape check the login page always used (Firebase does the real check). */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (s) => EMAIL_RE.test(String(s || '').trim()) && String(s).trim().length <= 254;

const api = { NAME_MIN, NAME_MAX, NAME_RE, normalizeName, validateFullName, PASSWORD_MIN, PASSWORD_MAX, PASSWORD_SPECIALS,
    PASSWORD_RE, PASSWORD_RULES, validatePassword, attachPasswordChecklist, EMAIL_RE, isEmail };
if (typeof window !== 'undefined') window.CalzadaValidators = api;
export default api;
