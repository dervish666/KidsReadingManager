/**
 * Genre synonym → canonical map.
 *
 * The junk filter (genreFilter.js) keeps catalog garbage *out*, but it doesn't
 * collapse the many near-duplicate genres that providers legitimately return:
 * "Childrens" / "Children's stories" / "Juvenile Fiction" all mean the same
 * thing, "Humor" / "Humorous stories" / "Comedy" all mean the same thing, and
 * so on. Left alone they fragment the books-page dropdown into ~200 entries.
 *
 * This module is the curated taxonomy. It does two things:
 *   1. MERGE — maps each known synonym onto a single canonical genre name.
 *   2. DROP  — removes over-specific library subject-headings that survived the
 *      junk filter but aren't useful reading genres (place names, character
 *      names, "Women household employees", foreign-language sentinels, etc.).
 *
 * Philosophy is deliberately "moderate": clear synonyms collapse and obvious
 * junk is dropped, but recognisable mid-level tags (Pirates, Dragons, War,
 * Survival…) are kept distinct rather than folded into a tiny core. Unknown
 * names that are neither a known synonym nor a known drop pass through
 * unchanged, so genuinely new genres still appear — they just don't reintroduce
 * a spelling variant of something we already have.
 *
 * Used in two places, off the same data:
 *   - filterGenres() (runtime chokepoint) so enrichment can't regrow synonyms.
 *   - scripts/merge-genres.mjs (one-time) to collapse the existing prod rows.
 */

/**
 * Canonical genre → list of source names (case-insensitive) that merge into it.
 * The canonical key is the FINAL display name. Any existing genre whose name
 * appears in a list (including a different-cased/spelled version of the
 * canonical itself, e.g. "Humor" → "Humour") is redirected to the canonical.
 */
const GENRE_MERGES = {
  Fiction: ['Novels', 'Stories', 'English fiction'],
  "Children's Fiction": [
    'Childrens',
    "Children's stories",
    "Children's fiction",
    'Juvenile Fiction',
    'Juvenile literature',
    "Children's literature",
    'Child and youth fiction',
    "Children's stories, English",
    "Children's stories, New Zealand",
    'Kids',
    'Children',
    'Juvenile',
    'Ficción juvenil',
    'Kinderbuch ab 8 Jahren',
  ],
  'Non-Fiction': ['Nonfiction', 'Juvenile Nonfiction'],
  'Picture Books': [
    'Picture books',
    'Picture books for children',
    'Pictorial works',
    'Storytime',
    'Stories in rhyme',
    'Counting',
  ],
  'Early Readers': [
    'Readers',
    'Readers (Elementary)',
    'Readers (Primary)',
    'Beginner reader',
    '1st Grade',
    'Reading (elementary)',
    'Reading',
    'English language reading schemes',
  ],
  'Animal Stories': [
    'Animals',
    'Animal stories',
    'Animals, fiction',
    'Animals, juvenile literature',
    'Cats',
    'Dogs',
    'Dogs, fiction',
    'Horses',
    'Bears',
    'Mice',
    'Owls',
    'Barn owl',
    'Penguins',
    'Ducks',
    'Birds',
    'Alligators',
    'Elephants, fiction',
    'Bulls',
    'Fighting bull',
    'Teddy bears',
  ],
  Humour: ['Humor', 'Humorous stories', 'Comedy', 'Comic'],
  'Graphic Novels': ['Graphic novels', 'Comics', 'Comics & Graphic Novels'],
  'Historical Fiction': ['Historical'],
  'Science Fiction': ['Science fiction', 'Aliens', 'Space', 'Time travel', 'Life on other planets'],
  Family: ['Families', 'Family life', 'Brothers and sisters', 'Brothers', 'Grandparent and child'],
  Friendship: ['Friendship, fiction'],
  War: ['World War II', 'World War, 1939-1945'],
  History: ['Vikings', 'Celts'],
  'Realistic Fiction': ['Contemporary'],
  School: ['School stories', 'Schools', 'Boarding School', 'Boarding schools'],
  'Short Stories': ['Short stories', 'Collections'],
  Biography: ['Biography & Autobiography', 'Great britain, biography'],
  Crime: ['Thriller', 'Espionage'],
  Mystery: ['Child detectives'],
  Romance: ['Love'],
  Fantasy: ['Fantasy fiction', 'Animals, Mythical', 'Giants'],
  Mythology: ['Folklore'],
  'Fairy Tales': ['Fairy tales'],
  Science: ['Physics', 'Astronomy', 'Human body', 'Earth'],
  Education: ['Teaching', 'Mathematics'],
  Art: ['Architecture'],
  Behaviour: ['Behavior', 'Conduct of life'],
  Sports: ['Soccer', 'Soccer players', 'Soccer stories', 'Soccer, fiction'],
  Plays: ['Drama'],
  Horror: ['Ghosts'],
  Dinosaurs: ['Dinosaurs, fiction'],
  Monsters: ['Monsters, fiction'],
  Nature: ['Endangered species'],
  Adventure: [
    'Adventure stories',
    'Adventure and adventurers',
    'Adventure and adventurers, fiction',
    'Action',
    'Camping',
  ],
  Classics: ['Beowulf'],
};

/**
 * Names to delete outright: over-specific library subject-headings, place
 * names, character names, language/format sentinels, and one-off themes too
 * granular to be a genre. Books lose the tag (it is removed from genre_ids).
 */
const GENRE_DROP = [
  'Boys',
  'Africa',
  'English language, juvenile literature',
  'Great Britain',
  'Cultural',
  'Welsh language',
  'Orphans',
  'Australia',
  'English',
  'Harry Potter',
  'London (England)',
  'Tom (Fictitious character : Blade)',
  'Elenna (Fictitious character : Blade)',
  'Dirty Bertie (Fictitious character)',
  'Child labor',
  'Chimney sweeps',
  'Food',
  'Pizza',
  'Holiday',
  'Halloween',
  'Birthdays',
  'Miscellanea',
  'Water',
  'Women household employees',
  'Air travel',
  'Anxiety',
  'Benefactors',
  'Books and reading',
  'Brigands and robbers',
  'China',
  'Cleaning',
  'Cleanliness',
  'Clothing and dress',
  'Defensive (Military science)',
  'Dwellings',
  'Egypt',
  'England',
  'English language',
  'Feminism',
  'France',
  'India',
  'Junge',
  'Language Arts & Disciplines',
  'Language and languages',
  'Motor vehicles',
  'Open Library Staff Picks',
  'Schwert',
  'Social life and customs',
  'Spain Civil War, 1936-1939',
  'Spanish language materials',
  'Wishes',
  "Children's songs",
  'Night, fiction',
];

/**
 * Canonical genres that stand on their own (no synonyms merge into them) but
 * are part of the curated keep-set. Listed so the one-time migration can mark
 * the full canonical set as predefined/stable. Canonicals that DO absorb
 * synonyms are the keys of GENRE_MERGES.
 */
const CANONICAL_STANDALONE = [
  'Middle Grade',
  'Young Adult',
  'Chapter Books',
  'Poetry',
  'Magic',
  'Dragons',
  'Witches',
  'Pirates',
  'Steampunk',
  'Dystopia',
  'Bullying',
  'Christmas',
  'LGBT',
  'Paranormal',
  'Survival',
  'Geography',
  'Shakespeare',
];

/** Full ordered list of canonical genres this taxonomy produces. */
const CANONICAL_GENRES = [...Object.keys(GENRE_MERGES), ...CANONICAL_STANDALONE];

// --- Lookups (built once) -------------------------------------------------

// lowercased synonym → canonical display name
const MERGE_REVERSE = new Map();
for (const [canonical, synonyms] of Object.entries(GENRE_MERGES)) {
  for (const syn of synonyms) {
    MERGE_REVERSE.set(syn.trim().toLowerCase(), canonical);
  }
}

// lowercased canonical name → canonical display name (identity, proper case)
const CANONICAL_LC = new Map();
for (const canonical of CANONICAL_GENRES) {
  CANONICAL_LC.set(canonical.trim().toLowerCase(), canonical);
}

// lowercased names to drop
const DROP_SET = new Set(GENRE_DROP.map((n) => n.trim().toLowerCase()));

/**
 * Map a genre name to its canonical form.
 * @param {unknown} name
 * @returns {string|null} canonical display name, the trimmed name itself if
 *   unknown (passthrough), or null if the name should be dropped.
 */
function canonicalGenre(name) {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  const key = trimmed.toLowerCase();
  if (DROP_SET.has(key)) return null;
  if (MERGE_REVERSE.has(key)) return MERGE_REVERSE.get(key);
  if (CANONICAL_LC.has(key)) return CANONICAL_LC.get(key);
  return trimmed;
}

export { GENRE_MERGES, GENRE_DROP, CANONICAL_STANDALONE, CANONICAL_GENRES, canonicalGenre };
