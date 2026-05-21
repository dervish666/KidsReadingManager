import { describe, it, expect } from 'vitest';
import { generateToken } from '../../utils/helpers.js';

describe('generateToken', () => {
  it('should return a URL-safe base64 string', () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('should return a 22-character string (128 bits)', () => {
    const token = generateToken();
    expect(token.length).toBe(22);
  });

  it('should generate unique tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateToken()));
    expect(tokens.size).toBe(100);
  });
});
