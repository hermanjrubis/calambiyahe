/**
 * server/password-reset.js
 *
 * POST /api/auth/password-reset   { email }
 *
 * Sends a password reset link from Calzada's own mail, with a per-email cooldown kept in
 * Firestore (passwordResetThrottle/{sha256(email)}):
 *   1st request: sent, next one allowed after 60 s
 *   2nd: after 120 s     3rd and later: after 300 s     at most 5 in 24 hours
 *
 * Privacy and safety:
 *   - The answer is the same whether or not an account exists, and whether or not it has a
 *     password (Google-only accounts get no email). Only the cooldown is per email, and it is
 *     counted for every address asked about, so it reveals nothing either.
 *   - The throttle document holds a hash of the email, never the email itself, and is removed by
 *     the daily purge 24 hours after the last request.
 *   - The reset link is put in the email only. emailLog keeps event, recipient, subject and time
 *     (see mailer.js), never the message body.
 *   - Firestore rules deny all client access to passwordResetThrottle.
 *   - If server mail is not set up (no GMAIL_APP_PASSWORD), it answers 503 { fallback: 'client' }
 *     for every address alike, and the page asks Firebase to send its own reset email.
 */

const crypto = require('crypto');
const express = require('express');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { getAuth } = require('./auth');
const { sendEvent } = require('./mailer');

const RESET_STEPS_SEC = [60, 120, 300];
const RESET_MAX_PER_DAY = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTINUE_URL = `${process.env.PRODUCTION_ORIGIN || 'https://calzadaph.com'}/login?reset=done`;
// Every answer takes at least this long (tests set RESET_MIN_ANSWER_MS=0)
const MIN_ANSWER_MS = process.env.RESET_MIN_ANSWER_MS !== undefined ? Math.max(0, Number(process.env.RESET_MIN_ANSWER_MS) || 0) : 2500;
// Per network address as well, so one sender cannot mail many inboxes or use up the daily Gmail quota
const IP_MAX_PER_HOUR = 10;
const HOUR_MS = 60 * 60 * 1000;
const GENERIC_MESSAGE = 'If an account with a password exists for this email, a reset link is on its way.';

const hashEmail = (email) => crypto.createHash('sha256').update(`calzada-reset:${email}`).digest('hex');

/** Wait before the next request, given how many were made in the current 24-hour window. */
const cooldownAfter = (count) => RESET_STEPS_SEC[Math.min(Math.max(count, 1), RESET_STEPS_SEC.length) - 1];

/**
 * Claims one request slot in a transaction. Returns { allowed, retryAfterSec, cooldownSec }.
 * Exported for tests.
 */
async function claimResetSlot(db, emailHash, nowMs = Date.now()) {
    const ref = db.collection('passwordResetThrottle').doc(emailHash);
    return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const d = snap.exists ? snap.data() : null;
        const windowStart = d && Number.isFinite(d.windowStartMs) && nowMs - d.windowStartMs < DAY_MS ? d.windowStartMs : nowMs;
        const count = d && windowStart === d.windowStartMs ? (d.count || 0) : 0;
        const nextAllowed = d && windowStart === d.windowStartMs ? (d.nextAllowedMs || 0) : 0;

        if (count >= RESET_MAX_PER_DAY) {
            return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((windowStart + DAY_MS - nowMs) / 1000)) };
        }
        if (nowMs < nextAllowed) {
            return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((nextAllowed - nowMs) / 1000)) };
        }
        const newCount = count + 1;
        const cooldownSec = newCount >= RESET_MAX_PER_DAY
            ? Math.ceil((windowStart + DAY_MS - nowMs) / 1000)
            : cooldownAfter(newCount);
        tx.set(ref, {
            count: newCount,
            windowStartMs: windowStart,
            nextAllowedMs: nowMs + cooldownSec * 1000,
            // For the daily purge: removed once the 24-hour window is over
            expiresAt: Timestamp.fromMillis(windowStart + DAY_MS)
        });
        return { allowed: true, cooldownSec };
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
            return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((windowStart + HOUR_MS - nowMs) / 1000)) };
        }
        tx.set(ref, { count: count + 1, windowStartMs: windowStart, expiresAt: Timestamp.fromMillis(windowStart + HOUR_MS) });
        return { allowed: true };
    });
}

const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64);

/** Sends the email if the account exists and signs in with a password. Never throws. */
async function sendResetIfAccount(email) {
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
        const link = await getAuth().generatePasswordResetLink(email, { url: CONTINUE_URL });
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
            return res.status(429).json({ ok: false, error: 'rate_limited', retryAfterSec: slot.retryAfterSec });
        }

        // The send finishes before answering (a serverless function may stop once it has
        // answered), and every answer takes at least MIN_ANSWER_MS, so the time taken does not
        // tell an existing account from a missing one.
        const started = Date.now();
        await sendResetIfAccount(email);
        const wait = MIN_ANSWER_MS + crypto.randomInt(0, 400) - (Date.now() - started);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        return res.json({ ok: true, message: GENERIC_MESSAGE, cooldownSec: slot.cooldownSec });
    });
}

module.exports = { registerPasswordReset, claimResetSlot, claimIpSlot, hashEmail, cooldownAfter, RESET_STEPS_SEC, RESET_MAX_PER_DAY };
