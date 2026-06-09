#!/usr/bin/env node
/**
 * One-time genre synonym merge.
 *
 * Collapses the curated synonym groups in src/utils/genreSynonyms.js into a
 * single canonical genre each, drops the over-specific subject-heading tail,
 * remaps every book's genre_ids JSON onto the survivors (de-duped, orphans
 * stripped), renames survivors to their canonical name + marks the canonical
 * set predefined, and deletes the merged/dropped rows.
 *
 * Runtime enrichment is normalised by the same map via filterGenres(); this
 * script is the one-off pass over the rows that already exist.
 *
 *   node scripts/merge-genres.mjs              # dry-run against --remote (report only)
 *   node scripts/merge-genres.mjs --execute    # apply to remote prod D1
 *   node scripts/merge-genres.mjs --local      # target the local D1 instead
 *   node scripts/merge-genres.mjs --local --execute
 *
 * Reads/writes via `wrangler d1 execute`. Idempotent: re-running after a
 * successful merge is a no-op (survivors are already canonical, nothing to map).
 */
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CANONICAL_GENRES, canonicalGenre } from '../src/utils/genreSynonyms.js';

const DB = 'reading-manager-db';
const args = new Set(process.argv.slice(2));
const TARGET = args.has('--local') ? '--local' : '--remote';
const EXECUTE = args.has('--execute');
const CHUNK = 400; // statements per applied SQL file

// The full curated canonical set — these get renamed to canonical + marked predefined.
const CURATED_LC = new Set(CANONICAL_GENRES.map((n) => n.toLowerCase()));

function sql(query) {
  const out = execSync(
    `npx wrangler d1 execute ${DB} ${TARGET} --json --command ${JSON.stringify(query)}`,
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024 }
  );
  const parsed = JSON.parse(out);
  return (Array.isArray(parsed) ? parsed[0]?.results : parsed.result?.[0]?.results) || [];
}

function applyFile(statements, label) {
  for (let i = 0; i < statements.length; i += CHUNK) {
    const slice = statements.slice(i, i + CHUNK);
    const file = join(tmpdir(), `merge-genres-${label}-${i}.sql`);
    writeFileSync(file, slice.join('\n') + '\n');
    process.stdout.write(
      `  applying ${label} ${i + 1}-${i + slice.length}/${statements.length}…\n`
    );
    execSync(`npx wrangler d1 execute ${DB} ${TARGET} --file=${JSON.stringify(file)} --yes`, {
      stdio: ['ignore', 'inherit', 'inherit'],
    });
  }
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

// --- Load ----------------------------------------------------------------
console.log(`Loading genres + books from ${TARGET}…`);
const genres = sql('SELECT id, name, is_predefined FROM genres');
const books = sql(
  "SELECT id, genre_ids FROM books WHERE genre_ids IS NOT NULL AND genre_ids NOT IN ('', '[]')"
);
const validIds = new Set(genres.map((g) => g.id));

// --- Classify each genre row --------------------------------------------
// For each canonical target, choose a survivor row (prefer exact-name match,
// else most-booked). Track which rows merge/drop/keep.
const bookCountById = {};
for (const b of books) {
  let ids;
  try {
    ids = JSON.parse(b.genre_ids);
  } catch {
    ids = [];
  }
  for (const id of ids) bookCountById[id] = (bookCountById[id] || 0) + 1;
}

const dropRows = []; // {id,name}
const byCanonical = new Map(); // canonicalName -> [{id,name}]
const keepUnclassified = []; // rows whose canonical == own name (passthrough)

for (const g of genres) {
  const canon = canonicalGenre(g.name);
  if (canon === null) {
    dropRows.push(g);
    continue;
  }
  if (!byCanonical.has(canon)) byCanonical.set(canon, []);
  byCanonical.get(canon).push(g);
  if (canon.toLowerCase() === g.name.trim().toLowerCase() && !CURATED_LC.has(canon.toLowerCase())) {
    keepUnclassified.push(g);
  }
}

// Pick survivor per canonical and build id remap.
const idRemap = new Map(); // oldId -> survivorId
const renames = []; // {id, name, predefined}
const creates = []; // {id, name} for canonicals with no existing row
const survivorIds = new Set();

for (const [canon, rows] of byCanonical) {
  const exact = rows.find((r) => r.name.trim().toLowerCase() === canon.toLowerCase());
  const survivor =
    exact ||
    rows.slice().sort((a, b) => (bookCountById[b.id] || 0) - (bookCountById[a.id] || 0))[0];
  survivorIds.add(survivor.id);
  const predefined = CURATED_LC.has(canon.toLowerCase());
  // Rename survivor to canonical display name / set predefined where needed.
  const needsRename = survivor.name !== canon;
  const needsPredef = predefined && !survivor.is_predefined;
  if (needsRename || needsPredef) renames.push({ id: survivor.id, name: canon, predefined });
  for (const r of rows) idRemap.set(r.id, survivor.id);
}

// Canonicals in the curated set with no existing row at all → create them.
for (const canon of CANONICAL_GENRES) {
  if (!byCanonical.has(canon)) {
    const id = randomUUID();
    creates.push({ id, name: canon });
    survivorIds.add(id);
  }
}

const dropIds = new Set(dropRows.map((r) => r.id));

// --- Recompute book.genre_ids -------------------------------------------
let booksChanged = 0;
let booksEmptied = 0;
let orphansStripped = 0;
const bookUpdates = []; // {id, genreIds}
for (const b of books) {
  let ids;
  try {
    ids = JSON.parse(b.genre_ids);
  } catch {
    continue;
  }
  const out = [];
  const seen = new Set();
  for (const id of ids) {
    if (dropIds.has(id)) continue;
    if (!validIds.has(id)) {
      orphansStripped++;
      continue;
    }
    const target = idRemap.get(id) || id;
    if (seen.has(target)) continue;
    seen.add(target);
    out.push(target);
  }
  const next = JSON.stringify(out);
  if (next !== b.genre_ids) {
    booksChanged++;
    if (out.length === 0) booksEmptied++;
    bookUpdates.push({ id: b.id, genreIds: next });
  }
}

const deleteIds = genres.filter((g) => !survivorIds.has(g.id)).map((g) => g.id);
const projectedGenreCount = genres.length - deleteIds.length + creates.length;

// --- Report --------------------------------------------------------------
console.log('\n================ GENRE MERGE — DRY RUN REPORT ================');
console.log(`Genres now:            ${genres.length}`);
console.log(`Genres after merge:    ${projectedGenreCount}`);
console.log(`  survivors kept:      ${survivorIds.size - creates.length}`);
console.log(
  `  created (missing):   ${creates.length}${creates.length ? ' → ' + creates.map((c) => c.name).join(', ') : ''}`
);
console.log(`  renamed/predefined:  ${renames.length}`);
console.log(
  `  merged away:         ${genres.length - dropRows.length - (survivorIds.size - creates.length)}`
);
console.log(`  dropped (junk):      ${dropRows.length}`);
console.log(`Books with genres:     ${books.length}`);
console.log(`  books updated:       ${booksChanged}`);
console.log(`  books left genreless:${booksEmptied}`);
console.log(`  orphan ids stripped: ${orphansStripped}`);

console.log('\n--- Canonical genres (survivor ← merged sources) ---');
const canonList = [...byCanonical.entries()]
  .filter(([c]) => CURATED_LC.has(c.toLowerCase()))
  .sort((a, b) => a[0].localeCompare(b[0]));
for (const [canon, rows] of canonList) {
  const total = rows.reduce((s, r) => s + (bookCountById[r.id] || 0), 0);
  const sources = rows
    .filter((r) => r.name !== canon)
    .map((r) => r.name)
    .sort();
  console.log(`  ${canon} (${total})${sources.length ? '  ← ' + sources.join(', ') : ''}`);
}

console.log('\n--- DROPPED rows (deleted, removed from books) ---');
console.log(
  '  ' +
    dropRows
      .map((r) => `${r.name} (${bookCountById[r.id] || 0})`)
      .sort()
      .join('\n  ')
);

if (keepUnclassified.length) {
  console.log('\n--- KEPT UNCLASSIFIED (passthrough — not merged, not dropped) ---');
  console.log(
    '  ' +
      keepUnclassified
        .map((r) => `${r.name} (${bookCountById[r.id] || 0})`)
        .sort()
        .join('\n  ')
  );
}

if (!EXECUTE) {
  console.log('\nDry run only. Re-run with --execute to apply.');
  process.exit(0);
}

// --- Execute -------------------------------------------------------------
console.log('\n================ EXECUTING ================');

const createStmts = creates.map(
  (c) => `INSERT INTO genres (id, name, is_predefined) VALUES (${q(c.id)}, ${q(c.name)}, 1);`
);
const renameStmts = renames.map(
  (r) =>
    `UPDATE genres SET name = ${q(r.name)}${r.predefined ? ', is_predefined = 1' : ''} WHERE id = ${q(r.id)};`
);
const bookStmts = bookUpdates.map(
  (b) => `UPDATE books SET genre_ids = ${q(b.genreIds)} WHERE id = ${q(b.id)};`
);
const deleteStmts = [];
for (let i = 0; i < deleteIds.length; i += 50) {
  const ids = deleteIds
    .slice(i, i + 50)
    .map(q)
    .join(', ');
  deleteStmts.push(`DELETE FROM genres WHERE id IN (${ids});`);
}

// Order: create + rename survivors first (so books point at named survivors),
// then remap books, then delete merged/dropped rows.
applyFile([...createStmts, ...renameStmts], 'genres-rename');
applyFile(bookStmts, 'books');
applyFile(deleteStmts, 'genres-delete');

console.log('\nDone. Verifying…');
const after = sql('SELECT COUNT(*) AS n FROM genres');
console.log(`Genres now in ${TARGET}: ${after[0]?.n}`);
