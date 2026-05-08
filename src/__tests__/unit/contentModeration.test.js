import { describe, it, expect } from 'vitest';
import { isContentSafe, filterContentSafe } from '../../utils/contentModeration.js';

describe('isContentSafe', () => {
  it('returns safe for empty input', () => {
    expect(isContentSafe('', '')).toEqual({ safe: true, flags: [] });
    expect(isContentSafe(null, null)).toEqual({ safe: true, flags: [] });
    expect(isContentSafe(undefined, undefined)).toEqual({ safe: true, flags: [] });
  });

  it('returns safe for legitimate primary-school book recommendations', () => {
    const cases = [
      ['The Hobbit', 'A wonderful adventure for fans of fantasy.'],
      ["Charlotte's Web", 'A classic tale of friendship between a pig and a spider.'],
      [
        'The Boy in the Striped Pyjamas',
        'A powerful story about the holocaust, suitable for upper key stage 2.',
      ],
      ['Holes', 'A clever mystery with themes of injustice and friendship.'],
      [
        'Wolfie',
        'A book about a girl who finds a wolf cub. Some scenes show the wolf hunting prey.',
      ],
      [
        'The Boy at the Back of the Class',
        'A story about a refugee classmate, exploring themes of belonging.',
      ],
      ['Goodnight Mister Tom', 'A WW2-era evacuation story dealing with abuse and recovery.'],
    ];
    for (const [title, reason] of cases) {
      const result = isContentSafe(title, reason);
      expect(result.safe).toBe(true);
      expect(result.flags).toEqual([]);
    }
  });

  it('flags titles or reasons containing explicit sexual content', () => {
    const cases = [
      ['Erotic Tales', 'A collection of short stories.'],
      ['A Novel', 'Contains sexually explicit material.'],
      ['Romance', 'Has an explicit sex scene midway through.'],
      ['Some Book', 'Includes pornographic descriptions.'],
      ['50 Shades of Anything', 'Adult romance.'],
      ['Adult Novel', 'Themes of bdsm and fetishism.'],
    ];
    for (const [title, reason] of cases) {
      const result = isContentSafe(title, reason);
      expect(result.safe).toBe(false);
      expect(result.flags.length).toBeGreaterThan(0);
    }
  });

  it('flags self-harm and suicide content', () => {
    const cases = [
      ['Hard Times', 'Contains depictions of self-harm.'],
      ['A Novel', 'Explores suicidal ideation in detail.'],
      ['Memoir', 'Self harm is a central theme.'],
      ['Story', 'Has explicit cutting scenes.'],
    ];
    for (const [title, reason] of cases) {
      const result = isContentSafe(title, reason);
      expect(result.safe).toBe(false);
      expect(result.flags.length).toBeGreaterThan(0);
    }
  });

  it('flags graphic violence but not generic mentions of conflict', () => {
    const violentCases = [
      ['War Memoir', 'Contains graphic violence and torture.'],
      ['Adult Thriller', 'Extreme violence throughout.'],
      ['A Book', 'Gory descriptions of injuries.'],
    ];
    for (const [title, reason] of violentCases) {
      expect(isContentSafe(title, reason).safe).toBe(false);
    }

    // These mention war / fighting / death but are age-appropriate
    const okCases = [
      ['Private Peaceful', 'A WW1 story about brothers in the trenches.'],
      ['Letters from the Lighthouse', 'A WW2 evacuation story with bombing scenes.'],
    ];
    for (const [title, reason] of okCases) {
      expect(isContentSafe(title, reason).safe).toBe(true);
    }
  });

  it('flags drug abuse marketing terms but not awareness or education', () => {
    expect(isContentSafe('A Novel', 'About illicit drugs and gang life.').safe).toBe(false);
    expect(isContentSafe('Rehab', 'A memoir of drug abuse.').safe).toBe(false);
    expect(isContentSafe('Heroin', 'Adult title.').safe).toBe(false);

    // Education / awareness framing should not match
    expect(
      isContentSafe(
        'You Choose',
        'A picture book teaching children to make safe choices and resist peer pressure.'
      ).safe
    ).toBe(true);
  });

  it('flags adult-only marketing language', () => {
    expect(isContentSafe('A Novel', '18+ only').safe).toBe(false);
    expect(isContentSafe('A Novel', 'Adults only — not for children.').safe).toBe(false);
    expect(isContentSafe('A Novel', 'Inappropriate for children.').safe).toBe(false);
  });

  it('does not match "sex" in legitimate contexts like sex education', () => {
    expect(
      isContentSafe(
        'Where Did I Come From?',
        'A widely-used UK primary book for early-years sex education and biology.'
      ).safe
    ).toBe(true);
  });

  it('records all matched patterns in flags', () => {
    const result = isContentSafe('A Book', 'Contains erotica and self-harm scenes.');
    expect(result.safe).toBe(false);
    expect(result.flags.length).toBeGreaterThanOrEqual(2);
  });

  it('is case-insensitive', () => {
    expect(isContentSafe('EROTIC NOVEL', '').safe).toBe(false);
    expect(isContentSafe('', 'PORNOGRAPHY').safe).toBe(false);
  });
});

describe('filterContentSafe', () => {
  it('returns empty arrays for null / undefined input', () => {
    expect(filterContentSafe(null)).toEqual({ kept: [], rejected: [] });
    expect(filterContentSafe(undefined)).toEqual({ kept: [], rejected: [] });
    expect(filterContentSafe([])).toEqual({ kept: [], rejected: [] });
  });

  it('keeps only safe suggestions', () => {
    const input = [
      { title: 'The Hobbit', reason: 'A great fantasy adventure.' },
      { title: 'Erotic Tales', reason: 'Adult.' },
      { title: "Charlotte's Web", reason: 'Classic friendship.' },
    ];
    const { kept, rejected } = filterContentSafe(input);
    expect(kept).toHaveLength(2);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].title).toBe('Erotic Tales');
    expect(rejected[0]._flags.length).toBeGreaterThan(0);
  });

  it('attaches matched flags only to rejected items', () => {
    const input = [
      { title: 'Holes', reason: 'Mystery.' },
      { title: 'Bad Book', reason: 'Self harm scenes.' },
    ];
    const { kept, rejected } = filterContentSafe(input);
    expect(kept[0]._flags).toBeUndefined();
    expect(rejected[0]._flags).toBeDefined();
    expect(rejected[0]._flags.length).toBeGreaterThan(0);
  });

  it('handles malformed entries without throwing', () => {
    const input = [
      null,
      undefined,
      { title: 'A Book' }, // missing reason
      { reason: 'A reason' }, // missing title
      {}, // empty object
    ];
    const { kept, rejected } = filterContentSafe(input);
    // None contain explicit terms, so all kept
    expect(kept.length + rejected.length).toBe(input.length);
    expect(rejected).toHaveLength(0);
  });
});
