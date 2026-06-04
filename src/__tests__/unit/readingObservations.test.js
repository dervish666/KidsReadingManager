import { describe, it, expect } from 'vitest';
import {
  OBSERVATION_KEYS,
  DEFAULT_OBSERVATION_CONFIG,
  resolveObservationConfig,
  enabledObservations,
  observationLabel,
  emptyObservations,
  observationsFromSession,
} from '../../utils/readingObservations';

describe('resolveObservationConfig', () => {
  it('returns the six defaults when given nothing', () => {
    const cfg = resolveObservationConfig(null);
    expect(cfg).toHaveLength(6);
    expect(cfg.slice(0, 3).every((o) => o.enabled)).toBe(true);
    expect(cfg.slice(3).every((o) => !o.enabled)).toBe(true);
    expect(cfg[0]).toEqual({ key: 'readFluent', label: 'Fluent & confident', enabled: true });
  });

  it('merges partial overrides onto the canonical slots', () => {
    const cfg = resolveObservationConfig([
      { key: 'readPhonics', label: 'Sounding out', enabled: false },
      { key: 'readCustom1', label: 'Used expression', enabled: true },
    ]);
    expect(cfg.find((o) => o.key === 'readPhonics')).toEqual({
      key: 'readPhonics',
      label: 'Sounding out',
      enabled: false,
    });
    expect(cfg.find((o) => o.key === 'readCustom1').enabled).toBe(true);
    // Untouched built-ins keep their defaults
    expect(cfg.find((o) => o.key === 'readFluent').label).toBe('Fluent & confident');
  });

  it('trims and clamps over-long labels and ignores junk', () => {
    const cfg = resolveObservationConfig([
      { key: 'readCustom1', label: '  ' + 'x'.repeat(60) + '  ' },
      { not: 'an observation' },
      42,
    ]);
    expect(cfg.find((o) => o.key === 'readCustom1').label).toHaveLength(40);
  });

  it('always returns canonical order regardless of input order', () => {
    const cfg = resolveObservationConfig([{ key: 'readCustom3' }, { key: 'readFluent' }]);
    expect(cfg.map((o) => o.key)).toEqual(OBSERVATION_KEYS);
  });
});

describe('enabledObservations', () => {
  it('returns only enabled, labelled slots as {key,label}', () => {
    // A complete stored config (the Settings page always saves all six slots).
    const items = enabledObservations([
      { key: 'readFluent', label: 'Fluent & confident', enabled: true },
      { key: 'readExpressive', label: 'Engaging & expressive', enabled: false },
      { key: 'readPhonics', label: 'Reliant on phonics', enabled: false },
      { key: 'readCustom1', label: '', enabled: true }, // enabled but no label -> excluded
      { key: 'readCustom2', label: 'Self-corrected', enabled: true },
      { key: 'readCustom3', label: '', enabled: false },
    ]);
    expect(items).toEqual([
      { key: 'readFluent', label: 'Fluent & confident' },
      { key: 'readCustom2', label: 'Self-corrected' },
    ]);
  });

  it('defaults to the three built-ins', () => {
    expect(enabledObservations(null).map((o) => o.key)).toEqual([
      'readFluent',
      'readExpressive',
      'readPhonics',
    ]);
  });
});

describe('observationLabel', () => {
  it('uses the configured label when present', () => {
    expect(observationLabel('readPhonics', [{ key: 'readPhonics', label: 'Sounding out' }])).toBe(
      'Sounding out'
    );
  });
  it('falls back to the built-in default for a disabled/empty slot', () => {
    expect(
      observationLabel('readPhonics', [{ key: 'readPhonics', label: '', enabled: false }])
    ).toBe('Reliant on phonics');
  });
  it('returns empty string for a custom slot with no label', () => {
    expect(observationLabel('readCustom1', null)).toBe('');
  });
});

describe('emptyObservations / observationsFromSession', () => {
  it('emptyObservations has all six keys false', () => {
    const empty = emptyObservations();
    expect(Object.keys(empty)).toEqual(OBSERVATION_KEYS);
    expect(Object.values(empty).every((v) => v === false)).toBe(true);
  });
  it('observationsFromSession coerces stored values to booleans', () => {
    const obs = observationsFromSession({ readFluent: 1, readCustom2: true, readPhonics: 0 });
    expect(obs.readFluent).toBe(true);
    expect(obs.readCustom2).toBe(true);
    expect(obs.readPhonics).toBe(false);
    expect(obs.readCustom3).toBe(false);
  });
});

describe('DEFAULT_OBSERVATION_CONFIG', () => {
  it('is the three built-ins enabled and three custom slots off', () => {
    expect(DEFAULT_OBSERVATION_CONFIG).toHaveLength(6);
    expect(DEFAULT_OBSERVATION_CONFIG.filter((o) => o.enabled).map((o) => o.key)).toEqual([
      'readFluent',
      'readExpressive',
      'readPhonics',
    ]);
  });
});
