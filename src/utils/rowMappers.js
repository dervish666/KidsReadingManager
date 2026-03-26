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
    genreIds: (() => {
      try {
        return row.genre_ids ? JSON.parse(row.genre_ids) : [];
      } catch {
        return [];
      }
    })(),
    readingLevel: row.reading_level,
    ageRange: row.age_range,
    description: row.description,
    isbn: row.isbn || null,
    pageCount: row.page_count ?? null,
    seriesName: row.series_name || null,
    seriesNumber: row.series_number ?? null,
    publicationYear: row.publication_year ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
    yearGroup: row.year_group || null,
    senStatus: row.sen_status || null,
    pupilPremium: Boolean(row.pupil_premium),
    ealStatus: row.eal_status || null,
    fsm: Boolean(row.fsm),
    processingRestricted: Boolean(row.processing_restricted),
    aiOptOut: Boolean(row.ai_opt_out),
    dateOfBirth: row.date_of_birth || null,
    gender: row.gender || null,
    firstLanguage: row.first_language || null,
    ealDetailedStatus: row.eal_detailed_status || null,
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
    disabled: Boolean(row.disabled),
    wondeClassId: row.wonde_class_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    wondeSchoolId: row.wonde_school_id || null,
    hasWondeToken: Boolean(row.wonde_school_token),
    wondeLastSyncAt: row.wonde_last_sync_at || null,
    myloginOrgId: row.mylogin_org_id || null,
    consentGivenAt: row.consent_given_at || null,
    consentVersion: row.consent_version || null,
    consentGivenBy: row.consent_given_by || null,
    // Contact/address fields
    contactEmail: row.contact_email || null,
    phone: row.phone || null,
    addressLine1: row.address_line_1 || null,
    addressLine2: row.address_line_2 || null,
    town: row.town || null,
    postcode: row.postcode || null,
    // Billing fields (synced from Stripe via webhooks)
    stripeCustomerId: row.stripe_customer_id || null,
    stripeSubscriptionId: row.stripe_subscription_id || null,
    subscriptionStatus: row.subscription_status || 'none',
    subscriptionPlan: row.subscription_plan || null,
    aiAddonActive: Boolean(row.ai_addon_active),
    trialEndsAt: row.trial_ends_at || null,
    currentPeriodEnd: row.current_period_end || null,
    billingEmail: row.billing_email || null,
    // Counts (only present when joined via subquery)
    studentCount: row.student_count ?? null,
    classCount: row.class_count ?? null,
    // Sync error (only present when joined via subquery)
    lastSyncError: row.last_sync_error || null,
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
    createdAt: row.created_at,
  };
};

// ── Support Tickets ─────────────────────────────────────────────────────────

export const rowToSupportTicket = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id || null,
    organizationName: row.organization_name || null,
    userId: row.user_id || null,
    userName: row.user_name,
    userEmail: row.user_email,
    subject: row.subject,
    message: row.message,
    pageUrl: row.page_url || null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at || null,
  };
};

export const rowToSupportNote = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    ticketId: row.ticket_id,
    userId: row.user_id || null,
    userName: row.user_name,
    note: row.note,
    createdAt: row.created_at,
  };
};

// ── Tour Completions ────────────────────────────────────────────────────────

export const rowToTourCompletion = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    tourId: row.tour_id,
    version: row.tour_version,
    completedAt: row.completed_at,
  };
};
