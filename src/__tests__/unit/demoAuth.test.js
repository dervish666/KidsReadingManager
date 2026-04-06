import { describe, it, expect } from 'vitest';
import { PUBLIC_PATHS } from '../../utils/constants.js';

describe('demo auth public path', () => {
  it('includes /api/auth/demo in PUBLIC_PATHS', () => {
    expect(PUBLIC_PATHS).toContain('/api/auth/demo');
  });
});
