/**
 * Usernames for manually created staff accounts.
 *
 * Schools that cannot complete a Wonde/MyLogin approval get their staff set up
 * by hand, and many of those staff have no school email address. Those accounts
 * sign in with `firstname.lastname` instead.
 *
 * Usernames are globally unique (partial unique index, migration 0077) because
 * the login form asks for one identifier and nothing else — there is no school
 * picker to disambiguate `john.smith` at two schools. Collisions get a numeric
 * suffix, which is what a school office would do anyway.
 */

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 40;

/** Placeholder domain for accounts with no real email. Mirrors the MyLogin one. */
export const NO_EMAIL_DOMAIN = 'no-email.invalid';

const ACCENTS = {
  á: 'a',
  à: 'a',
  â: 'a',
  ä: 'a',
  ã: 'a',
  å: 'a',
  ā: 'a',
  é: 'e',
  è: 'e',
  ê: 'e',
  ë: 'e',
  ē: 'e',
  í: 'i',
  ì: 'i',
  î: 'i',
  ï: 'i',
  ī: 'i',
  ó: 'o',
  ò: 'o',
  ô: 'o',
  ö: 'o',
  õ: 'o',
  ø: 'o',
  ō: 'o',
  ú: 'u',
  ù: 'u',
  û: 'u',
  ü: 'u',
  ū: 'u',
  ñ: 'n',
  ç: 'c',
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ý: 'y',
  ÿ: 'y',
};

/** Fold accents and drop anything that is not a letter, digit or hyphen. */
function foldToken(token) {
  return token
    .toLowerCase()
    .split('')
    .map((ch) => ACCENTS[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Turn a display name into a `firstname.lastname` username candidate.
 * Middle names are dropped — schools ask for two parts, not four.
 * Returns '' when the name has no usable characters (e.g. non-Latin script);
 * callers must handle that rather than writing an empty username.
 */
export function usernameFromName(name) {
  if (!name || typeof name !== 'string') return '';

  const tokens = name.trim().split(/\s+/).map(foldToken).filter(Boolean);

  if (tokens.length === 0) return '';

  const parts = tokens.length === 1 ? [tokens[0]] : [tokens[0], tokens[tokens.length - 1]];
  return parts
    .join('.')
    .slice(0, USERNAME_MAX_LENGTH)
    .replace(/[.-]+$/, '');
}

/**
 * Normalise a username the admin typed. Same character set as the generated
 * form, so a hand-typed one cannot become unreachable at the login box.
 */
export function normaliseUsername(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .trim()
    .toLowerCase()
    .split('.')
    .map(foldToken)
    .filter(Boolean)
    .join('.')
    .slice(0, USERNAME_MAX_LENGTH)
    .replace(/[.-]+$/, '');
}

export function isValidUsername(value) {
  return (
    typeof value === 'string' &&
    value.length >= USERNAME_MIN_LENGTH &&
    value.length <= USERNAME_MAX_LENGTH &&
    /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(value)
  );
}

/**
 * An identifier typed at the login box is an email if it has an `@`.
 * Anything else is treated as a username — deliberately loose, because a
 * mistyped email should fail as "no such account", not as "invalid format".
 */
export function looksLikeEmail(identifier) {
  return typeof identifier === 'string' && identifier.includes('@');
}

/** The placeholder address stored in `users.email` when there is no real one. */
export function placeholderEmailFor(username) {
  return `${username}@${NO_EMAIL_DOMAIN}`;
}

/** True when this address is a placeholder, so nothing should be emailed to it. */
export function isPlaceholderEmail(email) {
  return typeof email === 'string' && email.toLowerCase().endsWith(`@${NO_EMAIL_DOMAIN}`);
}

/**
 * Find a free username, suffixing `2`, `3`, … on collision.
 * Checks active and inactive rows: a deactivated account keeps its username,
 * so reusing it would collide on the unique index.
 */
export async function allocateUsername(db, base, { maxAttempts = 50 } = {}) {
  if (!isValidUsername(base)) {
    throw new Error(`Cannot allocate username from invalid base: ${base}`);
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const suffix = attempt === 0 ? '' : String(attempt + 1);
    const candidate = base.slice(0, USERNAME_MAX_LENGTH - suffix.length) + suffix;

    const clash = await db
      .prepare('SELECT id FROM users WHERE username = ?')
      .bind(candidate)
      .first();

    if (!clash) return candidate;
  }

  throw new Error(`Could not allocate a username for "${base}" after ${maxAttempts} attempts`);
}
