/**
 * D1 batch helpers.
 *
 * D1's `db.batch()` rejects arrays of more than 100 prepared statements with
 * an opaque error. Routes that build their batches dynamically (bulk import,
 * class-goals updates, Wonde sync) chunk into slices of 100 — but a future
 * refactor that adds a side-effect statement inside the loop body could push
 * a chunk to 101 and silently break the affected request.
 *
 * `assertBatchSize` is a defensive pre-flight: call it immediately before
 * `db.batch()` so the failure mode is a clear thrown Error at the call site
 * rather than a vague D1 rejection.
 */

export const D1_BATCH_LIMIT = 100;

/**
 * Throw if a prepared-statement array exceeds D1's per-batch limit.
 * @param {Array} statements - Prepared statements about to be batched.
 * @param {string} [label] - Optional context for the error message.
 */
export function assertBatchSize(statements, label = 'db.batch') {
  if (!Array.isArray(statements)) {
    throw new Error(`${label}: expected array of statements, got ${typeof statements}`);
  }
  if (statements.length > D1_BATCH_LIMIT) {
    throw new Error(
      `${label}: D1 batch size ${statements.length} exceeds limit of ${D1_BATCH_LIMIT}; chunk before calling db.batch()`
    );
  }
}
