// Gemini API Service
import { AIService, Message } from '../types/chat';

// Use the family-level 'latest' alias to always get the most recent flash variant
// Alternative models: gemini-pro-latest (higher quality, slower)
const DEFAULT_MODEL = 'gemini-flash-latest';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiServiceOptions {
  proxyBaseUrl?: string;
}

export interface GeminiModel {
  name: string;
  displayName: string;
  description: string;
  supportedGenerationMethods: string[];
}

interface ListModelsResponse {
  models: GeminiModel[];
}

interface GeminiContent {
  role: string;
  parts: { text: string }[];
}

interface GeminiRequest {
  contents: GeminiContent[];
  systemInstruction?: {
    parts: { text: string }[];
  };
  generationConfig?: {
    temperature?: number;
    topK?: number;
    topP?: number;
    maxOutputTokens?: number;
  };
}

interface GeminiResponse {
  candidates: {
    content: {
      parts: { text: string }[];
    };
  }[];
}

export class GeminiService implements AIService {
  private apiKey: string;
  private model: string;
  private proxyBaseUrl?: string;
  private mode: 'direct' | 'proxy';

  constructor(apiKey: string | undefined, model: string = DEFAULT_MODEL, options?: GeminiServiceOptions) {
    this.proxyBaseUrl = options?.proxyBaseUrl !== undefined ? options.proxyBaseUrl.replace(/\/$/, '') : undefined;
    this.mode = this.proxyBaseUrl !== undefined ? 'proxy' : 'direct';
    this.apiKey = apiKey || '';
    this.model = model;

    if (this.mode === 'direct' && !this.apiKey) {
      throw new Error('Gemini API key not configured');
    }
  }

  /**
   * Fetch available models from the Gemini API
   */
  async listAvailableModels(): Promise<GeminiModel[]> {
    if (this.mode === 'proxy') {
      return [];
    }

    try {
      const response = await fetch(`${GEMINI_API_BASE}?key=${this.apiKey}`);
      
      if (!response.ok) {
        console.error('Failed to fetch models:', response.statusText);
        return [];
      }

      const data: ListModelsResponse = await response.json();
      
      // Filter models that:
      // 1. Support generateContent
      // 2. Are stable/latest versions (not experimental or preview)
      // 3. Exclude thinking/vision-only models
      const filteredModels = data.models.filter(model => {
        const modelName = model.name.toLowerCase();
        
        // Must support generateContent
        if (!model.supportedGenerationMethods.includes('generateContent')) {
          return false;
        }
        
        // Exclude experimental, preview, and old versions
        if (modelName.includes('experimental') || 
            modelName.includes('preview') ||
            modelName.includes('tuning') ||
            modelName.includes('vision') ||
            modelName.includes('thinking')) {
          return false;
        }
        
        // Only include models ending with -latest or numbered versions like 2.0
        // This typically gives us gemini-pro-latest, gemini-flash-latest, etc.
        return modelName.includes('-latest') || 
               modelName.match(/gemini-\d+\.\d+-(pro|flash)(?:-\d+b)?$/);
      });

      // Sort to prefer -latest versions first, then by name
      return filteredModels.sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        
        // Prioritize -latest versions
        const aIsLatest = aName.includes('-latest');
        const bIsLatest = bName.includes('-latest');
        
        if (aIsLatest && !bIsLatest) return -1;
        if (!aIsLatest && bIsLatest) return 1;
        
        // Then sort by name (pro before flash)
        return aName.localeCompare(bName);
      });
    } catch (error) {
      console.error('Error fetching models:', error);
      return [];
    }
  }

  /**
   * Set the model to use for generation
   */
  setModel(model: string): void {
    this.model = model;
  }

  /**
   * Get the current model
   */
  getModel(): string {
    return this.model;
  }

  private convertMessages(messages: Message[]): GeminiContent[] {
    return messages
      .filter(msg => msg.role !== 'system')
      .map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));
  }

  async sendMessage(
    messages: Message[],
    systemInstruction: string
  ): Promise<string> {
    if (this.mode === 'proxy') {
      return this.sendViaProxy(messages, systemInstruction);
    }

    const contents = this.convertMessages(messages);

    const request: GeminiRequest = {
      contents,
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 8192,
      },
    };

    const apiUrl = `${GEMINI_API_BASE}/${this.model}:generateContent`;
    const response = await fetch(`${apiUrl}?key=${this.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', { status: response.status, statusText: response.statusText, body: errorText });
      
      // Provide more helpful error messages
      if (response.status === 400 && errorText.includes('API_KEY_INVALID')) {
        throw new Error('Invalid API key. Please check your Gemini API key and try again.');
      }
      if (response.status === 401) {
        throw new Error('Unauthorized. Please verify your Gemini API key.');
      }
      if (response.status === 404) {
        throw new Error('Model not found. The API has been updated to use gemini-flash-latest.');
      }
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please wait a moment and try again.');
      }
      
      throw new Error(`Gemini API error: ${response.statusText} - ${errorText}`);
    }

    const data: GeminiResponse = await response.json();
    
    if (!data.candidates || data.candidates.length === 0) {
      throw new Error('No response from Gemini');
    }

    return data.candidates[0].content.parts[0].text;
  }

  private async sendViaProxy(
    messages: Message[],
    systemInstruction: string
  ): Promise<string> {
    const target = this.buildProxyUrl('api/proxy/gemini');

    const response = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        systemInstruction,
        model: this.model,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Proxy Gemini error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    const data = await response.json() as { content?: string; candidates?: { content?: { parts?: { text?: string }[] } }[] };

    // Prefer wrapped { content } shape
    if (data.content && typeof data.content === 'string') {
      return data.content.trim();
    }

    // Fallback: raw Gemini response
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text === 'string' && text.trim()) {
      return text.trim();
    }

    throw new Error('Proxy Gemini returned no content');
  }

  private buildProxyUrl(path: string): string {
    const normalizedPath = path.replace(/^\//, '');
    if (this.proxyBaseUrl === undefined || this.proxyBaseUrl === null) {
      // Default to relative path so subpath deployments (e.g., /chat) work without extra config.
      return normalizedPath;
    }

    const base = this.proxyBaseUrl.replace(/\/$/, '');
    if (!base) return normalizedPath;
    return `${base}/${normalizedPath}`;
  }
}
