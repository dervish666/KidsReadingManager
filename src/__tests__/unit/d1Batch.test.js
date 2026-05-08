import { describe, it, expect } from 'vitest';
import { assertBatchSize, D1_BATCH_LIMIT } from '../../utils/d1Batch.js';

describe('assertBatchSize', () => {
  it('passes for an empty array', () => {
    expect(() => assertBatchSize([])).not.toThrow();
  });

  it('passes at the limit', () => {
    const statements = Array.from({ length: D1_BATCH_LIMIT }, () => ({}));
    expect(() => assertBatchSize(statements)).not.toThrow();
  });

  it('throws above the limit', () => {
    const statements = Array.from({ length: D1_BATCH_LIMIT + 1 }, () => ({}));
    expect(() => assertBatchSize(statements)).toThrow(/exceeds limit of 100/);
  });

  it('includes the label in the error message', () => {
    const statements = Array.from({ length: 101 }, () => ({}));
    expect(() => assertBatchSize(statements, 'students-bulk')).toThrow(/students-bulk/);
  });

  it('throws on non-array input', () => {
    expect(() => assertBatchSize(null)).toThrow(/expected array/);
    expect(() => assertBatchSize(undefined)).toThrow(/expected array/);
    expect(() => assertBatchSize({})).toThrow(/expected array/);
  });

  it('exports D1_BATCH_LIMIT as 100', () => {
    expect(D1_BATCH_LIMIT).toBe(100);
  });
});
