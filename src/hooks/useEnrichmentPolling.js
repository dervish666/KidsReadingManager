import { useState, useRef, useCallback } from 'react';

/**
 * Shared polling hook for metadata enrichment jobs.
 *
 * @param {Function} fetchWithAuth - Authenticated fetch from AuthContext
 * @param {Object}   [options]
 * @param {Function} [options.onComplete]  - Called when the job completes successfully
 * @param {Function} [options.onError]     - Called with an error message on failure
 * @param {Function} [options.onFinished]  - Called when polling ends (success, failure, or abort)
 * @param {number}   [options.maxRetries]  - Consecutive error retries before giving up (default 3)
 * @param {number}   [options.retryDelay]  - ms to wait between retries (default 2000)
 */
export function useEnrichmentPolling(fetchWithAuth, options = {}) {
  const { onComplete, onError, onFinished, maxRetries = 3, retryDelay = 2000 } = options;

  const [progress, setProgress] = useState(null);
  const abortRef = useRef(null);

  const startPolling = useCallback(
    async (jobId) => {
      const controller = new AbortController();
      abortRef.current = controller;
      let consecutiveErrors = 0;

      try {
        while (!controller.signal.aborted) {
          const res = await fetchWithAuth('/api/metadata/enrich', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId }),
            signal: controller.signal,
          });

          if (!res.ok) {
            // Try to read error body for useful info
            const errBody = await res.json().catch(() => ({}));

            // Rate limited: the run is healthy, we're just polling faster than
            // the cost cap. Back off (honouring retryAfter) and retry WITHOUT
            // counting it as a hard error, so a busy run doesn't get killed.
            if (res.status === 429) {
              const waitSec = Number(errBody.retryAfter);
              const waitMs = Number.isFinite(waitSec) && waitSec > 0 ? waitSec * 1000 : 5000;
              await new Promise((r) => setTimeout(r, Math.min(waitMs, 15000)));
              continue;
            }

            consecutiveErrors++;
            if (errBody.done || errBody.status === 'failed') {
              onError?.(errBody.error || 'Enrichment failed');
              break;
            }
            // Retry up to maxRetries on transient errors (e.g. Worker timeout)
            if (consecutiveErrors >= maxRetries) {
              onError?.('Enrichment stopped after repeated errors — use Resume to continue');
              break;
            }
            // Wait before retrying
            await new Promise((r) => setTimeout(r, retryDelay));
            continue;
          }

          consecutiveErrors = 0;
          const data = await res.json();
          setProgress(data);

          if (
            data.done ||
            data.status === 'completed' ||
            data.status === 'failed' ||
            data.status === 'paused'
          ) {
            if (data.status === 'completed' || data.done) {
              onComplete?.();
            } else if (data.status === 'failed') {
              onError?.('Enrichment failed');
            }
            break;
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Polling error', err);
          onError?.('Enrichment polling encountered an error');
        }
      } finally {
        abortRef.current = null;
        onFinished?.();
      }
    },
    [fetchWithAuth, onComplete, onError, onFinished, maxRetries, retryDelay]
  );

  const stopPolling = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
  }, []);

  return { progress, setProgress, startPolling, stopPolling, abortRef };
}
