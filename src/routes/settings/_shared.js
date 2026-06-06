/**
 * Shared helpers for the settings route modules.
 *
 * The settings surface area is split across several files for readability —
 * org settings CRUD, organization AI config, platform AI keys — and these
 * helpers are imported wherever they're needed. They were inlined in
 * settings.js before the split.
 */

/**
 * Shared helper: call provider models API and return [{id, name}] list.
 */
export async function fetchProviderModels(provider, apiKey) {
  if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.data || []).map((m) => ({ id: m.id, name: m.display_name || m.id }));
  }

  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.data || [])
      .filter((m) => /^(gpt-|o1|o3|o4)/.test(m.id))
      .sort((a, b) => b.created - a.created)
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
