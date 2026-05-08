import { describe, it, expect } from 'vitest';
import { scrubSentryEvent } from '../../utils/sentryFilter.js';

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
