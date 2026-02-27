/**
 * Centralized row-to-object mappers (snake_case → camelCase).
 *
 * Every route and provider that converts a D1 row should import from here
 * so column additions only need updating in one place.
 */

import { safeJsonParse } from './routeHelpers.js';

// ── Books ────────────────────────────────────────────────────────────────────

export const rowToBook = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    genreIds: row.genre_ids ? JSON.parse(row.genre_ids) : [],
    readingLevel: row.reading_level,
    ageRange: row.age_range,
    description: row.description,
    isbn: row.isbn || null,
    pageCount: row.page_count || null,
    seriesName: row.series_name || null,
    seriesNumber: row.series_number || null,
    publicationYear: row.publication_year || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

// ── Students ─────────────────────────────────────────────────────────────────

export const rowToStudent = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    classId: row.class_id,
    lastReadDate: row.last_read_date,
    likes: safeJsonParse(row.likes, []),
    dislikes: safeJsonParse(row.dislikes, []),
    readingLevelMin: row.reading_level_min,
    readingLevelMax: row.reading_level_max,
    readingLevel: row.reading_level,
    notes: row.notes,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    currentBookId: row.current_book_id || null,
    currentBookTitle: row.current_book_title || null,
    currentBookAuthor: row.current_book_author || null,
    currentStreak: row.current_streak || 0,
    longestStreak: row.longest_streak || 0,
    streakStartDate: row.streak_start_date || null,
    processingRestricted: Boolean(row.processing_restricted),
    aiOptOut: Boolean(row.ai_opt_out),
    readingSessions: [],
    preferences: {
      favoriteGenreIds: [],
      likes: [],
      dislikes: []
    }
  };
};

// ── Classes ──────────────────────────────────────────────────────────────────

export const rowToClass = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    teacherName: row.teacher_name,
    academicYear: row.academic_year,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

// ── Users ────────────────────────────────────────────────────────────────────

export const rowToUser = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    email: row.email,
    name: row.name,
    role: row.role,
    isActive: Boolean(row.is_active),
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    authProvider: row.auth_provider || null,
    myloginId: row.mylogin_id || null,
    wondeEmployeeId: row.wonde_employee_id || null,
  };
};

// ── Organizations ────────────────────────────────────────────────────────────

export const rowToOrganization = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    subscriptionTier: row.subscription_tier,
    maxStudents: row.max_students,
    maxTeachers: row.max_teachers,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    wondeSchoolId: row.wonde_school_id || null,
    wondeLastSyncAt: row.wonde_last_sync_at || null,
    myloginOrgId: row.mylogin_org_id || null,
    consentGivenAt: row.consent_given_at || null,
    consentVersion: row.consent_version || null,
    consentGivenBy: row.consent_given_by || null,
  };
};

// ── Genres ────────────────────────────────────────────────────────────────────

export const rowToGenre = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isPredefined: Boolean(row.is_predefined),
    createdAt: row.created_at
  };
};
