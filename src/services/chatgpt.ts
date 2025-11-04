// ChatGPT (OpenAI) API Service
import { AIService, Message, StreamCallback } from '../types/chat';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODELS_URL = 'https://api.openai.com/v1/models';
const DEFAULT_MODEL = 'gpt-4-turbo-preview';

export interface OpenAIModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

interface ListModelsResponse {
  object: string;
  data: OpenAIModel[];
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface OpenAIResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
}

export class ChatGPTService implements AIService {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = DEFAULT_MODEL) {
    this.apiKey = apiKey;
    this.model = model;
  }

  /**
   * Fetch available models from the OpenAI API
   */
  async listAvailableModels(): Promise<OpenAIModel[]> {
    try {
      const response = await fetch(OPENAI_MODELS_URL, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });
      
      if (!response.ok) {
        console.error('Failed to fetch models:', response.statusText);
        return [];
      }

      const data: ListModelsResponse = await response.json();
      
      // Filter to only chat completion models (gpt-* models)
      // Exclude deprecated models, base models, and instruct variants
      const filteredModels = data.data.filter(model => {
        const modelId = model.id.toLowerCase();
        
        // Only include GPT models
        if (!modelId.startsWith('gpt-')) {
          return false;
        }
        
        // Exclude deprecated, instruct, base, and vision-only models
        if (modelId.includes('instruct') || 
            modelId.includes('base') ||
            modelId.includes('0301') ||
            modelId.includes('0314') ||
            modelId.includes('vision')) {
          return false;
        }
        
        return true;
      });

      // Sort by model name (newer models first)
      return filteredModels.sort((a, b) => {
        const aId = a.id.toLowerCase();
        const bId = b.id.toLowerCase();
        
        // Prioritize gpt-4 over gpt-3.5
        if (aId.startsWith('gpt-4') && !bId.startsWith('gpt-4')) return -1;
        if (!aId.startsWith('gpt-4') && bId.startsWith('gpt-4')) return 1;
        
        // Then sort alphabetically
        return aId.localeCompare(bId);
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

  private prepareMessages(
    messages: Message[],
    systemInstruction: string
  ): OpenAIMessage[] {
    const systemMessage: OpenAIMessage = {
      role: 'system',
      content: systemInstruction,
    };

    const conversationMessages: OpenAIMessage[] = messages
      .filter(msg => msg.role !== 'system')
      .map(msg => ({
        role: msg.role,
        content: msg.content,
      }));

    return [systemMessage, ...conversationMessages];
  }

  async sendMessage(
    messages: Message[],
    systemInstruction: string
  ): Promise<string> {
    const preparedMessages = this.prepareMessages(messages, systemInstruction);

    const request: OpenAIRequest = {
      model: this.model,
      messages: preparedMessages,
      temperature: 0.7,
      max_tokens: 4096,
    };

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', { status: response.status, statusText: response.statusText, body: errorText });
      
      // Provide more helpful error messages
      if (response.status === 400 && errorText.includes('invalid_api_key')) {
        throw new Error('Invalid API key. Please check your OpenAI API key and try again.');
      }
      if (response.status === 401) {
        throw new Error('Unauthorized. Please verify your OpenAI API key.');
      }
      if (response.status === 404) {
        throw new Error('Model not found. Please check that the model exists and is accessible.');
      }
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please wait a moment and try again.');
      }
      
      throw new Error(`OpenAI API error: ${response.statusText} - ${errorText}`);
    }

    const data: OpenAIResponse = await response.json();
    
    if (!data.choices || data.choices.length === 0) {
      throw new Error('No response from ChatGPT');
    }

    return data.choices[0].message.content;
  }

  async streamMessage(
    messages: Message[],
    systemInstruction: string,
    callback: StreamCallback
  ): Promise<void> {
    console.log('[ChatGPT] streamMessage called');
    const preparedMessages = this.prepareMessages(messages, systemInstruction);
    console.log('[ChatGPT] Messages prepared, count:', preparedMessages.length);

    const request = {
      model: this.model,
      messages: preparedMessages,
      temperature: 0.7,
      max_tokens: 4096,
      stream: true,
    };

    console.log('[ChatGPT] Making request to:', OPENAI_API_URL);

    try {
      const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(request),
      });

      console.log('[ChatGPT] Response received, status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[ChatGPT] API error:', { status: response.status, statusText: response.statusText, body: errorText });
        callback.onError(new Error(`OpenAI API error: ${response.statusText}`));
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        console.error('[ChatGPT] Response body is not readable');
        callback.onError(new Error('Response body is not readable'));
        return;
      }

      console.log('[ChatGPT] Starting to read stream...');
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        let streamFinished = false;
        while (!streamFinished) {
          const { done, value } = await reader.read();

          if (done) {
            console.log('[ChatGPT] Stream complete');
            streamFinished = true;
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6).trim();
              if (jsonStr === '[DONE]') {
                continue;
              }
              
              try {
                const data = JSON.parse(jsonStr);
                const chunk = data.choices?.[0]?.delta?.content;
                if (chunk) {
                  console.log('[ChatGPT] Incremental chunk:', chunk.length, 'chars, content:', JSON.stringify(chunk.substring(0, 50)));
                  callback.onChunk(chunk);
                }
              } catch (parseError) {
                console.warn('[ChatGPT] Failed to parse SSE chunk:', parseError);
              }
            }
          }
        }
        
        console.log('[ChatGPT] Calling onComplete');
        callback.onComplete();
      } catch (error) {
        console.error('[ChatGPT] Streaming read error:', error);
        callback.onError(error instanceof Error ? error : new Error(String(error)));
      }
    } catch (error) {
      console.error('[ChatGPT] Streaming error:', error);
      callback.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
