/**
 * Calzada Branded HTML Email Template for Feedback Submissions
 * Table-based inline layout compatible with Gmail, Outlook, Apple Mail, etc.
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
    const key = String(rating).trim();
    const map = {
        '1': { emoji: '😞', label: 'Bad' },
        '2': { emoji: '😕', label: 'Poor' },
        '3': { emoji: '😐', label: 'Okay' },
        '4': { emoji: '🙂', label: 'Good' },
        '5': { emoji: '😄', label: 'Great' },
        'Bad': { emoji: '😞', label: 'Bad' },
        'Poor': { emoji: '😕', label: 'Poor' },
        'Okay': { emoji: '😐', label: 'Okay' },
        'Good': { emoji: '🙂', label: 'Good' },
        'Great': { emoji: '😄', label: 'Great' }
    };

    if (map[key]) {
        const item = map[key];
        return `${item.emoji} ${item.label}`;
    }
    return escapeHtml(key);
}

function getCategoryStyle(category) {
    const norm = String(category || '').trim().toLowerCase();
    if (norm === 'bug report' || norm.includes('bug')) {
        return {
            bg: '#FFF7ED',       // warm amber/orange tint
            color: '#C2410C',    // deep warm amber text
            border: '#FFEDD5'
        };
    }
    if (norm === 'suggestion' || norm.includes('suggest') || norm.includes('feature') || norm.includes('idea')) {
        return {
            bg: '#EFF6FF',       // soft brand blue tint
            color: '#1D4ED8',    // deep brand blue text
            border: '#DBEAFE'
        };
    }
    // Default / General
    return {
        bg: '#F1F5F9',         // soft neutral slate tint
        color: '#475569',      // neutral slate text
        border: '#E2E8F0'
    };
}

/**
 * Shared Branded Email Shell (Table-based layout with Calzada wordmark + arrow flourish)
 */
function renderEmailShell({ title, contentHtml, footerSubtext, showFooter = true }) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title || 'Calzada')}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #1E293B;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #F1F5F9; padding: 40px 16px;">
    <tr>
      <td align="center">
        <!-- Main Container Card -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 560px; background-color: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06); border: 1px solid #E2E8F0;">
          
          <!-- Header Band -->
          <tr>
            <td style="background-color: #378ADD; padding: 24px 32px; text-align: left;">
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align: middle;">
                    <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 24px; font-weight: 800; color: #FFFFFF; letter-spacing: -0.6px; line-height: 1; text-decoration: none;">Calzada</span>
                  </td>
                  <td style="vertical-align: middle; padding-left: 7px; padding-top: 2px;">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" style="display: block;">
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
            <td style="padding: 28px 32px 30px 32px;">
              ${contentHtml}
            </td>
          </tr>

          ${showFooter ? `
          <!-- Footer Band -->
          <tr>
            <td style="background-color: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 20px 32px; font-size: 12px; color: #64748B; line-height: 1.5; text-align: left;">
              <div style="margin-bottom: 4px; font-weight: 500; color: #475569;">
                This is an automated notification from the Calzada capstone feedback form.
              </div>
              <div style="font-size: 11px; color: #94A3B8;">
                ${footerSubtext || 'Calzada &bull; Calamba City, Laguna &bull; Academic Capstone Project'}
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
 * Internal Notification Email (Sent to thecalzada@gmail.com)
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
      <!-- Natural Context Line + Timestamp -->
      <div style="font-size: 14px; line-height: 1.5; color: #64748B; margin-bottom: 22px; padding-bottom: 16px; border-bottom: 1px solid #F1F5F9;">
        New feedback just came in &mdash; <strong style="color: #042C53; font-weight: 600;">${timestampStr}</strong>.
      </div>

      <!-- Field-Row Layout Table -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
        <!-- Category Row -->
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
        <!-- Rating Row -->
        <tr>
          <td style="padding: 10px 0; width: 105px; vertical-align: middle;">
            <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B; display: block;">Rating</span>
          </td>
          <td style="padding: 10px 0; font-size: 15px; font-weight: 500; color: #042C53; vertical-align: middle;">
            ${formattedRating}
          </td>
        </tr>
        ` : ''}

        <!-- Submitter Name Row -->
        <tr>
          <td style="padding: 10px 0; width: 105px; vertical-align: middle;">
            <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B; display: block;">Name</span>
          </td>
          <td style="padding: 10px 0; font-size: 15px; font-weight: 500; color: #042C53; vertical-align: middle;">
            ${safeName ? safeName : '<span style="color: #94A3B8; font-weight: 400; font-style: italic;">Not provided</span>'}
          </td>
        </tr>

        <!-- Submitter Email Row -->
        <tr>
          <td style="padding: 10px 0; width: 105px; vertical-align: middle;">
            <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B; display: block;">Email</span>
          </td>
          <td style="padding: 10px 0; font-size: 15px; font-weight: 500; vertical-align: middle;">
            <a href="mailto:${safeEmail}" style="color: #378ADD; text-decoration: none; font-weight: 500;">
              ${safeEmail}
            </a>
          </td>
        </tr>
      </table>

      <!-- Message Section -->
      <div style="margin-top: 22px; padding-top: 20px; border-top: 1px solid #F1F5F9;">
        <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B; margin-bottom: 10px;">
          Message
        </div>
        <div style="background-color: #F8FAFC; border-left: 4px solid #378ADD; padding: 18px 20px; border-radius: 0 6px 6px 0; color: #042C53; font-size: 15px; line-height: 1.6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          ${safeMessage}
        </div>
      </div>
    `;

    return renderEmailShell({
        title: `[Calzada Feedback] ${category} — from ${name || 'Anonymous'}`,
        contentHtml,
        footerSubtext: 'Reply directly to this email to contact the submitter.',
        showFooter: true
    });
}

/**
 * Submitter Thank-You Email (Sent to user's verified email)
 */
function generateFeedbackThankYouEmailHtml({ name, category }) {
    const safeName = name && name.trim() ? escapeHtml(name.trim()) : 'there';
    const rawCategory = category ? category.trim() : 'Feedback';
    const catLower = rawCategory.toLowerCase();
    const catDisplay = (catLower === 'general' || !catLower) ? 'feedback' : escapeHtml(catLower);

    const contentHtml = `
      <div style="font-size: 14px; line-height: 1.5; color: #64748B; margin-bottom: 22px; padding-bottom: 16px; border-bottom: 1px solid #F1F5F9;">
        Confirmation &mdash; <strong style="color: #042C53; font-weight: 600;">We received your feedback</strong>.
      </div>

      <p style="font-size: 15px; line-height: 1.6; color: #1E293B; margin: 0 0 16px 0;">
        Hi ${safeName},
      </p>

      <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 16px 0;">
        Thank you for taking the time to share your feedback with us. We&rsquo;ve received your <strong style="color: #042C53;">${catDisplay}</strong> and our team will review it as we continue improving Calzada.
      </p>

      <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 24px 0;">
        We appreciate you helping us make the app better.
      </p>

      <div style="font-size: 15px; font-weight: 600; color: #042C53;">
        &mdash; The Calzada Team
      </div>
    `;

    return renderEmailShell({
        title: 'Thank you for your feedback! — Calzada',
        contentHtml,
        showFooter: false
    });
}

/**
 * Smart Travel Reminder Email (Sent when remindAt is reached)
 */
function generateReminderEmailHtml({
    destName,
    originLabel,
    leaveTimeStr,
    arriveTimeStr,
    modeStr,
    fareStr,
    fareRegular,
    fareDiscounted,
    plannerUrl,
    lang = 'en'
}) {
    const isTl = lang === 'tl';
    const safeDest = escapeHtml(destName || 'your destination');
    const safeOrigin = escapeHtml(originLabel || 'Current Location');
    const safeLeave = escapeHtml(leaveTimeStr || '--:--');
    const safeArrive = escapeHtml(arriveTimeStr || '--:--');
    const safeMode = escapeHtml(modeStr || (isTl ? 'Dyip' : 'Jeepney'));
    const safeUrl = escapeHtml(plannerUrl || 'https://calzadaph.com/planner');

    let resolvedFareStr = null;
    if (typeof fareRegular === 'number' && typeof fareDiscounted === 'number') {
        if (fareRegular === 0) {
            resolvedFareStr = isTl ? 'Libre' : 'Free';
        } else {
            const discLabel = isTl ? 'Estudyante/Senior/PWD' : 'Student/Senior/PWD';
            resolvedFareStr = `₱${fareRegular.toFixed(2)} (${discLabel} ₱${fareDiscounted.toFixed(2)})`;
        }
    }

    const subject = isTl
        ? `Oras na para umalis papuntang ${destName}`
        : `Time to leave for ${destName}`;

    const headline = isTl ? 'Oras na para umalis!' : "It's time to leave!";
    const subheader = isTl
        ? `Narito ang paalala para sa iyong byahe papuntang <strong style="color: #042C53;">${safeDest}</strong>.`
        : `Here are the details for your trip to <strong style="color: #042C53;">${safeDest}</strong>.`;

    const labelLeave = isTl ? 'Umalis bago mag' : 'Leave by';
    const labelArrive = isTl ? 'Tinatayang dating' : 'Estimated arrival';
    const labelMode = isTl ? 'Sasakyan' : 'Mode';
    const labelFare = isTl ? 'Pamasahe' : 'Fare estimate';
    const labelOrigin = isTl ? 'Pinanggalingan' : 'Starting from';
    const ctaText = isTl ? 'Buksan sa Calzada Planner' : 'Open in Calzada Planner';

    const fareRowHtml = resolvedFareStr ? `
              <tr>
                <td style="padding: 6px 0; font-size: 13px; color: #64748B;">${labelFare}</td>
                <td style="padding: 6px 0; font-size: 14px; font-weight: 600; color: #0F172A;">${escapeHtml(resolvedFareStr)}</td>
              </tr>` : '';

    const contentHtml = `
      <div style="font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #2272C3; margin-bottom: 8px;">
        ${isTl ? 'Paalala sa Byahe' : 'Travel Reminder'}
      </div>
      <h2 style="font-size: 22px; font-weight: 800; color: #042C53; margin: 0 0 12px 0; line-height: 1.3;">
        ${headline}
      </h2>
      <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 24px 0;">
        ${subheader}
      </p>

      <!-- Highlight Card -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; margin-bottom: 24px; overflow: hidden;">
        <tr>
          <td style="padding: 20px; border-bottom: 1px solid #E2E8F0; background: #EFF6FF;">
            <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #1D4ED8; margin-bottom: 4px;">
              ${labelLeave}
            </div>
            <div style="font-size: 26px; font-weight: 800; color: #1E3A8A; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
              ${safeLeave}
            </div>
            <div style="font-size: 13px; color: #475569; margin-top: 4px;">
              ${labelArrive}: <strong style="color: #0F172A;">${safeArrive}</strong>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding: 18px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding: 6px 0; font-size: 13px; color: #64748B; width: 120px;">${labelMode}</td>
                <td style="padding: 6px 0; font-size: 14px; font-weight: 600; color: #0F172A;">${safeMode}</td>
              </tr>${fareRowHtml}
              <tr>
                <td style="padding: 6px 0; font-size: 13px; color: #64748B;">${labelOrigin}</td>
                <td style="padding: 6px 0; font-size: 14px; color: #334155;">${safeOrigin}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- CTA Button -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px;">
        <tr>
          <td align="center">
            <a href="${safeUrl}" style="display: inline-block; background-color: #2272C3; color: #FFFFFF; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
              ${ctaText} &rarr;
            </a>
          </td>
        </tr>
      </table>

      <div style="font-size: 13px; color: #64748B; line-height: 1.5; border-top: 1px solid #F1F5F9; padding-top: 16px;">
        ${isTl
          ? 'Naka-iskedyul ang paalalang ito batay sa iyong napiling oras sa Calzada.'
          : 'This reminder was scheduled based on your chosen departure time on Calzada.'}
      </div>
    `;

    return {
        subject,
        html: renderEmailShell({
            title: subject,
            contentHtml,
            showFooter: false
        })
    };
}

/**
 * Owner Notification Emails for Application & Payment lifecycle events
 */
function generateOwnerNotificationEmail({ event, business, reason, amountDue, plan, referenceNo }) {
    const businessName = escapeHtml(business?.name || 'Your business');
    const subjectName = String(business?.name || 'Your business').replace(/[\r\n]+/g, ' ').trim();
    const safeReason = escapeHtml(reason || business?.reviewNote || 'No specific note provided.');
    const planName = plan === 'plus360' ? 'Listed + 360' : (plan === 'featured' ? 'Featured' : 'Listed');
    const amount = amountDue || (plan === 'featured' ? 299 : (plan === 'plus360' ? 199 : 59));
    const baseUrl = process.env.PRODUCTION_ORIGIN || 'https://calzadaph.com';
    const myBusinessUrl = `${baseUrl}/my-business`;

    let subject = '';
    let bodyHtml = '';

    switch (event) {
        case 'received':
            subject = `We got your application for ${subjectName}`;
            bodyHtml = `
              <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 16px;">
                We got your application for <strong>${businessName}</strong>.
              </p>
              <p style="font-size: 14px; line-height: 1.6; color: #64748B; margin-bottom: 24px;">
                The Calzada team checks every registration to make sure commuters get accurate information. We'll email you once our review is complete.
              </p>
            `;
            break;

        case 'needs_changes':
            subject = `Action needed: changes requested for ${subjectName}`;
            bodyHtml = `
              <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 16px;">
                Our team reviewed your application for <strong>${businessName}</strong> and requested a few changes before approval:
              </p>
              <div style="background-color: #FEF2F2; border-left: 4px solid #DC2626; border-radius: 6px; padding: 14px 16px; margin-bottom: 24px; font-size: 14px; color: #991B1B; line-height: 1.5;">
                ${safeReason}
              </div>
              <p style="font-size: 14px; line-height: 1.6; color: #64748B; margin-bottom: 24px;">
                Please visit your business page to update your details and resubmit for review.
              </p>
              <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px;">
                <tr>
                  <td>
                    <a href="${myBusinessUrl}" style="background-color: #378ADD; color: #FFFFFF; font-size: 15px; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 8px; display: inline-block;">
                      Update &amp; Resubmit
                    </a>
                  </td>
                </tr>
              </table>
            `;
            break;

        case 'approved_unpaid':
            subject = `Your details are approved – pay with GCash to go live on Calzada`;
            bodyHtml = `
              <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 16px;">
                Great news! Details for <strong>${businessName}</strong> have been approved by Calzada.
              </p>
              <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="font-size: 14px; color: #64748B; padding-bottom: 8px;">Chosen Plan</td>
                    <td style="font-size: 14px; font-weight: 700; color: #042C53; text-align: right; padding-bottom: 8px;">${planName}</td>
                  </tr>
                  <tr>
                    <td style="font-size: 14px; color: #64748B;">Amount Due</td>
                    <td style="font-size: 18px; font-weight: 800; color: #378ADD; text-align: right;">₱${amount}</td>
                  </tr>
                </table>
              </div>
              <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 16px;">
                Pay exactly <strong>₱${amount}</strong> with GCash, then upload the receipt on My Business to go live on the Calzada map.
              </p>
              <div style="text-align: center; margin: 24px 0;">
                <img src="${baseUrl}/assets/payments/gcash-qr.png" alt="Calzada PH GCash QR code" style="max-width: 260px; border-radius: 12px; border: 1px solid #E2E8F0;" />
              </div>
              <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto 24px;">
                <tr>
                  <td>
                    <a href="${myBusinessUrl}" style="background-color: #378ADD; color: #FFFFFF; font-size: 15px; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 8px; display: inline-block;">
                      Upload Receipt on My Business
                    </a>
                  </td>
                </tr>
              </table>
            `;
            break;

        case 'payment_received':
            subject = `We got your receipt for ${subjectName}`;
            bodyHtml = `
              <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 16px;">
                We got your receipt for <strong>${businessName}</strong>.
              </p>
              <p style="font-size: 14px; line-height: 1.6; color: #64748B; margin-bottom: 24px;">
                Our team checks payments within 1–2 days against our GCash statement. We'll email you once your listing is verified and live on the map.
              </p>
            `;
            break;

        case 'not_matched':
            subject = `Payment receipt update for ${subjectName}`;
            bodyHtml = `
              <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 16px;">
                We reviewed the payment receipt submitted for <strong>${businessName}</strong>, but could not verify it:
              </p>
              <div style="background-color: #FEF2F2; border-left: 4px solid #DC2626; border-radius: 6px; padding: 14px 16px; margin-bottom: 24px; font-size: 14px; color: #991B1B; line-height: 1.5;">
                ${safeReason}
              </div>
              <p style="font-size: 14px; line-height: 1.6; color: #64748B; margin-bottom: 24px;">
                Please check your reference number and upload the correct GCash confirmation receipt on My Business.
              </p>
              <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px;">
                <tr>
                  <td>
                    <a href="${myBusinessUrl}" style="background-color: #378ADD; color: #FFFFFF; font-size: 15px; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 8px; display: inline-block;">
                      Re-upload Receipt
                    </a>
                  </td>
                </tr>
              </table>
            `;
            break;

        case 'live':
            subject = `${subjectName} is live on Calzada`;
            const refText = referenceNo ? escapeHtml(referenceNo) : 'Verified';
            const today = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
            bodyHtml = `
              <p style="font-size: 16px; line-height: 1.6; color: #16A34A; font-weight: 700; margin-bottom: 12px;">
                🎉 Your business is now live on Calzada!
              </p>
              <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 24px;">
                Commuters in Calamba can now find <strong>${businessName}</strong> on the map, browse it in Places, plan jeepney routes to it, and see your updates.
              </p>
              <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 18px; margin-bottom: 24px;">
                <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B; margin-bottom: 12px;">
                  Payment Acknowledgment (Not an official receipt)
                </div>
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size: 13px;">
                  <tr>
                    <td style="color: #64748B; padding-bottom: 6px;">Business:</td>
                    <td style="font-weight: 600; color: #042C53; text-align: right; padding-bottom: 6px;">${businessName}</td>
                  </tr>
                  <tr>
                    <td style="color: #64748B; padding-bottom: 6px;">Plan:</td>
                    <td style="font-weight: 600; color: #042C53; text-align: right; padding-bottom: 6px;">${planName}</td>
                  </tr>
                  <tr>
                    <td style="color: #64748B; padding-bottom: 6px;">Amount Paid:</td>
                    <td style="font-weight: 700; color: #16A34A; text-align: right; padding-bottom: 6px;">₱${amount}</td>
                  </tr>
                  <tr>
                    <td style="color: #64748B; padding-bottom: 6px;">Reference No:</td>
                    <td style="font-family: monospace; color: #042C53; text-align: right; padding-bottom: 6px;">${refText}</td>
                  </tr>
                  <tr>
                    <td style="color: #64748B;">Date Verified:</td>
                    <td style="color: #042C53; text-align: right;">${today}</td>
                  </tr>
                </table>
              </div>
              <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px;">
                <tr>
                  <td>
                    <a href="${myBusinessUrl}" style="background-color: #378ADD; color: #FFFFFF; font-size: 15px; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 8px; display: inline-block;">
                      Open Business Dashboard
                    </a>
                  </td>
                </tr>
              </table>
            `;
            break;

        case 'declined':
            subject = `Application status for ${subjectName}`;
            bodyHtml = `
              <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 16px;">
                Thank you for your interest in listing <strong>${businessName}</strong> on Calzada.
              </p>
              <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 16px;">
                After reviewing your application, we are unable to approve this listing at this time:
              </p>
              <div style="background-color: #F1F5F9; border-left: 4px solid #64748B; border-radius: 6px; padding: 14px 16px; margin-bottom: 24px; font-size: 14px; color: #475569; line-height: 1.5;">
                ${safeReason}
              </div>
              <p style="font-size: 13px; color: #64748B; line-height: 1.5;">
                Declined registrations do not incur any charges.
              </p>
            `;
            break;
    }

    return {
        subject,
        html: renderEmailShell({
            title: subject,
            contentHtml: bodyHtml,
            showFooter: true
        })
    };
}

module.exports = {
    escapeHtml,
    formatRating,
    getCategoryStyle,
    renderEmailShell,
    generateFeedbackEmailHtml,
    generateFeedbackThankYouEmailHtml,
    generateReminderEmailHtml,
    generateOwnerNotificationEmail
};

