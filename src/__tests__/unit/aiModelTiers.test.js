import { describe, it, expect } from 'vitest';
import {
  isCheapModel,
  filterCheapModels,
  clampToCheapModel,
  CHEAP_DEFAULT_MODEL,
} from '../../utils/aiModelTiers.js';

describe('aiModelTiers', () => {
  describe('isCheapModel', () => {
    it('allows the Haiku family and nothing else from Anthropic', () => {
      expect(isCheapModel('anthropic', 'claude-haiku-4-5')).toBe(true);
      expect(isCheapModel('anthropic', 'claude-haiku-4-5-20251001')).toBe(true);
      expect(isCheapModel('anthropic', 'claude-3-5-haiku-latest')).toBe(true);
      expect(isCheapModel('anthropic', 'claude-sonnet-5')).toBe(false);
      expect(isCheapModel('anthropic', 'claude-opus-5')).toBe(false);
      expect(isCheapModel('anthropic', 'claude-fable-5-1')).toBe(false);
    });

    it('allows nano and mini from OpenAI, not the full-size models', () => {
      expect(isCheapModel('openai', 'gpt-5.4-nano')).toBe(true);
      expect(isCheapModel('openai', 'gpt-5.4-mini')).toBe(true);
      expect(isCheapModel('openai', 'gpt-4o-mini')).toBe(true);
      expect(isCheapModel('openai', 'o4-mini')).toBe(true);
      expect(isCheapModel('openai', 'gpt-5.4')).toBe(false);
      expect(isCheapModel('openai', 'gpt-5.6')).toBe(false);
      expect(isCheapModel('openai', 'gpt-4.1')).toBe(false);
    });

    it('allows Flash from Google, not Pro', () => {
      expect(isCheapModel('google', 'gemini-2.5-flash')).toBe(true);
      expect(isCheapModel('google', 'gemini-2.5-flash-lite')).toBe(true);
      expect(isCheapModel('google', 'gemini-3.7-flash')).toBe(true);
      expect(isCheapModel('google', 'gemini-2.5-pro')).toBe(false);
    });

    it('refuses unknown providers and empty ids', () => {
      expect(isCheapModel('llama', 'llama-mini')).toBe(false);
      expect(isCheapModel('anthropic', null)).toBe(false);
      expect(isCheapModel('anthropic', '')).toBe(false);
    });
  });

  describe('filterCheapModels', () => {
    it('keeps order and drops the expensive tier', () => {
      const list = [
        { id: 'claude-opus-5', name: 'Opus 5' },
        { id: 'claude-haiku-4-5', name: 'Haiku 4.5' },
        { id: 'claude-sonnet-5', name: 'Sonnet 5' },
        { id: 'claude-haiku-4-5-20251001', name: 'Haiku 4.5 (dated)' },
      ];
      expect(filterCheapModels('anthropic', list).map((m) => m.id)).toEqual([
        'claude-haiku-4-5',
        'claude-haiku-4-5-20251001',
      ]);
    });

    it('passes null through so a rejected key still reads as rejected', () => {
      expect(filterCheapModels('anthropic', null)).toBeNull();
    });
  });

  describe('clampToCheapModel', () => {
    it('leaves a cheap preference alone', () => {
      expect(clampToCheapModel('openai', 'gpt-5.4-nano')).toEqual({
        model: 'gpt-5.4-nano',
        clamped: false,
      });
    });

    it('replaces an expensive preference with the cheap default and says so', () => {
      expect(clampToCheapModel('anthropic', 'claude-fable-5-1')).toEqual({
        model: CHEAP_DEFAULT_MODEL.anthropic,
        clamped: true,
      });
    });

    it('fills a missing preference with the default without calling it a clamp', () => {
      expect(clampToCheapModel('google', null)).toEqual({
        model: 'gemini-2.5-flash',
        clamped: false,
      });
    });
  });
});
