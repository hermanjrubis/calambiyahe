/**
 * Calzada Branded HTML Email Templates
 * Compatible with Gmail, Outlook, Apple Mail, etc.
 * Design system: Flat white cards, 1px solid #E2E8F0, 12px radius, no drop shadows.
 * Sora for headings, Outfit for body text. #378ADD is the only accent color.
 */

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatRating(rating) {
    if (!rating) return null;
    const num = Number(rating);
    if (!isNaN(num) && num >= 1 && num <= 5) {
        return `${'★'.repeat(num)}${'☆'.repeat(5 - num)} (${num}/5)`;
    }
    return escapeHtml(String(rating));
}

function getCategoryStyle(category) {
    const norm = String(category || '').trim().toLowerCase();
    if (norm === 'bug report' || norm.includes('bug')) {
        return {
            bg: '#FFF7ED',
            color: '#C2410C',
            border: '#FFEDD5'
        };
    }
    if (norm === 'suggestion' || norm.includes('suggest') || norm.includes('feature') || norm.includes('idea')) {
        return {
            bg: '#EFF6FF',
            color: '#1D4ED8',
            border: '#DBEAFE'
        };
    }
    return {
        bg: '#F1F5F9',
        color: '#475569',
        border: '#E2E8F0'
    };
}

/**
 * Shared Branded Email Shell (Table-based layout with Calzada wordmark + arrow flourish)
 * Flat white card, 1px solid #E2E8F0, 12px radius, no drop shadows.
 */
function renderEmailShell({ title, contentHtml, footerSubtext, showFooter = true }) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title || 'Calzada')}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F8F9FC; font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #042C53;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #F8F9FC; padding: 40px 16px;">
    <tr>
      <td align="center">
        <!-- Main Container Card (Flat, 1px solid #E2E8F0, 12px radius, no drop shadows) -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 560px; background-color: #FFFFFF; border-radius: 12px; overflow: hidden; border: 1px solid #E2E8F0;">
          
          <!-- Header Band -->
          <tr>
            <td style="background-color: #378ADD; padding: 24px 32px; text-align: left;">
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align: middle;">
                    <span style="font-family: 'Sora', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 24px; font-weight: 700; color: #FFFFFF; letter-spacing: -0.5px; line-height: 1; text-decoration: none;">Calzada</span>
                  </td>
                  <td style="vertical-align: middle; padding-left: 8px; padding-top: 2px;">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: block;">
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                      <polyline points="13 6 19 12 13 18"></polyline>
                    </svg>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card Body -->
          <tr>
            <td style="padding: 32px;">
              ${contentHtml}
            </td>
          </tr>

          ${showFooter ? `
          <!-- Footer Band -->
          <tr>
            <td style="background-color: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 20px 32px; font-size: 12px; color: #64748B; line-height: 1.5; text-align: left;">
              <div style="font-family: 'Outfit', sans-serif;">
                ${footerSubtext || 'This is an automated message from Calzada. Reply to this email to reach us.'}
              </div>
            </td>
          </tr>` : ''}

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Event Email Generator for All 14 Catalog Events
 * Each email has:
 * - One clear headline
 * - 2-4 short lines
 * - One button (to My Business, place page, or planner)
 * - Standard automated message footer
 */
function renderEventEmail(eventName, payload = {}, recipientType = 'owner') {
    const baseUrl = process.env.PRODUCTION_ORIGIN || 'https://calzadaph.com';
    const myBusinessUrl = `${baseUrl}/my-business`;
    const plannerUrl = `${baseUrl}/planner`;
    const adminUrl = `${baseUrl}/admin`;

    const b = payload.business || {};
    const businessName = escapeHtml(b.name || payload.businessName || payload.name || 'Your business');
    const plainBusName = String(b.name || payload.businessName || payload.name || 'Your business').replace(/[\r\n]+/g, ' ').trim();
    const safeReason = escapeHtml(payload.reason || b.reviewNote || 'No specific note provided.');
    const planName = escapeHtml(b.plan === 'plus360' ? 'Listed + 360' : (b.plan === 'featured' ? 'Featured' : 'Listed'));
    const amount = payload.amountDue || b.amountDue || (b.plan === 'featured' ? 299 : (b.plan === 'plus360' ? 199 : 59));
    const refNo = escapeHtml(payload.referenceNo || b.lastPaymentRef || 'Submitted');
    const shootDate = escapeHtml(payload.shootDate || b.tour360ShootDate || 'To be determined');
    const placeId = escapeHtml(payload.placeId || b.placeId || payload.entityId || '');
    const placeName = escapeHtml(payload.placeName || b.name || 'Calamba Place');
    const plainPlaceName = String(payload.placeName || b.name || 'Calamba Place').replace(/[\r\n]+/g, ' ').trim();
    const reviewerName = escapeHtml(payload.reviewerName || 'A commuter');
    const ratingStars = formatRating(payload.rating || 5);
    const commentPreview = escapeHtml(payload.commentText ? (payload.commentText.length > 120 ? payload.commentText.slice(0, 117) + '...' : payload.commentText) : 'No written comment');

    let subject = '';
    let headline = '';
    let lines = [];
    let buttonText = '';
    let buttonUrl = myBusinessUrl;
    let extraBox = '';

    switch (eventName) {
        case 'application_received':
            if (recipientType === 'admin') {
                subject = `New business application: ${plainBusName}`;
                headline = `New application: ${businessName}`;
                lines = [
                    `A new business registration was submitted on Calzada.`,
                    `Category: ${escapeHtml(b.category || 'Local Business')} · Plan: ${planName}.`,
                    `Review the application details and location pin in the admin panel.`
                ];
                buttonText = 'Review in Admin Panel';
                buttonUrl = `${adminUrl}#applications`;
            } else {
                subject = `We got your application for ${plainBusName}`;
                headline = `We received your application for ${businessName}`;
                lines = [
                    `Thank you for registering ${businessName} on Calzada.`,
                    `The Calzada team verifies every listing to give commuters in Calamba accurate location and contact details.`,
                    `We will email you once our review is complete.`
                ];
                buttonText = 'View on My Business';
                buttonUrl = myBusinessUrl;
            }
            break;

        case 'application_needs_changes':
            subject = `Action needed: changes requested for ${plainBusName}`;
            headline = `Changes requested for ${businessName}`;
            lines = [
                `Our team reviewed your application and requested adjustments before we can approve it:`,
                `Please update your details and resubmit when ready.`
            ];
            extraBox = `
              <div style="background-color: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 14px 16px; margin: 16px 0; font-size: 14px; color: #991B1B; line-height: 1.5;">
                ${safeReason}
              </div>`;
            buttonText = 'Update & Resubmit';
            buttonUrl = myBusinessUrl;
            break;

        case 'application_approved_pay':
            subject = `Your details are approved – pay with GCash to go live on Calzada`;
            headline = `${businessName} is approved – next step: payment`;
            lines = [
                `Great news! Your business details have been approved by Calzada.`,
                `Chosen Plan: ${planName} · Amount Due: ₱${amount}.`,
                `Pay via GCash and upload your confirmation receipt on My Business to publish your listing.`
            ];
            buttonText = 'Upload Receipt on My Business';
            buttonUrl = myBusinessUrl;
            break;

        case 'application_declined':
            subject = `Application status for ${plainBusName}`;
            headline = `Update on your application for ${businessName}`;
            lines = [
                `Thank you for your interest in listing with Calzada.`,
                `After careful review, we are unable to approve this application at this time:`,
                `Declined registrations do not incur any charges.`
            ];
            extraBox = `
              <div style="background-color: #F1F5F9; border: 1px solid #E2E8F0; border-radius: 8px; padding: 14px 16px; margin: 16px 0; font-size: 14px; color: #475569; line-height: 1.5;">
                ${safeReason}
              </div>`;
            buttonText = 'Open My Business';
            buttonUrl = myBusinessUrl;
            break;

        case 'payment_received':
            if (recipientType === 'admin') {
                subject = `Payment receipt submitted: ${plainBusName}`;
                headline = `New payment receipt for ${businessName}`;
                lines = [
                    `A payment confirmation receipt was uploaded for ${businessName}.`,
                    `Reference: ${refNo} · Amount Due: ₱${amount}.`,
                    `Verify this transaction in your GCash merchant portal and publish the listing.`
                ];
                buttonText = 'Verify in Admin Panel';
                buttonUrl = `${adminUrl}#payments`;
            } else {
                subject = `We got your receipt for ${plainBusName}`;
                headline = `We received your payment receipt for ${businessName}`;
                lines = [
                    `Thank you for submitting your GCash payment confirmation.`,
                    `Reference: ${refNo} · Plan: ${planName}.`,
                    `Our team verifies receipts within 1–2 business days. We will notify you the moment your listing is live.`
                ];
                buttonText = 'Check Status on My Business';
                buttonUrl = myBusinessUrl;
            }
            break;

        case 'payment_not_matched':
            subject = `Payment receipt update for ${plainBusName}`;
            headline = `Payment could not be verified for ${businessName}`;
            lines = [
                `We checked the payment receipt you uploaded, but we were unable to match it with our records:`,
                `Please double-check your GCash transaction reference number and re-upload the receipt.`
            ];
            extraBox = `
              <div style="background-color: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 14px 16px; margin: 16px 0; font-size: 14px; color: #991B1B; line-height: 1.5;">
                ${safeReason}
              </div>`;
            buttonText = 'Re-upload Receipt';
            buttonUrl = myBusinessUrl;
            break;

        case 'business_live':
            subject = `${plainBusName} is live on Calzada`;
            headline = `${businessName} is now live on Calzada!`;
            lines = [
                `Your payment has been verified and your business listing is officially published.`,
                `Commuters in Calamba can now find your location, plan jeepney routes to it, and read your updates.`,
                `You can update photos, post announcements, and view commuter views on your dashboard.`
            ];
            buttonText = 'Open Business Dashboard';
            buttonUrl = myBusinessUrl;
            break;

        case 'tour360_availed':
            if (recipientType === 'admin') {
                subject = `New 360 shoot pending: ${plainBusName}`;
                headline = `360° virtual tour shoot pending for ${businessName}`;
                lines = [
                    `A business has subscribed to a plan including an on-site 360° virtual tour.`,
                    `Location: ${escapeHtml(b.address || 'Calamba City')} · Contact: ${escapeHtml(b.contactNumber || 'On file')}.`,
                    `Contact the owner to arrange the photography schedule.`
                ];
                buttonText = 'View in Admin Panel';
                buttonUrl = `${adminUrl}#businesses`;
            } else {
                subject = `Your 360° virtual tour: next steps for ${plainBusName}`;
                headline = `Your 360° virtual tour for ${businessName}`;
                lines = [
                    `Your Calzada subscription includes an on-site 360° virtual tour of your establishment.`,
                    `Our team will reach out to schedule a quick 15-minute photography session at your location.`,
                    `Once captured, your immersive tour will be published directly on your Calzada listing.`
                ];
                buttonText = 'View on My Business';
                buttonUrl = myBusinessUrl;
            }
            break;

        case 'tour360_scheduled':
            subject = `360° photo shoot scheduled for ${plainBusName}`;
            headline = `360° shoot scheduled for ${businessName}`;
            lines = [
                `Your on-site 360° photography session is confirmed for ${shootDate}.`,
                `A Calzada photographer will visit your establishment at the scheduled time.`,
                `Please have your customer area ready so we can capture your space at its best.`
            ];
            buttonText = 'View Details on My Business';
            buttonUrl = myBusinessUrl;
            break;

        case 'tour360_published':
            subject = `Your 360° virtual tour is now published for ${plainBusName}`;
            headline = `Your 360° tour is live on Calzada!`;
            lines = [
                `The 360° interactive virtual tour for ${businessName} is now published.`,
                `Commuters can now look inside your establishment right from your place page.`,
                `Check out how it looks on the Calzada map.`
            ];
            buttonText = 'View Place on Calzada';
            buttonUrl = placeId ? `${baseUrl}/places?id=${placeId}` : `${baseUrl}/places`;
            break;

        case 'business_removed':
            subject = `Listing status update for ${plainBusName}`;
            headline = `${businessName} has been unlisted from Calzada`;
            lines = [
                `Your business listing has been hidden or removed by an administrator:`,
                `If you have questions or would like to appeal this action, reply directly to this email.`
            ];
            extraBox = `
              <div style="background-color: #F1F5F9; border: 1px solid #E2E8F0; border-radius: 8px; padding: 14px 16px; margin: 16px 0; font-size: 14px; color: #475569; line-height: 1.5;">
                ${safeReason}
              </div>`;
            buttonText = 'Open My Business';
            buttonUrl = myBusinessUrl;
            break;

        case 'business_deleted':
            subject = `${plainBusName} was removed from Calzada`;
            headline = `${businessName} has been permanently removed`;
            lines = [
                `An administrator permanently removed your business from Calzada. Its listing, posts, reviews and photos are no longer on the site.`,
                `Reason given:`
            ];
            extraBox = `
              <div style="background-color: #F1F5F9; border: 1px solid #E2E8F0; border-radius: 8px; padding: 14px 16px; margin: 16px 0; font-size: 14px; color: #475569; line-height: 1.5;">
                ${safeReason}
              </div>
              <p style="font-family: 'Outfit', sans-serif; font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 12px 0;">
                Your payment records are kept. If you have questions, reply directly to this email.
              </p>`;
            buttonText = 'See Calzada plans';
            buttonUrl = `${baseUrl}/plans`;
            break;

        case 'review_posted':
            if (recipientType === 'user') {
                subject = `Thank you for reviewing ${plainPlaceName}`;
                headline = `Thank you for your review of ${placeName}`;
                lines = [
                    `We received your review for ${placeName}.`,
                    `Your rating: ${ratingStars} · "${commentPreview}".`,
                    `Community feedback helps commuters discover quality spots and helps local establishments improve.`
                ];
                buttonText = 'View Place & Reviews';
                buttonUrl = placeId ? `${baseUrl}/places?id=${placeId}` : `${baseUrl}/places`;
            } else {
                subject = `New review received for ${plainPlaceName}`;
                headline = `New review on ${placeName}`;
                lines = [
                    `A commuter posted a new review on ${placeName}.`,
                    `Rating: ${ratingStars} by ${reviewerName}.`,
                    `Comment: "${commentPreview}".`
                ];
                buttonText = 'View Place & Reviews';
                buttonUrl = placeId ? `${baseUrl}/places?id=${placeId}` : `${baseUrl}/places`;
            }
            break;

        case 'review_removed':
            subject = `Your review for ${plainPlaceName} was removed`;
            headline = `Notice regarding your review for ${placeName}`;
            lines = [
                `Your review for ${placeName} was hidden or removed by Calzada moderation:`,
                `Please review our community standards to ensure your future contributions remain active.`
            ];
            extraBox = `
              <div style="background-color: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 14px 16px; margin: 16px 0; font-size: 14px; color: #991B1B; line-height: 1.5;">
                ${safeReason}
              </div>`;
            buttonText = 'Visit Calzada Places';
            buttonUrl = `${baseUrl}/places`;
            break;

        case 'post_hidden':
            subject = `Your post for ${plainBusName} has been hidden`;
            headline = `Post moderation notice for ${businessName}`;
            lines = [
                `A post published for ${businessName} was hidden by an administrator:`,
                `You can view and manage your posts anytime from your My Business dashboard.`
            ];
            extraBox = `
              <div style="background-color: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 14px 16px; margin: 16px 0; font-size: 14px; color: #991B1B; line-height: 1.5;">
                ${safeReason}
              </div>`;
            buttonText = 'Manage Posts on My Business';
            buttonUrl = myBusinessUrl;
            break;

        default:
            subject = `Update regarding ${plainBusName}`;
            headline = `Notification for ${businessName}`;
            lines = [
                `There is a new update regarding your business listing on Calzada.`,
                `Please check your dashboard for details.`
            ];
            buttonText = 'Open My Business';
            buttonUrl = myBusinessUrl;
            break;
    }

    const linesHtml = lines.map(line => `
      <p style="font-family: 'Outfit', sans-serif; font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 12px 0;">
        ${line}
      </p>
    `).join('');

    const contentHtml = `
      <h1 style="font-family: 'Sora', sans-serif; font-size: 20px; font-weight: 700; color: #042C53; margin: 0 0 16px 0; line-height: 1.3;">
        ${headline}
      </h1>
      ${linesHtml}
      ${extraBox}
      <table cellpadding="0" cellspacing="0" border="0" style="margin: 24px 0 0 0;">
        <tr>
          <td>
            <a href="${buttonUrl}" style="background-color: #378ADD; color: #FFFFFF; font-family: 'Outfit', sans-serif; font-size: 15px; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 8px; display: inline-block;">
              ${buttonText}
            </a>
          </td>
        </tr>
      </table>
    `;

    return {
        subject,
        html: renderEmailShell({
            title: subject,
            contentHtml,
            showFooter: true
        })
    };
}

/**
 * Backward compatibility wrapper for existing code calling generateOwnerNotificationEmail
 */
function generateOwnerNotificationEmail(params) {
    const eventMap = {
        received: 'application_received',
        needs_changes: 'application_needs_changes',
        approved_unpaid: 'application_approved_pay',
        payment_received: 'payment_received',
        not_matched: 'payment_not_matched',
        live: 'business_live',
        declined: 'application_declined'
    };
    const mapped = eventMap[params?.event] || params?.event;
    return renderEventEmail(mapped, params, 'owner');
}

/**
 * Internal Notification Email (Feedback Submissions)
 */
function generateFeedbackEmailHtml({ category, rating, name, email, message, timestamp }) {
    const safeCategory = escapeHtml(category);
    const safeName = name && name.trim() ? escapeHtml(name.trim()) : null;
    const safeEmail = escapeHtml(email ? email.trim() : '');
    const safeMessage = escapeHtml(message ? message.trim() : '').replace(/\n/g, '<br>');
    const formattedRating = formatRating(rating);
    const catStyle = getCategoryStyle(category);

    const timestampStr = (timestamp ? new Date(timestamp) : new Date()).toLocaleString('en-US', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });

    const contentHtml = `
      <div style="font-size: 14px; line-height: 1.5; color: #64748B; margin-bottom: 22px; padding-bottom: 16px; border-bottom: 1px solid #F1F5F9;">
        New feedback just came in &mdash; <strong style="color: #042C53; font-weight: 600;">${timestampStr}</strong>.
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
        <tr>
          <td style="padding: 10px 0; width: 105px; vertical-align: middle;">
            <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B; display: block;">Category</span>
          </td>
          <td style="padding: 10px 0; vertical-align: middle;">
            <span style="display: inline-block; background-color: ${catStyle.bg}; color: ${catStyle.color}; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 4px; border: 1px solid ${catStyle.border}; letter-spacing: 0.01em;">
              ${safeCategory}
            </span>
          </td>
        </tr>
        ${formattedRating ? `
        <tr>
          <td style="padding: 10px 0; width: 105px; vertical-align: middle;">
            <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B; display: block;">Rating</span>
          </td>
          <td style="padding: 10px 0; font-size: 15px; font-weight: 500; color: #042C53; vertical-align: middle;">
            ${formattedRating}
          </td>
        </tr>` : ''}
        ${safeName ? `
        <tr>
          <td style="padding: 10px 0; vertical-align: middle;">
            <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B; display: block;">Sender</span>
          </td>
          <td style="padding: 10px 0; font-size: 15px; font-weight: 500; color: #042C53; vertical-align: middle;">
            ${safeName}
          </td>
        </tr>` : ''}
        ${safeEmail ? `
        <tr>
          <td style="padding: 10px 0; vertical-align: middle;">
            <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B; display: block;">Email</span>
          </td>
          <td style="padding: 10px 0; font-size: 14px; vertical-align: middle;">
            <a href="mailto:${safeEmail}" style="color: #378ADD; text-decoration: none; font-weight: 500;">${safeEmail}</a>
          </td>
        </tr>` : ''}
      </table>
      ${safeMessage ? `
      <div style="margin-top: 20px; padding: 16px; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px;">
        <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B; margin-bottom: 8px;">Message</div>
        <div style="font-size: 14px; line-height: 1.6; color: #334155;">${safeMessage}</div>
      </div>` : ''}
    `;

    return renderEmailShell({
        title: `Calzada Feedback: ${category}`,
        contentHtml,
        footerSubtext: 'Calzada • Calamba City, Laguna • Automated notification',
        showFooter: true
    });
}

function generateFeedbackThankYouEmailHtml({ name, category }) {
    const safeName = name && name.trim() ? escapeHtml(name.trim()) : null;
    const greeting = safeName ? `Hi ${safeName},` : 'Hello,';
    const baseUrl = process.env.PRODUCTION_ORIGIN || 'https://calzadaph.com';

    const contentHtml = `
      <h1 style="font-family: 'Sora', sans-serif; font-size: 20px; font-weight: 700; color: #042C53; margin: 0 0 16px 0; line-height: 1.3;">
        Thank you for helping us improve Calzada
      </h1>
      <p style="font-family: 'Outfit', sans-serif; font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 12px 0;">
        ${greeting}
      </p>
      <p style="font-family: 'Outfit', sans-serif; font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 12px 0;">
        We received your feedback regarding <strong>${escapeHtml(category || 'Calzada')}</strong>. Every report and suggestion helps make navigating Calamba easier for everyone.
      </p>
      <p style="font-family: 'Outfit', sans-serif; font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 24px 0;">
        Our team reviews every submission as we expand route coverage and features across the city.
      </p>
      <table cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td>
            <a href="${baseUrl}/planner" style="background-color: #378ADD; color: #FFFFFF; font-family: 'Outfit', sans-serif; font-size: 15px; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 8px; display: inline-block;">
              Explore Calzada Planner
            </a>
          </td>
        </tr>
      </table>
    `;

    return renderEmailShell({
        title: 'Thank you for your feedback – Calzada',
        contentHtml,
        showFooter: true
    });
}

function generateReminderEmailHtml({ destName, leaveByStr, etaStr, mode, fareStr, originName, plannerUrl, lang }) {
    const isTl = (lang || '').toLowerCase() === 'tl';
    const safeDest = escapeHtml(destName || (isTl ? 'iyong destinasyon' : 'your destination'));
    const safeLeave = escapeHtml(leaveByStr || 'Now');
    const safeArrive = escapeHtml(etaStr || '--:--');
    const safeMode = escapeHtml(mode === 'walking' || mode === 'walk' ? (isTl ? 'Paglalakad' : 'Walking') : 'Jeepney');
    const safeOrigin = escapeHtml(originName || (isTl ? 'Aking Lokasyon' : 'My Location'));
    const safeUrl = escapeHtml(plannerUrl || 'https://calzadaph.com/planner');

    const subject = isTl
        ? `Paalala sa Byahe: Papuntang ${String(destName || 'destinasyon').replace(/[\r\n]+/g, ' ').trim()}`
        : `Travel Reminder: Trip to ${String(destName || 'destination').replace(/[\r\n]+/g, ' ').trim()}`;

    const contentHtml = `
      <h1 style="font-family: 'Sora', sans-serif; font-size: 20px; font-weight: 700; color: #042C53; margin: 0 0 16px 0; line-height: 1.3;">
        ${isTl ? `Paalala para sa byahe papuntang ${safeDest}` : `Travel reminder for your trip to ${safeDest}`}
      </h1>
      <p style="font-family: 'Outfit', sans-serif; font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 12px 0;">
        ${isTl ? 'Umalis bago mag' : 'Leave by'}: <strong style="color: #042C53;">${safeLeave}</strong> · ${isTl ? 'Tinatayang dating' : 'Estimated arrival'}: <strong style="color: #042C53;">${safeArrive}</strong>.
      </p>
      <p style="font-family: 'Outfit', sans-serif; font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 12px 0;">
        ${isTl ? 'Sasakyan' : 'Mode'}: ${safeMode}${fareStr ? ` · ${isTl ? 'Pamasahe' : 'Fare'}: ${escapeHtml(fareStr)}` : ''} · ${isTl ? 'Simula sa' : 'Starting from'}: ${safeOrigin}.
      </p>
      <table cellpadding="0" cellspacing="0" border="0" style="margin: 24px 0 0 0;">
        <tr>
          <td>
            <a href="${safeUrl}" style="background-color: #378ADD; color: #FFFFFF; font-family: 'Outfit', sans-serif; font-size: 15px; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 8px; display: inline-block;">
              ${isTl ? 'Buksan sa Calzada Planner' : 'Open in Calzada Planner'}
            </a>
          </td>
        </tr>
      </table>
    `;

    return {
        subject,
        html: renderEmailShell({
            title: subject,
            contentHtml,
            showFooter: true
        })
    };
}

module.exports = {
    escapeHtml,
    formatRating,
    getCategoryStyle,
    renderEmailShell,
    renderEventEmail,
    generateEventEmail: renderEventEmail,
    generateOwnerNotificationEmail,
    generateFeedbackEmailHtml,
    generateFeedbackThankYouEmailHtml,
    generateReminderEmailHtml
};
