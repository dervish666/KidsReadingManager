/**
 * Shared placeholder-cover detection used by both the on-demand cover route
 * (src/routes/covers.js) and the metadata enrichment cover fetch
 * (src/services/metadataService.js).
 *
 * Some upstream providers (Hardcover, Google Books, OpenLibrary) return their
 * "image not available" placeholder image with HTTP 200 instead of 404 when
 * the underlying record has no real cover. These placeholders pass simple
 * byte-size checks, so we fingerprint them by SHA-256 and reject matches.
 *
 * Add new hashes here when more placeholder variants are spotted.
 */

const KNOWN_PLACEHOLDER_HASHES = new Set([
  // 300x391 italic "image not available" PNG, ~15.5KB. Seen on Hardcover-sourced
  // covers when the upstream record has no image.
  '12557f8948b8bdc6af436e3a8b3adddd45f7f7d2b67c5832e799cdf4686f72bb',
]);

/** SHA-256 hex digest of an ArrayBuffer (Web Crypto, available in Workers). */
async function sha256Hex(buffer) {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Returns true if `buffer` matches a known placeholder image hash.
 */
async function isKnownPlaceholder(buffer) {
  return KNOWN_PLACEHOLDER_HASHES.has(await sha256Hex(buffer));
}

export { KNOWN_PLACEHOLDER_HASHES, sha256Hex, isKnownPlaceholder };
