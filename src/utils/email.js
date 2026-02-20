/**
 * Email utilities for sending transactional emails
 *
 * Supports multiple email providers:
 * 1. Cloudflare Email Routing (send_email binding) - requires Email Routing enabled
 * 2. Resend - requires RESEND_API_KEY secret
 * 3. SMTP relay - requires SMTP_* environment variables
 *
 * Falls back gracefully if no email provider is configured.
 */

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
 * Send a password reset email
 * @param {Object} env - Cloudflare environment bindings
 * @param {string} recipientEmail - User's email address
 * @param {string} recipientName - User's name
 * @param {string} resetToken - Password reset token
 * @param {string} baseUrl - Base URL for the reset link
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendPasswordResetEmail(env, recipientEmail, recipientName, resetToken, baseUrl) {
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
      <a href="${resetUrl}" style="background: #6B8E6B; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; display: inline-block;">Reset Password</a>
    </div>

    <p style="color: #6b7280; font-size: 14px;">This link will expire in 1 hour.</p>

    <p style="color: #6b7280; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

    <p style="color: #9ca3af; font-size: 12px; margin: 0;">
      If the button doesn't work, copy and paste this link into your browser:<br>
      <a href="${resetUrl}" style="color: #6B8E6B; word-break: break-all;">${resetUrl}</a>
    </p>
  </div>
</body>
</html>`;

  // Try Resend first (most reliable for transactional email)
  if (env.RESEND_API_KEY) {
    return await sendWithResend(env.RESEND_API_KEY, env.EMAIL_FROM || 'hello@tallyreading.uk', recipientEmail, subject, textBody, htmlBody);
  }

  // Try Cloudflare Email Routing binding
  if (env.EMAIL_SENDER) {
    console.log('Using Cloudflare Email Routing to send email to:', recipientEmail);
    return await sendWithCloudflareEmail(env.EMAIL_SENDER, env.EMAIL_FROM || 'hello@tallyreading.uk', recipientEmail, subject, textBody, htmlBody);
  }

  // No email provider configured - log available bindings for debugging
  console.warn('No email provider configured. Set RESEND_API_KEY or EMAIL_SENDER binding.');
  console.warn('Available env keys:', Object.keys(env || {}).join(', '));
  return {
    success: false,
    error: 'Email service not configured'
  };
}

/**
 * Send email using Resend API
 */
async function sendWithResend(apiKey, from, to, subject, text, html) {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        text,
        html,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error('Resend API error:', error);
      return { success: false, error: error.message || 'Failed to send email' };
    }

    const result = await response.json();
    console.log('Email sent successfully via Resend:', result.id);
    return { success: true };
  } catch (error) {
    console.error('Resend send error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send email using Cloudflare Email Routing binding
 * Requires the send_email binding to be configured in wrangler.toml
 */
async function sendWithCloudflareEmail(emailBinding, from, to, subject, text, html) {
  try {
    // Import EmailMessage from cloudflare:email
    const { EmailMessage } = await import('cloudflare:email');

    // Generate a unique Message-ID (required by Cloudflare Email)
    const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@tallyreading.uk>`;

    // Build MIME message manually (simpler than importing mimetext)
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const rawEmail = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Message-ID: ${messageId}`,
      `Date: ${new Date().toUTCString()}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset=utf-8`,
      `Content-Transfer-Encoding: 7bit`,
      ``,
      text,
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset=utf-8`,
      `Content-Transfer-Encoding: 7bit`,
      ``,
      html,
      ``,
      `--${boundary}--`,
    ].join('\r\n');

    const message = new EmailMessage(from, to, rawEmail);
    await emailBinding.send(message);

    console.log('Email sent successfully via Cloudflare Email Routing');
    return { success: true };
  } catch (error) {
    console.error('Cloudflare Email send error:', error);
    return { success: false, error: error.message };
  }
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

  // Try Resend first
  if (env.RESEND_API_KEY) {
    return await sendWithResend(env.RESEND_API_KEY, to, to, subject, textBody, htmlBody);
  }

  // Try Cloudflare Email Routing binding
  if (env.EMAIL_SENDER) {
    return await sendWithCloudflareEmail(env.EMAIL_SENDER, to, to, subject, textBody, htmlBody);
  }

  console.warn('No email provider configured for signup notification.');
  return { success: false, error: 'Email service not configured' };
}

/**
 * Send a welcome email to new users
 */
export async function sendWelcomeEmail(env, recipientEmail, recipientName, organizationName, temporaryPassword, baseUrl) {
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
      <a href="${loginUrl}" style="background: #6B8E6B; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; display: inline-block;">Log In Now</a>
    </div>
  </div>
</body>
</html>`;

  // Try Resend first
  if (env.RESEND_API_KEY) {
    return await sendWithResend(env.RESEND_API_KEY, env.EMAIL_FROM || 'hello@tallyreading.uk', recipientEmail, subject, textBody, htmlBody);
  }

  // Try Cloudflare Email Routing binding
  if (env.EMAIL_SENDER) {
    return await sendWithCloudflareEmail(env.EMAIL_SENDER, env.EMAIL_FROM || 'hello@tallyreading.uk', recipientEmail, subject, textBody, htmlBody);
  }

  console.warn('No email provider configured for welcome email.');
  return { success: false, error: 'Email service not configured' };
}
