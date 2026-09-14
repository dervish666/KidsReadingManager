import { describe, it, expect, vi } from 'vitest';
import { isChunkLoadError, recoverFromChunkError } from '../../utils/chunkRecovery.js';

/** A sessionStorage stand-in, so these tests never depend on real browser storage. */
function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
    removeItem: (k) => {
      delete data[k];
    },
    _data: data,
  };
}

/** The storage a private window gives you: present, but throws on use. */
const throwingStorage = {
  getItem() {
    throw new DOMException('denied');
  },
  setItem() {
    throw new DOMException('denied');
  },
  removeItem() {},
};

const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

function recover(error, overrides = {}) {
  const reload = vi.fn();
  const triggered = recoverFromChunkError(error, {
    storage: fakeStorage(),
    userAgent: CHROME_UA,
    reload,
    ...overrides,
  });
  return { triggered, reload };
}

describe('isChunkLoadError', () => {
  it('recognises the CSS loader failure that reached production', () => {
    // TALLY-READING-J. The CSS loader sets `code` and leaves `name` as Error,
    // so anything keying on name alone misses this exact case.
    const error = new Error(
      'Loading CSS chunk 12 failed.\n(https://tallyreading.uk/static/css/async/12.6b15730d67.css)'
    );
    error.code = 'CSS_CHUNK_LOAD_FAILED';
    expect(error.name).toBe('Error');
    expect(isChunkLoadError(error)).toBe(true);
  });

  it('recognises the JS loader failure by name', () => {
    const error = new Error('Loading chunk 418 failed.\n(missing: /static/js/async/418.js)');
    error.name = 'ChunkLoadError';
    expect(isChunkLoadError(error)).toBe(true);
  });

  it('recognises either failure by message alone when code and name are lost', () => {
    expect(isChunkLoadError(new Error('Loading chunk 7 failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('Loading CSS chunk 12 failed.'))).toBe(true);
  });

  it('does not claim unrelated errors', () => {
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
    // BookImportWizard throws this on a failed batch. Nothing to do with bundles.
    expect(isChunkLoadError(new Error('Import chunk failed (matched 3)'))).toBe(false);
  });
});

describe('recoverFromChunkError', () => {
  it('reloads once for a real user hitting a stale chunk', () => {
    const error = new Error('Loading CSS chunk 12 failed.');
    error.code = 'CSS_CHUNK_LOAD_FAILED';
    const { triggered, reload } = recover(error);
    expect(triggered).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('leaves unrelated errors alone so they still reach the error UI', () => {
    const { triggered, reload } = recover(new Error('Something else broke'));
    expect(triggered).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('refuses a second reload inside the cooldown, so a bad deploy cannot loop', () => {
    const storage = fakeStorage();
    const error = new Error('Loading chunk 12 failed.');
    error.name = 'ChunkLoadError';

    const first = recover(error, { storage, now: 1_000_000 });
    expect(first.triggered).toBe(true);

    // The fresh bundle fails the same way half a second later.
    const second = recover(error, { storage, now: 1_000_500 });
    expect(second.triggered).toBe(false);
    expect(second.reload).not.toHaveBeenCalled();
  });

  it('allows a retry once the cooldown has passed, so the next deploy is covered', () => {
    const storage = fakeStorage();
    const error = new Error('Loading chunk 12 failed.');
    error.name = 'ChunkLoadError';

    expect(recover(error, { storage, now: 1_000_000 }).triggered).toBe(true);
    // A day later, a new release, a new stale chunk.
    expect(recover(error, { storage, now: 1_000_000 + 86_400_000 }).triggered).toBe(true);
  });

  it('does not reload for crawlers', () => {
    // The event that started all this: bingbot abandoning a stylesheet that
    // was live and serving 200. Reloading for it helps nobody.
    const error = new Error('Loading CSS chunk 12 failed.');
    error.code = 'CSS_CHUNK_LOAD_FAILED';
    const { triggered, reload } = recover(error, {
      userAgent: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    });
    expect(triggered).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('declines to reload when storage throws, rather than risk an unguarded loop', () => {
    const error = new Error('Loading chunk 12 failed.');
    error.name = 'ChunkLoadError';
    const { triggered, reload } = recover(error, { storage: throwingStorage });
    expect(triggered).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
