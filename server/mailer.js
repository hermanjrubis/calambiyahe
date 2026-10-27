/**
 * Calzada Unified Mailer Service
 * Handles idempotent event email dispatch, template rendering, logging, and Gmail daily limit monitoring.
 */

const nodemailer = require('nodemailer');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { renderEventEmail, generateOwnerNotificationEmail } = require('./email-template');

// Event Catalog with subjects and recipient roles
const EVENTS = {
    application_received: {
        recipients: ['owner', 'admin'],
        subject: 'Application received — Calzada'
    },
    application_needs_changes: {
        recipients: ['owner'],
        subject: 'Action required: Updates needed for your business listing'
    },
    application_approved_pay: {
        recipients: ['owner'],
        subject: 'Application approved! Complete payment to go live'
    },
    application_declined: {
        recipients: ['owner'],
        subject: 'Calzada Business Application Update'
    },
    payment_received: {
        recipients: ['owner', 'admin'],
        subject: 'Payment receipt received — Calzada'
    },
    payment_not_matched: {
        recipients: ['owner'],
        subject: 'Payment verification issue — Calzada'
    },
    business_live: {
        recipients: ['owner'],
        subject: "You're live on Calzada!"
    },
    tour360_availed: {
        recipients: ['owner', 'admin'],
        subject: '360° Virtual Tour setup — Calzada'
    },
    tour360_scheduled: {
        recipients: ['owner'],
        subject: 'Your 360° virtual tour shoot has been scheduled!'
    },
    tour360_published: {
        recipients: ['owner'],
        subject: 'Your 360° Virtual Tour is now live on Calzada!'
    },
    business_removed: {
        recipients: ['owner'],
        subject: 'Listing update: Business removed from Calzada'
    },
    review_posted: {
        recipients: ['user', 'owner', 'admin'],
        subject: 'Review update — Calzada'
    },
    review_removed: {
        recipients: ['user'],
        subject: 'Calzada review moderation notice'
    },
    post_hidden: {
        recipients: ['owner'],
        subject: 'Calzada post moderation notice'
    }
};

function getEmailTransporter() {
    const user = process.env.GMAIL_USER || 'thecalzada@gmail.com';
    const pass = process.env.GMAIL_APP_PASSWORD;

    if (!pass) {
        return null;
    }

    return nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass }
    });
}

/**
 * Check count of emails sent/logged today and warn if > 400 (Gmail limit ~500/day)
 */
async function checkDailyEmailVolume(adminDb) {
    try {
        const startOfDay = new Date();
        startOfDay.setUTCHours(0, 0, 0, 0);
        // count() reads one aggregate instead of every log doc of the day
        const agg = await adminDb.collection('emailLog')
            .where('sentAt', '>=', startOfDay.toISOString())
            .count()
            .get();
        const total = agg.data().count;
        if (total > 400) {
            console.warn(`[MAILER WARNING] High email volume today: ${total} emails sent today. Gmail limit is ~500/day.`);
        }
        return total;
    } catch (err) {
        console.warn('[MAILER] Could not check daily email volume:', err.message);
        return 0;
    }
}

/**
 * Resolve email recipients based on event definition, payload, and Firestore lookups.
 */
async function resolveRecipients(eventName, entityId, toOverride, data, adminDb) {
    const eventConfig = EVENTS[eventName];
    const roles = eventConfig ? eventConfig.recipients : ['owner'];
    const resolved = {};

    // 1. Explicit override passed as string or array
    if (typeof toOverride === 'string' && toOverride.trim()) {
        const trimmed = toOverride.trim();
        for (const role of roles) {
            resolved[role] = trimmed;
        }
        return resolved;
    }

    if (Array.isArray(toOverride) && toOverride.length > 0) {
        roles.forEach((role, idx) => {
            if (toOverride[idx]) {
                resolved[role] = String(toOverride[idx]).trim();
            }
        });
        return resolved;
    }

    // 2. Explicit role map in toOverride
    if (toOverride && typeof toOverride === 'object') {
        for (const role of roles) {
            if (toOverride[role]) {
                resolved[role] = String(toOverride[role]).trim();
            }
        }
    }

    // 3. Resolve Admin email
    if (roles.includes('admin') && !resolved.admin) {
        resolved.admin = (process.env.ADMIN_ALERT_EMAIL || 'thecalzada@gmail.com').trim();
    }

    // 4. Resolve User / Reviewer email
    if (roles.includes('user') && !resolved.user) {
        if (data && data.userEmail) {
            resolved.user = data.userEmail.trim();
        } else if (data && data.reviewerEmail) {
            resolved.user = data.reviewerEmail.trim();
        } else if (adminDb && entityId && (eventName === 'review_posted' || eventName === 'review_removed')) {
            try {
                const revDoc = await adminDb.collection('place_reviews').doc(entityId).get();
                if (revDoc.exists) {
                    const rev = revDoc.data();
                    if (rev.userEmail) {
                        resolved.user = rev.userEmail.trim();
                    } else if (rev.userId || rev.uid) {
                        const userRecord = await getAuth().getUser(rev.userId || rev.uid);
                        if (userRecord && userRecord.email) {
                            resolved.user = userRecord.email.trim();
                        }
                    }
                }
            } catch (err) {
                console.warn('[MAILER] Could not resolve reviewer email from place_reviews:', err.message);
            }
        }
    }

    // 5. Resolve Business Owner email
    if (roles.includes('owner') && !resolved.owner) {
        if (data && data.ownerEmail) {
            resolved.owner = data.ownerEmail.trim();
        } else if (adminDb) {
            let businessId = data && data.businessId ? data.businessId : entityId;

            // If event is post_hidden and businessId not in data, fetch from post
            if (eventName === 'post_hidden' && entityId) {
                try {
                    const postDoc = await adminDb.collection('posts').doc(entityId).get();
                    if (postDoc.exists && postDoc.data().businessId) {
                        businessId = postDoc.data().businessId;
                    }
                } catch (pErr) {
                    console.warn('[MAILER] Could not resolve businessId from post:', pErr.message);
                }
            }

            // If event is review_posted, check if review's place matches a registered business
            if (eventName === 'review_posted') {
                const placeId = data && (data.placeId || data.placeName);
                if (placeId) {
                    try {
                        const bSnap = await adminDb.collection('businesses')
                            .where('placeId', '==', String(placeId))
                            .limit(1)
                            .get();
                        if (!bSnap.empty) {
                            businessId = bSnap.docs[0].id;
                        }
                    } catch (_) {}
                }
            }

            if (businessId) {
                try {
                    const privateDoc = await adminDb.collection('businesses')
                        .doc(businessId)
                        .collection('private')
                        .doc('owner')
                        .get();
                    if (privateDoc.exists && privateDoc.data().ownerEmail) {
                        resolved.owner = privateDoc.data().ownerEmail.trim();
                    }
                } catch (privErr) {
                    console.warn('[MAILER] Could not read private/owner:', privErr.message);
                }

                if (!resolved.owner) {
                    try {
                        const bDoc = await adminDb.collection('businesses').doc(businessId).get();
                        if (bDoc.exists) {
                            const bData = bDoc.data();
                            if (bData.ownerEmail) {
                                resolved.owner = bData.ownerEmail.trim();
                            } else if (bData.ownerId) {
                                const userRecord = await getAuth().getUser(bData.ownerId);
                                if (userRecord && userRecord.email) {
                                    resolved.owner = userRecord.email.trim();
                                }
                            }
                        }
                    } catch (bErr) {
                        console.warn('[MAILER] Could not resolve owner from businesses collection:', bErr.message);
                    }
                }
            }
        }
    }

    return resolved;
}

/**
 * Main event dispatcher
 * Export sendEvent(eventName, { entityId, version, to, data })
 */
async function sendEvent(eventName, options = {}) {
    const { entityId, version = 1, to: toOverride, data = {} } = options;

    const eventConfig = EVENTS[eventName];
    if (!eventConfig) {
        throw new Error(`Unknown event name: "${eventName}"`);
    }

    const adminDb = getFirestore();
    if (!adminDb) {
        throw new Error('Firestore is not initialized.');
    }

    // 1. Idempotency check: emailLog/{eventName}_{entityId}_{version || 1}
    const safeEntityId = String(entityId || 'default').replace(/[^A-Za-z0-9_-]/g, '_');
    const safeVersion = String(version || 1).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60);
    const logDocId = `${eventName}_${safeEntityId}_${safeVersion}`;
    const logRef = adminDb.collection('emailLog').doc(logDocId);

    // Claim the log doc in a transaction, so two calls at the same time (double click, retry)
    // cannot both send. A failed send (ok:false) or a claim stuck for 5 minutes may be retried.
    const claimed = await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(logRef);
        if (snap.exists) {
            const d = snap.data() || {};
            const stuck = d.state === 'sending' && Date.now() - Date.parse(d.sentAt || 0) > 5 * 60 * 1000;
            if (d.ok === true || (d.state === 'sending' && !stuck)) return false;
        }
        tx.set(logRef, {
            event: eventName,
            entityId: String(entityId || ''),
            state: 'sending',
            sentAt: new Date().toISOString()
        });
        return true;
    });
    if (!claimed) {
        console.log(`[MAILER] Idempotent skip: emailLog doc ${logDocId} already exists.`);
        return { success: true, skipped: true, docId: logDocId };
    }

    // 2. Check daily email volume
    await checkDailyEmailVolume(adminDb);

    // 3. Resolve recipient emails
    const resolvedRecipients = await resolveRecipients(eventName, entityId, toOverride, data, adminDb);
    const recipientRoles = Object.keys(resolvedRecipients).filter(role => !!resolvedRecipients[role]);
    const recipientEmails = Array.from(new Set(recipientRoles.map(role => resolvedRecipients[role]))).filter(Boolean);

    // Build items to send
    const itemsToSend = [];
    let primarySubject = eventConfig.subject;

    for (const role of recipientRoles) {
        const recipientEmail = resolvedRecipients[role];
        const rendered = renderEventEmail(eventName, data, role);
        if (rendered && rendered.html) {
            itemsToSend.push({
                role,
                to: recipientEmail,
                subject: rendered.subject || eventConfig.subject,
                html: rendered.html
            });
            if (role === 'owner' || !primarySubject) {
                primarySubject = rendered.subject;
            }
        }
    }

    const isDryRun = process.env.DRY_RUN_EMAIL === 'true' || !process.env.VERCEL;

    // 4. Handle DRY_RUN_EMAIL=true
    if (isDryRun) {
        console.log(`[MAILER:DRY_RUN] Event "${eventName}" for entityId "${entityId}". Recipients: ${JSON.stringify(recipientEmails)}`);
        const logData = {
            event: eventName,
            entityId: String(entityId || ''),
            to: recipientEmails,
            subject: primarySubject,
            sentAt: new Date().toISOString(),
            state: 'done',
            dryRun: true,
            ok: true
        };
        await logRef.set(logData);
        return { success: true, dryRun: true, skipped: false, docId: logDocId, to: recipientEmails };
    }

    // 5. Send real email via nodemailer
    const transporter = getEmailTransporter();
    let allOk = true;
    let lastError = null;

    if (!transporter) {
        allOk = false;
        lastError = 'GMAIL_APP_PASSWORD is not set or transporter could not be created.';
        console.warn(`[MAILER] ${lastError}`);
    } else {
        const fromAddress = `"Calzada" <${process.env.GMAIL_USER || 'thecalzada@gmail.com'}>`;
        const replyToAddress = process.env.GMAIL_USER || 'thecalzada@gmail.com';

        for (const item of itemsToSend) {
            try {
                await transporter.sendMail({
                    from: fromAddress,
                    to: item.to,
                    replyTo: replyToAddress,
                    subject: item.subject,
                    html: item.html
                });
                console.log(`[MAILER] Email sent to ${item.to} for event ${eventName}`);
            } catch (sendErr) {
                allOk = false;
                lastError = sendErr.message;
                console.error(`[MAILER] Error sending email to ${item.to}:`, sendErr.message);
            }
        }
    }

    // 6. Write the emailLog doc
    const logData = {
        event: eventName,
        entityId: String(entityId || ''),
        to: recipientEmails,
        subject: primarySubject,
        sentAt: new Date().toISOString(),
        state: 'done',
        dryRun: false,
        ok: allOk && itemsToSend.length > 0
    };
    if (!itemsToSend.length && !lastError) lastError = 'No recipient could be resolved.';
    if (lastError) {
        logData.error = lastError;
    }

    await logRef.set(logData);

    return {
        success: allOk,
        dryRun: false,
        skipped: false,
        docId: logDocId,
        to: recipientEmails,
        error: lastError || undefined
    };
}

module.exports = {
    EVENTS,
    sendEvent,
    getEmailTransporter,
    generateOwnerNotificationEmail
};
