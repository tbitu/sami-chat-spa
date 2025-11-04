// Gemini API Service
import { AIService, Message, StreamCallback } from '../types/chat';

// Use 'latest' suffix to always get the most recent stable version
// Alternative models: gemini-2.5-pro-latest (higher quality, slower)
const DEFAULT_MODEL = 'gemini-2.5-flash-latest';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

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

  constructor(apiKey: string, model: string = DEFAULT_MODEL) {
    this.apiKey = apiKey;
    this.model = model;
  }

  /**
   * Fetch available models from the Gemini API
   */
  async listAvailableModels(): Promise<GeminiModel[]> {
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
        throw new Error('Model not found. The API has been updated to use gemini-1.5-flash.');
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

  async streamMessage(
    messages: Message[],
    systemInstruction: string,
    callback: StreamCallback
  ): Promise<void> {
    console.log('[Gemini] streamMessage called');
    const contents = this.convertMessages(messages);
    console.log('[Gemini] Messages converted, count:', contents.length);

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

    const apiUrl = `${GEMINI_API_BASE}/${this.model}:streamGenerateContent`;
    console.log('[Gemini] Making request to:', apiUrl);
    
    try {
      const response = await fetch(`${apiUrl}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      console.log('[Gemini] Response received, status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Gemini] API error:', { status: response.status, statusText: response.statusText, body: errorText });
        callback.onError(new Error(`Gemini API error: ${response.statusText}`));
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        console.error('[Gemini] Response body is not readable');
        callback.onError(new Error('Response body is not readable'));
        return;
      }

      console.log('[Gemini] Starting to read stream...');
      const decoder = new TextDecoder();
      let buffer = '';

      try {
          let streamFinished = false;
          while (!streamFinished) {
            const { done, value } = await reader.read();

            if (done) {
              console.log('[Gemini] Stream complete');
              streamFinished = true;
              break;
            }

            buffer += decoder.decode(value, { stream: true });
          
          // Gemini streaming API returns a JSON array with objects separated by commas
          // We need to extract complete JSON objects from the buffer
          // Format: [{"candidates":[...]},{"candidates":[...]},...]
          
          // Try to extract and parse complete JSON objects
          while (buffer.length > 0) {
            // Skip leading whitespace and array bracket
            buffer = buffer.replace(/^\s*(?:\[|,)\s*/, '');
            
            if (buffer.length === 0) {
              break;
            }
            
            // Try to find a complete JSON object
            let depth = 0;
            let inString = false;
            let escape = false;
            let endIndex = -1;
            
            for (let i = 0; i < buffer.length; i++) {
              const char = buffer[i];
              
              if (escape) {
                escape = false;
                continue;
              }
              
              if (char === '\\') {
                escape = true;
                continue;
              }
              
              if (char === '"') {
                inString = !inString;
                continue;
              }
              
              if (inString) {
                continue;
              }
              
              if (char === '{') {
                depth++;
              } else if (char === '}') {
                depth--;
                if (depth === 0) {
                  endIndex = i + 1;
                  break;
                }
              }
            }
            
            // If we found a complete JSON object
            if (endIndex > 0) {
              const jsonStr = buffer.substring(0, endIndex);
              buffer = buffer.substring(endIndex);
              
              try {
                const data: GeminiResponse = JSON.parse(jsonStr);
                
                if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
                  const chunk = data.candidates[0].content.parts[0].text;
                  console.log('[Gemini] Incremental chunk:', chunk.length, 'chars, content:', JSON.stringify(chunk.substring(0, 50)));
                  callback.onChunk(chunk);
                }
              } catch (parseError) {
                console.warn('[Gemini] Failed to parse chunk:', jsonStr.substring(0, 100), parseError);
              }
            } else {
              // No complete object found, wait for more data
              break;
            }
          }
        }
        
        console.log('[Gemini] Calling onComplete');
        callback.onComplete();
      } catch (error) {
        console.error('[Gemini] Streaming read error:', error);
        callback.onError(error instanceof Error ? error : new Error(String(error)));
      }
    } catch (error) {
      console.error('[Gemini] Streaming error:', error);
      callback.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
