/**
 * @vitest-environment node
 */
import { describe, it, expect, vi } from 'vitest';
import {
  usernameFromName,
  normaliseUsername,
  isValidUsername,
  looksLikeEmail,
  placeholderEmailFor,
  isPlaceholderEmail,
  allocateUsername,
  USERNAME_MAX_LENGTH,
} from '../../utils/username.js';

describe('usernameFromName', () => {
  it('builds firstname.lastname', () => {
    expect(usernameFromName('Sarah Jones')).toBe('sarah.jones');
  });

  it('drops middle names — schools ask for two parts', () => {
    expect(usernameFromName('Anna Marie Patel')).toBe('anna.patel');
  });

  it('keeps a double-barrelled surname joined by its hyphen', () => {
    expect(usernameFromName("Mary-Anne O'Brien")).toBe('mary-anne.obrien');
  });

  it('folds accents rather than dropping the letters', () => {
    expect(usernameFromName('José Núñez')).toBe('jose.nunez');
  });

  it('handles a single-word name', () => {
    expect(usernameFromName('Cher')).toBe('cher');
  });

  it('returns empty for a name with no Latin characters, so the caller must ask', () => {
    expect(usernameFromName('李雷')).toBe('');
    expect(usernameFromName('   ')).toBe('');
    expect(usernameFromName(null)).toBe('');
  });

  it('never exceeds the column budget', () => {
    const long = usernameFromName(`${'a'.repeat(60)} ${'b'.repeat(60)}`);
    expect(long.length).toBeLessThanOrEqual(USERNAME_MAX_LENGTH);
    expect(isValidUsername(long)).toBe(true);
  });
});

describe('normaliseUsername', () => {
  it('lowercases and trims what an admin typed', () => {
    expect(normaliseUsername('  Sarah.Jones  ')).toBe('sarah.jones');
  });

  it('strips characters that would make the username untypable at the login box', () => {
    expect(normaliseUsername('sarah jones!')).toBe('sarahjones');
    expect(normaliseUsername('sarah@jones')).toBe('sarahjones');
  });

  it('drops a trailing dot', () => {
    expect(normaliseUsername('sarah.')).toBe('sarah');
  });
});

describe('isValidUsername', () => {
  it.each(['sarah.jones', 'j.doe2', 'mary-anne.obrien', 'abc'])('accepts %s', (v) => {
    expect(isValidUsername(v)).toBe(true);
  });

  it.each(['', 'ab', '.sarah', 'sarah.', '-sarah', 'Sarah.Jones', 'sarah jones', 'a@b.c'])(
    'rejects %s',
    (v) => {
      expect(isValidUsername(v)).toBe(false);
    }
  );
});

describe('looksLikeEmail', () => {
  it('treats anything with an @ as an email and everything else as a username', () => {
    expect(looksLikeEmail('a@b.c')).toBe(true);
    expect(looksLikeEmail('sarah.jones')).toBe(false);
  });
});

describe('placeholder addresses', () => {
  it('round-trips', () => {
    const email = placeholderEmailFor('sarah.jones');
    expect(email).toBe('sarah.jones@no-email.invalid');
    expect(isPlaceholderEmail(email)).toBe(true);
  });

  it('does not flag a real address', () => {
    expect(isPlaceholderEmail('sarah@school.sch.uk')).toBe(false);
    expect(isPlaceholderEmail(null)).toBe(false);
  });
});

describe('allocateUsername', () => {
  const dbReturning = (takenSet) => ({
    prepare: vi.fn(() => ({
      bind: vi.fn(function (value) {
        this._value = value;
        return this;
      }),
      first: vi.fn(function () {
        return Promise.resolve(takenSet.has(this._value) ? { id: 'x' } : null);
      }),
    })),
  });

  it('returns the base when it is free', async () => {
    expect(await allocateUsername(dbReturning(new Set()), 'sarah.jones')).toBe('sarah.jones');
  });

  it('suffixes on collision', async () => {
    const db = dbReturning(new Set(['sarah.jones', 'sarah.jones2']));
    expect(await allocateUsername(db, 'sarah.jones')).toBe('sarah.jones3');
  });

  it('checks inactive rows too — a deactivated account keeps its username', async () => {
    const db = dbReturning(new Set(['sarah.jones']));
    const sql = [];
    const orig = db.prepare;
    db.prepare = vi.fn((q) => {
      sql.push(q);
      return orig(q);
    });
    await allocateUsername(db, 'sarah.jones');
    expect(sql[0]).not.toContain('is_active');
  });

  it('refuses an invalid base rather than writing an unusable username', async () => {
    await expect(allocateUsername(dbReturning(new Set()), '')).rejects.toThrow(/invalid base/);
  });

  it('gives up loudly rather than looping forever', async () => {
    const everything = { has: () => true };
    await expect(allocateUsername(dbReturning(everything), 'sarah.jones')).rejects.toThrow(
      /Could not allocate/
    );
  });
});
