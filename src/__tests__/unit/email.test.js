import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendPasswordResetEmail, sendWelcomeEmail, sendSignupNotificationEmail } from '../../utils/email.js';

// Mock the cloudflare:email module with a proper constructor class
vi.mock('cloudflare:email', () => {
  return {
    EmailMessage: class EmailMessage {
      constructor(from, to, content) {
        this.from = from;
        this.to = to;
        this.content = content;
      }
    }
  };
});

describe('Email Service', () => {
  let originalFetch;
  let consoleLogSpy;
  let consoleWarnSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = vi.fn();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('sendPasswordResetEmail', () => {
    const defaultParams = {
      recipientEmail: 'user@example.com',
      recipientName: 'John Doe',
      resetToken: 'abc123token',
      baseUrl: 'https://app.example.com'
    };

    describe('with Resend provider', () => {
      const envWithResend = {
        RESEND_API_KEY: 'test-resend-api-key',
        EMAIL_FROM: 'noreply@myapp.com'
      };

      it('should send email via Resend API when RESEND_API_KEY is configured', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'email-123' })
        });

        const result = await sendPasswordResetEmail(
          envWithResend,
          defaultParams.recipientEmail,
          defaultParams.recipientName,
          defaultParams.resetToken,
          defaultParams.baseUrl
        );

        expect(result.success).toBe(true);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch).toHaveBeenCalledWith(
          'https://api.resend.com/emails',
          expect.objectContaining({
            method: 'POST',
            headers: {
              'Authorization': 'Bearer test-resend-api-key',
              'Content-Type': 'application/json'
            }
          })
        );
      });

      it('should include correct email content in Resend request', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'email-123' })
        });

        await sendPasswordResetEmail(
          envWithResend,
          defaultParams.recipientEmail,
          defaultParams.recipientName,
          defaultParams.resetToken,
          defaultParams.baseUrl
        );

        const fetchCall = global.fetch.mock.calls[0];
        const requestBody = JSON.parse(fetchCall[1].body);

        expect(requestBody.from).toBe('noreply@myapp.com');
        expect(requestBody.to).toBe('user@example.com');
        expect(requestBody.subject).toBe('Reset your Tally Reading password');
        expect(requestBody.text).toContain('Hi John Doe');
        expect(requestBody.text).toContain('https://app.example.com/reset-password?token=abc123token');
        expect(requestBody.html).toContain('John Doe');
        expect(requestBody.html).toContain('https://app.example.com/reset-password?token=abc123token');
      });

      it('should use default EMAIL_FROM when not configured', async () => {
        const envWithResendNoFrom = { RESEND_API_KEY: 'test-key' };

        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'email-123' })
        });

        await sendPasswordResetEmail(
          envWithResendNoFrom,
          defaultParams.recipientEmail,
          defaultParams.recipientName,
          defaultParams.resetToken,
          defaultParams.baseUrl
        );

        const fetchCall = global.fetch.mock.calls[0];
        const requestBody = JSON.parse(fetchCall[1].body);

        expect(requestBody.from).toBe('hello@tallyreading.uk');
      });

      it('should handle Resend API error response', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: false,
          json: async () => ({ message: 'Invalid API key' })
        });

        const result = await sendPasswordResetEmail(
          envWithResend,
          defaultParams.recipientEmail,
          defaultParams.recipientName,
          defaultParams.resetToken,
          defaultParams.baseUrl
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid API key');
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      it('should handle Resend API error response without message', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: false,
          json: async () => ({})
        });

        const result = await sendPasswordResetEmail(
          envWithResend,
          defaultParams.recipientEmail,
          defaultParams.recipientName,
          defaultParams.resetToken,
          defaultParams.baseUrl
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe('Failed to send email');
      });

      it('should handle Resend API network error', async () => {
        global.fetch.mockRejectedValueOnce(new Error('Network failure'));

        const result = await sendPasswordResetEmail(
          envWithResend,
          defaultParams.recipientEmail,
          defaultParams.recipientName,
          defaultParams.resetToken,
          defaultParams.baseUrl
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe('Network failure');
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      it('should handle Resend API response JSON parse error', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: false,
          json: async () => { throw new Error('Invalid JSON'); }
        });

        const result = await sendPasswordResetEmail(
          envWithResend,
          defaultParams.recipientEmail,
          defaultParams.recipientName,
          defaultParams.resetToken,
          defaultParams.baseUrl
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe('Failed to send email');
      });

      it('should log success message when email sent via Resend', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'email-xyz-789' })
        });

        await sendPasswordResetEmail(
          envWithResend,
          defaultParams.recipientEmail,
          defaultParams.recipientName,
          defaultParams.resetToken,
          defaultParams.baseUrl
        );

        expect(consoleLogSpy).toHaveBeenCalledWith(
          'Email sent successfully via Resend:',
          'email-xyz-789'
        );
      });
    });

    describe('with Cloudflare Email provider', () => {
      const createMockEmailBinding = () => ({
        send: vi.fn().mockResolvedValue(undefined)
      });

      it('should send email via Cloudflare Email when EMAIL_SENDER is configured', async () => {
        const mockEmailBinding = createMockEmailBinding();
        const envWithCloudflare = {
          EMAIL_SENDER: mockEmailBinding,
          EMAIL_FROM: 'cf@myapp.com'
        };

        const result = await sendPasswordResetEmail(
          envWithCloudflare,
          defaultParams.recipientEmail,
          defaultParams.recipientName,
          defaultParams.resetToken,
          defaultParams.baseUrl
        );

        expect(result.success).toBe(true);
        expect(mockEmailBinding.send).toHaveBeenCalledTimes(1);
        expect(consoleLogSpy).toHaveBeenCalledWith(
          'Using Cloudflare Email Routing to send email to:',
          'user@example.com'
        );
      });

      it('should use default EMAIL_FROM for Cloudflare when not configured', async () => {
        const mockEmailBinding = createMockEmailBinding();
        const envWithCloudflareNoFrom = {
          EMAIL_SENDER: mockEmailBinding
        };

        const result = await sendPasswordResetEmail(
          envWithCloudflareNoFrom,
          defaultParams.recipientEmail,
          defaultParams.recipientName,
          defaultParams.resetToken,
          defaultParams.baseUrl
        );

        expect(result.success).toBe(true);
      });

      it('should handle Cloudflare Email send error', async () => {
        const mockEmailBinding = {
          send: vi.fn().mockRejectedValue(new Error('Cloudflare email error'))
        };
        const envWithCloudflare = {
          EMAIL_SENDER: mockEmailBinding
        };

        const result = await sendPasswordResetEmail(
          envWithCloudflare,
          defaultParams.recipientEmail,
          defaultParams.recipientName,
          defaultParams.resetToken,
          defaultParams.baseUrl
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe('Cloudflare email error');
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      it('should prefer Resend over Cloudflare when both are configured', async () => {
        const mockEmailBinding = createMockEmailBinding();
        const envWithBoth = {
          RESEND_API_KEY: 'test-resend-key',
          EMAIL_SENDER: mockEmailBinding,
          EMAIL_FROM: 'both@myapp.com'
        };

        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'resend-email-id' })
        });

        const result = await sendPasswordResetEmail(
          envWithBoth,
          defaultParams.recipientEmail,
          defaultParams.recipientName,
          defaultParams.resetToken,
          defaultParams.baseUrl
        );

        expect(result.success).toBe(true);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(mockEmailBinding.send).not.toHaveBeenCalled();
      });
    });

    describe('with no provider configured', () => {
      it('should return error when no email provider is configured', async () => {
        const result = await sendPasswordResetEmail(
          {},
          defaultParams.recipientEmail,
          defaultParams.recipientName,
          defaultParams.resetToken,
          defaultParams.baseUrl
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe('Email service not configured');
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          'No email provider configured. Set RESEND_API_KEY or EMAIL_SENDER binding.'
        );
      });

      it('should log available env keys for debugging', async () => {
        const env = { SOME_VAR: 'value', ANOTHER_VAR: 'test' };

        await sendPasswordResetEmail(
          env,
          defaultParams.recipientEmail,
          defaultParams.recipientName,
          defaultParams.resetToken,
          defaultParams.baseUrl
        );

        expect(consoleWarnSpy).toHaveBeenCalledWith(
          'Available env keys:',
          'SOME_VAR, ANOTHER_VAR'
        );
      });

      it('should throw error when env is null/undefined', async () => {
        // The function expects a valid env object - passing null throws
        await expect(sendPasswordResetEmail(
          null,
          defaultParams.recipientEmail,
          defaultParams.recipientName,
          defaultParams.resetToken,
          defaultParams.baseUrl
        )).rejects.toThrow();
      });
    });

    describe('email content formatting', () => {
      it('should include recipient name in text body', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'email-123' })
        });

        await sendPasswordResetEmail(
          { RESEND_API_KEY: 'key' },
          'test@example.com',
          'Alice Smith',
          'token123',
          'https://example.com'
        );

        const fetchCall = global.fetch.mock.calls[0];
        const requestBody = JSON.parse(fetchCall[1].body);

        expect(requestBody.text).toContain('Hi Alice Smith,');
        expect(requestBody.text).toContain('You requested to reset your password');
        expect(requestBody.text).toContain('This link will expire in 1 hour');
        expect(requestBody.text).toContain('If you didn\'t request this');
      });

      it('should include correct reset URL in email', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'email-123' })
        });

        await sendPasswordResetEmail(
          { RESEND_API_KEY: 'key' },
          'test@example.com',
          'Bob',
          'unique-reset-token-xyz',
          'https://myapp.domain.com'
        );

        const fetchCall = global.fetch.mock.calls[0];
        const requestBody = JSON.parse(fetchCall[1].body);
        const expectedUrl = 'https://myapp.domain.com/reset-password?token=unique-reset-token-xyz';

        expect(requestBody.text).toContain(expectedUrl);
        expect(requestBody.html).toContain(expectedUrl);
        expect(requestBody.html).toContain(`href="${expectedUrl}"`);
      });

      it('should include HTML styling in email body', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'email-123' })
        });

        await sendPasswordResetEmail(
          { RESEND_API_KEY: 'key' },
          'test@example.com',
          'Charlie',
          'token',
          'https://example.com'
        );

        const fetchCall = global.fetch.mock.calls[0];
        const requestBody = JSON.parse(fetchCall[1].body);

        expect(requestBody.html).toContain('<!DOCTYPE html>');
        expect(requestBody.html).toContain('Tally Reading');
        expect(requestBody.html).toContain('Reset Password');
        expect(requestBody.html).toContain('linear-gradient');
      });
    });
  });

  describe('sendWelcomeEmail', () => {
    const defaultParams = {
      recipientEmail: 'newuser@example.com',
      recipientName: 'Jane Doe',
      organizationName: 'Springfield Elementary',
      temporaryPassword: 'TempPass123!',
      baseUrl: 'https://app.example.com'
    };

    describe('with Resend provider', () => {
      const envWithResend = {
        RESEND_API_KEY: 'test-resend-api-key',
        EMAIL_FROM: 'welcome@myapp.com'
      };

      it('should send welcome email via Resend API', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'welcome-email-123' })
        });

        const result = await sendWelcomeEmail(
          envWithResend,
          defaultParams.recipientEmail,
          defaultParams.recipientName,
          defaultParams.organizationName,
          defaultParams.temporaryPassword,
          defaultParams.baseUrl
        );

        expect(result.success).toBe(true);
        expect(global.fetch).toHaveBeenCalledTimes(1);
      });

      it('should include correct welcome email content', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'email-123' })
        });

        await sendWelcomeEmail(
          envWithResend,
          defaultParams.recipientEmail,
          defaultParams.recipientName,
          defaultParams.organizationName,
          defaultParams.temporaryPassword,
          defaultParams.baseUrl
        );

        const fetchCall = global.fetch.mock.calls[0];
        const requestBody = JSON.parse(fetchCall[1].body);

        expect(requestBody.subject).toBe('Welcome to Tally Reading - Springfield Elementary');
        expect(requestBody.text).toContain('Hi Jane Doe');
        expect(requestBody.text).toContain('Welcome to Tally Reading');
        expect(requestBody.text).toContain('Springfield Elementary');
        expect(requestBody.text).toContain('Email: newuser@example.com');
        expect(requestBody.text).toContain('Temporary Password: TempPass123!');
        expect(requestBody.text).toContain('https://app.example.com/login');
      });

      it('should include login URL in welcome email', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'email-123' })
        });

        await sendWelcomeEmail(
          envWithResend,
          'user@test.com',
          'Test User',
          'Test Org',
          'password123',
          'https://custom.domain.com'
        );

        const fetchCall = global.fetch.mock.calls[0];
        const requestBody = JSON.parse(fetchCall[1].body);

        expect(requestBody.text).toContain('https://custom.domain.com/login');
        expect(requestBody.html).toContain('https://custom.domain.com/login');
      });

      it('should include temporary password in welcome email', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'email-123' })
        });

        await sendWelcomeEmail(
          envWithResend,
          'user@test.com',
          'Test User',
          'Test Org',
          'MySecureTemp!Password',
          'https://example.com'
        );

        const fetchCall = global.fetch.mock.calls[0];
        const requestBody = JSON.parse(fetchCall[1].body);

        expect(requestBody.text).toContain('Temporary Password: MySecureTemp!Password');
        expect(requestBody.html).toContain('MySecureTemp!Password');
      });

      it('should handle Resend API error for welcome email', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: false,
          json: async () => ({ message: 'Rate limit exceeded' })
        });

        const result = await sendWelcomeEmail(
          envWithResend,
          defaultParams.recipientEmail,
          defaultParams.recipientName,
          defaultParams.organizationName,
          defaultParams.temporaryPassword,
          defaultParams.baseUrl
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe('Rate limit exceeded');
      });
    });

    describe('with Cloudflare Email provider', () => {
      it('should send welcome email via Cloudflare Email', async () => {
        const mockEmailBinding = {
          send: vi.fn().mockResolvedValue(undefined)
        };
        const envWithCloudflare = {
          EMAIL_SENDER: mockEmailBinding
        };

        const result = await sendWelcomeEmail(
          envWithCloudflare,
          defaultParams.recipientEmail,
          defaultParams.recipientName,
          defaultParams.organizationName,
          defaultParams.temporaryPassword,
          defaultParams.baseUrl
        );

        expect(result.success).toBe(true);
        expect(mockEmailBinding.send).toHaveBeenCalledTimes(1);
      });

      it('should handle Cloudflare Email error for welcome email', async () => {
        const mockEmailBinding = {
          send: vi.fn().mockRejectedValue(new Error('Email routing failed'))
        };
        const envWithCloudflare = {
          EMAIL_SENDER: mockEmailBinding
        };

        const result = await sendWelcomeEmail(
          envWithCloudflare,
          defaultParams.recipientEmail,
          defaultParams.recipientName,
          defaultParams.organizationName,
          defaultParams.temporaryPassword,
          defaultParams.baseUrl
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe('Email routing failed');
      });
    });

    describe('with no provider configured', () => {
      it('should return error when no email provider is configured', async () => {
        const result = await sendWelcomeEmail(
          {},
          defaultParams.recipientEmail,
          defaultParams.recipientName,
          defaultParams.organizationName,
          defaultParams.temporaryPassword,
          defaultParams.baseUrl
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe('Email service not configured');
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          'No email provider configured for welcome email.'
        );
      });
    });

    describe('email content formatting', () => {
      it('should include organization name in subject', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'email-123' })
        });

        await sendWelcomeEmail(
          { RESEND_API_KEY: 'key' },
          'user@example.com',
          'User Name',
          'Awesome School',
          'pass123',
          'https://example.com'
        );

        const fetchCall = global.fetch.mock.calls[0];
        const requestBody = JSON.parse(fetchCall[1].body);

        expect(requestBody.subject).toBe('Welcome to Tally Reading - Awesome School');
      });

      it('should include password change reminder in welcome email', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'email-123' })
        });

        await sendWelcomeEmail(
          { RESEND_API_KEY: 'key' },
          'user@example.com',
          'User Name',
          'Test School',
          'pass123',
          'https://example.com'
        );

        const fetchCall = global.fetch.mock.calls[0];
        const requestBody = JSON.parse(fetchCall[1].body);

        expect(requestBody.text).toContain('change your password immediately');
        expect(requestBody.html).toContain('change your password immediately');
      });

      it('should include HTML styling in welcome email', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'email-123' })
        });

        await sendWelcomeEmail(
          { RESEND_API_KEY: 'key' },
          'user@example.com',
          'User Name',
          'Test School',
          'pass123',
          'https://example.com'
        );

        const fetchCall = global.fetch.mock.calls[0];
        const requestBody = JSON.parse(fetchCall[1].body);

        expect(requestBody.html).toContain('<!DOCTYPE html>');
        expect(requestBody.html).toContain('Tally Reading');
        expect(requestBody.html).toContain('Log In Now');
        expect(requestBody.html).toContain('linear-gradient');
      });

      it('should include credentials box in HTML email', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'email-123' })
        });

        await sendWelcomeEmail(
          { RESEND_API_KEY: 'key' },
          'credentials@test.com',
          'Cred User',
          'Cred School',
          'CredPass456!',
          'https://example.com'
        );

        const fetchCall = global.fetch.mock.calls[0];
        const requestBody = JSON.parse(fetchCall[1].body);

        expect(requestBody.html).toContain('Your login credentials');
        expect(requestBody.html).toContain('Email: credentials@test.com');
        expect(requestBody.html).toContain('Temporary Password: CredPass456!');
      });
    });
  });

  describe('sendSignupNotificationEmail', () => {
    describe('with Resend provider', () => {
      const envWithResend = {
        RESEND_API_KEY: 'test-resend-api-key',
        EMAIL_FROM: 'hello@tallyreading.uk'
      };

      it('should send notification email via Resend API', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'signup-email-123' })
        });

        const result = await sendSignupNotificationEmail(envWithResend, 'teacher@school.sch.uk');

        expect(result.success).toBe(true);
        expect(global.fetch).toHaveBeenCalledTimes(1);
      });

      it('should send to EMAIL_FROM address (self-notification)', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'email-123' })
        });

        await sendSignupNotificationEmail(envWithResend, 'new@signup.com');

        const fetchCall = global.fetch.mock.calls[0];
        const requestBody = JSON.parse(fetchCall[1].body);

        expect(requestBody.to).toBe('hello@tallyreading.uk');
        expect(requestBody.from).toBe('hello@tallyreading.uk');
      });

      it('should include signup email in subject and body', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'email-123' })
        });

        await sendSignupNotificationEmail(envWithResend, 'interested@school.sch.uk');

        const fetchCall = global.fetch.mock.calls[0];
        const requestBody = JSON.parse(fetchCall[1].body);

        expect(requestBody.subject).toBe('New Tally signup: interested@school.sch.uk');
        expect(requestBody.text).toContain('Email: interested@school.sch.uk');
        expect(requestBody.html).toContain('interested@school.sch.uk');
      });

      it('should include timestamp in body', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'email-123' })
        });

        await sendSignupNotificationEmail(envWithResend, 'test@example.com');

        const fetchCall = global.fetch.mock.calls[0];
        const requestBody = JSON.parse(fetchCall[1].body);

        expect(requestBody.text).toContain('Time:');
        expect(requestBody.html).toContain('Time:');
      });

      it('should use default email when EMAIL_FROM not configured', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'email-123' })
        });

        await sendSignupNotificationEmail({ RESEND_API_KEY: 'key' }, 'test@example.com');

        const fetchCall = global.fetch.mock.calls[0];
        const requestBody = JSON.parse(fetchCall[1].body);

        expect(requestBody.to).toBe('hello@tallyreading.uk');
      });

      it('should handle Resend API error', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: false,
          json: async () => ({ message: 'Forbidden' })
        });

        const result = await sendSignupNotificationEmail(envWithResend, 'test@example.com');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Forbidden');
      });
    });

    describe('with Cloudflare Email provider', () => {
      it('should send notification via Cloudflare Email', async () => {
        const mockEmailBinding = {
          send: vi.fn().mockResolvedValue(undefined)
        };
        const env = { EMAIL_SENDER: mockEmailBinding };

        const result = await sendSignupNotificationEmail(env, 'test@example.com');

        expect(result.success).toBe(true);
        expect(mockEmailBinding.send).toHaveBeenCalledTimes(1);
      });
    });

    describe('with no provider configured', () => {
      it('should return error when no email provider is configured', async () => {
        const result = await sendSignupNotificationEmail({}, 'test@example.com');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Email service not configured');
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          'No email provider configured for signup notification.'
        );
      });
    });

    describe('email content formatting', () => {
      it('should escape HTML in signup email address', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'email-123' })
        });

        await sendSignupNotificationEmail(
          { RESEND_API_KEY: 'key' },
          '<script>alert("xss")</script>@evil.com'
        );

        const fetchCall = global.fetch.mock.calls[0];
        const requestBody = JSON.parse(fetchCall[1].body);

        expect(requestBody.html).not.toContain('<script>');
        expect(requestBody.html).toContain('&lt;script&gt;');
      });

      it('should include HTML styling', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'email-123' })
        });

        await sendSignupNotificationEmail(
          { RESEND_API_KEY: 'key' },
          'test@example.com'
        );

        const fetchCall = global.fetch.mock.calls[0];
        const requestBody = JSON.parse(fetchCall[1].body);

        expect(requestBody.html).toContain('<!DOCTYPE html>');
        expect(requestBody.html).toContain('Tally Reading');
        expect(requestBody.html).toContain('linear-gradient');
      });
    });
  });

  describe('Provider priority', () => {
    it('should use Resend as first priority when available', async () => {
      const mockEmailBinding = {
        send: vi.fn().mockResolvedValue(undefined)
      };
      const env = {
        RESEND_API_KEY: 'resend-key',
        EMAIL_SENDER: mockEmailBinding
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'resend-id' })
      });

      await sendPasswordResetEmail(
        env,
        'test@example.com',
        'Test User',
        'token',
        'https://example.com'
      );

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(mockEmailBinding.send).not.toHaveBeenCalled();
    });

    it('should fall back to Cloudflare when Resend is not configured', async () => {
      const mockEmailBinding = {
        send: vi.fn().mockResolvedValue(undefined)
      };
      const env = {
        EMAIL_SENDER: mockEmailBinding
      };

      await sendPasswordResetEmail(
        env,
        'test@example.com',
        'Test User',
        'token',
        'https://example.com'
      );

      expect(global.fetch).not.toHaveBeenCalled();
      expect(mockEmailBinding.send).toHaveBeenCalledTimes(1);
    });
  });
});
