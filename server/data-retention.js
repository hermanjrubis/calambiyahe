/**
 * server/data-retention.js
 *
 * Daily clean-up for data minimization (RA 10173 Sec. 11(e): personal data is kept only as long
 * as needed). Run by the Vercel cron in vercel.json:
 *
 *   GET /api/cron/data-retention      Authorization: Bearer <CRON_SECRET>   (Vercel Cron)
 *   POST /api/cron/data-retention     X-Cron-Secret: <CRON_SECRET>          (manual / other cron)
 *        ?dryRun=1 counts what would be removed without removing it
 *
 * What it removes (the periods are the ones in the Privacy Policy, js/legal-modal.js):
 *   - users/{uid}/routeHistory entries planned more than 12 months ago
 *   - users/{uid}/sessions sign-in records older than 12 months
 *   - emailLog entries (recipient, subject, time) older than 12 months
 *   - feedback messages older than 12 months
 *   - passwordResetThrottle documents whose 24-hour (or 1-hour) window is over
 *
 * Needs the collection-group indexes on routeHistory.plannedAt and sessions.timestamp
 * (firestore.indexes.json, fieldOverrides). Works in batches within a time budget; anything left
 * is removed the next day.
 */

const { getFirestore, Timestamp } = require('firebase-admin/firestore');

const ROUTE_HISTORY_MONTHS = 12;
const RECORDS_MONTHS = 12; // sign-in records, email log, feedback
const BATCH = 300;
const TIME_BUDGET_MS = 8000; // stay well inside the function time limit
const MAX_PER_RUN = 20000;

/** The cut-off: the same calendar day 12 months back (Asia/Manila is not needed for a day-level rule). */
function routeHistoryCutoff(now = new Date(), months = ROUTE_HISTORY_MONTHS) {
    const d = new Date(now.getTime());
    d.setUTCMonth(d.getUTCMonth() - months);
    return d;
}

async function deleteByQuery(db, makeQuery, { dryRun, deadline, max }) {
    let removed = 0;
    let more = true;
    while (more && Date.now() < deadline && removed < max) {
        const snap = await makeQuery().limit(Math.min(BATCH, max - removed)).get();
        if (snap.empty) { more = false; break; }
        if (dryRun) {
            removed += snap.size;
            // a dry run cannot page past what it does not delete; one page is enough to report
            more = snap.size === BATCH;
            break;
        }
        const batch = db.batch();
        snap.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        removed += snap.size;
        more = snap.size === BATCH;
    }
    return { removed, more };
}

async function runDataRetention({ dryRun = false, now = new Date(), db = getFirestore() } = {}) {
    const deadline = Date.now() + TIME_BUDGET_MS;
    const cutoff = routeHistoryCutoff(now);

    const routeHistory = await deleteByQuery(db,
        () => db.collectionGroup('routeHistory').where('plannedAt', '<', Timestamp.fromDate(cutoff)).orderBy('plannedAt'),
        { dryRun, deadline, max: MAX_PER_RUN });

    const recordsCutoff = routeHistoryCutoff(now, RECORDS_MONTHS);
    const sessions = await deleteByQuery(db,
        () => db.collectionGroup('sessions').where('timestamp', '<', Timestamp.fromDate(recordsCutoff)).orderBy('timestamp'),
        { dryRun, deadline, max: MAX_PER_RUN });
    // emailLog.sentAt is an ISO string, which sorts like the time it holds
    const emailLog = await deleteByQuery(db,
        () => db.collection('emailLog').where('sentAt', '<', recordsCutoff.toISOString()),
        { dryRun, deadline, max: 5000 });
    const feedback = await deleteByQuery(db,
        () => db.collection('feedback').where('timestamp', '<', Timestamp.fromDate(recordsCutoff)),
        { dryRun, deadline, max: 5000 });

    const throttle = await deleteByQuery(db,
        () => db.collection('passwordResetThrottle').where('expiresAt', '<', Timestamp.fromDate(now)),
        { dryRun, deadline, max: 2000 });

    return {
        ok: true,
        dryRun,
        cutoff: cutoff.toISOString(),
        recordsCutoff: recordsCutoff.toISOString(),
        routeHistoryRemoved: routeHistory.removed,
        routeHistoryMore: routeHistory.more,
        sessionsRemoved: sessions.removed,
        emailLogRemoved: emailLog.removed,
        feedbackRemoved: feedback.removed,
        resetThrottleRemoved: throttle.removed
    };
}

function isCronAuthorized(req) {
    const secret = process.env.CRON_SECRET;
    if (!secret) return false;
    return req.headers['authorization'] === `Bearer ${secret}` || req.headers['x-cron-secret'] === secret;
}

function registerDataRetention(app) {
    const handler = async (req, res) => {
        if (!isCronAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
        try {
            const result = await runDataRetention({ dryRun: req.query.dryRun === '1' });
            console.log('[RETENTION]', JSON.stringify(result));
            return res.json(result);
        } catch (err) {
            // Most likely the collection-group index is not deployed yet
            console.error('[RETENTION] failed:', err.message);
            return res.status(500).json({ ok: false, error: 'retention_failed' });
        }
    };
    app.get('/api/cron/data-retention', handler);
    app.post('/api/cron/data-retention', handler);
}

module.exports = { registerDataRetention, runDataRetention, routeHistoryCutoff, isCronAuthorized, ROUTE_HISTORY_MONTHS, RECORDS_MONTHS };
