import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendSupportNotificationEmail } from '../../utils/email.js';

describe('sendSupportNotificationEmail', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn();
  });

  it('sends email via Resend when RESEND_API_KEY is configured', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'email-123' }),
    });

    const env = {
      RESEND_API_KEY: 'test-key',
      EMAIL_FROM: 'support@tallyreading.uk',
    };

    const result = await sendSupportNotificationEmail(env, {
      ticketId: 'ticket-001',
      userName: 'Jane Smith',
      userEmail: 'jane@school.sch.uk',
      organizationName: 'Test School',
      subject: 'Cannot import books',
      message: 'I tried to import a CSV but it failed.',
    });

    expect(result.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({ method: 'POST' })
    );

    const callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(callBody.subject).toBe('[Tally Support] Cannot import books');
    expect(callBody.to).toBe('support@tallyreading.uk');
    expect(callBody.text).toContain('Jane Smith');
    expect(callBody.text).toContain('jane@school.sch.uk');
    expect(callBody.text).toContain('Test School');
    expect(callBody.text).toContain('ticket-001');
  });

  it('uses SUPPORT_EMAIL when configured', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'email-123' }),
    });

    const env = {
      RESEND_API_KEY: 'test-key',
      SUPPORT_EMAIL: 'help@tallyreading.uk',
      EMAIL_FROM: 'noreply@tallyreading.uk',
    };

    const result = await sendSupportNotificationEmail(env, {
      ticketId: 'ticket-002',
      userName: 'John',
      userEmail: 'john@school.sch.uk',
      organizationName: null,
      subject: 'Help',
      message: 'Need help.',
    });

    expect(result.success).toBe(true);
    const callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(callBody.to).toBe('help@tallyreading.uk');
  });

  it('returns error when no email provider is configured', async () => {
    const env = {};
    const result = await sendSupportNotificationEmail(env, {
      ticketId: 'ticket-003',
      userName: 'Test',
      userEmail: 'test@test.com',
      organizationName: 'School',
      subject: 'Test',
      message: 'Test message',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Email service not configured');
  });

  it('escapes HTML in user-controlled values', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'email-123' }),
    });

    const env = {
      RESEND_API_KEY: 'test-key',
      EMAIL_FROM: 'support@tallyreading.uk',
    };

    await sendSupportNotificationEmail(env, {
      ticketId: 'ticket-004',
      userName: '<script>alert("xss")</script>',
      userEmail: 'test@test.com',
      organizationName: 'School',
      subject: 'Test',
      message: 'Test <b>message</b>',
    });

    const callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(callBody.html).not.toContain('<script>');
    expect(callBody.html).toContain('&lt;script&gt;');
  });
});
