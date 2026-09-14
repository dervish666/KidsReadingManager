import { describe, it, expect, afterEach, vi } from 'vitest';
import { scrubSentryEvent, isCrawlerUserAgent } from '../../utils/sentryFilter.js';

describe('isCrawlerUserAgent', () => {
  it('matches the crawlers that actually reach the landing page', () => {
    // bingbot is the one that filed TALLY-READING-J.
    expect(
      isCrawlerUserAgent('Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)')
    ).toBe(true);
    expect(
      isCrawlerUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')
    ).toBe(true);
    expect(isCrawlerUserAgent('Mozilla/5.0 (compatible; Baiduspider/2.0)')).toBe(true);
    expect(
      isCrawlerUserAgent('Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/bot)')
    ).toBe(true);
    expect(isCrawlerUserAgent('facebookexternalhit/1.1')).toBe(true);
    expect(isCrawlerUserAgent('Twitterbot/1.0')).toBe(true);
    expect(isCrawlerUserAgent('Mozilla/5.0 (compatible; Yahoo! Slurp)')).toBe(true);
  });

  it('does not match a teacher on a Cubot handset', () => {
    // The reason the pattern needs a delimiter after the token: Cubot is a
    // real budget Android brand, and a bare /bot/ would silently drop every
    // error from anyone holding one.
    expect(
      isCrawlerUserAgent(
        'Mozilla/5.0 (Linux; Android 11; CUBOT_NOTE_20) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0 Mobile Safari/537.36'
      )
    ).toBe(false);
  });

  it('does not match ordinary browsers', () => {
    expect(
      isCrawlerUserAgent(
        'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
      )
    ).toBe(false);
    expect(
      isCrawlerUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
      )
    ).toBe(false);
  });

  it('handles missing or empty input', () => {
    expect(isCrawlerUserAgent(undefined)).toBe(false);
    expect(isCrawlerUserAgent(null)).toBe(false);
    expect(isCrawlerUserAgent('')).toBe(false);
  });
});

describe('scrubSentryEvent crawler filtering', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('drops the event entirely when the browser is a crawler', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    });
    expect(scrubSentryEvent({ extra: { anything: 1 } })).toBeNull();
  });

  it('keeps the event for a real browser', () => {
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
    });
    const out = scrubSentryEvent({ extra: { keepMe: 'yes' } });
    expect(out).not.toBeNull();
    expect(out.extra.keepMe).toBe('yes');
  });
});

describe('scrubSentryEvent', () => {
  it('returns the event unchanged for empty input', () => {
    expect(scrubSentryEvent(null)).toBeNull();
    expect(scrubSentryEvent(undefined)).toBeUndefined();
    expect(scrubSentryEvent({})).toEqual({});
  });

  it('redacts PII-keyed fields in event.extra', () => {
    const event = {
      extra: {
        student_id: 'abc-123',
        student_name: 'Alice Smith',
        date_of_birth: '2017-04-12',
        sen_status: 'EHCP',
        eal: 'A',
        gender: 'F',
        pupil_premium: 1,
        someUnrelatedField: 'keep this',
      },
    };
    const out = scrubSentryEvent(event);
    expect(out.extra.student_id).toBe('[Filtered]');
    expect(out.extra.student_name).toBe('[Filtered]');
    expect(out.extra.date_of_birth).toBe('[Filtered]');
    expect(out.extra.sen_status).toBe('[Filtered]');
    expect(out.extra.eal).toBe('[Filtered]');
    expect(out.extra.gender).toBe('[Filtered]');
    expect(out.extra.pupil_premium).toBe('[Filtered]');
    expect(out.extra.someUnrelatedField).toBe('keep this');
  });

  it('handles camelCase variants of PII keys', () => {
    const event = {
      extra: {
        firstName: 'Alice',
        lastName: 'Smith',
        yearGroup: 3,
        readingLevel: 4.5,
      },
    };
    const out = scrubSentryEvent(event);
    expect(out.extra.firstName).toBe('[Filtered]');
    expect(out.extra.lastName).toBe('[Filtered]');
    expect(out.extra.yearGroup).toBe('[Filtered]');
    expect(out.extra.readingLevel).toBe('[Filtered]');
  });

  it('recursively scrubs nested objects', () => {
    const event = {
      extra: {
        student: {
          name: 'Alice',
          eal_status: 'A',
          inner: { gender: 'F', score: 5 },
        },
      },
    };
    const out = scrubSentryEvent(event);
    expect(out.extra.student.name).toBe('[Filtered]');
    expect(out.extra.student.eal_status).toBe('[Filtered]');
    expect(out.extra.student.inner.gender).toBe('[Filtered]');
    expect(out.extra.student.inner.score).toBe(5);
  });

  it('scrubs arrays of objects', () => {
    const event = {
      extra: {
        students: [
          { name: 'Alice', dob: '2017-01-01' },
          { name: 'Bob', dob: '2017-02-02' },
        ],
      },
    };
    const out = scrubSentryEvent(event);
    expect(out.extra.students[0].name).toBe('[Filtered]');
    expect(out.extra.students[0].dob).toBe('[Filtered]');
    expect(out.extra.students[1].name).toBe('[Filtered]');
  });

  it('scrubs request body data', () => {
    const event = {
      request: {
        url: 'https://tallyreading.uk/api/students/abc-123',
        method: 'POST',
        data: { name: 'Alice', notes: 'kept', dob: '2017-01-01' },
      },
    };
    const out = scrubSentryEvent(event);
    expect(out.request.data.name).toBe('[Filtered]');
    expect(out.request.data.dob).toBe('[Filtered]');
    expect(out.request.data.notes).toBe('kept');
    // URL retained for triage
    expect(out.request.url).toBe('https://tallyreading.uk/api/students/abc-123');
  });

  it('scrubs breadcrumb payloads', () => {
    const event = {
      breadcrumbs: [
        { type: 'http', message: 'GET /api/students', data: { name: 'Alice', status: 200 } },
        { type: 'click', message: 'click button', data: null },
      ],
    };
    const out = scrubSentryEvent(event);
    expect(out.breadcrumbs[0].data.name).toBe('[Filtered]');
    expect(out.breadcrumbs[0].data.status).toBe(200);
    expect(out.breadcrumbs[1].data).toBeNull();
  });

  it('truncates long breadcrumb messages to 200 chars', () => {
    const event = {
      breadcrumbs: [{ message: 'x'.repeat(500) }],
    };
    const out = scrubSentryEvent(event);
    expect(out.breadcrumbs[0].message.length).toBe(200);
  });

  it('scrubs event.user fields', () => {
    const event = { user: { id: 'user-1', email: 'teacher@example.com', name: 'Mrs Jones' } };
    const out = scrubSentryEvent(event);
    expect(out.user.email).toBe('[Filtered]');
    expect(out.user.name).toBe('[Filtered]');
    // user.id is an opaque UUID — not PII-pattern matched
    expect(out.user.id).toBe('user-1');
  });

  it('caps recursion depth so a circular-ish object cannot stall the event hook', () => {
    const event = { extra: {} };
    let cursor = event.extra;
    for (let i = 0; i < 20; i += 1) {
      cursor.next = { dob: '2017-01-01' };
      cursor = cursor.next;
    }
    const out = scrubSentryEvent(event);
    expect(out).toBeDefined();
  });
});
