/**
 * Module-level AI config cache shared between fix-suggestion-panel and
 * admin/settings. Lives in its own file so fix-suggestion-panel.tsx
 * exports only React components, satisfying Vite Fast Refresh.
 */

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

export interface AIConfig {
  engineEnabled: boolean;
  externalEnabled: boolean;
  provider: "gemini" | "openai";
  model: string;
}

let _configCache: AIConfig | null = null;
let _configPromise: Promise<AIConfig> | null = null;

export function getAIConfig(): Promise<AIConfig> {
  if (_configCache) return Promise.resolve(_configCache);
  if (!_configPromise) {
    _configPromise = fetch(`${BASE}/api/ai/config`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        _configCache = data as AIConfig;
        return _configCache!;
      })
      .catch(() => {
        _configPromise = null;
        const fallback: AIConfig = { engineEnabled: false, externalEnabled: false, provider: "gemini", model: "" };
        return fallback;
      });
  }
  return _configPromise;
}

export function invalidateAIConfigCache() {
  _configCache = null;
  _configPromise = null;
}

export function peekAIConfigCache(): AIConfig | null {
  return _configCache;
}
