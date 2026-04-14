import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';

// Import data provider functions
import { createProvider } from '../data/index.js';
// Import AI service
import { generateBroadSuggestions } from '../services/aiService.js';

// Import utilities
import { notFoundError, badRequestError, serverError } from '../middleware/errorHandler';
import { decryptSensitiveData, permissions, getEncryptionSecret } from '../utils/crypto.js';
import { buildStudentReadingProfile } from '../utils/studentProfile.js';
import {
  isExactMatch,
  isFuzzyMatch,
  isAuthorMatch,
  normalizeAuthorDisplay,
} from '../utils/stringMatching.js';
import { getCachedRecommendations, cacheRecommendations } from '../utils/recommendationCache.js';
import { normalizeISBN } from '../utils/isbn.js';
import { lookupISBN } from '../utils/isbnLookup.js';
import { validateBook } from '../utils/validation.js';
import { rowToBook } from '../utils/rowMappers.js';
import { parseGenreIds } from '../utils/helpers.js';

// Import middleware
import { requireReadonly, requireTeacher, requireAdmin, auditLog } from '../middleware/tenant.js';

// Import metadata cascade for single-book enrichment
import { getConfigWithKeys } from './metadata.js';
import { enrichBook } from '../services/metadataService.js';

// Create router
const booksRouter = new Hono();

// Override global 1MB body limit for import endpoints (CSV files can be large)
booksRouter.use('/import/*', bodyLimit({ maxSize: 5 * 1024 * 1024 }));

// Apply authentication middleware to all book routes
// GET endpoints require at least readonly access
// POST/PUT/DELETE endpoints require teacher access (checked via permissions below)

/**
 * GET /api/books
 * Get all books (with optional pagination)
 * Query params:
 * - page: Page number (1-based, optional)
 * - pageSize: Items per page (default 50, optional)
 * - search: Search query for title/author (optional)
 * - all: If 'true', return all books without pagination (for initial context load)
 * - fields: If 'minimal', return only id/title/author (use with all=true for autocomplete)
 *
 * Requires authentication (at least readonly access)
 */
booksRouter.get('/', requireReadonly(), async (c) => {
  const provider = await createProvider(c.env);
  const organizationId = c.get('organizationId');
  const db = c.env.READING_MANAGER_DB;
  const { page, pageSize, search, all, fields } = c.req.query();

  // In multi-tenant mode, always scope to organization's books
  if (organizationId && db) {
    // Return minimal book list for autocomplete (avoids N+1 paginated fetches)
    if (all === 'true') {
      const columns = fields === 'minimal' ? 'b.id, b.title, b.author' : 'b.*';
      const result = await db
        .prepare(
          `
        SELECT ${columns} FROM books b
        INNER JOIN org_book_selections obs ON b.id = obs.book_id
        WHERE obs.organization_id = ? AND obs.is_available = 1
        ORDER BY b.title
      `
        )
        .bind(organizationId)
        .all();
      if (fields === 'minimal') {
        return c.json(
          (result.results || []).map((r) => ({ id: r.id, title: r.title, author: r.author }))
        );
      }
      return c.json((result.results || []).map(rowToBook));
    }

    // Search with org scoping using FTS5 for performance
    if (search && search.trim()) {
      const limit = pageSize ? parseInt(pageSize, 10) : 50;
      const searchTerm = search.trim();
      // Try FTS5 first (handles prefix matching and is much faster than LIKE on large tables)
      // Escape FTS5 special characters and add prefix matching
      const ftsQuery = searchTerm
        .replace(/['"*()^]/g, '')
        .split(/\s+/)
        .filter(Boolean)
        .map((t) => `"${t}"*`)
        .join(' ');
      let result;
      try {
        result = await db
          .prepare(
            `
          SELECT b.* FROM books b
          INNER JOIN org_book_selections obs ON b.id = obs.book_id
          INNER JOIN books_fts fts ON b.id = fts.id
          WHERE obs.organization_id = ? AND fts MATCH ?
          ORDER BY rank LIMIT ?
        `
          )
          .bind(organizationId, ftsQuery, limit)
          .all();
      } catch {
        // FTS5 may not be available or query may be invalid — fall back to LIKE
        const likeQuery = `%${searchTerm}%`;
        result = await db
          .prepare(
            `
          SELECT b.* FROM books b
          INNER JOIN org_book_selections obs ON b.id = obs.book_id
          WHERE obs.organization_id = ? AND (b.title LIKE ? OR b.author LIKE ?)
          ORDER BY b.title LIMIT ?
        `
          )
          .bind(organizationId, likeQuery, likeQuery, limit)
          .all();
      }
      return c.json((result.results || []).map(rowToBook));
    }

    // Pagination with org scoping
    if (page) {
      const pageNum = Math.max(parseInt(page, 10) || 1, 1);
      const size = Math.min(Math.max(parseInt(pageSize, 10) || 50, 1), 100);
      const offset = (pageNum - 1) * size;
      const countResult = await db
        .prepare(
          'SELECT COUNT(*) as count FROM books b INNER JOIN org_book_selections obs ON b.id = obs.book_id WHERE obs.organization_id = ? AND obs.is_available = 1'
        )
        .bind(organizationId)
        .first();
      const total = countResult?.count || 0;
      const result = await db
        .prepare(
          `
        SELECT b.* FROM books b
        INNER JOIN org_book_selections obs ON b.id = obs.book_id
        WHERE obs.organization_id = ? AND obs.is_available = 1
        ORDER BY b.title LIMIT ? OFFSET ?
      `
        )
        .bind(organizationId, size, offset)
        .all();
      return c.json({
        books: (result.results || []).map(rowToBook),
        total,
        page: pageNum,
        pageSize: size,
        totalPages: Math.ceil(total / size),
      });
    }

    // Default: paginated org books (page 1 if not specified)
    const defaultPageSize = 50;
    const countResult = await db
      .prepare(
        'SELECT COUNT(*) as count FROM books b INNER JOIN org_book_selections obs ON b.id = obs.book_id WHERE obs.organization_id = ? AND obs.is_available = 1'
      )
      .bind(organizationId)
      .first();
    const total = countResult?.count || 0;
    const result = await db
      .prepare(
        `
      SELECT b.* FROM books b
      INNER JOIN org_book_selections obs ON b.id = obs.book_id
      WHERE obs.organization_id = ? AND obs.is_available = 1
      ORDER BY b.title LIMIT ? OFFSET 0
    `
      )
      .bind(organizationId, defaultPageSize)
      .all();
    return c.json({
      books: (result.results || []).map(rowToBook),
      total,
      page: 1,
      pageSize: defaultPageSize,
      totalPages: Math.ceil(total / defaultPageSize),
    });
  }

  // Legacy mode: no org scoping
  if (search && search.trim()) {
    const limit = pageSize ? parseInt(pageSize, 10) : 50;
    const books = await provider.searchBooks(search.trim(), limit);
    return c.json(books);
  }
  if (page) {
    const pageNum = parseInt(page, 10) || 1;
    const size = parseInt(pageSize, 10) || 50;
    const result = await provider.getBooksPaginated(pageNum, size);
    return c.json(result);
  }
  const books = await provider.getAllBooks();
  return c.json(books);
});

/**
 * GET /api/books/search
 * Search books by title or author (full-text search with D1)
 * Query params:
 * - q: Search query (required)
 * - limit: Maximum results (default 50)
 *
 * Requires authentication (at least readonly access)
 */
booksRouter.get('/search', requireReadonly(), async (c) => {
  const { q, limit } = c.req.query();

  if (!q || !q.trim()) {
    return c.json({ error: 'Search query (q) is required' }, 400);
  }

  const maxResults = Math.min(Math.max(limit ? parseInt(limit, 10) : 50, 1), 100);
  const organizationId = c.get('organizationId');
  const db = c.env.READING_MANAGER_DB;

  // In multi-tenant mode, scope search to organization's books using FTS5
  if (organizationId && db) {
    const searchTerm = q.trim();
    const ftsQuery = searchTerm
      .replace(/['"*()^]/g, '')
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => `"${t}"*`)
      .join(' ');
    let result;
    try {
      result = await db
        .prepare(
          `
        SELECT b.* FROM books b
        INNER JOIN org_book_selections obs ON b.id = obs.book_id
        INNER JOIN books_fts fts ON b.id = fts.id
        WHERE obs.organization_id = ? AND fts MATCH ?
        ORDER BY rank LIMIT ?
      `
        )
        .bind(organizationId, ftsQuery, maxResults)
        .all();
    } catch {
      // FTS5 fallback to LIKE
      const likeQuery = `%${searchTerm}%`;
      result = await db
        .prepare(
          `
        SELECT b.* FROM books b
        INNER JOIN org_book_selections obs ON b.id = obs.book_id
        WHERE obs.organization_id = ? AND (b.title LIKE ? OR b.author LIKE ?)
        ORDER BY b.title LIMIT ?
      `
        )
        .bind(organizationId, likeQuery, likeQuery, maxResults)
        .all();
    }
    const books = (result.results || []).map(rowToBook);
    return c.json({ query: q.trim(), count: books.length, books });
  }

  // Legacy mode
  const provider = await createProvider(c.env);
  const books = await provider.searchBooks(q.trim(), maxResults);
  return c.json({ query: q.trim(), count: books.length, books });
});

/**
 * GET /api/books/library-search
 * Find books from the library matching a student's profile
 * No AI - pure database search
 *
 * Query params:
 * - studentId: Required - the student to find books for
 * - focusMode: Optional - 'balanced' | 'consolidation' | 'challenge' (default: 'balanced')
 *
 * Requires authentication (at least readonly access)
 */
booksRouter.get('/library-search', requireReadonly(), async (c) => {
  try {
    const { studentId, focusMode = 'balanced' } = c.req.query();

    if (!studentId) {
      throw badRequestError('studentId query parameter is required');
    }

    const organizationId = c.get('organizationId');
    const db = c.env.READING_MANAGER_DB;

    if (!organizationId || !db) {
      throw badRequestError('Multi-tenant mode required for library search');
    }

    // Build student profile
    const profile = await buildStudentReadingProfile(studentId, organizationId, db);

    if (!profile) {
      throw notFoundError(`Student with ID ${studentId} not found`);
    }

    // Build the search query
    const { student, preferences, inferredGenres, readBookIds } = profile;

    // Build query to find matching books, scoped to organization
    let query = `
      SELECT DISTINCT b.id, b.title, b.author, b.reading_level, b.age_range, b.genre_ids, b.description,
        b.isbn, b.page_count, b.series_name, b.series_number, b.publication_year
      FROM books b
      INNER JOIN org_book_selections obs ON b.id = obs.book_id AND obs.organization_id = ?
      WHERE 1=1
    `;
    const params = [organizationId];

    // Filter by reading level range if student has one set
    const minLevel = student.readingLevelMin;
    const maxLevel = student.readingLevelMax;

    // Adjust effective range based on focus mode
    let effectiveMin = minLevel;
    let effectiveMax = maxLevel;
    if (minLevel !== null && maxLevel !== null) {
      const midpoint = (minLevel + maxLevel) / 2;
      if (focusMode === 'consolidation') {
        effectiveMax = midpoint;
      } else if (focusMode === 'challenge') {
        effectiveMin = midpoint;
      }
    }

    if (effectiveMin !== null && effectiveMax !== null) {
      // Filter books where book level falls within the effective range
      // Include books with no reading level (don't exclude unleveled books)
      query += ` AND (b.reading_level IS NULL OR (
        CAST(b.reading_level AS REAL) >= ? AND CAST(b.reading_level AS REAL) <= ?
      ))`;
      params.push(effectiveMin, effectiveMax);
    }
    // If no range set, don't filter by level (return all books)

    // Exclude already-read books (chunked to stay within SQLite bind limit of 999)
    if (readBookIds.length > 0) {
      const CHUNK_SIZE = 400;
      for (let i = 0; i < readBookIds.length; i += CHUNK_SIZE) {
        const chunk = readBookIds.slice(i, i + CHUNK_SIZE);
        const placeholders = chunk.map(() => '?').join(',');
        query += ` AND b.id NOT IN (${placeholders})`;
        params.push(...chunk);
      }
    }

    // Exclude disliked books (by title match, with SQL wildcard escaping)
    if (preferences.dislikes.length > 0) {
      for (const disliked of preferences.dislikes) {
        const escaped = disliked.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
        query += ` AND b.title NOT LIKE ? ESCAPE '\\'`;
        params.push(`%${escaped}%`);
      }
    }

    query += ` LIMIT 100`; // Get more than we need for scoring

    const booksResult = await db
      .prepare(query)
      .bind(...params)
      .all();
    let books = booksResult.results || [];

    // Score and sort books by genre match
    const scoredBooks = books.map((book) => {
      let score = 0;
      const matchReasons = [];
      const bookGenreIds = parseGenreIds(book.genre_ids);

      // Score for matching favorite genres
      for (const genreId of bookGenreIds) {
        if (preferences.favoriteGenreIds.includes(genreId)) {
          score += 3; // Explicit favorite gets higher weight
          matchReasons.push('favorite genre');
        } else if (inferredGenres.some((g) => g.id === genreId)) {
          score += 2; // Inferred favorite
          matchReasons.push('matches reading history');
        }
      }

      // Score for books well within the target reading level range
      if (effectiveMin !== null && effectiveMax !== null && book.reading_level) {
        const bookLevel = parseFloat(book.reading_level);
        if (!isNaN(bookLevel)) {
          const targetCenter = (effectiveMin + effectiveMax) / 2;
          const targetHalf = (effectiveMax - effectiveMin) / 2;
          const distanceFromCenter = Math.abs(bookLevel - targetCenter);
          // Bonus for books closer to the center of the target range
          if (targetHalf > 0 && distanceFromCenter <= targetHalf * 0.5) {
            score += 1;
            matchReasons.push(
              focusMode === 'consolidation'
                ? 'consolidation level'
                : focusMode === 'challenge'
                  ? 'challenge level'
                  : 'ideal level match'
            );
          }
        }
      }

      return { ...book, score, matchReasons: [...new Set(matchReasons)] };
    });

    // Sort by score (highest first) and take top 10
    scoredBooks.sort((a, b) => b.score - a.score);
    const topBooks = scoredBooks.slice(0, 10);

    // Get genre names for display
    const allGenreIds = [...new Set(topBooks.flatMap((b) => parseGenreIds(b.genre_ids)))];

    let genreNameMap = {};
    if (allGenreIds.length > 0) {
      const placeholders = allGenreIds.map(() => '?').join(',');
      const genresResult = await db
        .prepare(
          `
        SELECT id, name FROM genres WHERE id IN (${placeholders})
      `
        )
        .bind(...allGenreIds)
        .all();

      for (const row of genresResult.results || []) {
        genreNameMap[row.id] = row.name;
      }
    }

    // Format response
    const formattedBooks = topBooks.map((book) => {
      const genreIds = parseGenreIds(book.genre_ids);
      // Only include genres that have a name in the map (filter out invalid IDs)
      const genres = genreIds.filter((id) => genreNameMap[id]).map((id) => genreNameMap[id]);

      // Build match reason string
      let matchReason = 'Matches your reading level';
      if (book.matchReasons.includes('favorite genre')) {
        const matchingGenre = genres.find((g) => preferences.favoriteGenreNames.includes(g));
        matchReason = `Matches favorite genre: ${matchingGenre || genres[0] || 'General'}`;
      } else if (book.matchReasons.includes('matches reading history')) {
        matchReason = "Similar to books you've enjoyed";
      }

      return {
        id: book.id,
        title: book.title,
        author: book.author,
        readingLevel: book.reading_level,
        ageRange: book.age_range,
        description: book.description,
        isbn: book.isbn,
        pageCount: book.page_count,
        seriesName: book.series_name,
        seriesNumber: book.series_number,
        publicationYear: book.publication_year,
        genres,
        matchReason,
      };
    });

    return c.json({
      books: formattedBooks,
      studentProfile: {
        readingLevel: student.readingLevel,
        readingLevelMin: student.readingLevelMin,
        readingLevelMax: student.readingLevelMax,
        favoriteGenres: preferences.favoriteGenreNames,
        inferredGenres: inferredGenres.map((g) => g.name),
        booksRead: profile.booksReadCount,
      },
    });
  } catch (error) {
    // Re-throw known errors (badRequestError, notFoundError)
    if (error.status) {
      throw error;
    }
    // Log unexpected errors and re-throw
    console.error('Error in library-search:', error);
    throw error;
  }
});

/**
 * GET /api/books/ai-suggestions
 * Get AI-powered book suggestions (not constrained to library)
 *
 * Query params:
 * - studentId: Required - the student to get suggestions for
 * - focusMode: Optional - 'balanced' | 'consolidation' | 'challenge' (default: 'balanced')
 *
 * Requires authentication (at least readonly access)
 */
booksRouter.get('/ai-suggestions', requireReadonly(), async (c) => {
  try {
    // Demo users: hard cap of 3 AI requests per hour
    if (c.get('user')?.authProvider === 'demo') {
      const demoDb = c.env.READING_MANAGER_DB;
      const demoUserId = c.get('userId');
      const count = await demoDb
        .prepare(
          `SELECT COUNT(*) as count FROM rate_limits
           WHERE key = ? AND endpoint = '/api/books/ai-suggestions-demo'
           AND created_at > datetime('now', '-3600 seconds')`
        )
        .bind(demoUserId)
        .first();

      if ((count?.count || 0) >= 3) {
        return c.json(
          {
            error: 'Demo is limited to 3 AI recommendation requests. Sign up for unlimited access!',
            code: 'DEMO_AI_LIMIT',
          },
          429
        );
      }

      await demoDb
        .prepare(
          `INSERT INTO rate_limits (id, key, endpoint, created_at)
           VALUES (?, ?, '/api/books/ai-suggestions-demo', datetime('now'))`
        )
        .bind(crypto.randomUUID(), demoUserId)
        .run();
    }

    const { studentId, focusMode = 'balanced', skipCache } = c.req.query();

    if (!studentId) {
      throw badRequestError('studentId query parameter is required');
    }

    const organizationId = c.get('organizationId');
    const db = c.env.READING_MANAGER_DB;
    const encSecret = getEncryptionSecret(c.env);

    if (!organizationId || !db || !encSecret) {
      throw badRequestError('Multi-tenant mode required for AI suggestions');
    }

    // GDPR: Check processing restriction and AI opt-out before generating recommendations
    const studentFlags = await db
      .prepare(
        'SELECT processing_restricted, ai_opt_out FROM students WHERE id = ? AND organization_id = ?'
      )
      .bind(studentId, organizationId)
      .first();

    if (!studentFlags) {
      throw notFoundError(`Student with ID ${studentId} not found`);
    }

    if (studentFlags.processing_restricted) {
      return c.json({
        suggestions: [],
        message: 'Processing is restricted for this student. AI recommendations are unavailable.',
      });
    }

    if (studentFlags.ai_opt_out) {
      return c.json({
        suggestions: [],
        message: 'AI recommendations are disabled for this student.',
      });
    }

    // Build student profile
    const profile = await buildStudentReadingProfile(studentId, organizationId, db);

    if (!profile) {
      throw notFoundError(`Student with ID ${studentId} not found`);
    }

    // Build cache inputs from profile
    const cacheInputs = {
      readingLevelMin: profile.student.readingLevelMin,
      readingLevelMax: profile.student.readingLevelMax,
      genres: profile.preferences.favoriteGenreNames,
      focusMode,
      recentBookIds: profile.readBookIds || [],
      provider: null, // set after we know which provider
    };

    // Check cache (unless skipCache requested)
    if (skipCache !== 'true') {
      // Quick-read AI config just for provider name (for cache key)
      const configRow = await db
        .prepare('SELECT provider FROM org_ai_config WHERE organization_id = ?')
        .bind(organizationId)
        .first();
      cacheInputs.provider = configRow?.provider || 'anthropic';

      const cached = await getCachedRecommendations(c.env, cacheInputs);
      if (cached) {
        // Library cross-check on cached suggestions
        const suggestionTitles = (cached.suggestions || [])
          .filter((s) => s && s.title)
          .map((s) => s.title.toLowerCase());
        let libraryMatches = {};

        if (suggestionTitles.length > 0) {
          const placeholders = suggestionTitles.map(() => '?').join(',');
          const booksResult = await db
            .prepare(
              `SELECT b.id, b.title FROM books b
             INNER JOIN org_book_selections obs ON b.id = obs.book_id
             WHERE obs.organization_id = ? AND obs.is_available = 1
             AND LOWER(b.title) IN (${placeholders})`
            )
            .bind(organizationId, ...suggestionTitles)
            .all();
          for (const book of booksResult.results || []) {
            libraryMatches[book.title.toLowerCase()] = book.id;
          }
        }

        const enriched = (cached.suggestions || []).map((s) => ({
          ...s,
          inLibrary: s?.title ? !!libraryMatches[s.title.toLowerCase()] : false,
          libraryBookId: s?.title ? libraryMatches[s.title.toLowerCase()] || null : null,
        }));

        return c.json({
          suggestions: enriched,
          studentProfile: {
            readingLevel: profile.student.readingLevel,
            favoriteGenres: profile.preferences.favoriteGenreNames,
            inferredGenres: profile.inferredGenres.map((g) => g.name),
            recentReads: profile.recentReads.map((r) => r.title),
          },
          cached: true,
        });
      }
    }

    // Get AI configuration
    const dbConfig = await db
      .prepare(
        `
      SELECT provider, api_key_encrypted, model_preference, is_enabled
      FROM org_ai_config WHERE organization_id = ?
    `
      )
      .bind(organizationId)
      .first();

    let aiConfig;

    if (dbConfig && dbConfig.is_enabled && dbConfig.api_key_encrypted) {
      // Path 1: School has their own API key configured
      try {
        const decryptedApiKey = await decryptSensitiveData(dbConfig.api_key_encrypted, encSecret);
        aiConfig = {
          provider: dbConfig.provider || 'anthropic',
          apiKey: decryptedApiKey,
          model: dbConfig.model_preference,
        };
      } catch (decryptError) {
        console.error('Failed to decrypt API key:', decryptError.message);
        throw badRequestError('AI configuration error. Please check Settings.');
      }
    } else {
      // Path 2: Check if org has the paid AI addon
      const org = await db
        .prepare('SELECT ai_addon_active FROM organizations WHERE id = ?')
        .bind(organizationId)
        .first();

      if (!org?.ai_addon_active) {
        throw Object.assign(
          new Error('AI recommendations are not enabled for this organisation.'),
          { status: 403 }
        );
      }

      // Path 2a: Use owner's platform key
      const platformKey = await db
        .prepare(
          'SELECT provider, api_key_encrypted, model_preference FROM platform_ai_keys WHERE is_active = 1'
        )
        .first();

      if (platformKey?.api_key_encrypted) {
        try {
          const decryptedKey = await decryptSensitiveData(platformKey.api_key_encrypted, encSecret);
          aiConfig = {
            provider: platformKey.provider,
            apiKey: decryptedKey,
            model: platformKey.model_preference || null,
          };
        } catch (decryptError) {
          console.error('Failed to decrypt platform API key:', decryptError.message);
          throw badRequestError('Platform AI configuration error. Contact the administrator.');
        }
      } else {
        // Path 2b: Tertiary fallback — env vars (transitional, remove after platform keys confirmed)
        const envProvider = c.env.ANTHROPIC_API_KEY
          ? 'anthropic'
          : c.env.OPENAI_API_KEY
            ? 'openai'
            : c.env.GOOGLE_API_KEY
              ? 'google'
              : null;

        if (!envProvider) {
          throw badRequestError('AI not configured. Contact your administrator.');
        }

        const envKeyMap = {
          anthropic: 'ANTHROPIC_API_KEY',
          openai: 'OPENAI_API_KEY',
          google: 'GOOGLE_API_KEY',
        };

        aiConfig = {
          provider: envProvider,
          apiKey: c.env[envKeyMap[envProvider]],
          model: null,
        };
      }
    }

    // Generate AI suggestions
    const suggestions = await generateBroadSuggestions(profile, aiConfig, focusMode);

    // Set provider on cache inputs (now we know from aiConfig)
    cacheInputs.provider = aiConfig.provider;

    // Cache the raw suggestions (non-blocking)
    if (c.executionCtx?.waitUntil) {
      c.executionCtx.waitUntil(cacheRecommendations(c.env, cacheInputs, { suggestions }));
    } else {
      // Fallback for environments without waitUntil
      cacheRecommendations(c.env, cacheInputs, { suggestions }).catch(() => {});
    }

    // Check which suggestions are in the library
    // Add null safety in case AI returns malformed data
    const suggestionTitles = (suggestions || [])
      .filter((s) => s && s.title)
      .map((s) => s.title.toLowerCase());
    let libraryMatches = {};

    if (suggestionTitles.length > 0) {
      // Search for title matches in this organization's library
      const placeholders = suggestionTitles.map(() => '?').join(',');
      const booksResult = await db
        .prepare(
          `
        SELECT b.id, b.title FROM books b
        INNER JOIN org_book_selections obs ON b.id = obs.book_id
        WHERE obs.organization_id = ? AND obs.is_available = 1
        AND LOWER(b.title) IN (${placeholders})
      `
        )
        .bind(organizationId, ...suggestionTitles)
        .all();

      for (const book of booksResult.results || []) {
        libraryMatches[book.title.toLowerCase()] = book.id;
      }
    }

    // Add inLibrary flag to each suggestion (with null safety)
    const enrichedSuggestions = (suggestions || []).map((suggestion) => ({
      ...suggestion,
      inLibrary: suggestion?.title ? !!libraryMatches[suggestion.title.toLowerCase()] : false,
      libraryBookId: suggestion?.title
        ? libraryMatches[suggestion.title.toLowerCase()] || null
        : null,
    }));

    return c.json({
      suggestions: enrichedSuggestions,
      studentProfile: {
        readingLevel: profile.student.readingLevel,
        favoriteGenres: profile.preferences.favoriteGenreNames,
        inferredGenres: profile.inferredGenres.map((g) => g.name),
        recentReads: profile.recentReads.map((r) => r.title),
      },
      cached: false,
    });
  } catch (error) {
    // Re-throw known errors (badRequestError, notFoundError, etc.)
    if (error.status) {
      throw error;
    }
    // Log and handle AI service errors (use 500 for upstream failures)
    console.error('AI suggestions error:', error.message, error.stack);
    throw serverError(
      'AI recommendations are temporarily unavailable. Try "Find in Library" instead.'
    );
  }
});

/**
 * GET /api/books/count
 * Get total book count
 *
 * Requires authentication (at least readonly access)
 */
booksRouter.get('/count', requireReadonly(), async (c) => {
  const organizationId = c.get('organizationId');
  const db = c.env.READING_MANAGER_DB;
  if (organizationId && db) {
    const result = await db
      .prepare(
        'SELECT COUNT(*) as count FROM org_book_selections WHERE organization_id = ? AND is_available = 1'
      )
      .bind(organizationId)
      .first();
    return c.json({ count: result?.count || 0 });
  }
  const provider = await createProvider(c.env);
  const count = await provider.getBookCount();
  return c.json({ count });
});

/**
 * Normalize author name from "Surname, Firstname" to "Firstname Surname".
 * OpenLibrary sometimes returns names in inverted format.
 */
function normalizeAuthorName(name) {
  if (!name) return null;
  const trimmed = name.trim();
  // Match "Surname, Firstname" pattern (exactly one comma)
  const parts = trimmed.split(',');
  if (parts.length === 2) {
    const surname = parts[0].trim();
    const firstname = parts[1].trim();
    if (firstname && surname) {
      return `${firstname} ${surname}`;
    }
  }
  return trimmed;
}

/**
 * GET /api/books/search-external
 * Search external book databases (OpenLibrary) by title for typeahead suggestions.
 * Returns normalized results with title, author, ISBN, and publication year.
 *
 * Query params:
 * - q: Search query (required, min 3 chars)
 * - limit: Max results (default 8, max 20)
 *
 * Requires authentication (at least readonly access)
 */
booksRouter.get('/search-external', requireReadonly(), async (c) => {
  const { q, limit } = c.req.query();

  if (!q || q.trim().length < 3) {
    return c.json({ results: [] });
  }

  const maxResults = Math.min(parseInt(limit, 10) || 8, 20);
  const searchTerm = q.trim();

  try {
    const params = new URLSearchParams({
      q: searchTerm,
      limit: String(maxResults),
      fields: 'key,title,author_name,first_publish_year,isbn',
    });

    const response = await fetch(`https://openlibrary.org/search.json?${params}`, {
      headers: { 'User-Agent': 'TallyReading/1.0 (educational-app)' },
    });

    if (!response.ok) {
      return c.json({ results: [] });
    }

    const data = await response.json();
    const results = (data.docs || []).map((doc) => ({
      title: doc.title || '',
      author: normalizeAuthorName(doc.author_name?.[0] || null),
      isbn: doc.isbn?.[0] || null,
      publicationYear: doc.first_publish_year || null,
    }));

    return c.json({ results });
  } catch (error) {
    console.error('External book search error:', error);
    return c.json({ results: [] });
  }
});

/**
 * POST /api/books
 * Add a new book
 *
 * Requires authentication (at least teacher access)
 */
booksRouter.post('/', requireTeacher(), async (c) => {
  const bookData = await c.req.json();

  // Validate book data
  const validation = validateBook(bookData);
  if (!validation.isValid) {
    throw badRequestError(validation.errors.join('; '));
  }

  const newBook = {
    id: bookData.id || crypto.randomUUID(),
    title: bookData.title,
    author: bookData.author || null,
    genreIds: bookData.genreIds || [],
    readingLevel: bookData.readingLevel || null,
    ageRange: bookData.ageRange || null,
    description: bookData.description || null,
    isbn: bookData.isbn || null,
    pageCount: bookData.pageCount ?? null,
    seriesName: bookData.seriesName || null,
    seriesNumber: bookData.seriesNumber ?? null,
    publicationYear: bookData.publicationYear ?? null,
  };

  const provider = await createProvider(c.env);
  const savedBook = await provider.addBook(newBook);

  // Link book to the current organization
  const organizationId = c.get('organizationId');
  if (organizationId) {
    const db = c.env.READING_MANAGER_DB;
    if (db) {
      await db
        .prepare(
          'INSERT OR IGNORE INTO org_book_selections (id, organization_id, book_id, is_available) VALUES (?, ?, ?, 1)'
        )
        .bind(crypto.randomUUID(), organizationId, savedBook.id)
        .run();
    }
  }

  return c.json(savedBook, 201);
});

/**
 * GET /api/books/isbn/:isbn
 * Look up a book by ISBN — checks local D1 first, then OpenLibrary
 *
 * Requires authentication (at least teacher access)
 */
booksRouter.get('/isbn/:isbn', requireTeacher(), async (c) => {
  const { isbn } = c.req.param();
  const normalized = normalizeISBN(isbn);
  if (!normalized) {
    throw badRequestError('Invalid ISBN');
  }

  const organizationId = c.get('organizationId');
  const db = c.env.READING_MANAGER_DB;

  // Check local D1 database first
  if (db) {
    const row = await db.prepare('SELECT * FROM books WHERE isbn = ?').bind(normalized).first();
    if (row) {
      let inLibrary = false;
      if (organizationId) {
        const orgLink = await db
          .prepare(
            'SELECT 1 FROM org_book_selections WHERE organization_id = ? AND book_id = ? AND is_available = 1'
          )
          .bind(organizationId, row.id)
          .first();
        inLibrary = !!orgLink;
      }
      return c.json({ source: 'local', inLibrary, book: rowToBook(row) });
    }
  }

  // Not found locally by ISBN — try OpenLibrary
  const olBook = await lookupISBN(normalized, c.env);
  if (!olBook) {
    return c.json({ source: 'not_found', isbn: normalized, book: null });
  }

  // Normalize author name from OpenLibrary ("Surname, First" → "First Surname")
  if (olBook.author) {
    olBook.author = normalizeAuthorDisplay(olBook.author);
  }

  // Check if a matching book already exists locally by title+author (different edition/ISBN)
  if (olBook.title && db) {
    const titleQuery = `%${olBook.title.trim()}%`;
    const candidates = await db
      .prepare('SELECT * FROM books WHERE title LIKE ? LIMIT 20')
      .bind(titleQuery)
      .all();
    const match = (candidates.results || []).find((row) =>
      isFuzzyMatch(
        { title: olBook.title, author: olBook.author },
        { title: row.title, author: row.author }
      )
    );
    if (match) {
      let inLibrary = false;
      if (organizationId) {
        const orgLink = await db
          .prepare(
            'SELECT 1 FROM org_book_selections WHERE organization_id = ? AND book_id = ? AND is_available = 1'
          )
          .bind(organizationId, match.id)
          .first();
        inLibrary = !!orgLink;
      }
      return c.json({
        source: 'local',
        inLibrary,
        book: { ...rowToBook(match), isbn: match.isbn || normalized },
      });
    }
  }

  return c.json({ source: 'openlibrary', inLibrary: false, book: olBook });
});

/**
 * POST /api/books/scan
 * Scan a book by ISBN — link existing, preview, or create new
 *
 * Request body: { isbn, confirm }
 * Requires authentication (at least teacher access)
 */
booksRouter.post('/scan', requireTeacher(), async (c) => {
  const { isbn, confirm } = await c.req.json();
  const normalized = normalizeISBN(isbn);
  if (!normalized) {
    throw badRequestError('Invalid ISBN');
  }

  const organizationId = c.get('organizationId');
  const db = c.env.READING_MANAGER_DB;

  // Check D1 for existing book by ISBN
  let existingRow = null;
  if (db) {
    existingRow = await db.prepare('SELECT * FROM books WHERE isbn = ?').bind(normalized).first();
  }

  if (existingRow) {
    // Book exists — link to this org
    if (organizationId && db) {
      await db
        .prepare(
          `
        INSERT INTO org_book_selections (id, organization_id, book_id, is_available, created_at)
        VALUES (?, ?, ?, 1, datetime('now'))
        ON CONFLICT (organization_id, book_id) DO UPDATE SET is_available = 1, updated_at = datetime('now')
      `
        )
        .bind(crypto.randomUUID(), organizationId, existingRow.id)
        .run();
    }
    return c.json({ action: 'linked', book: rowToBook(existingRow) });
  }

  // Not found locally by ISBN — look up on OpenLibrary
  const olBook = await lookupISBN(normalized, c.env);

  // Normalize author name from OpenLibrary ("Surname, First" → "First Surname")
  if (olBook?.author) {
    olBook.author = normalizeAuthorDisplay(olBook.author);
  }

  if (!confirm) {
    // Preview mode — return metadata (or just the ISBN if OpenLibrary had nothing)
    return c.json({ action: 'preview', book: olBook || { isbn: normalized } });
  }

  // Before creating, check for title+author duplicates in the database.
  // OpenLibrary may return the same book under a different ISBN (different edition).
  if (olBook?.title && db) {
    const titleQuery = `%${olBook.title.trim()}%`;
    const candidates = await db
      .prepare(
        `
      SELECT * FROM books WHERE title LIKE ? LIMIT 20
    `
      )
      .bind(titleQuery)
      .all();

    const match = (candidates.results || []).find((row) =>
      isFuzzyMatch(
        { title: olBook.title, author: olBook.author },
        { title: row.title, author: row.author }
      )
    );

    if (match) {
      // Duplicate found — update its ISBN if missing, then link to org
      if (!match.isbn && normalized) {
        await db
          .prepare('UPDATE books SET isbn = ?, updated_at = datetime("now") WHERE id = ?')
          .bind(normalized, match.id)
          .run();
      }
      if (organizationId) {
        await db
          .prepare(
            `
          INSERT INTO org_book_selections (id, organization_id, book_id, is_available, created_at)
          VALUES (?, ?, ?, 1, datetime('now'))
          ON CONFLICT (organization_id, book_id) DO UPDATE SET is_available = 1, updated_at = datetime('now')
        `
          )
          .bind(crypto.randomUUID(), organizationId, match.id)
          .run();
      }
      return c.json({
        action: 'linked',
        book: { ...rowToBook(match), isbn: match.isbn || normalized },
      });
    }
  }

  // No duplicate — create the book and link to org
  const newBook = {
    id: crypto.randomUUID(),
    title: olBook?.title || 'Unknown Title',
    author: olBook?.author || null,
    genreIds: [],
    readingLevel: null,
    ageRange: null,
    description: null,
    isbn: normalized,
    pageCount: olBook?.pageCount ?? null,
    seriesName: olBook?.seriesName || null,
    seriesNumber: olBook?.seriesNumber ?? null,
    publicationYear: olBook?.publicationYear ?? null,
  };

  const provider = await createProvider(c.env);
  const savedBook = await provider.addBook(newBook);

  // Link to org
  if (organizationId && db) {
    await db
      .prepare(
        `
      INSERT INTO org_book_selections (id, organization_id, book_id, is_available, created_at)
      VALUES (?, ?, ?, 1, datetime('now'))
      ON CONFLICT (organization_id, book_id) DO UPDATE SET is_available = 1, updated_at = datetime('now')
    `
      )
      .bind(crypto.randomUUID(), organizationId, savedBook.id)
      .run();
  }

  return c.json({ action: 'created', book: savedBook }, 201);
});

/**
 * GET /api/books/:id
 * Get a single book by ID (full details)
 *
 * Requires authentication (at least readonly access)
 */
booksRouter.get('/:id', requireReadonly(), async (c) => {
  const { id } = c.req.param();
  const organizationId = c.get('organizationId');
  const db = c.env.READING_MANAGER_DB;

  let book;
  if (organizationId && db) {
    const row = await db
      .prepare(
        `SELECT b.* FROM books b
       INNER JOIN org_book_selections obs ON obs.book_id = b.id
       WHERE b.id = ? AND obs.organization_id = ?`
      )
      .bind(id, organizationId)
      .first();
    book = row ? rowToBook(row) : null;
  } else {
    const provider = await createProvider(c.env);
    book = await provider.getBookById(id);
  }

  if (!book) {
    throw notFoundError(`Book with ID ${id} not found`);
  }

  return c.json(book);
});

/**
 * PUT /api/books/:id
 * Update a book
 *
 * Requires authentication (at least teacher access)
 */
booksRouter.put('/:id', requireTeacher(), async (c) => {
  const { id } = c.req.param();
  const bookData = await c.req.json();
  const organizationId = c.get('organizationId');
  const db = c.env.READING_MANAGER_DB;

  // Single query: check book exists and org ownership in one round-trip
  let existingBook;
  if (organizationId && db) {
    const row = await db
      .prepare(
        `SELECT b.* FROM books b
       INNER JOIN org_book_selections obs ON obs.book_id = b.id
       WHERE b.id = ? AND obs.organization_id = ?`
      )
      .bind(id, organizationId)
      .first();
    if (!row) {
      throw notFoundError(`Book with ID ${id} not found`);
    }
    existingBook = rowToBook(row);
  } else {
    const provider = await createProvider(c.env);
    existingBook = await provider.getBookById(id);
    if (!existingBook) {
      throw notFoundError(`Book with ID ${id} not found`);
    }
  }

  // Update book with safe merge
  const updatedBook = {
    ...existingBook,
    title: bookData.title !== undefined ? bookData.title : existingBook.title,
    author: bookData.author !== undefined ? bookData.author : existingBook.author,
    genreIds: bookData.genreIds !== undefined ? bookData.genreIds : existingBook.genreIds,
    readingLevel:
      bookData.readingLevel !== undefined ? bookData.readingLevel : existingBook.readingLevel,
    ageRange: bookData.ageRange !== undefined ? bookData.ageRange : existingBook.ageRange,
    description:
      bookData.description !== undefined ? bookData.description : existingBook.description,
    isbn: bookData.isbn !== undefined ? bookData.isbn : existingBook.isbn,
    pageCount: bookData.pageCount !== undefined ? bookData.pageCount : existingBook.pageCount,
    seriesName: bookData.seriesName !== undefined ? bookData.seriesName : existingBook.seriesName,
    seriesNumber:
      bookData.seriesNumber !== undefined ? bookData.seriesNumber : existingBook.seriesNumber,
    publicationYear:
      bookData.publicationYear !== undefined
        ? bookData.publicationYear
        : existingBook.publicationYear,
    id, // Ensure ID doesn't change
  };

  // Validate the merged book data
  const bookValidation = validateBook(updatedBook);
  if (!bookValidation.isValid) {
    throw badRequestError(bookValidation.errors.join('; '));
  }

  const provider = await createProvider(c.env);
  const savedBook = await provider.updateBook(id, updatedBook);
  return c.json(savedBook);
});

/**
 * DELETE /api/books/clear-library
 * Remove all books from the current organization's library and clean up orphaned global books.
 *
 * Requires authentication (at least admin access)
 */
booksRouter.delete('/clear-library', requireAdmin(), auditLog('clear', 'library'), async (c) => {
  const organizationId = c.get('organizationId');
  if (!organizationId || !c.env.READING_MANAGER_DB) {
    throw badRequestError('Clear library is only available in multi-tenant mode');
  }

  const db = c.env.READING_MANAGER_DB;

  // Count books linked to this org
  const countResult = await db
    .prepare('SELECT COUNT(*) as count FROM org_book_selections WHERE organization_id = ?')
    .bind(organizationId)
    .first();
  const booksUnlinked = countResult?.count || 0;

  if (booksUnlinked === 0) {
    return c.json({ message: 'No books to clear', booksUnlinked: 0, orphansDeleted: 0 });
  }

  // Remove all org links and clean up orphaned books
  await db.batch([
    db.prepare('DELETE FROM org_book_selections WHERE organization_id = ?').bind(organizationId),
    db.prepare(
      'DELETE FROM books WHERE NOT EXISTS (SELECT 1 FROM org_book_selections WHERE org_book_selections.book_id = books.id)'
    ),
  ]);

  // Count remaining orphans deleted (approximate — we know the unlinked count)
  return c.json({
    message: `Cleared ${booksUnlinked} books from library`,
    booksUnlinked,
  });
});

/**
 * POST /api/books/:id/enrich
 * Enrich a single book using the metadata cascade engine.
 * Fetches description, genres, cover etc. from configured providers
 * and stores any cover image in R2.
 */
booksRouter.post('/:id/enrich', requireAdmin(), async (c) => {
  const { id } = c.req.param();
  const db = c.env.READING_MANAGER_DB;
  if (!db) throw notFoundError('Book not found');

  const book = await db.prepare('SELECT * FROM books WHERE id = ?').bind(id).first();
  if (!book) throw notFoundError('Book not found');

  const encSecret = getEncryptionSecret(c.env);
  const config = await getConfigWithKeys(db, encSecret);
  if (!config) return c.json({ error: 'Metadata configuration not found' }, 500);
  config.fetchCovers = Boolean(config.fetchCovers);

  const { merged, log } = await enrichBook(
    { id: book.id, title: book.title, author: book.author, isbn: book.isbn },
    config
  );

  const fieldsEnriched = log.flatMap((entry) => entry.fields);

  // Store cover in R2 if a coverUrl was found and the book has an ISBN
  let coverStored = false;
  const r2 = c.env.BOOK_COVERS;
  if (merged.coverUrl && book.isbn && r2) {
    try {
      const res = await fetch(merged.coverUrl, {
        headers: { 'User-Agent': 'TallyReading/1.0 (educational-app)' },
      });
      if (res.ok) {
        const imageData = await res.arrayBuffer();
        if (imageData.byteLength > 1000) {
          await r2.put(`isbn/${book.isbn}-M.jpg`, imageData, {
            httpMetadata: { contentType: res.headers.get('Content-Type') || 'image/jpeg' },
          });
          coverStored = true;
        }
      }
    } catch {
      /* non-critical */
    }
  }

  return c.json({
    description: merged.description || null,
    genres: merged.genres || null,
    coverStored,
    fieldsEnriched,
  });
});

/**
 * DELETE /api/books/:id
 * Delete a book
 *
 * Requires authentication (at least teacher access)
 */
booksRouter.delete('/:id', requireTeacher(), async (c) => {
  const { id } = c.req.param();

  // In multi-tenant mode, only remove the org's link to the book (not the global book)
  const organizationId = c.get('organizationId');
  if (organizationId && c.env.READING_MANAGER_DB) {
    const db = c.env.READING_MANAGER_DB;
    const orgLink = await db
      .prepare('SELECT 1 FROM org_book_selections WHERE organization_id = ? AND book_id = ?')
      .bind(organizationId, id)
      .first();
    if (!orgLink) {
      throw notFoundError(`Book with ID ${id} not found`);
    }
    // Remove the org's link to the book rather than deleting the global book record
    await db
      .prepare('DELETE FROM org_book_selections WHERE organization_id = ? AND book_id = ?')
      .bind(organizationId, id)
      .run();
    return c.json({ message: 'Book removed from organization successfully' });
  }

  // Legacy mode: delete the book directly
  const provider = await createProvider(c.env);
  const deletedBook = await provider.deleteBook(id);

  if (!deletedBook) {
    throw notFoundError(`Book with ID ${id} not found`);
  }

  return c.json({ message: 'Book deleted successfully' });
});

/**
 * POST /api/books/bulk
 * Bulk import books with duplicate detection and KV optimization
 *
 * Requires authentication (at least teacher access)
 */
booksRouter.post('/bulk', requireTeacher(), async (c) => {
  const booksData = await c.req.json();

  // Validate input
  if (!Array.isArray(booksData) || booksData.length === 0) {
    throw badRequestError('Request must contain an array of books');
  }

  // Filter valid books and prepare them
  const validBooks = booksData
    .filter((book) => book.title && book.title.trim())
    .map((book) => ({
      id: crypto.randomUUID(),
      title: book.title.trim(),
      author: book.author || null,
      genreIds: book.genreIds || [],
      readingLevel: book.readingLevel || null,
      ageRange: book.ageRange || null,
      description: book.description || null,
      isbn: book.isbn || null,
      pageCount: book.pageCount ?? null,
      seriesName: book.seriesName || null,
      seriesNumber: book.seriesNumber ?? null,
      publicationYear: book.publicationYear ?? null,
    }));

  if (validBooks.length === 0) {
    throw badRequestError('No valid books found in request');
  }

  // Targeted duplicate detection — avoid loading entire book catalog
  const db = c.env.READING_MANAGER_DB;
  const existingByIsbn = new Map();
  const existingByTitle = new Map();

  if (db) {
    // 1. Batch ISBN lookup for books that have ISBNs
    const isbns = validBooks.filter((b) => b.isbn).map((b) => b.isbn);
    if (isbns.length > 0) {
      const ISBN_BATCH = 50;
      for (let i = 0; i < isbns.length; i += ISBN_BATCH) {
        const batch = isbns.slice(i, i + ISBN_BATCH);
        const placeholders = batch.map(() => '?').join(',');
        const result = await db
          .prepare(`SELECT id, isbn, title, author FROM books WHERE isbn IN (${placeholders})`)
          .bind(...batch)
          .all();
        for (const book of result.results || []) {
          if (book.isbn) existingByIsbn.set(book.isbn, book);
        }
      }
    }

    // 2. FTS5 title search for books without ISBNs (or as fallback)
    for (const book of validBooks) {
      if (book.isbn && existingByIsbn.has(book.isbn)) continue; // already matched by ISBN
      const ftsQuery = book.title.trim().replace(/['"*()]/g, '');
      if (!ftsQuery) continue;
      try {
        const ftsResult = await db
          .prepare(
            `SELECT id, title, author FROM books
           INNER JOIN books_fts fts ON books.id = fts.id
           WHERE fts MATCH ? LIMIT 10`
          )
          .bind(`"${ftsQuery}"`)
          .all();
        for (const match of ftsResult.results || []) {
          const key = match.title.toLowerCase().trim();
          if (!existingByTitle.has(key)) existingByTitle.set(key, match);
        }
      } catch {
        // FTS match failed (e.g. special chars) — skip
      }
    }
  } else {
    // Legacy mode: fall back to provider
    const provider = await createProvider(c.env);
    const allBooks = await provider.getAllBooks();
    for (const book of allBooks) {
      if (book.isbn) existingByIsbn.set(book.isbn, book);
      const key = book.title.toLowerCase().trim();
      if (!existingByTitle.has(key)) existingByTitle.set(key, book);
    }
  }

  // Filter out duplicates using the targeted lookup results
  const normalizeTitle = (title) =>
    title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ');
  const normalizeAuthor = (author) =>
    author
      ? author
          .toLowerCase()
          .trim()
          .replace(/[^\w\s]/g, '')
          .replace(/\s+/g, ' ')
      : '';

  const isDuplicate = (newBook) => {
    // Check ISBN match first
    if (newBook.isbn && existingByIsbn.has(newBook.isbn)) return true;

    // Check title match
    const newTitle = normalizeTitle(newBook.title);
    const newAuthor = normalizeAuthor(newBook.author);

    for (const [, existing] of existingByTitle) {
      const existingTitle = normalizeTitle(existing.title);
      if (newTitle === existingTitle) {
        const existingAuthor = normalizeAuthor(existing.author);
        if (newAuthor && existingAuthor) {
          if (newAuthor === existingAuthor) return true;
        } else {
          return true; // Same title, consider duplicate
        }
      }
    }
    return false;
  };

  const newBooks = validBooks.filter((book) => !isDuplicate(book));
  const duplicateCount = validBooks.length - newBooks.length;

  // Use batch operation for efficiency (only 2 KV operations total)
  const provider = await createProvider(c.env);
  let savedBooks = [];
  if (newBooks.length > 0) {
    savedBooks = await provider.addBooksBatch(newBooks);
  }

  // Link new books to the current organization
  const organizationId = c.get('organizationId');
  if (organizationId && db && savedBooks.length > 0) {
    const linkStatements = savedBooks.map((book) =>
      db
        .prepare(
          'INSERT OR IGNORE INTO org_book_selections (id, organization_id, book_id, is_available) VALUES (?, ?, ?, 1)'
        )
        .bind(crypto.randomUUID(), organizationId, book.id)
    );
    for (let i = 0; i < linkStatements.length; i += 100) {
      await db.batch(linkStatements.slice(i, i + 100));
    }
  }

  return c.json(
    {
      imported: savedBooks.length,
      duplicates: duplicateCount,
      total: validBooks.length,
      books: savedBooks,
    },
    201
  );
});

/**
 * POST /api/books/import/preview
 * Preview import results: categorize books into matched, fuzzy matches, new, and conflicts
 *
 * Request body: { books: [{ title, author, readingLevel, isbn }] }
 * Response: { matched, possibleMatches, newBooks, conflicts, alreadyInLibrary, summary }
 *
 * Categories:
 * - matched: Exact matches to existing books (auto-link to org)
 * - possibleMatches: Fuzzy matches (require user confirmation)
 * - newBooks: No match found (will create new book)
 * - conflicts: Match exists but metadata differs (user decides to update)
 * - alreadyInLibrary: Already linked to this organization
 *
 * Requires authentication (at least teacher access)
 */
booksRouter.post('/import/preview', requireAdmin(), async (c) => {
  const { books: importBooks } = await c.req.json();
  const organizationId = c.get('organizationId');
  const db = c.env.READING_MANAGER_DB;

  if (!Array.isArray(importBooks) || importBooks.length === 0) {
    throw badRequestError('Request must contain an array of books');
  }

  if (!organizationId || !db) {
    throw badRequestError('Multi-tenant mode required for import preview');
  }

  // Get books already in this organization's library
  const orgBooksResult = await db
    .prepare(
      'SELECT book_id FROM org_book_selections WHERE organization_id = ? AND is_available = 1'
    )
    .bind(organizationId)
    .all();
  const orgBookIds = new Set((orgBooksResult.results || []).map((r) => r.book_id));

  // Categorize imports
  const matched = [];
  const possibleMatches = [];
  const newBooks = [];
  const conflicts = [];
  const alreadyInLibrary = [];

  // Step 1: Batch ISBN lookup (avoids loading entire book catalog)
  const importIsbns = importBooks.filter((b) => b.isbn).map((b) => b.isbn);
  const isbnBookMap = new Map();
  if (importIsbns.length > 0) {
    const ISBN_BATCH = 50;
    for (let i = 0; i < importIsbns.length; i += ISBN_BATCH) {
      const batch = importIsbns.slice(i, i + ISBN_BATCH);
      const placeholders = batch.map(() => '?').join(',');
      const isbnResult = await db
        .prepare(`SELECT * FROM books WHERE isbn IN (${placeholders})`)
        .bind(...batch)
        .all();
      for (const book of isbnResult.results || []) {
        isbnBookMap.set(book.isbn, book);
      }
    }
  }

  // Step 2: Process each imported book
  for (const importedBook of importBooks) {
    if (!importedBook.title || !importedBook.title.trim()) continue;

    // ISBN exact match (from batch lookup)
    if (importedBook.isbn && isbnBookMap.has(importedBook.isbn)) {
      const isbnMatch = isbnBookMap.get(importedBook.isbn);
      if (orgBookIds.has(isbnMatch.id)) {
        alreadyInLibrary.push({ importedBook, existingBook: isbnMatch });
      } else {
        const hasConflict =
          importedBook.readingLevel &&
          isbnMatch.reading_level &&
          importedBook.readingLevel !== isbnMatch.reading_level;
        if (hasConflict) {
          conflicts.push({ importedBook, existingBook: isbnMatch });
        } else {
          matched.push({ importedBook, existingBook: isbnMatch });
        }
      }
      continue;
    }

    // FTS5 title search for exact and fuzzy matching candidates
    let candidates = [];
    try {
      // Escape FTS5 special characters and search by title
      const ftsQuery = importedBook.title.trim().replace(/['"*()]/g, '');
      if (ftsQuery) {
        const ftsResult = await db
          .prepare(
            `SELECT b.* FROM books b
           INNER JOIN books_fts fts ON b.id = fts.id
           WHERE fts MATCH ? LIMIT 20`
          )
          .bind(`"${ftsQuery}"`)
          .all();
        candidates = ftsResult.results || [];
      }
    } catch {
      // FTS match failed (e.g. special chars) — skip to newBooks
    }

    // Check for exact title/author match in candidates
    const exactMatch = candidates.find(
      (existing) =>
        isExactMatch(existing.title, importedBook.title) &&
        isAuthorMatch(existing.author, importedBook.author)
    );

    if (exactMatch) {
      if (orgBookIds.has(exactMatch.id)) {
        alreadyInLibrary.push({ importedBook, existingBook: exactMatch });
        continue;
      }
      const hasConflict =
        importedBook.readingLevel &&
        exactMatch.reading_level &&
        importedBook.readingLevel !== exactMatch.reading_level;
      if (hasConflict) {
        conflicts.push({ importedBook, existingBook: exactMatch });
      } else {
        matched.push({ importedBook, existingBook: exactMatch });
      }
      continue;
    }

    // Check for fuzzy match in candidates
    const fuzzyMatch = candidates.find((existing) =>
      isFuzzyMatch(
        { title: importedBook.title, author: importedBook.author },
        { title: existing.title, author: existing.author }
      )
    );

    if (fuzzyMatch) {
      possibleMatches.push({ importedBook, existingBook: fuzzyMatch });
    } else {
      newBooks.push({ importedBook });
    }
  }

  return c.json({
    matched,
    possibleMatches,
    newBooks,
    conflicts,
    alreadyInLibrary,
    summary: {
      total: importBooks.length,
      matched: matched.length,
      possibleMatches: possibleMatches.length,
      newBooks: newBooks.length,
      conflicts: conflicts.length,
      alreadyInLibrary: alreadyInLibrary.length,
    },
  });
});

/**
 * POST /api/books/import/confirm
 * Execute the import based on user's decisions from preview
 *
 * Request body: {
 *   matched: [{ existingBookId }],
 *   newBooks: [{ title, author, readingLevel, isbn, description, pageCount, publicationYear, seriesName, seriesNumber }],
 *   conflicts: [{ existingBookId, updateReadingLevel, newReadingLevel }]
 * }
 */
booksRouter.post('/import/confirm', requireAdmin(), auditLog('import', 'books'), async (c) => {
  const { matched = [], newBooks = [], conflicts = [] } = await c.req.json();
  const organizationId = c.get('organizationId');
  const db = c.env.READING_MANAGER_DB;

  if (!organizationId || !db) {
    throw badRequestError('Multi-tenant mode required for import');
  }

  let linked = 0;
  let created = 0;
  let updated = 0;
  const errors = [];

  // Collect all statements, then execute in batches of 100 (D1 limit)
  const statements = [];

  // 1. Link matched books to organization
  for (const match of matched) {
    statements.push({
      stmt: db
        .prepare(
          `
        INSERT INTO org_book_selections (id, organization_id, book_id, is_available, created_at)
        VALUES (?, ?, ?, 1, datetime('now'))
        ON CONFLICT (organization_id, book_id) DO UPDATE SET is_available = 1, updated_at = datetime('now')
      `
        )
        .bind(crypto.randomUUID(), organizationId, match.existingBookId),
      onSuccess: () => {
        linked++;
      },
      onError: (err) => {
        errors.push({ type: 'link', bookId: match.existingBookId, error: err });
      },
    });
  }

  // 2. Create new books and link to organization
  // Deduplicate by ISBN within the import batch (CSV may contain duplicate ISBNs
  // for different editions). First occurrence gets created; duplicates get linked.
  const isbnToBookId = new Map();
  for (const book of newBooks) {
    const isbn = book.isbn || null;

    // If we've already seen this ISBN in this import, just link to the existing book
    if (isbn && isbnToBookId.has(isbn)) {
      const existingBookId = isbnToBookId.get(isbn);
      statements.push({
        stmt: db
          .prepare(
            `
          INSERT INTO org_book_selections (id, organization_id, book_id, is_available, created_at)
          VALUES (?, ?, ?, 1, datetime('now'))
          ON CONFLICT (organization_id, book_id) DO UPDATE SET is_available = 1, updated_at = datetime('now')
        `
          )
          .bind(crypto.randomUUID(), organizationId, existingBookId),
        onSuccess: () => {
          linked++;
        },
        onError: (err) => {
          errors.push({ type: 'link', title: book.title, error: err });
        },
      });
      continue;
    }

    const bookId = crypto.randomUUID();
    if (isbn) isbnToBookId.set(isbn, bookId);

    const pageCount = book.pageCount ? parseInt(book.pageCount, 10) || null : null;
    const publicationYear = book.publicationYear
      ? parseInt(book.publicationYear, 10) || null
      : null;
    const seriesNumber = book.seriesNumber ? parseInt(book.seriesNumber, 10) || null : null;
    statements.push({
      stmt: db
        .prepare(
          `
        INSERT INTO books (id, title, author, reading_level, isbn, description, page_count, publication_year, series_name, series_number, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `
        )
        .bind(
          bookId,
          book.title,
          book.author || null,
          book.readingLevel || null,
          isbn,
          book.description || null,
          pageCount,
          publicationYear,
          book.seriesName || null,
          seriesNumber
        ),
      onSuccess: () => {
        created++;
      },
      onError: (err) => {
        errors.push({ type: 'create', title: book.title, error: err });
      },
    });
    statements.push({
      stmt: db
        .prepare(
          `
        INSERT INTO org_book_selections (id, organization_id, book_id, is_available, created_at)
        VALUES (?, ?, ?, 1, datetime('now'))
      `
        )
        .bind(crypto.randomUUID(), organizationId, bookId),
      onSuccess: () => {},
      onError: (err) => {
        errors.push({ type: 'create', title: book.title, error: err });
      },
    });
  }

  // 3. Handle conflicts (update books if requested, then link)
  for (const conflict of conflicts) {
    if (conflict.updateReadingLevel) {
      statements.push({
        stmt: db
          .prepare(
            `
          UPDATE books SET reading_level = ?, updated_at = datetime('now') WHERE id = ?
        `
          )
          .bind(conflict.newReadingLevel, conflict.existingBookId),
        onSuccess: () => {
          updated++;
        },
        onError: (err) => {
          errors.push({ type: 'conflict', bookId: conflict.existingBookId, error: err });
        },
      });
    }
    statements.push({
      stmt: db
        .prepare(
          `
        INSERT INTO org_book_selections (id, organization_id, book_id, is_available, created_at)
        VALUES (?, ?, ?, 1, datetime('now'))
        ON CONFLICT (organization_id, book_id) DO UPDATE SET is_available = 1, updated_at = datetime('now')
      `
        )
        .bind(crypto.randomUUID(), organizationId, conflict.existingBookId),
      onSuccess: () => {
        linked++;
      },
      onError: (err) => {
        errors.push({ type: 'conflict', bookId: conflict.existingBookId, error: err });
      },
    });
  }

  // Execute in batches of 100 (D1 batch limit)
  const BATCH_SIZE = 100;
  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    const batch = statements.slice(i, i + BATCH_SIZE);
    try {
      await db.batch(batch.map((b) => b.stmt));
      // D1 batches are all-or-nothing — if we get here, all succeeded
      batch.forEach((b) => b.onSuccess());
    } catch (error) {
      // If the entire batch fails, record errors for all items in it
      console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, error.message);
      batch.forEach((b) => b.onError(error.message));
    }
  }

  return c.json({
    linked,
    created,
    updated,
    errors: errors.length > 0 ? errors : undefined,
    success: errors.length === 0,
  });
});

export { booksRouter };
