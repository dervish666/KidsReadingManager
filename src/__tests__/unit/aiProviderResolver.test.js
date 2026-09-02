import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveAiConfig, buildFailoverChain } from '../../utils/aiProviderResolver.js';
import { encryptSensitiveData } from '../../utils/crypto.js';

/**
 * These cover the four-tier key precedence that was previously inlined in
 * routes/books/recommendations.js. The recommendations route now depends on
 * this module, so a regression here breaks the paid feature — that is why the
 * exact error messages and status codes are asserted, not just the happy path.
 */

const SECRET = 'test-encryption-secret-value-0123456789';
const ENV = { ENCRYPTION_KEY: SECRET };

/**
 * Minimal D1 stand-in. Routes each prepare() by a distinctive fragment of its
 * SQL so a test only supplies the rows it cares about.
 */
function makeDb({ orgConfig = null, org = null, activePlatformKey = null, platformKeys = [] }) {
  return {
    prepare(sql) {
      const statement = {
        bind: () => statement,
        first: async () => {
          if (sql.includes('FROM org_ai_config')) return orgConfig;
          if (sql.includes('ai_addon_active FROM organizations')) return org;
          if (sql.includes('FROM platform_ai_keys WHERE is_active = 1')) return activePlatformKey;
          return null;
        },
        all: async () => {
          if (sql.includes('FROM platform_ai_keys')) return { results: platformKeys };
          return { results: [] };
        },
      };
      return statement;
    },
  };
}

const resolve = (db, env = ENV) =>
  resolveAiConfig({
    db,
    env,
    organizationId: 'org_1',
    notEntitledMessage: 'AI summaries are not enabled for this organisation.',
  });

describe('resolveAiConfig — Path 1: BYOK', () => {
  it("uses the school's own key without needing the AI add-on", async () => {
    const db = makeDb({
      orgConfig: {
        provider: 'openai',
        api_key_encrypted: await encryptSensitiveData('sk-school-key', SECRET),
        model_preference: 'gpt-5.4-nano',
        is_enabled: 1,
      },
      // ai_addon_active deliberately 0 — BYOK must not consult it
      org: { ai_addon_active: 0 },
    });
    const config = await resolve(db);
    expect(config).toMatchObject({
      provider: 'openai',
      apiKey: 'sk-school-key',
      model: 'gpt-5.4-nano',
      source: 'organization',
    });
  });

  it('defaults the provider to anthropic when the row has none', async () => {
    const db = makeDb({
      orgConfig: {
        provider: null,
        api_key_encrypted: await encryptSensitiveData('sk-x', SECRET),
        is_enabled: 1,
      },
    });
    expect((await resolve(db)).provider).toBe('anthropic');
  });

  it('falls through to the add-on path when the row is stored but disabled', async () => {
    const db = makeDb({
      orgConfig: {
        provider: 'openai',
        api_key_encrypted: await encryptSensitiveData('sk-school-key', SECRET),
        is_enabled: 0,
      },
      org: { ai_addon_active: 0 },
    });
    await expect(resolve(db)).rejects.toMatchObject({ status: 403 });
  });

  it('400s with a settings-shaped message when the stored key will not decrypt', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = makeDb({
      orgConfig: { provider: 'anthropic', api_key_encrypted: 'enc:not:valid', is_enabled: 1 },
    });
    await expect(resolve(db)).rejects.toThrow('AI configuration error. Please check Settings.');
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('resolveAiConfig — Path 2: entitlement', () => {
  it('403s when there is no BYOK key and no AI add-on', async () => {
    const db = makeDb({ org: { ai_addon_active: 0 } });
    await expect(resolve(db)).rejects.toMatchObject({
      status: 403,
      message: 'AI summaries are not enabled for this organisation.',
    });
  });

  it('403s when the organisation row is missing entirely', async () => {
    const db = makeDb({ org: null });
    await expect(resolve(db)).rejects.toMatchObject({ status: 403 });
  });

  it('uses the caller-supplied message so the 403 names the right feature', async () => {
    const db = makeDb({ org: { ai_addon_active: 0 } });
    await expect(
      resolveAiConfig({
        db,
        env: ENV,
        organizationId: 'org_1',
        notEntitledMessage: 'AI recommendations are not enabled for this organisation.',
      })
    ).rejects.toThrow('AI recommendations are not enabled for this organisation.');
  });
});

describe('resolveAiConfig — Path 2a/2b: platform then env', () => {
  it('uses the active platform key when the add-on is on', async () => {
    const db = makeDb({
      org: { ai_addon_active: 1 },
      activePlatformKey: {
        provider: 'anthropic',
        api_key_encrypted: await encryptSensitiveData('sk-platform', SECRET),
        model_preference: null,
      },
    });
    expect(await resolve(db)).toMatchObject({
      provider: 'anthropic',
      apiKey: 'sk-platform',
      source: 'platform',
    });
  });

  it('falls back to env keys in anthropic → openai → google order', async () => {
    const db = makeDb({ org: { ai_addon_active: 1 } });
    expect(
      await resolve(db, { ...ENV, OPENAI_API_KEY: 'sk-env-openai', GOOGLE_API_KEY: 'g-env' })
    ).toMatchObject({ provider: 'openai', apiKey: 'sk-env-openai', source: 'environment' });

    expect(
      await resolve(db, {
        ...ENV,
        ANTHROPIC_API_KEY: 'sk-env-anthropic',
        OPENAI_API_KEY: 'sk-env-openai',
      })
    ).toMatchObject({ provider: 'anthropic', apiKey: 'sk-env-anthropic' });
  });

  it('400s when entitled but nothing at all is configured', async () => {
    const db = makeDb({ org: { ai_addon_active: 1 } });
    await expect(resolve(db)).rejects.toThrow('AI not configured. Contact your administrator.');
  });

  it('400s when the platform key will not decrypt', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = makeDb({
      org: { ai_addon_active: 1 },
      activePlatformKey: { provider: 'anthropic', api_key_encrypted: 'enc:bad:bad' },
    });
    await expect(resolve(db)).rejects.toThrow('Platform AI configuration error.');
    error.mockRestore();
  });
});

describe('buildFailoverChain', () => {
  const primary = { provider: 'anthropic', apiKey: 'sk-primary', model: null };

  let warn;
  let error;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    error = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
    error.mockRestore();
  });

  it('keeps the primary first and appends other providers', async () => {
    const db = makeDb({
      platformKeys: [
        { provider: 'openai', api_key_encrypted: await encryptSensitiveData('sk-o', SECRET) },
        { provider: 'google', api_key_encrypted: await encryptSensitiveData('sk-g', SECRET) },
      ],
    });
    const chain = await buildFailoverChain({ db, env: ENV, primary });
    expect(chain[0]).toBe(primary);
    expect(chain.map((c) => c.provider)).toEqual(['anthropic', 'openai', 'google']);
  });

  it('never duplicates a provider already in the chain', async () => {
    const db = makeDb({
      platformKeys: [
        { provider: 'anthropic', api_key_encrypted: await encryptSensitiveData('sk-a2', SECRET) },
      ],
    });
    const chain = await buildFailoverChain({
      db,
      env: { ...ENV, ANTHROPIC_API_KEY: 'sk-env-a' },
      primary,
    });
    expect(chain).toHaveLength(1);
    expect(chain[0].apiKey).toBe('sk-primary');
  });

  it('skips an undecryptable fallback key loudly rather than silently', async () => {
    const db = makeDb({ platformKeys: [{ provider: 'openai', api_key_encrypted: 'enc:no:no' }] });
    const chain = await buildFailoverChain({ db, env: ENV, primary });
    expect(chain).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('undecryptable platform key'));
  });

  it('returns the primary alone when the platform-key query blows up', async () => {
    const db = {
      prepare: () => ({
        all: async () => {
          throw new Error('D1_ERROR: internal error');
        },
      }),
    };
    const chain = await buildFailoverChain({ db, env: ENV, primary });
    expect(chain).toEqual([primary]);
    expect(error).toHaveBeenCalled();
  });

  it('appends env keys for providers not already covered', async () => {
    const db = makeDb({});
    const chain = await buildFailoverChain({
      db,
      env: { ...ENV, GOOGLE_API_KEY: 'g-env', OPENAI_API_KEY: 'o-env' },
      primary,
    });
    expect(chain.map((c) => c.provider)).toEqual(['anthropic', 'openai', 'google']);
  });
});

describe('resolveAiConfig — low-cost tier clamp', () => {
  let warnSpy;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('replaces a frontier BYOK preference with the cheap default and warns', async () => {
    const db = makeDb({
      orgConfig: {
        provider: 'anthropic',
        api_key_encrypted: await encryptSensitiveData('sk-school-key', SECRET),
        model_preference: 'claude-fable-5-1',
        is_enabled: 1,
      },
      org: { ai_addon_active: 0 },
    });
    const config = await resolve(db);
    expect(config.model).toBe('claude-haiku-4-5');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('claude-fable-5-1'));
  });

  it('replaces a frontier platform preference — the owner cannot opt in by hand either', async () => {
    const db = makeDb({
      org: { ai_addon_active: 1 },
      activePlatformKey: {
        provider: 'openai',
        api_key_encrypted: await encryptSensitiveData('sk-platform', SECRET),
        model_preference: 'gpt-5.6',
      },
    });
    const config = await resolve(db);
    expect(config).toMatchObject({ source: 'platform', model: 'gpt-5.4-nano' });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('fills a missing preference with the cheap default without warning', async () => {
    const db = makeDb({
      org: { ai_addon_active: 1 },
      activePlatformKey: {
        provider: 'google',
        api_key_encrypted: await encryptSensitiveData('g-platform', SECRET),
        model_preference: null,
      },
    });
    const config = await resolve(db);
    expect(config.model).toBe('gemini-2.5-flash');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('clamps fallback keys in the failover chain too', async () => {
    const db = makeDb({
      platformKeys: [
        {
          provider: 'anthropic',
          api_key_encrypted: await encryptSensitiveData('a-key', SECRET),
          model_preference: 'claude-opus-5',
        },
      ],
    });
    const chain = await buildFailoverChain({
      db,
      env: ENV,
      primary: { provider: 'openai', apiKey: 'sk', model: 'gpt-5.4-nano' },
    });
    expect(chain[1]).toMatchObject({ provider: 'anthropic', model: 'claude-haiku-4-5' });
  });
});
