/**
 * server/password-reset.js
 *
 * POST /api/auth/password-reset         { email }
 * POST /api/auth/password-reset/clear   Authorization: Bearer <Firebase ID token>
 *
 * Sends a password reset link from Calzada's own mail. Limits per email address, kept in
 * Firestore (passwordResetThrottle/{sha256(email)}):
 *
 *   wait between emails   60 s after the 1st, 2 min after the 2nd
 *   per hour              3 emails, then locked until 1 hour after the first of them
 *   per day               5 emails, then locked until 24 hours after the first of them
 *
 * Both windows start at the first request and end on their own (the lock does not grow with
 * more tries: asking during a lock changes nothing). Signing in to the account clears them
 * (the /clear call, with a valid ID token for that email), so someone who got back in is not
 * left waiting.
 *
 * Per network address as well: 10 requests an hour (hashed address), so one sender cannot mail
 * many inboxes or use up the daily Gmail quota.
 *
 * Privacy and safety:
 *   - The answer is the same whether or not an account exists, and whether or not it has a
 *     password (Google-only accounts get no email). The limits count every address asked about,
 *     so they reveal nothing either.
 *   - Every answer takes at least MIN_ANSWER_MS, so timing does not tell accounts apart.
 *   - The throttle documents hold hashes, never the email or network address, and are removed
 *     by the daily data-retention job once their 24-hour window is over.
 *   - The reset link is put in the email only. emailLog keeps event, recipient, subject and time
 *     (see mailer.js), never the message body. It is printed to the terminal only on a local machine, never
 *     in the deployed logs.
 *   - The link opens /reset-password on the real site; only a local (non-Vercel) server may point
 *     it at http://localhost for testing (exact hostname check, see linkOrigin).
 *   - Firestore rules deny all client access to passwordResetThrottle.
 *   - If server mail is not set up (no GMAIL_APP_PASSWORD), it answers 503 { fallback: 'client' }
 *     for every address alike, and the page asks Firebase to send its own reset email.
 */

const crypto = require('crypto');
const express = require('express');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { getAuth } = require('./auth');
const { sendEvent } = require('./mailer');

const RESET_STEPS_SEC = [60, 120];   // wait after the 1st and the 2nd email of an hour
const RESET_MAX_PER_HOUR = 3;
const RESET_MAX_PER_DAY = 5;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const IP_MAX_PER_HOUR = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTINUE_URL = `${process.env.PRODUCTION_ORIGIN || 'https://calzadaph.com'}/login?reset=done`;
// The link in the email opens Calzada's own page (/reset-password) instead of Firebase's.
// Every answer takes at least this long (tests set RESET_MIN_ANSWER_MS=0)
const MIN_ANSWER_MS = process.env.RESET_MIN_ANSWER_MS !== undefined ? Math.max(0, Number(process.env.RESET_MIN_ANSWER_MS) || 0) : 2500;
const PRODUCTION_ORIGIN = process.env.PRODUCTION_ORIGIN || 'https://calzadaph.com';
const IS_DEPLOYED = !!process.env.VERCEL;
const GENERIC_MESSAGE = 'If an account with a password exists for this email, a reset link is on its way.';

const hashEmail = (email) => crypto.createHash('sha256').update(`calzada-reset:${email}`).digest('hex');
const secs = (ms) => Math.max(1, Math.ceil(ms / 1000));

/**
 * Reads the current windows from a throttle document. Older documents (one 24-hour window:
 * count, windowStartMs, nextAllowedMs) are read as the daily window.
 */
function readWindows(d, nowMs) {
    const dayStart = d && Number.isFinite(d.dayStartMs) ? d.dayStartMs : (d && Number.isFinite(d.windowStartMs) ? d.windowStartMs : null);
    const dayLive = dayStart !== null && nowMs - dayStart < DAY_MS;
    const hourLive = d && Number.isFinite(d.hourStartMs) && nowMs - d.hourStartMs < HOUR_MS;
    return {
        dayStart: dayLive ? dayStart : nowMs,
        dayCount: dayLive ? (Number.isFinite(d.dayCount) ? d.dayCount : (d.count || 0)) : 0,
        hourStart: hourLive ? d.hourStartMs : nowMs,
        hourCount: hourLive ? (d.hourCount || 0) : 0,
        // a short wait only matters while its own window is still open
        nextAllowed: dayLive && d && Number.isFinite(d.nextAllowedMs) ? d.nextAllowedMs : 0
    };
}

/**
 * Claims one request slot in a transaction. Exported for tests.
 * Allowed:  { allowed: true, cooldownSec, remainingHour, remainingDay, lock: null|'hour'|'day' }
 *           (lock says whether that email used up the hour or the day; cooldownSec runs to its end)
 * Refused:  { allowed: false, reason: 'cooldown'|'hour'|'day', retryAfterSec }
 */
async function claimResetSlot(db, emailHash, nowMs = Date.now()) {
    const ref = db.collection('passwordResetThrottle').doc(emailHash);
    return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const w = readWindows(snap.exists ? snap.data() : null, nowMs);

        if (w.dayCount >= RESET_MAX_PER_DAY) return { allowed: false, reason: 'day', retryAfterSec: secs(w.dayStart + DAY_MS - nowMs) };
        if (w.hourCount >= RESET_MAX_PER_HOUR) return { allowed: false, reason: 'hour', retryAfterSec: secs(w.hourStart + HOUR_MS - nowMs) };
        if (nowMs < w.nextAllowed) return { allowed: false, reason: 'cooldown', retryAfterSec: secs(w.nextAllowed - nowMs) };

        const dayCount = w.dayCount + 1;
        const hourCount = w.hourCount + 1;
        let lock = null;
        let nextAllowed;
        if (dayCount >= RESET_MAX_PER_DAY) { lock = 'day'; nextAllowed = w.dayStart + DAY_MS; }
        else if (hourCount >= RESET_MAX_PER_HOUR) { lock = 'hour'; nextAllowed = w.hourStart + HOUR_MS; }
        else nextAllowed = nowMs + RESET_STEPS_SEC[Math.min(hourCount, RESET_STEPS_SEC.length) - 1] * 1000;

        tx.set(ref, {
            dayStartMs: w.dayStart,
            dayCount,
            hourStartMs: w.hourStart,
            hourCount,
            nextAllowedMs: nextAllowed,
            // For the daily data-retention job: removed once the 24-hour window is over
            expiresAt: Timestamp.fromMillis(w.dayStart + DAY_MS)
        });
        return {
            allowed: true,
            lock,
            cooldownSec: secs(nextAllowed - nowMs),
            remainingHour: Math.max(0, Math.min(RESET_MAX_PER_HOUR - hourCount, RESET_MAX_PER_DAY - dayCount)),
            remainingDay: RESET_MAX_PER_DAY - dayCount
        };
    });
}

/** At most IP_MAX_PER_HOUR requests per hour from one network address (hashed, never stored as is). */
async function claimIpSlot(db, ip, nowMs = Date.now()) {
    if (!ip) return { allowed: true };
    const ref = db.collection('passwordResetThrottle').doc('ip_' + crypto.createHash('sha256').update(`calzada-reset-ip:${ip}`).digest('hex'));
    return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const d = snap.exists ? snap.data() : null;
        const fresh = !d || !Number.isFinite(d.windowStartMs) || nowMs - d.windowStartMs >= HOUR_MS;
        const windowStart = fresh ? nowMs : d.windowStartMs;
        const count = fresh ? 0 : (d.count || 0);
        if (count >= IP_MAX_PER_HOUR) {
            return { allowed: false, reason: 'network', retryAfterSec: secs(windowStart + HOUR_MS - nowMs) };
        }
        tx.set(ref, { count: count + 1, windowStartMs: windowStart, expiresAt: Timestamp.fromMillis(windowStart + HOUR_MS) });
        return { allowed: true };
    });
}

/**
 * Which site the reset link points to. Always the real site once deployed. On a developer's own
 * machine (not on Vercel) a request from http://localhost:<port> or http://127.0.0.1:<port> gets a
 * link to that machine, so the page can be tried locally. The hostname is compared exactly: an
 * Origin such as "https://localhost.example.com" is not localhost.
 */
function linkOrigin(req) {
    if (IS_DEPLOYED) return PRODUCTION_ORIGIN;
    try {
        const o = new URL(String(req.headers.origin || ''));
        if ((o.hostname === 'localhost' || o.hostname === '127.0.0.1') && (o.protocol === 'http:' || o.protocol === 'https:')) return o.origin;
    } catch (_) { /* no or bad Origin */ }
    return PRODUCTION_ORIGIN;
}

/** Firebase's link → https://calzadaph.com/reset-password?oobCode=... (keeps Firebase's link if it has no code) */
function calzadaResetLink(firebaseLink, origin) {
    try {
        const code = new URL(firebaseLink).searchParams.get('oobCode');
        if (code) return `${origin}/reset-password?oobCode=${encodeURIComponent(code)}`;
    } catch (_) { /* keep Firebase's link */ }
    return firebaseLink;
}

const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64);

/** Sends the email if the account exists and signs in with a password. Never throws. */
async function sendResetIfAccount(email, origin) {
    let user;
    try {
        user = await getAuth().getUserByEmail(email);
    } catch (err) {
        if (err && err.code !== 'auth/user-not-found') console.warn('[RESET] lookup failed:', err.code || err.message);
        return;
    }
    const hasPassword = Array.isArray(user.providerData) && user.providerData.some((p) => p.providerId === 'password');
    if (!hasPassword || user.disabled) return;
    try {
        const link = calzadaResetLink(await getAuth().generatePasswordResetLink(email, { url: CONTINUE_URL }), origin);
        // Local testing only: the link can reset the password, so it never goes to the deployed logs
        if (!IS_DEPLOYED) console.log(`[RESET] link for ${email}: ${link}`);
        await sendEvent('password_reset', {
            entityId: user.uid,
            version: String(Date.now()),
            to: email,
            data: { link, name: user.displayName || '' }
        });
    } catch (err) {
        console.error('[RESET] could not send:', err.code || err.message);
    }
}

function registerPasswordReset(app) {
    app.post('/api/auth/password-reset', express.json({ limit: '2kb' }), async (req, res) => {
        const email = String((req.body && req.body.email) || '').trim().toLowerCase();
        if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
            return res.status(400).json({ ok: false, error: 'invalid_email' });
        }
        // Same for every address: server mail is either set up or not
        if (!process.env.GMAIL_APP_PASSWORD && process.env.VERCEL) {
            return res.status(503).json({ ok: false, fallback: 'client' });
        }

        let db;
        try { db = getFirestore(); } catch (_) { db = null; }
        if (!db) return res.status(503).json({ ok: false, fallback: 'client' });

        let slot;
        try {
            const ipSlot = await claimIpSlot(db, clientIp(req));
            slot = ipSlot.allowed ? await claimResetSlot(db, hashEmail(email)) : ipSlot;
        } catch (err) {
            console.error('[RESET] throttle failed:', err.message);
            return res.status(503).json({ ok: false, fallback: 'client' });
        }
        if (!slot.allowed) {
            res.setHeader('Retry-After', String(slot.retryAfterSec));
            return res.status(429).json({
                ok: false, error: 'rate_limited', reason: slot.reason, retryAfterSec: slot.retryAfterSec,
                limits: { perHour: RESET_MAX_PER_HOUR, perDay: RESET_MAX_PER_DAY }
            });
        }

        // The send finishes before answering (a serverless function may stop once it has
        // answered), and every answer takes at least MIN_ANSWER_MS, so the time taken does not
        // tell an existing account from a missing one.
        const started = Date.now();
        await sendResetIfAccount(email, linkOrigin(req));
        const wait = MIN_ANSWER_MS + crypto.randomInt(0, 400) - (Date.now() - started);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        return res.json({
            ok: true, message: GENERIC_MESSAGE, cooldownSec: slot.cooldownSec, lock: slot.lock,
            remainingHour: slot.remainingHour, remainingDay: slot.remainingDay,
            limits: { perHour: RESET_MAX_PER_HOUR, perDay: RESET_MAX_PER_DAY }
        });
    });

    // Signed in again (e.g. with the new password): clear the limits for this account's email.
    // Needs a valid ID token, and clears only the email inside it.
    app.post('/api/auth/password-reset/clear', async (req, res) => {
        const m = /^Bearer (.+)$/.exec(String(req.headers.authorization || ''));
        if (!m) return res.status(401).json({ ok: false });
        let decoded;
        try { decoded = await getAuth().verifyIdToken(m[1]); } catch (_) { return res.status(401).json({ ok: false }); }
        const email = String(decoded.email || '').trim().toLowerCase();
        if (!email || !decoded.firebase || decoded.firebase.sign_in_provider !== 'password') return res.json({ ok: true, cleared: false });
        try {
            await getFirestore().collection('passwordResetThrottle').doc(hashEmail(email)).delete();
            return res.json({ ok: true, cleared: true });
        } catch (err) {
            console.error('[RESET] clear failed:', err.message);
            return res.status(500).json({ ok: false });
        }
    });

    // Lightweight check so /login can tell a Google-only account to click "Sign in with Google"
    // instead of asking for a password that does not exist (Firebase hides fetchSignInMethodsForEmail).
    const hintIpMap = new Map();
    const HINT_WINDOW_MS = 60 * 1000;
    const HINT_MAX_PER_MIN = 25;

    app.post('/api/auth/signin-hint', express.json({ limit: '1kb' }), async (req, res) => {
        const email = String((req.body && req.body.email) || '').trim().toLowerCase();
        if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
            return res.json({ ok: true, googleOnly: false });
        }

        const ipKey = crypto.createHash('sha256').update(`calzada-hint-ip:${clientIp(req)}`).digest('hex');
        const now = Date.now();
        const entry = hintIpMap.get(ipKey);
        if (entry && now - entry.start < HINT_WINDOW_MS) {
            if (entry.count >= HINT_MAX_PER_MIN) {
                return res.status(429).json({ ok: false, googleOnly: false });
            }
            entry.count += 1;
        } else {
            if (hintIpMap.size > 500) {
                for (const [k, v] of hintIpMap) {
                    if (now - v.start >= HINT_WINDOW_MS) hintIpMap.delete(k);
                }
            }
            hintIpMap.set(ipKey, { start: now, count: 1 });
        }

        try {
            const user = await getAuth().getUserByEmail(email);
            const providers = Array.isArray(user.providerData) ? user.providerData.map((p) => p.providerId) : [];
            const googleOnly = providers.includes('google.com') && !providers.includes('password');
            return res.json({ ok: true, googleOnly });
        } catch (_) {
            return res.json({ ok: true, googleOnly: false });
        }
    });
}

module.exports = {
    registerPasswordReset, claimResetSlot, claimIpSlot, hashEmail, readWindows, linkOrigin, calzadaResetLink,
    RESET_STEPS_SEC, RESET_MAX_PER_HOUR, RESET_MAX_PER_DAY
};
