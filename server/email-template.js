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

module.exports = {
    escapeHtml,
    formatRating,
    getCategoryStyle,
    renderEmailShell,
    generateFeedbackEmailHtml,
    generateFeedbackThankYouEmailHtml
};
