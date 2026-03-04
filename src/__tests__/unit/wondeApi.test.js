import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  wondeRequest,
  fetchAllStudents,
  fetchAllClasses,
  fetchAllEmployees,
  fetchDeletions
} from '../../utils/wondeApi.js';

describe('wondeApi', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // ---------------------------------------------------------------------------
  // wondeRequest — core HTTP function
  // ---------------------------------------------------------------------------
  describe('wondeRequest', () => {
    it('makes GET request to correct base URL + path', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [{ id: '1', name: 'Alice' }],
          meta: { pagination: { more: false, current_page: 1 } }
        })
      });

      await wondeRequest('/schools/SCHOOL1/students', 'test-token');

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url] = global.fetch.mock.calls[0];
      expect(url).toBe('https://api.wonde.com/v1.0/schools/SCHOOL1/students');
    });

    it('sends Bearer token in Authorization header', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [],
          meta: { pagination: { more: false, current_page: 1 } }
        })
      });

      await wondeRequest('/schools/SCHOOL1/students', 'my-secret-token');

      const [, options] = global.fetch.mock.calls[0];
      expect(options.headers).toEqual(
        expect.objectContaining({
          'Authorization': 'Bearer my-secret-token'
        })
      );
    });

    it('appends query params to URL', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [],
          meta: { pagination: { more: false, current_page: 1 } }
        })
      });

      await wondeRequest('/schools/S1/students', 'tok', {
        include: 'classes,education_details',
        per_page: '200'
      });

      const [url] = global.fetch.mock.calls[0];
      const parsed = new URL(url);
      expect(parsed.searchParams.get('include')).toBe('classes,education_details');
      expect(parsed.searchParams.get('per_page')).toBe('200');
    });

    it('returns data array from single-page response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [
            { id: '1', name: 'Alice' },
            { id: '2', name: 'Bob' }
          ],
          meta: { pagination: { more: false, current_page: 1 } }
        })
      });

      const result = await wondeRequest('/schools/S1/students', 'tok');

      expect(result).toEqual([
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' }
      ]);
    });

    it('follows pagination and collects all pages into single array', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: [{ id: '1' }, { id: '2' }],
            meta: {
              pagination: {
                more: true,
                current_page: 1,
                next: 'https://api.wonde.com/v1.0/schools/S1/students?page=2'
              }
            }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: [{ id: '3' }, { id: '4' }],
            meta: {
              pagination: {
                more: true,
                current_page: 2,
                next: 'https://api.wonde.com/v1.0/schools/S1/students?page=3'
              }
            }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: [{ id: '5' }],
            meta: {
              pagination: {
                more: false,
                current_page: 3
              }
            }
          })
        });

      const result = await wondeRequest('/schools/S1/students', 'tok');

      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(result).toEqual([
        { id: '1' }, { id: '2' },
        { id: '3' }, { id: '4' },
        { id: '5' }
      ]);
    });

    it('uses next URL from pagination for subsequent pages', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: [{ id: '1' }],
            meta: {
              pagination: {
                more: true,
                current_page: 1,
                next: 'https://api.wonde.com/v1.0/schools/S1/students?page=2&include=classes'
              }
            }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: [{ id: '2' }],
            meta: { pagination: { more: false, current_page: 2 } }
          })
        });

      await wondeRequest('/schools/S1/students', 'tok', { include: 'classes' });

      // Second call should use the `next` URL directly
      const [secondUrl] = global.fetch.mock.calls[1];
      expect(secondUrl).toBe('https://api.wonde.com/v1.0/schools/S1/students?page=2&include=classes');
    });

    it('throws on non-ok response with status and statusText', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden'
      });

      await expect(
        wondeRequest('/schools/S1/students', 'bad-token')
      ).rejects.toThrow('Wonde API error: 403 Forbidden');
    });

    it('throws on network error (passes through)', async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(
        wondeRequest('/schools/S1/students', 'tok')
      ).rejects.toThrow('Failed to fetch');
    });

    it('handles empty data array gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [],
          meta: { pagination: { more: false, current_page: 1 } }
        })
      });

      const result = await wondeRequest('/schools/S1/students', 'tok');
      expect(result).toEqual([]);
    });

    it('handles response with no pagination meta', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [{ id: '1' }]
        })
      });

      const result = await wondeRequest('/schools/S1/students', 'tok');
      expect(result).toEqual([{ id: '1' }]);
    });

    it('handles response with missing data field', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          meta: { pagination: { more: false } }
        })
      });

      const result = await wondeRequest('/schools/S1/students', 'tok');
      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // fetchAllStudents
  // ---------------------------------------------------------------------------
  describe('fetchAllStudents', () => {
    it('calls correct endpoint with correct includes and per_page', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [],
          meta: { pagination: { more: false } }
        })
      });

      await fetchAllStudents('tok123', 'SCHOOL_ABC');

      const [url] = global.fetch.mock.calls[0];
      const parsed = new URL(url);
      expect(parsed.pathname).toBe('/v1.0/schools/SCHOOL_ABC/students');
      expect(parsed.searchParams.get('include')).toBe('education_details,extended_details,classes,year');
      expect(parsed.searchParams.get('per_page')).toBe('200');
    });

    it('passes updatedAfter as updated_after param', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [],
          meta: { pagination: { more: false } }
        })
      });

      await fetchAllStudents('tok', 'S1', { updatedAfter: '2026-01-15T00:00:00Z' });

      const [url] = global.fetch.mock.calls[0];
      const parsed = new URL(url);
      expect(parsed.searchParams.get('updated_after')).toBe('2026-01-15T00:00:00Z');
    });

    it('does not include updated_after when not specified', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [],
          meta: { pagination: { more: false } }
        })
      });

      await fetchAllStudents('tok', 'S1');

      const [url] = global.fetch.mock.calls[0];
      const parsed = new URL(url);
      expect(parsed.searchParams.has('updated_after')).toBe(false);
    });

    it('returns collected student data', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [
            { id: 'stu1', forename: 'Alice' },
            { id: 'stu2', forename: 'Bob' }
          ],
          meta: { pagination: { more: false } }
        })
      });

      const result = await fetchAllStudents('tok', 'S1');
      expect(result).toHaveLength(2);
      expect(result[0].forename).toBe('Alice');
    });
  });

  // ---------------------------------------------------------------------------
  // fetchAllClasses
  // ---------------------------------------------------------------------------
  describe('fetchAllClasses', () => {
    it('calls correct endpoint with correct includes and filters', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [],
          meta: { pagination: { more: false } }
        })
      });

      await fetchAllClasses('tok', 'SCHOOL_XYZ');

      const [url] = global.fetch.mock.calls[0];
      const parsed = new URL(url);
      expect(parsed.pathname).toBe('/v1.0/schools/SCHOOL_XYZ/classes');
      expect(parsed.searchParams.get('include')).toBe('students,employees');
      expect(parsed.searchParams.get('has_students')).toBe('true');
      expect(parsed.searchParams.get('per_page')).toBe('200');
    });

    it('passes updatedAfter as updated_after param', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [],
          meta: { pagination: { more: false } }
        })
      });

      await fetchAllClasses('tok', 'S1', { updatedAfter: '2026-02-01T10:00:00Z' });

      const [url] = global.fetch.mock.calls[0];
      const parsed = new URL(url);
      expect(parsed.searchParams.get('updated_after')).toBe('2026-02-01T10:00:00Z');
    });

    it('does not include updated_after when not specified', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [],
          meta: { pagination: { more: false } }
        })
      });

      await fetchAllClasses('tok', 'S1');

      const [url] = global.fetch.mock.calls[0];
      const parsed = new URL(url);
      expect(parsed.searchParams.has('updated_after')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // fetchAllEmployees
  // ---------------------------------------------------------------------------
  describe('fetchAllEmployees', () => {
    it('calls correct endpoint with correct includes and filters', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [],
          meta: { pagination: { more: false } }
        })
      });

      await fetchAllEmployees('tok', 'SCHOOL_99');

      const [url] = global.fetch.mock.calls[0];
      const parsed = new URL(url);
      expect(parsed.pathname).toBe('/v1.0/schools/SCHOOL_99/employees');
      expect(parsed.searchParams.get('include')).toBe('classes,employment_details');
      expect(parsed.searchParams.get('has_class')).toBe('true');
      expect(parsed.searchParams.get('per_page')).toBe('200');
    });

    it('passes updatedAfter as updated_after param', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [],
          meta: { pagination: { more: false } }
        })
      });

      await fetchAllEmployees('tok', 'S1', { updatedAfter: '2026-03-01T00:00:00Z' });

      const [url] = global.fetch.mock.calls[0];
      const parsed = new URL(url);
      expect(parsed.searchParams.get('updated_after')).toBe('2026-03-01T00:00:00Z');
    });

    it('does not include updated_after when not specified', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [],
          meta: { pagination: { more: false } }
        })
      });

      await fetchAllEmployees('tok', 'S1');

      const [url] = global.fetch.mock.calls[0];
      const parsed = new URL(url);
      expect(parsed.searchParams.has('updated_after')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // fetchDeletions
  // ---------------------------------------------------------------------------
  describe('fetchDeletions', () => {
    it('calls correct endpoint with type=student', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [],
          meta: { pagination: { more: false } }
        })
      });

      await fetchDeletions('tok', 'SCHOOL_DEL');

      const [url] = global.fetch.mock.calls[0];
      const parsed = new URL(url);
      expect(parsed.pathname).toBe('/v1.0/schools/SCHOOL_DEL/deletions');
      expect(parsed.searchParams.get('type')).toBe('student');
    });

    it('passes updatedAfter as updated_after param', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [],
          meta: { pagination: { more: false } }
        })
      });

      await fetchDeletions('tok', 'S1', '2026-01-01T00:00:00Z');

      const [url] = global.fetch.mock.calls[0];
      const parsed = new URL(url);
      expect(parsed.searchParams.get('updated_after')).toBe('2026-01-01T00:00:00Z');
    });

    it('does not include updated_after when not specified', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [],
          meta: { pagination: { more: false } }
        })
      });

      await fetchDeletions('tok', 'S1');

      const [url] = global.fetch.mock.calls[0];
      const parsed = new URL(url);
      expect(parsed.searchParams.has('updated_after')).toBe(false);
    });

    it('returns deletion records', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [
            { id: 'del1', type: 'student', deleted_at: '2026-02-20T12:00:00Z' }
          ],
          meta: { pagination: { more: false } }
        })
      });

      const result = await fetchDeletions('tok', 'S1');
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('student');
    });
  });

  // ---------------------------------------------------------------------------
  // Error propagation through convenience functions
  // ---------------------------------------------------------------------------
  describe('error propagation', () => {
    it('fetchAllStudents throws on API error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      });

      await expect(
        fetchAllStudents('bad-tok', 'S1')
      ).rejects.toThrow('Wonde API error: 401 Unauthorized');
    });

    it('fetchAllClasses throws on network error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

      await expect(
        fetchAllClasses('tok', 'S1')
      ).rejects.toThrow('Network failure');
    });

    it('fetchAllEmployees throws on API error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      await expect(
        fetchAllEmployees('tok', 'S1')
      ).rejects.toThrow('Wonde API error: 500 Internal Server Error');
    });

    it('fetchDeletions throws on API error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      await expect(
        fetchDeletions('tok', 'S1')
      ).rejects.toThrow('Wonde API error: 404 Not Found');
    });
  });

  // ---------------------------------------------------------------------------
  // Pagination through convenience functions
  // ---------------------------------------------------------------------------
  describe('pagination through convenience functions', () => {
    it('fetchAllStudents collects multi-page results', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: [{ id: 'stu1' }],
            meta: {
              pagination: {
                more: true,
                current_page: 1,
                next: 'https://api.wonde.com/v1.0/schools/S1/students?page=2&include=education_details,extended_details,classes,year&per_page=200'
              }
            }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: [{ id: 'stu2' }],
            meta: { pagination: { more: false, current_page: 2 } }
          })
        });

      const result = await fetchAllStudents('tok', 'S1');

      expect(result).toEqual([{ id: 'stu1' }, { id: 'stu2' }]);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
