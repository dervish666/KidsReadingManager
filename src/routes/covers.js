import { Hono } from 'hono';

const coversRouter = new Hono();

// Valid cover types
const VALID_TYPES = new Set(['id', 'olid', 'isbn']);

// Key format: {identifier}-{S|M|L}.jpg
const KEY_PATTERN = /^.+-[SML]\.jpg$/;

// Cache-Control: 30 days
const CACHE_CONTROL = 'public, max-age=2592000';

// Minimum content-length for a real cover image (below this = placeholder)
const MIN_IMAGE_SIZE = 1000;

/**
 * GET /:type/:key
 * Serve cover images through R2 with OpenLibrary origin fallback.
 *
 * :type = id | olid | isbn
 * :key  = {identifier}-{S|M|L}.jpg
 */
coversRouter.get('/:type/:key', async (c) => {
  const { type, key } = c.req.param();

  // 1. Validate type
  if (!VALID_TYPES.has(type)) {
    return c.json({ message: 'Invalid cover type. Must be id, olid, or isbn.' }, 400);
  }

  // 2. Validate key format
  if (!KEY_PATTERN.test(key)) {
    return c.json({ message: 'Invalid key format. Expected {identifier}-{S|M|L}.jpg' }, 400);
  }

  const r2Key = `${type}/${key}`;
  const r2 = c.env.BOOK_COVERS;

  // 3. Check R2 cache
  if (r2) {
    try {
      const cached = await r2.get(r2Key);
      if (cached) {
        const contentType = cached.httpMetadata?.contentType || 'image/jpeg';
        return new Response(cached.body, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Cache-Control': CACHE_CONTROL,
            'X-Cache-Source': 'r2'
          }
        });
      }
    } catch (err) {
      // R2 read failed — fall through to origin
      console.error('R2 get error:', err);
    }
  }

  // 4. Fetch from OpenLibrary origin
  const originUrl = `https://covers.openlibrary.org/b/${type}/${key}`;

  let originResponse;
  try {
    originResponse = await fetch(originUrl);
  } catch (err) {
    console.error('Origin fetch error:', err);
    return c.json({ message: 'Failed to fetch cover from origin' }, 502);
  }

  // 5. If origin returns non-OK, return 404
  if (!originResponse.ok) {
    return c.json({ message: 'Cover not found' }, 404);
  }

  // 6. Read full body and check actual size to detect placeholder images
  const imageData = await originResponse.arrayBuffer();
  if (imageData.byteLength < MIN_IMAGE_SIZE) {
    return c.json({ message: 'Cover not found' }, 404);
  }

  // 7. Store in R2 via waitUntil (non-blocking)
  if (r2 && c.executionCtx?.waitUntil) {
    c.executionCtx.waitUntil(
      r2.put(r2Key, imageData.slice(0), {
        httpMetadata: { contentType: 'image/jpeg' }
      })
    );
  }

  // 8. Return origin response
  return new Response(imageData, {
    status: 200,
    headers: {
      'Content-Type': originResponse.headers.get('Content-Type') || 'image/jpeg',
      'Cache-Control': CACHE_CONTROL,
      'X-Cache-Source': 'origin'
    }
  });
});

export default coversRouter;
