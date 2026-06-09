#!/usr/bin/env node
/**
 * reading-news-stats.mjs — pull the most-read books & authors across ALL
 * schools from D1, for the `reading-news` skill (the weekly newsletter).
 *
 * Aggregate-only: "popular authors across Tally schools" is product analytics,
 * NOT personal data — no org/student/child rows ever leave the database, only
 * book titles, authors, read counts, and average star ratings. This is what
 * makes the generic newsletter safe to publish.
 *
 * Usage:
 *   node scripts/reading-news-stats.mjs              # remote (prod), top 12
 *   node scripts/reading-news-stats.mjs --limit 8    # top 8
 *   node scripts/reading-news-stats.mjs --local      # local D1
 *
 * Output (stdout): JSON
 *   { generatedAt, totalReads, topAuthors:[{author,reads,avgRating,books:[…]}], topBooks:[…] }
 *
 * Read-only (single SELECT). Requires wrangler auth for --remote (same as
 * migrations / merge-genres.mjs).
 */
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const remoteFlag = args.includes('--local') ? '--local' : '--remote';
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 ? Math.max(1, Number(args[limitIdx + 1]) || 12) : 12;

// One pass over linked, non-marker reading sessions, grouped by book.
// `[ABSENT]`/`[NO_RECORD]` markers aren't reads (matches the app's stats).
const SQL = `
SELECT b.author AS author, b.title AS title,
       COUNT(*) AS reads,
       SUM(CASE WHEN rs.rating IS NOT NULL THEN rs.rating ELSE 0 END) AS rating_sum,
       SUM(CASE WHEN rs.rating IS NOT NULL THEN 1 ELSE 0 END) AS rating_n
FROM reading_sessions rs
JOIN books b ON rs.book_id = b.id
WHERE b.author IS NOT NULL AND TRIM(b.author) <> ''
  AND b.title IS NOT NULL
  AND (rs.notes IS NULL OR (rs.notes NOT LIKE '%[ABSENT]%' AND rs.notes NOT LIKE '%[NO_RECORD]%'))
GROUP BY b.author, b.title
ORDER BY reads DESC
LIMIT 600;
`.trim();

function runQuery() {
  let out;
  try {
    out = execFileSync(
      'npx',
      ['wrangler', 'd1', 'execute', 'reading-manager-db', remoteFlag, '--json', '--command', SQL],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    );
  } catch (e) {
    process.stderr.write(`wrangler d1 execute failed:\n${e.stderr || e.message}\n`);
    process.exit(1);
  }
  // wrangler --json emits a JSON array of result sets; slice from the first
  // bracket in case a banner precedes it on some versions.
  const start = out.indexOf('[');
  if (start === -1) {
    process.stderr.write(`Unexpected wrangler output (no JSON array):\n${out.slice(0, 500)}\n`);
    process.exit(1);
  }
  const parsed = JSON.parse(out.slice(start));
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  return first?.results || [];
}

const rows = runQuery();

const byAuthor = new Map();
let totalReads = 0;
for (const r of rows) {
  totalReads += r.reads || 0;
  const a = byAuthor.get(r.author) || {
    author: r.author,
    reads: 0,
    ratingSum: 0,
    ratingN: 0,
    books: [],
  };
  a.reads += r.reads || 0;
  a.ratingSum += r.rating_sum || 0;
  a.ratingN += r.rating_n || 0;
  a.books.push({ title: r.title, reads: r.reads || 0 });
  byAuthor.set(r.author, a);
}

const round1 = (n) => Math.round(n * 10) / 10;

const topAuthors = [...byAuthor.values()]
  .sort((x, y) => y.reads - x.reads)
  .slice(0, limit)
  .map((a) => ({
    author: a.author,
    reads: a.reads,
    avgRating: a.ratingN ? round1(a.ratingSum / a.ratingN) : null,
    books: a.books
      .sort((x, y) => y.reads - x.reads)
      .slice(0, 5)
      .map((b) => b.title),
  }));

const topBooks = rows
  .slice()
  .sort((x, y) => y.reads - x.reads)
  .slice(0, limit)
  .map((r) => ({
    title: r.title,
    author: r.author,
    reads: r.reads,
    avgRating: r.rating_n ? round1(r.rating_sum / r.rating_n) : null,
  }));

process.stdout.write(
  JSON.stringify(
    { generatedAt: new Date().toISOString().slice(0, 10), totalReads, topAuthors, topBooks },
    null,
    2
  ) + '\n'
);
