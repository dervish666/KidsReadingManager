import { Hono } from 'hono';
import { generateBroadSuggestions } from '../../services/aiService.js';
import { notFoundError, badRequestError, serverError } from '../../middleware/errorHandler.js';
import { decryptSensitiveData, getEncryptionSecret } from '../../utils/crypto.js';
import { buildStudentReadingProfile } from '../../utils/studentProfile.js';
import { getCachedRecommendations, cacheRecommendations } from '../../utils/recommendationCache.js';
import { rowToBook } from '../../utils/rowMappers.js';
import { parseGenreIds } from '../../utils/helpers.js';
import { requireReadonly } from '../../middleware/tenant.js';

const recommendationsRouter = new Hono();

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
recommendationsRouter.get('/library-search', requireReadonly(), async (c) => {
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
      query += ` AND (b.reading_level IS NULL OR (
        CAST(b.reading_level AS REAL) >= ? AND CAST(b.reading_level AS REAL) <= ?
      ))`;
      params.push(effectiveMin, effectiveMax);
    }

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
recommendationsRouter.get('/ai-suggestions', requireReadonly(), async (c) => {
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
    const suggestionTitles = (suggestions || [])
      .filter((s) => s && s.title)
      .map((s) => s.title.toLowerCase());
    let libraryMatches = {};

    if (suggestionTitles.length > 0) {
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

export { recommendationsRouter };
