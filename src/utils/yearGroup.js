/**
 * UK year-group parsing helpers.
 *
 * Year-group data reaches Tally in several inconsistent shapes — Wonde's
 * `current_nc_year` ("R", "2", "N1"), demo data ("Year 2"), the badge
 * key-stage map ("Y2"), and (when a MIS syncs no education data at all) only
 * the class/registration-group name ("5D", "RF"). These pure helpers normalise
 * all of those into the two things the app needs: a coarse age band (for
 * age-appropriate recommendations) and a key stage (for badge thresholds).
 *
 * Shared by studentProfile.js (recommendations) and badgeDefinitions.js
 * (key stage) so both interpret the data identically.
 */

/**
 * Map a UK year group to a coarse, approximate age band.
 *
 * Returns a coarse two-year band ({ min, max }) — never an exact age. A child
 * in Year N is age (N+4) at the September start of the school year and turns
 * (N+5) during it, so the band is [N+4, N+5]. This band is the ONLY age signal
 * that crosses the AI boundary (see toAISafeProfile): it's the granularity
 * needed to keep recommended content age-appropriate, without exposing DOB,
 * exact age, or the raw year group.
 *
 * @param {string|number|null} yearGroup
 * @returns {{min: number, max: number}|null} Age band, or null if unparseable
 */
export function yearGroupToAgeBand(yearGroup) {
  if (yearGroup == null) return null;
  const raw = String(yearGroup).trim().toLowerCase();
  if (!raw) return null;

  // Nursery (Wonde "N1"/"N2", or "nursery")
  if (raw.includes('nursery') || /^n\d*$/.test(raw)) {
    return { min: 3, max: 4 };
  }

  // Reception (Wonde "R", or "YR"/"reception")
  if (raw.includes('reception') || raw === 'r' || raw === 'yr') {
    return { min: 4, max: 5 };
  }

  // Numeric school year — pull the first integer from "2", "Year 2", "Y2", "yr 2"
  const match = raw.match(/\d+/);
  if (!match) return null;
  const year = parseInt(match[0], 10);
  if (!Number.isInteger(year) || year < 0 || year > 13) return null;
  if (year === 0) return { min: 4, max: 5 }; // Reception expressed as Year 0

  return { min: year + 4, max: year + 5 };
}

/**
 * Best-effort UK year group from a class / registration-group name.
 *
 * Some Wonde connections (registration-groups schools) return no education
 * data, leaving `students.year_group` empty — but the class name usually
 * encodes the year: "5D" → "5", "6A" → "6", "RF"/"RJM" → "R" (Reception).
 * Tree/colour-named classes ("Willow", "Cherry") carry no year and return
 * null. Output is a year-group token suitable for yearGroupToAgeBand() /
 * yearGroupToKeyStage(); this is only ever a fallback when the real year
 * group is missing.
 *
 * @param {string|null} className
 * @returns {string|null} Year-group token ("5", "R", …), or null if not derivable
 */
export function classNameToYearGroup(className) {
  if (className == null) return null;
  const raw = String(className).trim().toLowerCase();
  if (!raw) return null;

  // Leading school-year number, optionally "y"/"year" prefixed: "5d", "y5", "year 5"
  const yearMatch = raw.match(/^(?:year\s*|y)?(\d{1,2})/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    if (year >= 1 && year <= 13) return String(year);
    if (year === 0) return 'R'; // Reception expressed as "0…"
    return null;
  }

  // Reception registration groups: "rf", "rjm", "r" (leading R, then only letters)
  if (/^r[a-z]*$/.test(raw)) return 'R';

  return null;
}

/**
 * Resolve a UK year group to a badge key stage: 'KS1' | 'LowerKS2' | 'UpperKS2'.
 *
 * Robust to every year-group shape (via yearGroupToAgeBand): "Year 2", "2",
 * "Y2", "R"/"Reception" all resolve correctly. Falls back to 'LowerKS2' (the
 * historical default) when the value is missing or unparseable. Callers should
 * coalesce a missing year group with classNameToYearGroup(className) before
 * calling, so registration-groups schools (empty year_group) still resolve.
 *
 *   Reception, Y1, Y2 (+ nursery) → KS1
 *   Y3, Y4                        → LowerKS2
 *   Y5, Y6 (+ beyond)             → UpperKS2
 *
 * @param {string|number|null} yearGroup
 * @returns {'KS1'|'LowerKS2'|'UpperKS2'}
 */
export function yearGroupToKeyStage(yearGroup) {
  const band = yearGroupToAgeBand(yearGroup);
  if (!band) return 'LowerKS2';
  const year = band.min - 4; // band is [year+4, year+5]; Reception/nursery → ≤0
  if (year <= 2) return 'KS1';
  if (year <= 4) return 'LowerKS2';
  return 'UpperKS2';
}
