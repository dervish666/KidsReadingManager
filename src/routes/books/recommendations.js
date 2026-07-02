import { Hono } from 'hono';
import { generateBroadSuggestionsWithFailover } from '../../services/aiService.js';
import { notFoundError, badRequestError, serverError } from '../../middleware/errorHandler.js';
import { decryptSensitiveData, getEncryptionSecret } from '../../utils/crypto.js';
import { buildStudentReadingProfile, toAISafeProfile } from '../../utils/studentProfile.js';
import { yearGroupToAgeBand } from '../../utils/yearGroup.js';
import { getCachedRecommendations, cacheRecommendations } from '../../utils/recommendationCache.js';
import { parseGenreIds } from '../../utils/helpers.js';
import { requireReadonly } from '../../middleware/tenant.js';
import { filterContentSafe } from '../../utils/contentModeration.js';
import { checkAIBudget, recordAICall, getMonthlyLimit } from '../../utils/aiCostCap.js';

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
      SELECT DISTINCT b.id, b.title, b.author,
        COALESCE(obs.reading_level_override, b.reading_level) AS reading_level,
        b.age_range, b.genre_ids, b.description,
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
      query += ` AND (COALESCE(obs.reading_level_override, b.reading_level) IS NULL OR (
        CAST(COALESCE(obs.reading_level_override, b.reading_level) AS REAL) >= ?
        AND CAST(COALESCE(obs.reading_level_override, b.reading_level) AS REAL) <= ?
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

    // Build cache inputs from profile. The age band (derived from year group)
    // is part of the key — otherwise two students with the same reading level
    // but different ages could share a cached, age-inappropriate result.
    const ageBand = yearGroupToAgeBand(profile.student.yearGroup);
    const cacheInputs = {
      organizationId,
      readingLevelMin: profile.student.readingLevelMin,
      readingLevelMax: profile.student.readingLevelMax,
      genres: profile.preferences.favoriteGenreNames,
      focusMode,
      recentBookIds: profile.readBookIds || [],
      ageBand: ageBand ? `${ageBand.min}-${ageBand.max}` : '',
      provider: null, // set after we know which provider
    };

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

    // Check cache (unless skipCache requested). Runs after provider
    // resolution so the read key hashes the same provider the write key
    // will use — deriving it separately here used to default to 'anthropic'
    // and permanently miss for platform-key orgs on other providers. A side
    // benefit: a lapsed AI add-on now stops serving cached recommendations
    // immediately (the entitlement check above) instead of for up to 7 days.
    cacheInputs.provider = aiConfig.provider;
    if (skipCache !== 'true') {
      const cached = await getCachedRecommendations(c.env, cacheInputs);
      if (cached) {
        // Defence-in-depth: re-run content moderation on cache hits too. Only
        // moderated output is cached today, but a denylist update, a stale
        // entry, or any future code path that caches raw output must not
        // surface unfiltered text to a child.
        const { kept: cachedSuggestions } = filterContentSafe(cached.suggestions || []);

        // Library cross-check on cached suggestions
        const suggestionTitles = cachedSuggestions
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

        const enriched = cachedSuggestions.map((s) => ({
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

    // Per-org monthly cost cap. Demo users have their own 3/hour cap above;
    // this is the ceiling for legitimate authenticated traffic. Counts only
    // cache-misses since cache hits don't burn AI tokens. Owners can raise
    // the limit via env var AI_MONTHLY_CALL_LIMIT (default 500/month).
    const aiBudgetLimit = getMonthlyLimit(c.env);
    const budget = await checkAIBudget(db, organizationId, aiBudgetLimit);
    if (!budget.allowed) {
      return c.json(
        {
          error: `Monthly AI recommendation limit reached (${budget.used}/${budget.limit} calls for ${budget.period}). Try "Find in Library" instead, or contact support to raise the limit.`,
          code: 'AI_BUDGET_EXCEEDED',
          used: budget.used,
          limit: budget.limit,
          period: budget.period,
        },
        429
      );
    }

    // Strip demographic and identifying fields before sending to the AI
    // provider. See toAISafeProfile() for the full whitelist — readingLevel
    // + genres + reading-history is sufficient for book recommendations.
    const safeProfile = toAISafeProfile(profile);

    // Build the failover chain. The primary `aiConfig` selected above stays
    // first; other configured platform keys, then any env-key candidates,
    // are appended as fallbacks. A transient outage on the primary (5xx /
    // timeout / malformed response that fails schema validation) flows
    // through to the next provider rather than 5xx-ing the user. Note:
    // platform/env failover means a school-key failure can fall through to
    // our platform spend — acceptable as a transient-outage handler, not a
    // routing default.
    const aiConfigs = [aiConfig];
    try {
      const platformKeyRows = await db
        .prepare(
          'SELECT provider, api_key_encrypted, model_preference FROM platform_ai_keys WHERE api_key_encrypted IS NOT NULL'
        )
        .all();
      for (const row of platformKeyRows.results || []) {
        if (aiConfigs.some((cfg) => cfg.provider === row.provider)) continue;
        try {
          const key = await decryptSensitiveData(row.api_key_encrypted, encSecret);
          aiConfigs.push({ provider: row.provider, apiKey: key, model: row.model_preference });
        } catch {
          // Undecryptable fallback key — skip it, the primary still works.
          // Warn so a rotated ENCRYPTION_KEY doesn't silently thin the chain.
          console.warn(`[ai-failover] skipping undecryptable platform key for ${row.provider}`);
        }
      }
    } catch (platformErr) {
      console.error('Failed to load platform failover keys:', platformErr.message);
    }
    const failoverCandidates = [
      { provider: 'anthropic', envKey: 'ANTHROPIC_API_KEY' },
      { provider: 'openai', envKey: 'OPENAI_API_KEY' },
      { provider: 'google', envKey: 'GOOGLE_API_KEY' },
    ];
    for (const { provider, envKey } of failoverCandidates) {
      const envApiKey = c.env[envKey];
      if (envApiKey && !aiConfigs.some((cfg) => cfg.provider === provider)) {
        aiConfigs.push({ provider, apiKey: envApiKey, model: null });
      }
    }

    // Capture the exact prompt/response exchange for the collapsed debug
    // panel on the recommendations page. Contains no student PII — the
    // prompt is built from the AI-safe profile (toAISafeProfile output).
    const aiDebug = {};
    const rawSuggestions = await generateBroadSuggestionsWithFailover(
      safeProfile,
      aiConfigs,
      focusMode,
      aiDebug
    );

    // Record the call against the org's monthly bucket. Sync (await) so
    // back-to-back calls can't blow past the cap by racing the write.
    await recordAICall(db, organizationId);

    // Content moderation safety net — filters any AI output whose title or
    // reason hits the explicit-terms denylist. Caller-facing audience is
    // children aged 5-11, so we run this even for cache-bound output.
    // Rejected items are logged for telemetry but never surfaced.
    const { kept: suggestions, rejected: moderationRejected } = filterContentSafe(rawSuggestions);
    if (moderationRejected.length > 0) {
      console.warn('[content-moderation] dropped AI recommendations', {
        organizationId,
        studentId,
        provider: aiConfig.provider,
        rejected: moderationRejected.map((r) => ({ title: r.title, flags: r._flags })),
      });
    }

    // Cache the moderated suggestions only — never the raw AI output.
    // A rejected suggestion shouldn't reach a child via cache hit either.
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
      debug: {
        provider: aiDebug.provider || null,
        model: aiDebug.model || null,
        prompt: aiDebug.prompt || null,
        rawResponse: aiDebug.rawResponse || null,
        failedAttempts: aiDebug.failedAttempts || [],
      },
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
