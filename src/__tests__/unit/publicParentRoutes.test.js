import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isPublicParentRoute, TEACHER_PARENT_PREFIXES } from '../../utils/constants.js';

const read = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

describe('isPublicParentRoute', () => {
  it('treats the token-in-URL parent portal routes as public', () => {
    expect(isPublicParentRoute('/api/parent/abc123')).toBe(true);
    expect(isPublicParentRoute('/api/parent/abc123/book-ideas')).toBe(true);
    expect(isPublicParentRoute('/api/parent/abc123/sessions')).toBe(true);
  });

  it('keeps every teacher-facing prefix behind JWT auth', () => {
    expect(isPublicParentRoute('/api/parent/generate/class-1')).toBe(false);
    expect(isPublicParentRoute('/api/parent/token/student/s-1')).toBe(false);
    expect(isPublicParentRoute('/api/parent/class/class-1')).toBe(false);
    expect(isPublicParentRoute('/api/parent/school/generate')).toBe(false);
    expect(isPublicParentRoute('/api/parent/school/tokens')).toBe(false);
    expect(isPublicParentRoute('/api/parent/tokens/t-1')).toBe(false);
  });

  it('ignores paths outside the parent router', () => {
    expect(isPublicParentRoute('/api/students')).toBe(false);
    expect(isPublicParentRoute('/api/parenting')).toBe(false);
  });
});

// The rule was copy-pasted into worker.js and tenant.js. v3.126.0 added
// /api/parent/school/ to the worker's copy only, so the auth middleware waved
// the request through with no user, requireTeacher() answered 401, and the
// client read that as an expired session and logged the teacher out. Both
// files must import the one helper rather than inline their own.
describe('the public-parent rule has exactly one definition', () => {
  const worker = read('../../worker.js');
  const tenant = read('../../middleware/tenant.js');

  it('is imported, not re-implemented, in worker.js and tenant.js', () => {
    for (const [name, source] of [
      ['worker.js', worker],
      ['middleware/tenant.js', tenant],
    ]) {
      expect(source, name).toContain('isPublicParentRoute');
      // An inline copy would have to test the prefix itself.
      expect(source, name).not.toContain("startsWith('/api/parent/generate/')");
      expect(source, name).not.toContain("startsWith('/api/parent/class/')");
    }
  });

  it('lists a prefix for every teacher-facing parent route in the router', () => {
    const router = read('../../routes/parent.js');
    // e.g. parentRouter.post('/school/generate', requireTeacher(), ...)
    const guarded = [...router.matchAll(/parentRouter\.\w+\(\s*'([^']+)'[^)]*require\w+\(\)/g)].map(
      (m) => m[1]
    );

    expect(guarded.length).toBeGreaterThan(0);
    for (const path of guarded) {
      const full = `/api/parent${path}`;
      expect(
        TEACHER_PARENT_PREFIXES.some((prefix) => full.startsWith(prefix)),
        `${full} is role-guarded but not listed in TEACHER_PARENT_PREFIXES, so it would be treated as a public parent-portal route and 401 the teacher`
      ).toBe(true);
    }
  });
});
