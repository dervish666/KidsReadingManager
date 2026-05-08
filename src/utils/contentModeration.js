/**
 * Content moderation for AI-generated book recommendations.
 *
 * Tally serves UK primary-school children aged 5–11. AI-generated book
 * recommendations are surfaced directly to that audience via the teacher
 * UI, with no human review step between the LLM and the child. This
 * module is the safety net that runs between `generateBroadSuggestions`
 * and the response — a conservative term denylist that rejects any
 * recommendation whose title or reason contains explicit, mature, or
 * otherwise age-inappropriate language.
 *
 * Conservative by design: a false positive (rejecting a legitimate
 * recommendation) is recoverable — the user can request another. A
 * false negative (an unsuitable recommendation reaching a 7-year-old)
 * is not. Patterns are tuned to require unambiguous markers, never
 * single ambiguous words like "sex" or "violence" in isolation that
 * would catch legitimate education / history / pastoral content.
 *
 * The denylist deliberately complements rather than replaces:
 *   1. The system-prompt framing in aiService.js ("UK primary school,
 *      ages 5-11, avoid mature themes")
 *   2. The library-match cross-check in recommendations.js (school-
 *      curated books are inherently safer than open-ended AI output)
 */

const EXPLICIT_TERM_PATTERNS = [
  // Sexual content
  /\berotic(?:a|ally|ism)?\b/i,
  /\bsexually explicit\b/i,
  /\bexplicit sex(?:ual)?\b/i,
  /\bsex scene\b/i,
  /\bsex acts?\b/i,
  /\bporn(?:o(?:graphy|graphic)?)?\b/i,
  /\b50 shades\b/i,
  /\bbdsm\b/i,
  /\bfetish(?:es|istic|ism)?\b/i,
  /\bnudity\b/i,
  /\bmasturbat/i,

  // Extreme violence / harm
  /\bgraphic violence\b/i,
  /\bextreme violence\b/i,
  /\bgory\b/i,
  /\btorture porn\b/i,

  // Self-harm / suicide
  /\bself[\s-]?harm\b/i,
  /\bsuicid(?:e|al|ed|es|ing)\b/i,
  /\bcutting (?:scenes?|content)\b/i,

  // Substance abuse (the abuse framing, not education / awareness)
  /\bdrug abuse\b/i,
  /\billicit drugs?\b/i,
  /\bheroin\b/i,
  /\bcocaine\b/i,
  /\bmeth(?:amphetamine)?\b/i,
  /\bcrystal meth\b/i,

  // Adult-only marketers
  /\b18\+ only\b/i,
  /\badults? only\b/i,
  /\bnot for children\b/i,
  /\binappropriate for (?:children|kids|young readers)\b/i,
];

/**
 * Check whether a title + reason pair contains content unsuitable for a
 * UK primary-school audience (ages 5–11).
 *
 * @param {string} title - Book title from the AI response
 * @param {string} reason - AI-written justification for the recommendation
 * @returns {{ safe: boolean, flags: string[] }} Decision + which patterns
 *   matched (the `flags` array is useful for instrumentation; never expose
 *   it to end users — it could leak the denylist contents)
 */
export function isContentSafe(title, reason) {
  const text = `${title || ''} ${reason || ''}`;
  if (!text.trim()) {
    return { safe: true, flags: [] };
  }
  const flags = [];
  for (const pattern of EXPLICIT_TERM_PATTERNS) {
    if (pattern.test(text)) {
      flags.push(pattern.source);
    }
  }
  return { safe: flags.length === 0, flags };
}

/**
 * Partition AI suggestions into kept (safe) and rejected (flagged) lists.
 * Callers should log the rejected list for moderation telemetry but never
 * surface its contents to end users.
 *
 * @param {Array<{title?: string, reason?: string}>} suggestions
 * @returns {{ kept: Array, rejected: Array }} `rejected` items carry an
 *   added `_flags` array recording the matched patterns.
 */
export function filterContentSafe(suggestions) {
  const kept = [];
  const rejected = [];
  for (const suggestion of suggestions || []) {
    const result = isContentSafe(suggestion?.title, suggestion?.reason);
    if (result.safe) {
      kept.push(suggestion);
    } else {
      rejected.push({ ...suggestion, _flags: result.flags });
    }
  }
  return { kept, rejected };
}
