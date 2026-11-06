/**
 * public/js/password-reset.js
 *
 * One way to ask for a password reset email, used by the login page ("Forgot password?") and by
 * Account settings ("Send password reset email").
 *
 * It calls POST /api/auth/password-reset (server/password-reset.js), which:
 *   - answers the same way whether or not an account exists for the email,
 *   - limits each email address: a wait of 60 s, then 2 min, between emails; 3 emails an hour;
 *     5 a day. A lock ends on its own at a fixed time; asking again does not make it longer,
 *   - sends the link from Calzada's own mail (the link is never stored).
 * Only when the server says its mail is not set up (503 with fallback "client") does it fall back
 * to Firebase's own reset email, which Firebase rate-limits on its side.
 *
 * Signing in clears the limits for that account (clearResetLimits, called by the login page).
 *
 * Also draws the countdown on the button or link ("Resend in 45s", "Resend in 12 min",
 * "Try again at 3:12 AM", "Try again tomorrow at 3:12 AM").
 */

import { auth, sendPasswordResetEmail } from './firebase-init.js';

const RESET_CONTINUE_URL = 'https://calzadaph.com/login?reset=done';
const LIMITS = { perHour: 3, perDay: 5 };

/**
 * @param {string} email
 * @returns {Promise<{ ok: boolean, cooldownSec: number, retryAt: number, code?: string,
 *   reason?: 'cooldown'|'hour'|'day'|'network', lock?: null|'hour'|'day', remainingHour?: number, remainingDay?: number }>}
 *   ok false with code 'rate_limited' (reason and retryAt say why and until when), 'invalid_email' or 'network'.
 */
export async function requestPasswordReset(email) {
    const clean = String(email || '').trim().toLowerCase();
    const at = (sec) => Date.now() + sec * 1000;
    let res;
    try {
        res = await fetch('/api/auth/password-reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: clean }),
            credentials: 'same-origin'
        });
    } catch (_) {
        return { ok: false, code: 'network', cooldownSec: 0, retryAt: 0 };
    }
    let body = {};
    try { body = await res.json(); } catch (_) { body = {}; }

    if (res.status === 429) {
        const sec = Math.max(1, Number(body.retryAfterSec) || 60);
        return { ok: false, code: 'rate_limited', reason: body.reason || 'cooldown', cooldownSec: sec, retryAt: at(sec) };
    }
    if (res.status === 400) return { ok: false, code: 'invalid_email', cooldownSec: 0, retryAt: 0 };
    if (res.status === 503 && body.fallback === 'client') {
        // Server mail is not set up: Firebase sends its own reset email instead
        try {
            await sendPasswordResetEmail(auth, clean, { url: RESET_CONTINUE_URL });
        } catch (err) {
            // Firebase hides whether the account exists; only a bad address or no connection matters here
            if (err && err.code === 'auth/invalid-email') return { ok: false, code: 'invalid_email', cooldownSec: 0, retryAt: 0 };
            if (err && err.code === 'auth/network-request-failed') return { ok: false, code: 'network', cooldownSec: 0, retryAt: 0 };
            if (err && err.code === 'auth/too-many-requests') return { ok: false, code: 'rate_limited', reason: 'hour', cooldownSec: 3600, retryAt: at(3600) };
        }
        return { ok: true, cooldownSec: 60, retryAt: at(60), lock: null };
    }
    if (!res.ok) return { ok: false, code: 'network', cooldownSec: 0, retryAt: 0 };
    const sec = Math.max(0, Number(body.cooldownSec) || 60);
    return {
        ok: true, cooldownSec: sec, retryAt: at(sec), lock: body.lock || null,
        remainingHour: Number.isFinite(body.remainingHour) ? body.remainingHour : undefined,
        remainingDay: Number.isFinite(body.remainingDay) ? body.remainingDay : undefined
    };
}

/** After signing in: clear this account's reset limits on the server. Fire and forget. */
export async function clearResetLimits(user) {
    try {
        if (!user || typeof user.getIdToken !== 'function') return;
        const token = await user.getIdToken();
        // keepalive: the request finishes even though the page moves on right after sign-in
        await fetch('/api/auth/password-reset/clear', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, credentials: 'same-origin', keepalive: true });
    } catch (_) { /* nothing to do: the limits end on their own */ }
}

// ── Wording ─────────────────────────────────────────────────────────────────────────────────

/** "45s" (under 2 min), "12 min", "5 h 10 min" (English) or "45s", "12 min", "5 oras at 10 min" (Tagalog). */
export function formatWait(sec, lang) {
    const s = Math.max(0, Math.ceil(sec));
    if (s < 120) return `${s}s`;
    const totalMin = Math.ceil(s / 60);
    if (totalMin < 60) return `${totalMin} min`;
    const h = Math.floor(totalMin / 60), m = totalMin % 60;
    if (lang === 'tl') return m ? `${h} oras at ${m} min` : `${h} oras`;
    return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * When something can be done again, as a phrase on the viewer's own clock:
 * "at 3:12 AM" · "tomorrow at 3:12 AM" · "on Nov 8 at 3:12 AM"  (Tagalog: "sa 3:12 AM" · "bukas, 3:12 AM")
 */
export function formatWhen(ms, lang) {
    const d = new Date(ms);
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const now = new Date();
    const dayOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const days = Math.round((dayOf(d) - dayOf(now)) / 86400000);
    const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (lang === 'tl') return days === 0 ? `sa ${time}` : days === 1 ? `bukas, ${time}` : `sa ${date}, ${time}`;
    return days === 0 ? `at ${time}` : days === 1 ? `tomorrow at ${time}` : `on ${date} at ${time}`;
}

/** The message under the field, in English or Tagalog. */
export function resetMessage(result, email, lang) {
    const tl = lang === 'tl';
    const when = result.retryAt ? formatWhen(result.retryAt, lang) : '';
    if (result.ok) {
        const sent = tl
            ? `Kung may Calzada account na may password ang ${email}, may reset link na papunta roon. Tingnan ang inbox at Spam folder. Mag-e-expire ang link sa loob ng 1 oras.`
            : `If ${email} has a Calzada account with a password, a reset link is on its way. Check your inbox and Spam folder. The link expires in 1 hour.`;
        let more = '';
        if (result.lock === 'day') {
            more = tl ? ` Ito na ang huling link para sa araw na ito; puwede ulit ${when}.` : ` That was the last link for today; you can ask again ${when}.`;
        } else if (result.lock === 'hour') {
            more = tl ? ` Ito na ang huling link para sa oras na ito; puwede ulit ${when}.` : ` That was the last link for this hour; you can ask again ${when}.`;
        } else if (Number.isFinite(result.remainingHour)) {
            const n = result.remainingHour;
            more = tl ? ` Puwede ka pang humiling ng ${n} link ngayong oras.` : ` You can ask for ${n} more link${n === 1 ? '' : 's'} this hour.`;
        }
        return sent + more;
    }
    if (result.code === 'rate_limited') {
        switch (result.reason) {
            case 'day':
                return tl
                    ? `Naabot mo na ang ${LIMITS.perDay} reset link para sa araw na ito. Para sa kaligtasan ng account mo, puwede ulit ${when}.`
                    : `You've reached today's limit of ${LIMITS.perDay} reset links. To keep your account safe, you can ask again ${when}.`;
            case 'hour':
                return tl
                    ? `Nakahiling ka na ng ${LIMITS.perHour} reset link sa loob ng isang oras. Para sa kaligtasan ng account mo, puwede ulit ${when}.`
                    : `You've asked for ${LIMITS.perHour} reset links within an hour. To keep your account safe, you can ask again ${when}.`;
            case 'network':
                return tl
                    ? `Maraming hiling mula sa network na ito. Subukan ulit ${when}.`
                    : `Too many requests from this network. Please try again ${when}.`;
            default:
                return tl
                    ? `Kapapadala lang namin ng link. Hintayin ang ${formatWait(result.cooldownSec, lang)} bago humiling ulit.`
                    : `We just sent a link. Please wait ${formatWait(result.cooldownSec, lang)} before asking for another.`;
        }
    }
    if (result.code === 'invalid_email') return tl ? 'Maglagay ng tamang email address.' : 'Please enter a valid email address.';
    return tl ? 'Hindi maipadala ngayon. Tingnan ang internet at subukan ulit.' : "Couldn't send right now. Check your connection and try again.";
}

/**
 * Disables a button (or link) until a fixed time, with a short label:
 * "Resend in 45s" (under 2 min), "Resend in 12 min" (under an hour), "Try again at 3:12 AM".
 * @param {HTMLElement} el
 * @param {number} retryAt  time in ms when it can be used again
 * @param {{ idleText: string, lang?: 'en'|'tl', prefix?: string }} texts
 * @returns {() => void} stop
 */
export function startCooldown(el, retryAt, texts) {
    if (!el) return () => {};
    if (el._czCooldown) el._czCooldown();
    const lang = texts.lang === 'tl' ? 'tl' : 'en';
    const label = (left) => {
        if (left >= 3600) return lang === 'tl' ? `Subukan ulit ${formatWhen(retryAt, lang)}` : `Try again ${formatWhen(retryAt, lang)}`;
        const wait = formatWait(left, lang);
        return `${texts.prefix || ''}${lang === 'tl' ? `Ipadala ulit sa ${wait}` : `Resend in ${wait}`}`;
    };
    const set = (disabled, text) => {
        el.textContent = text;
        if (el.tagName === 'BUTTON') el.disabled = disabled;
        el.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        el.classList.toggle('is-cooling', disabled);
    };
    const tick = () => {
        const left = Math.ceil((retryAt - Date.now()) / 1000);
        if (left <= 0) { stop(); return; }
        set(true, label(left));
    };
    const timer = setInterval(tick, 1000);
    const stop = () => {
        clearInterval(timer);
        el._czCooldown = null;
        set(false, texts.idleText);
    };
    el._czCooldown = stop;
    if (retryAt > Date.now()) tick(); else stop();
    return stop;
}
