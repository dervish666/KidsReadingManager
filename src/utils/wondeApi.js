/**
 * Wonde API Client
 *
 * Low-level HTTP client for communicating with the Wonde REST API
 * (https://api.wonde.com/v1.0). All functions handle pagination automatically,
 * collecting all pages into a single result array.
 *
 * Used by the sync service and webhook handler for school data provisioning.
 */

import { fetchWithTimeout } from './helpers.js';

const WONDE_BASE_URL = 'https://api.wonde.com/v1.0';

/**
 * Core HTTP function for making paginated GET requests to the Wonde API.
 *
 * Makes a GET request to `https://api.wonde.com/v1.0{path}` with
 * `Authorization: Bearer {token}` header. Handles pagination automatically
 * by following `meta.pagination.next` until `more === false`.
 *
 * @param {string} path - API path (e.g. '/schools/SCHOOL1/students')
 * @param {string} token - Wonde API bearer token
 * @param {Object} [params] - Query parameters to append to the URL
 * @returns {Promise<Array>} All data collected across all pages
 * @throws {Error} On non-ok responses: 'Wonde API error: {status} {statusText}'
 * @throws {Error} On network errors (passed through)
 */
export async function wondeRequest(path, token, params = {}) {
  const allData = [];

  // Build initial URL with query params
  const url = new URL(`${WONDE_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  let nextUrl = url.toString();
  let pageCount = 0;

  while (nextUrl) {
    pageCount++;
    if (pageCount > 100) {
      console.warn(`Wonde API pagination limit reached (100 pages) for ${path}`);
      break;
    }

    const response = await fetchWithTimeout(nextUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }, 8000);

    if (!response.ok) {
      throw new Error(`Wonde API error: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();

    // Collect data from this page
    const pageData = json.data || [];
    allData.push(...pageData);

    // Check for more pages
    const pagination = json.meta?.pagination;
    if (pagination && pagination.more && pagination.next) {
      nextUrl = pagination.next;
    } else {
      nextUrl = null;
    }
  }

  return allData;
}

/**
 * Fetch details for a single school from the Wonde API.
 *
 * Calls `GET /schools/{schoolId}` to retrieve school metadata including
 * name, address, phone, email, URN, and establishment number.
 *
 * Unlike the list endpoints, this returns a single object (not paginated).
 *
 * @param {string} token - Wonde API bearer token
 * @param {string} schoolId - Wonde school ID
 * @returns {Promise<Object>} School detail object
 */
export async function fetchSchoolDetails(token, schoolId) {
  const url = `${WONDE_BASE_URL}/schools/${schoolId}`;
  const response = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${token}` },
  }, 8000);

  if (!response.ok) {
    throw new Error(`Wonde API error: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  return json.data || null;
}

/**
 * Fetch all students for a school from the Wonde API.
 *
 * Calls `/schools/{schoolId}/students` with includes for education details,
 * extended details, classes, and year group. Supports delta sync via
 * `options.updatedAfter`.
 *
 * @param {string} token - Wonde API bearer token
 * @param {string} schoolId - Wonde school ID
 * @param {Object} [options] - Options
 * @param {string} [options.updatedAfter] - ISO date string for delta sync
 * @returns {Promise<Array>} All student records
 */
export async function fetchAllStudents(token, schoolId, options = {}) {
  const params = {
    include: 'education_details,extended_details,classes,year',
    per_page: '200'
  };

  if (options.updatedAfter) {
    params.updated_after = options.updatedAfter;
  }

  return wondeRequest(`/schools/${schoolId}/students`, token, params);
}

/**
 * Fetch all classes for a school from the Wonde API.
 *
 * Calls `/schools/{schoolId}/classes` with includes for students and employees,
 * filtered to only classes that have students. Supports delta sync via
 * `options.updatedAfter`.
 *
 * @param {string} token - Wonde API bearer token
 * @param {string} schoolId - Wonde school ID
 * @param {Object} [options] - Options
 * @param {string} [options.updatedAfter] - ISO date string for delta sync
 * @returns {Promise<Array>} All class records
 */
export async function fetchAllClasses(token, schoolId, options = {}) {
  const params = {
    include: 'students,employees',
    has_students: 'true',
    per_page: '200'
  };

  if (options.updatedAfter) {
    params.updated_after = options.updatedAfter;
  }

  return wondeRequest(`/schools/${schoolId}/classes`, token, params);
}

/**
 * Fetch all employees for a school from the Wonde API.
 *
 * Calls `/schools/{schoolId}/employees` with includes for classes and
 * employment details, filtered to only employees that have a class.
 * Supports delta sync via `options.updatedAfter`.
 *
 * @param {string} token - Wonde API bearer token
 * @param {string} schoolId - Wonde school ID
 * @param {Object} [options] - Options
 * @param {string} [options.updatedAfter] - ISO date string for delta sync
 * @returns {Promise<Array>} All employee records
 */
export async function fetchAllEmployees(token, schoolId, options = {}) {
  const params = {
    include: 'classes,employment_details',
    has_class: 'true',
    per_page: '200'
  };

  if (options.updatedAfter) {
    params.updated_after = options.updatedAfter;
  }

  return wondeRequest(`/schools/${schoolId}/employees`, token, params);
}

/**
 * Fetch student deletions for a school from the Wonde API.
 *
 * Calls `/schools/{schoolId}/deletions` with `type=student`.
 * Used during delta sync to identify students that have been removed
 * from the school in the MIS.
 *
 * @param {string} token - Wonde API bearer token
 * @param {string} schoolId - Wonde school ID
 * @param {string} [updatedAfter] - ISO date string for delta sync
 * @returns {Promise<Array>} Deletion records
 */
export async function fetchDeletions(token, schoolId, updatedAfter = null) {
  const params = {
    type: 'student'
  };

  if (updatedAfter) {
    params.updated_after = updatedAfter;
  }

  return wondeRequest(`/schools/${schoolId}/deletions`, token, params);
}
