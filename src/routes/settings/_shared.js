/**
 * Shared helpers for the settings route modules.
 *
 * The settings surface area is split across several files for readability —
 * org settings CRUD, organization AI config, platform AI keys — and these
 * helpers are imported wherever they're needed. They were inlined in
 * settings.js before the split.
 */

/**
 * Environment-variable fallback key for a provider (the last rung of the
 * key ladder: org key → platform key → env). Mirrors `resolveAiConfig`.
 */
export function envKeyFor(env, provider) {
  const names = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    google: 'GOOGLE_API_KEY',
  };
  const name = names[provider];
  return name ? env?.[name] || null : null;
}

import { filterCheapModels } from '../../utils/aiModelTiers.js';

// OpenAI's /v1/models lists everything the key can reach — image, audio,
// realtime and embedding models included. Keep the ones a chat completion
// can actually use.
const OPENAI_CHAT_MODEL = /^(gpt-|o\d)/;
const OPENAI_NOT_CHAT = /(realtime|audio|tts|transcribe|image|embedding|moderation|search)/;

/**
 * Shared helper: call provider models API and return [{id, name}] list,
 * newest first, trimmed to the low-cost tier (see utils/aiModelTiers.js).
 * The list is what the settings pickers show, so it is deliberately live
 * rather than curated — a static list is stale the day a provider ships a
 * model — but it is never the *whole* list: the pickers are the first line
 * of the cost cap, and `resolveAiConfig` is the second. `null` means the key
 * was rejected or the call failed; an empty array means the key works but
 * nothing in the cheap tier matched.
 */
export async function fetchProviderModels(provider, apiKey) {
  const models = await fetchAllProviderModels(provider, apiKey);
  return filterCheapModels(provider, models);
}

/** The unfiltered provider list. Not exported: nothing should offer it to a user. */
async function fetchAllProviderModels(provider, apiKey) {
  if (provider === 'anthropic') {
    // The default page is 20 models; ask for everything so a long-lived key
    // with many generations available doesn't lose the newest off the end.
    const res = await fetch('https://api.anthropic.com/v1/models?limit=1000', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.data || [])
      .slice()
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
      .map((m) => ({ id: m.id, name: m.display_name || m.id }));
  }

  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.data || [])
      .filter((m) => OPENAI_CHAT_MODEL.test(m.id) && !OPENAI_NOT_CHAT.test(m.id))
      .sort((a, b) => (b.created || 0) - (a.created || 0))
      .map((m) => ({ id: m.id, name: m.id }));
  }

  if (provider === 'google') {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: { 'x-goog-api-key': apiKey },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.models || [])
      .filter(
        (m) =>
          m.name.includes('gemini') && m.supportedGenerationMethods?.includes('generateContent')
      )
      .map((m) => ({
        id: m.name.replace('models/', ''),
        name: m.displayName || m.name.replace('models/', ''),
      }));
  }

  return null;
}
