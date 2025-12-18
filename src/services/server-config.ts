import type { AIProvider, TranslationService } from '../types/chat';

export interface ServerProviderConfig {
  enabled: boolean;
  model?: string;
}

export interface ServerConfig {
  proxyBaseUrl: string;
  providers: {
    gemini?: ServerProviderConfig;
    chatgpt?: ServerProviderConfig;
  };
  translationService?: TranslationService;
}

export function pickServerProvider(config: ServerConfig): AIProvider | null {
  if (config.providers.chatgpt?.enabled) return 'chatgpt';
  if (config.providers.gemini?.enabled) return 'gemini';
  return null;
}

export async function fetchServerConfig(signal?: AbortSignal): Promise<ServerConfig | null> {
  const candidates = [
    'api/server-config',       // preferred relative path (works under / or /chat)
    'server-config.json',      // allow direct file under the same prefix as the app
    'api/server-config.json',  // optional .json extension under /api
  ];

  for (const path of candidates) {
    try {
      const response = await fetch(path, { method: 'GET', signal });
      if (!response.ok) continue;

      const data = await response.json() as ServerConfig;
      if (!data || !data.providers) continue;

      const proxyBaseUrl = typeof data.proxyBaseUrl === 'string'
        ? data.proxyBaseUrl.replace(/\/$/, '')
        : '';

      return {
        ...data,
        proxyBaseUrl,
      };
    } catch (err) {
      // Try next candidate; fall through to return null if all fail
      console.debug('[server-config] Candidate failed:', { path, err });
    }
  }

  return null;
}
