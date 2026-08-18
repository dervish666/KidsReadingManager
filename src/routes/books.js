/**
 * Books entry router.
 *
 * The book surface area is split across files in `src/routes/books/` —
 * core CRUD (`core.js`), recommendations (`recommendations.js`), ISBN lookup
 * and scanning (`isbn.js`), CSV import (`import.js`) and duplicate detection
 * (`duplicates.js`). This file only composes them.
 *
 * Order of mounting matters: the sub-routers carry literal paths
 * (`/library-search`, `/ai-suggestions`, `/isbn/:isbn`, `/scan`,
 * `/search-external`, `/bulk`, `/import/*`) that need to be matched before
 * core's bare `/:id` handlers. Hono's trie prefers static routes over params,
 * but mounting them first keeps the precedence explicit and trivially
 * auditable.
 */

import { Hono } from 'hono';

import { recommendationsRouter } from './books/recommendations.js';
import { isbnRouter } from './books/isbn.js';
import { importRouter } from './books/import.js';
import { duplicatesRouter } from './books/duplicates.js';
import { coreRouter } from './books/core.js';

const booksRouter = new Hono();

booksRouter.route('/', recommendationsRouter);
booksRouter.route('/', isbnRouter);
booksRouter.route('/', importRouter);
booksRouter.route('/', duplicatesRouter);
booksRouter.route('/', coreRouter);

export { booksRouter };
