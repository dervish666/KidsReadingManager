/**
 * Email utilities for sending transactional emails
 *
 * Provider strategy:
 * 1. Cloudflare Email Service (send_email binding) — primary. Uses the simple
 *    object-based API introduced in public beta (2026-04-16). No MIME plumbing,
 *    no cloudflare:email import — just env.EMAIL_SENDER.send({ to, from, ... }).
 *    Cloudflare auto-manages SPF/DKIM/DMARC and IP reputation for
 *    Email-Service-verified domains.
 * 2. Resend (RESEND_API_KEY) — fallback. Catches Cloudflare failures during
 *    the beta migration. Safe to remove once Cloudflare reaches GA and we've
 *    validated deliverability.
 *
 * If both fail (or neither is configured) the caller gets a graceful
 * `{ success: false, error }` so transactional flows can proceed without crashing.
 */

import { fetchWithTimeout } from './helpers.js';

/** Escape user-controlled values for safe HTML interpolation */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Unified send: try Cloudflare first, fall back to Resend on failure.
 * @param {Object} env - Worker environment bindings
 * @param {{from:string,to:string,subject:string,text:string,html:string}} message
 * @param {string} logLabel - Short context label for logs (e.g. 'password reset')
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function sendEmail(env, message, logLabel) {
  let cfError = null;

  // Primary: Cloudflare Email Service (send_email binding)
  if (env.EMAIL_SENDER) {
    const result = await sendWithCloudflareEmail(env.EMAIL_SENDER, message);
    if (result.success) return result;
    cfError = result.error;
    if (env.RESEND_API_KEY) {
      console.warn(
        `Cloudflare Email send failed for ${logLabel}, falling back to Resend:`,
        cfError
      );
    }
  }

  // Fallback: Resend
  if (env.RESEND_API_KEY) {
    return sendWithResend(env.RESEND_API_KEY, message);
  }

  // Cloudflare was tried and failed, no Resend fallback configured — surface
  // the original error so operators can see what broke.
  if (cfError) {
    return { success: false, error: cfError };
  }

  console.warn(`No email provider configured for ${logLabel}.`);
  return { success: false, error: 'Email service not configured' };
}

/**
 * Send email using Resend API
 * @param {string} apiKey
 * @param {{from:string,to:string,subject:string,text:string,html:string}} message
 */
async function sendWithResend(apiKey, { from, to, subject, text, html }) {
  try {
    const response = await fetchWithTimeout(
      'https://api.resend.com/emails',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to, subject, text, html }),
      },
      5000
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error('Resend API error:', error);
      return { success: false, error: error.message || 'Failed to send email' };
    }

    await response.json().catch(() => ({}));
    return { success: true };
  } catch (error) {
    console.error('Resend send error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send email using Cloudflare Email Service binding.
 *
 * Uses the simple object-based API from the public-beta Email Service
 * (2026-04-16). The binding's .send() method now accepts a plain object with
 * { from, to, subject, text, html } — no EmailMessage / MIME construction
 * required. Cloudflare handles SPF/DKIM/DMARC and IP reputation automatically
 * for domains approved for Email Service sending.
 *
 * @param {{ send: (msg: object) => Promise<void> }} emailBinding - env.EMAIL_SENDER
 * @param {{from:string,to:string,subject:string,text:string,html:string}} message
 */
async function sendWithCloudflareEmail(emailBinding, { from, to, subject, text, html }) {
  try {
    await emailBinding.send({ from, to, subject, text, html });
    return { success: true };
  } catch (error) {
    console.error('Cloudflare Email send error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send a password reset email
 * @param {Object} env - Cloudflare environment bindings
 * @param {string} recipientEmail - User's email address
 * @param {string} recipientName - User's name
 * @param {string} resetToken - Password reset token
 * @param {string} baseUrl - Base URL for the reset link
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendPasswordResetEmail(
  env,
  recipientEmail,
  recipientName,
  resetToken,
  baseUrl
) {
  const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

  const subject = 'Reset your Tally Reading password';
  const textBody = `Hi ${recipientName},

You requested to reset your password for Tally Reading.

Click the link below to reset your password:
${resetUrl}

This link will expire in 1 hour.

If you didn't request this, you can safely ignore this email.

- The Tally Reading Team`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #8AAD8A 0%, #6B8E6B 100%); padding: 30px; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Tally Reading</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="font-size: 16px;">Hi <strong>${escapeHtml(recipientName)}</strong>,</p>

    <p>You requested to reset your password for Tally Reading.</p>

    <p>Click the button below to reset your password:</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${escapeHtml(resetUrl)}" style="background: #6B8E6B; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; display: inline-block;">Reset Password</a>
    </div>

    <p style="color: #6b7280; font-size: 14px;">This link will expire in 1 hour.</p>

    <p style="color: #6b7280; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

    <p style="color: #9ca3af; font-size: 12px; margin: 0;">
      If the button doesn't work, copy and paste this link into your browser:<br>
      <a href="${escapeHtml(resetUrl)}" style="color: #6B8E6B; word-break: break-all;">${escapeHtml(resetUrl)}</a>
    </p>
  </div>
</body>
</html>`;

  return sendEmail(
    env,
    {
      from: env.EMAIL_FROM || 'hello@tallyreading.uk',
      to: recipientEmail,
      subject,
      text: textBody,
      html: htmlBody,
    },
    'password reset'
  );
}

/**
 * Send a notification email when someone signs up via the landing page
 * @param {Object} env - Cloudflare environment bindings
 * @param {string} signupEmail - The email address that signed up
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendSignupNotificationEmail(env, signupEmail) {
  const to = env.EMAIL_FROM || 'hello@tallyreading.uk';
  const subject = `New Tally signup: ${signupEmail}`;
  const timestamp = new Date().toISOString();

  const textBody = `New signup on Tally Reading landing page.

Email: ${signupEmail}
Time: ${timestamp}`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #8AAD8A 0%, #6B8E6B 100%); padding: 30px; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Tally Reading</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="font-size: 16px;">New signup on the landing page:</p>

    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 6px; padding: 20px; margin: 20px 0;">
      <p style="margin: 5px 0; font-family: monospace; background: #f3f4f6; padding: 8px; border-radius: 4px;">Email: ${escapeHtml(signupEmail)}</p>
      <p style="margin: 5px 0; font-family: monospace; background: #f3f4f6; padding: 8px; border-radius: 4px;">Time: ${timestamp}</p>
    </div>
  </div>
</body>
</html>`;

  return sendEmail(
    env,
    {
      from: to,
      to,
      subject,
      text: textBody,
      html: htmlBody,
    },
    'signup notification'
  );
}

/**
 * Send a welcome email to new users
 */
export async function sendWelcomeEmail(
  env,
  recipientEmail,
  recipientName,
  organizationName,
  temporaryPassword,
  baseUrl
) {
  const loginUrl = `${baseUrl}/login`;

  const subject = `Welcome to Tally Reading - ${organizationName}`;
  const textBody = `Hi ${recipientName},

Welcome to Tally Reading!

You've been added to the ${organizationName} organization.

Your login credentials:
Email: ${recipientEmail}
Temporary Password: ${temporaryPassword}

Please log in and change your password immediately:
${loginUrl}

- The Tally Reading Team`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #8AAD8A 0%, #6B8E6B 100%); padding: 30px; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Tally Reading</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="font-size: 16px;">Hi <strong>${escapeHtml(recipientName)}</strong>,</p>

    <p>Welcome to Tally Reading! You've been added to the <strong>${escapeHtml(organizationName)}</strong> organization.</p>

    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 6px; padding: 20px; margin: 20px 0;">
      <p style="margin: 0 0 10px 0;"><strong>Your login credentials:</strong></p>
      <p style="margin: 5px 0; font-family: monospace; background: #f3f4f6; padding: 8px; border-radius: 4px;">Email: ${escapeHtml(recipientEmail)}</p>
      <p style="margin: 5px 0; font-family: monospace; background: #f3f4f6; padding: 8px; border-radius: 4px;">Temporary Password: ${escapeHtml(temporaryPassword)}</p>
    </div>

    <p style="color: #dc2626; font-size: 14px;"><strong>Important:</strong> Please log in and change your password immediately.</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${escapeHtml(loginUrl)}" style="background: #6B8E6B; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; display: inline-block;">Log In Now</a>
    </div>
  </div>
</body>
</html>`;

  return sendEmail(
    env,
    {
      from: env.EMAIL_FROM || 'hello@tallyreading.uk',
      to: recipientEmail,
      subject,
      text: textBody,
      html: htmlBody,
    },
    'welcome email'
  );
}

/**
 * Send a notification email when a support ticket is submitted
 * @param {Object} env - Cloudflare environment bindings
 * @param {Object} ticket - Ticket details
 * @param {string} ticket.ticketId - Ticket ID
 * @param {string} ticket.userName - Submitter's name
 * @param {string} ticket.userEmail - Submitter's email
 * @param {string|null} ticket.organizationName - School name (may be null)
 * @param {string} ticket.subject - Ticket subject
 * @param {string} ticket.message - Ticket message
 * @param {string|null} ticket.pageUrl - Page the user was on when submitting
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendSupportNotificationEmail(env, ticket) {
  const to = env.SUPPORT_EMAIL || env.EMAIL_FROM || 'hello@tallyreading.uk';
  const from = env.EMAIL_FROM || 'hello@tallyreading.uk';
  const subject = `[Tally Support] ${ticket.subject}`;
  const timestamp = new Date().toISOString();

  const textBody = `New support ticket from Tally Reading.

Ticket ID: ${ticket.ticketId}
From: ${ticket.userName} (${ticket.userEmail})
School: ${ticket.organizationName || 'N/A'}
Page: ${ticket.pageUrl || 'N/A'}
Time: ${timestamp}

Subject: ${ticket.subject}

Message:
${ticket.message}`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #8AAD8A 0%, #6B8E6B 100%); padding: 30px; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Tally Reading — Support</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="font-size: 16px;">New support ticket submitted:</p>

    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 6px; padding: 20px; margin: 20px 0;">
      <p style="margin: 5px 0; font-family: monospace; background: #f3f4f6; padding: 8px; border-radius: 4px;">Ticket: ${escapeHtml(ticket.ticketId)}</p>
      <p style="margin: 5px 0; font-family: monospace; background: #f3f4f6; padding: 8px; border-radius: 4px;">From: ${escapeHtml(ticket.userName)} (${escapeHtml(ticket.userEmail)})</p>
      <p style="margin: 5px 0; font-family: monospace; background: #f3f4f6; padding: 8px; border-radius: 4px;">School: ${escapeHtml(ticket.organizationName || 'N/A')}</p>
      <p style="margin: 5px 0; font-family: monospace; background: #f3f4f6; padding: 8px; border-radius: 4px;">Page: ${escapeHtml(ticket.pageUrl || 'N/A')}</p>
      <p style="margin: 5px 0; font-family: monospace; background: #f3f4f6; padding: 8px; border-radius: 4px;">Time: ${timestamp}</p>
    </div>

    <h3 style="margin-bottom: 8px;">${escapeHtml(ticket.subject)}</h3>
    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 6px; padding: 20px; white-space: pre-wrap;">${escapeHtml(ticket.message)}</div>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    <p style="color: #9ca3af; font-size: 12px; margin: 0;">Reply directly to ${escapeHtml(ticket.userEmail)}</p>
  </div>
</body>
</html>`;

  return sendEmail(
    env,
    { from, to, subject, text: textBody, html: htmlBody },
    'support notification'
  );
}

/**
 * Send trial ending reminder email to a school admin.
 * @param {Object} env - Worker environment (email provider bindings)
 * @param {string} recipientEmail - Admin email address
 * @param {string} recipientName - Admin name
 * @param {string} organizationName - School/org name
 * @param {number} daysRemaining - Days until trial expires
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendTrialEndingEmail(
  env,
  recipientEmail,
  recipientName,
  organizationName,
  daysRemaining
) {
  const from = env.EMAIL_FROM || 'hello@tallyreading.uk';
  const subject = `Your Tally Reading trial ends in ${daysRemaining} days`;

  const textBody = `Hi ${recipientName},

Your free trial of Tally Reading for ${organizationName} will end in ${daysRemaining} days.

To keep using Tally Reading without interruption, please subscribe from the Billing section in your settings.

If you have any questions, reply to this email — we're happy to help.

— The Tally Reading Team`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #8AAD8A 0%, #6B8E6B 100%); padding: 30px; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Tally Reading</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="font-size: 16px;">Hi <strong>${escapeHtml(recipientName)}</strong>,</p>

    <p>Your free trial of Tally Reading for <strong>${escapeHtml(organizationName)}</strong> will end in <strong>${daysRemaining} days</strong>.</p>

    <p>To keep using Tally Reading without interruption, please subscribe from the Billing section in your settings.</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="https://tallyreading.uk/settings" style="background: #6B8E6B; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; display: inline-block;">Go to Settings</a>
    </div>

    <p style="color: #6b7280; font-size: 14px;">If you have any questions, just reply to this email — we're happy to help.</p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    <p style="color: #9ca3af; font-size: 12px; margin: 0;">Tally Reading — Helping every child become a confident reader.</p>
  </div>
</body>
</html>`;

  return sendEmail(
    env,
    { from, to: recipientEmail, subject, text: textBody, html: htmlBody },
    'trial reminder'
  );
}
