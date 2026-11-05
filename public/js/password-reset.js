/**
 * public/js/password-reset.js
 *
 * One way to ask for a password reset email, used by the login page ("Forgot password?") and by
 * Account settings ("Send password reset email").
 *
 * It calls POST /api/auth/password-reset, which:
 *   - answers the same way whether or not an account exists for the email (no account lookup
 *     from the outside),
 *   - spaces requests per email: 60 s, then 120 s, then 300 s, and at most 5 in 24 hours,
 *   - sends the link from Calzada's own mail (the link is never stored).
 * Only when the server says its mail is not set up (503 with fallback "client") does it fall back
 * to Firebase's own reset email, which Firebase rate-limits on its side.
 *
 * Also draws the "Resend in 42 s" countdown on a button or link.
 */

import { auth, sendPasswordResetEmail } from './firebase-init.js';

const RESET_CONTINUE_URL = 'https://calzadaph.com/login?reset=done';

/**
 * @param {string} email
 * @returns {Promise<{ ok: boolean, cooldownSec: number, message?: string, code?: string }>}
 *   ok false with code 'rate_limited' (cooldownSec says how long), 'invalid_email' or 'network'.
 */
export async function requestPasswordReset(email) {
    const clean = String(email || '').trim().toLowerCase();
    let res;
    try {
        res = await fetch('/api/auth/password-reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: clean }),
            credentials: 'same-origin'
        });
    } catch (_) {
        return { ok: false, code: 'network', cooldownSec: 0 };
    }
    let body = {};
    try { body = await res.json(); } catch (_) { body = {}; }

    if (res.status === 429) {
        return { ok: false, code: 'rate_limited', cooldownSec: Math.max(1, Number(body.retryAfterSec) || 60) };
    }
    if (res.status === 400) return { ok: false, code: 'invalid_email', cooldownSec: 0 };
    if (res.status === 503 && body.fallback === 'client') {
        // Server mail is not configured: Firebase sends its own reset email instead
        try {
            await sendPasswordResetEmail(auth, clean, { url: RESET_CONTINUE_URL });
        } catch (err) {
            // Firebase hides whether the account exists; only a bad address or no connection matters here
            if (err && err.code === 'auth/invalid-email') return { ok: false, code: 'invalid_email', cooldownSec: 0 };
            if (err && err.code === 'auth/network-request-failed') return { ok: false, code: 'network', cooldownSec: 0 };
            if (err && err.code === 'auth/too-many-requests') return { ok: false, code: 'rate_limited', cooldownSec: 300 };
        }
        return { ok: true, cooldownSec: 60 };
    }
    if (!res.ok) return { ok: false, code: 'network', cooldownSec: 0 };
    return { ok: true, cooldownSec: Math.max(0, Number(body.cooldownSec) || 60) };
}

/** Texts for the result, in English or Tagalog. */
export function resetMessage(result, email, lang) {
    const tl = lang === 'tl';
    if (result.ok) {
        return tl
            ? `Kung may Calzada account na may password ang ${email}, may reset link na papunta roon. Tingnan ang inbox at Spam folder. Mag-e-expire ang link sa loob ng 1 oras.`
            : `If ${email} has a Calzada account with a password, a reset link is on its way. Check your inbox and Spam folder. The link expires in 1 hour.`;
    }
    if (result.code === 'rate_limited') {
        return tl ? 'Kapapadala lang namin ng link. Hintayin muna bago humiling ulit.' : 'We just sent a link. Please wait a moment before asking again.';
    }
    if (result.code === 'invalid_email') return tl ? 'Maglagay ng tamang email address.' : 'Please enter a valid email address.';
    return tl ? 'Hindi maipadala ngayon. Tingnan ang internet at subukan ulit.' : "Couldn't send right now. Check your connection and try again.";
}

/**
 * Disables a button (or link) and shows "Resend in N s" until the wait is over.
 * @param {HTMLElement} el
 * @param {number} seconds
 * @param {{ idleText: string, waitText?: (s:number)=>string }} texts
 * @returns {() => void} stop
 */
export function startCooldown(el, seconds, texts) {
    if (!el) return () => {};
    if (el._czCooldown) el._czCooldown();
    const waitText = texts.waitText || ((s) => `Resend in ${s}s`);
    const end = Date.now() + seconds * 1000;
    const set = (disabled, text) => {
        el.textContent = text;
        if ('disabled' in el && el.tagName === 'BUTTON') el.disabled = disabled;
        el.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        el.classList.toggle('is-cooling', disabled);
    };
    const tick = () => {
        const left = Math.ceil((end - Date.now()) / 1000);
        if (left <= 0) { stop(); return; }
        set(true, waitText(left));
    };
    const timer = setInterval(tick, 1000);
    const stop = () => {
        clearInterval(timer);
        el._czCooldown = null;
        set(false, texts.idleText);
    };
    el._czCooldown = stop;
    if (seconds > 0) tick(); else stop();
    return stop;
}
