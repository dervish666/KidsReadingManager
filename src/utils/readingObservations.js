/**
 * Reading observations ("how did they read today?") — shared definitions.
 *
 * Single source of truth for both the worker and the React app. There are six
 * fixed storage slots on a reading session: three built-in defaults plus three
 * custom slots. Each slot maps a camelCase API key to a snake_case DB column.
 *
 * Which slots a school actually uses — and what each is called — is configured
 * per organization via the `readingObservations` org setting (an array of
 * { key, label, enabled }). When that setting is absent we fall back to the
 * three built-ins below. The session columns only ever store the 0/1 ticks;
 * labels/enabled state are purely a configuration concern, so renaming or
 * disabling a slot never rewrites historical session data.
 */

export const OBSERVATION_SLOTS = [
  {
    key: 'readFluent',
    column: 'read_fluent',
    defaultLabel: 'Fluent & confident',
    defaultEnabled: true,
  },
  {
    key: 'readExpressive',
    column: 'read_expressive',
    defaultLabel: 'Engaging & expressive',
    defaultEnabled: true,
  },
  {
    key: 'readPhonics',
    column: 'read_phonics',
    defaultLabel: 'Reliant on phonics',
    defaultEnabled: true,
  },
  { key: 'readCustom1', column: 'read_custom1', defaultLabel: '', defaultEnabled: false },
  { key: 'readCustom2', column: 'read_custom2', defaultLabel: '', defaultEnabled: false },
  { key: 'readCustom3', column: 'read_custom3', defaultLabel: '', defaultEnabled: false },
];

/** All six camelCase observation keys, in canonical order. */
export const OBSERVATION_KEYS = OBSERVATION_SLOTS.map((s) => s.key);

/** Max length of a (custom) observation label. */
export const MAX_OBSERVATION_LABEL = 40;

/** The default per-org config: the three built-ins on, three custom slots off. */
export const DEFAULT_OBSERVATION_CONFIG = OBSERVATION_SLOTS.map((s) => ({
  key: s.key,
  label: s.defaultLabel,
  enabled: s.defaultEnabled,
}));

/**
 * Normalise a stored org config onto the canonical six slots. Tolerant of
 * partial, reordered, or malformed input — always returns exactly six
 * well-formed { key, label, enabled } slots in canonical order.
 */
export function resolveObservationConfig(stored) {
  const byKey = new Map();
  if (Array.isArray(stored)) {
    for (const item of stored) {
      if (item && typeof item === 'object' && typeof item.key === 'string') {
        byKey.set(item.key, item);
      }
    }
  }
  return OBSERVATION_SLOTS.map((slot) => {
    const o = byKey.get(slot.key);
    const label =
      o && typeof o.label === 'string'
        ? o.label.trim().slice(0, MAX_OBSERVATION_LABEL)
        : slot.defaultLabel;
    const enabled = o && o.enabled !== undefined ? !!o.enabled : slot.defaultEnabled;
    return { key: slot.key, label, enabled };
  });
}

/**
 * The slots a teacher actually sees on the capture / edit form: enabled and
 * with a non-empty label. Returns [{ key, label }].
 */
export function enabledObservations(stored) {
  return resolveObservationConfig(stored)
    .filter((o) => o.enabled && o.label)
    .map((o) => ({ key: o.key, label: o.label }));
}

/**
 * Resolve the display label for a single observation key. Uses the configured
 * label if present, otherwise the built-in default — so an observation recorded
 * on a past session still renders even if its slot was later disabled.
 */
export function observationLabel(key, stored) {
  const found = resolveObservationConfig(stored).find((o) => o.key === key);
  if (found && found.label) return found.label;
  const slot = OBSERVATION_SLOTS.find((s) => s.key === key);
  return slot ? slot.defaultLabel : '';
}

/** Empty observation state — all six slots unticked. */
export function emptyObservations() {
  const out = {};
  for (const key of OBSERVATION_KEYS) out[key] = false;
  return out;
}

/** Pull the six observation fields out of a session object as booleans. */
export function observationsFromSession(session = {}) {
  const out = {};
  for (const key of OBSERVATION_KEYS) out[key] = !!session[key];
  return out;
}
