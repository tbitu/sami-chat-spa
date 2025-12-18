// ChatGPT (OpenAI) API Service
import { AIService, Message, StreamingHandlers } from '../types/chat';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODELS_URL = 'https://api.openai.com/v1/models';
// Default should be the most recent recommended chat family (user requested)
const DEFAULT_MODEL = 'gpt-5-mini';

// Include GPT-5 family first, include chat variant, then gpt-4.1/gpt-4o/gpt-4, then gpt-3.5
const SUPPORTED_MODEL_PREFIXES = ['gpt-5', 'gpt-5-chat', 'gpt-4.1', 'gpt-4o', 'gpt-4', 'gpt-3.5'];
const EXCLUDED_MODEL_KEYWORDS = [
  'instruct',
  'base',
  '0301',
  '0314',
  'audio',
  'tts',
  'whisper',
  'embedding',
  'moderation',
  'preview',
  'realtime',
  'vision',
];
const DATE_SUFFIX_REGEX = /\d{4}-\d{2}-\d{2}$/;

interface ChatGPTServiceOptions {
  proxyBaseUrl?: string;
}

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
  top_p?: number;
  // Use max_completion_tokens per OpenAI Responses/Chat API docs; max_tokens is deprecated
  max_completion_tokens?: number;
  stream?: boolean;
}

interface OpenAIResponsePart {
  type: string;
  text?: string;
}

interface OpenAIResponse {
  choices: {
    message: {
      content: string | OpenAIResponsePart[];
    };
  }[];
}

function isSupportedOpenAIChatModel(modelId: string): boolean {
  const id = modelId.toLowerCase();
  if (!SUPPORTED_MODEL_PREFIXES.some(prefix => id.startsWith(prefix))) {
    return false;
  }
  return !EXCLUDED_MODEL_KEYWORDS.some(keyword => id.includes(keyword));
}

function rankOpenAIModel(id: string): number {
  const lower = id.toLowerCase();
  const index = SUPPORTED_MODEL_PREFIXES.findIndex(prefix => lower.startsWith(prefix));
  return index === -1 ? SUPPORTED_MODEL_PREFIXES.length : index;
}

export class ChatGPTService implements AIService {
  private apiKey: string;
  private model: string;
  private proxyBaseUrl?: string;
  private mode: 'direct' | 'proxy';

  constructor(apiKey: string | undefined, model: string = DEFAULT_MODEL, options?: ChatGPTServiceOptions) {
    this.proxyBaseUrl = options?.proxyBaseUrl !== undefined ? options.proxyBaseUrl.replace(/\/$/, '') : undefined;
    this.mode = this.proxyBaseUrl !== undefined ? 'proxy' : 'direct';
    this.apiKey = apiKey || '';
    this.model = model;

    if (this.mode === 'direct' && !this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }
  }

  /**
   * Fetch available models from the OpenAI API
   */
  async listAvailableModels(): Promise<OpenAIModel[]> {
    if (this.mode === 'proxy') {
      return [];
    }

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

      const filteredModels = data.data.filter(model => isSupportedOpenAIChatModel(model.id));

      return filteredModels.sort((a, b) => {
        const aId = a.id.toLowerCase();
        const bId = b.id.toLowerCase();

        const rankDelta = rankOpenAIModel(aId) - rankOpenAIModel(bId);
        if (rankDelta !== 0) {
          return rankDelta;
        }

        const aIsAlias = !DATE_SUFFIX_REGEX.test(aId);
        const bIsAlias = !DATE_SUFFIX_REGEX.test(bId);
        if (aIsAlias !== bIsAlias) {
          return aIsAlias ? -1 : 1;
        }

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
    const trimmedInstruction = systemInstruction?.trim();
    const systemMessages: OpenAIMessage[] = trimmedInstruction
      ? [{ role: 'system', content: trimmedInstruction }]
      : [];

    const conversationMessages: OpenAIMessage[] = messages
      .filter(msg => msg.role !== 'system')
      .map(msg => ({
        role: msg.role,
        content: msg.content,
      }));

    return [...systemMessages, ...conversationMessages];
  }

  async sendMessage(
    messages: Message[],
    systemInstruction: string
  ): Promise<string> {
    if (this.mode === 'proxy') {
      return this.sendViaProxy(messages, systemInstruction);
    }

    const preparedMessages = this.prepareMessages(messages, systemInstruction);

    // Build the minimal request payload. Some models reject optional params
    // like temperature/top_p/max_completion_tokens. Sending only the
    // required fields (model + messages) avoids unsupported-parameter errors.
    const request: OpenAIRequest = {
      model: this.model,
      messages: preparedMessages,
    };

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    };

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers,
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
      if (response.status === 403 && errorText.includes('insufficient_quota')) {
        throw new Error('Quota exceeded. Please review your OpenAI plan and usage limits.');
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

    const content = this.extractMessageText(data.choices[0]?.message?.content);
    if (!content) {
      throw new Error('No textual response from ChatGPT');
    }

    return content;
  }

  async streamMessage(
    messages: Message[],
    systemInstruction: string,
    handlers: StreamingHandlers
  ): Promise<void> {
    if (this.mode === 'proxy') {
      await this.sendViaProxyStreaming(messages, systemInstruction, handlers);
      return;
    }

    try {
      const full = await this.sendMessage(messages, systemInstruction);
      handlers.onPartial(full);
      handlers.onDone(full);
    } catch (err) {
      handlers.onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async sendViaProxy(
    messages: Message[],
    systemInstruction: string
  ): Promise<string> {
    const target = this.buildProxyUrl('api/proxy/chatgpt');

    // Build the same minimal payload we use for direct calls to avoid
    // unsupported parameter errors. Proxy just forwards to OpenAI.
    const preparedMessages = this.prepareMessages(messages, systemInstruction);

    const response = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: preparedMessages,
        stream: true,
      }),
    });

    // Try streaming first if the proxy/OpenAI responded with an event stream
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && response.body && contentType.includes('text/event-stream')) {
      try {
        return await this.consumeSseStream(response.body);
      } catch (err) {
        console.warn('[ChatGPT] Proxy streaming parse failed, falling back to buffered JSON:', err);
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Proxy ChatGPT error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json() as { content?: string; choices?: OpenAIResponse['choices'] };

    // Prefer wrapped { content } shape
    if (data.content && typeof data.content === 'string') {
      return data.content;
    }

    // Fallback: if Apache proxy returns raw OpenAI response, extract it
    if (Array.isArray(data.choices) && data.choices.length > 0) {
      const extracted = this.extractMessageText(data.choices[0]?.message?.content as string | OpenAIResponsePart[] | undefined);
      if (extracted) return extracted;
    }

    throw new Error('Proxy ChatGPT returned no content');
  }

  private async sendViaProxyStreaming(
    messages: Message[],
    systemInstruction: string,
    handlers: StreamingHandlers
  ): Promise<void> {
    const target = this.buildProxyUrl('api/proxy/chatgpt');

    const preparedMessages = this.prepareMessages(messages, systemInstruction);

    const response = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: preparedMessages,
        stream: true,
      }),
    });

    const contentType = response.headers.get('content-type') || '';
    if (response.ok && response.body && contentType.includes('text/event-stream')) {
      await this.consumeSseStreamWithHandlers(response.body, handlers);
      return;
    }

    if (!response.ok) {
      const errorText = await response.text();
      handlers.onError(new Error(`Proxy ChatGPT error: ${response.status} ${response.statusText} - ${errorText}`));
      return;
    }

    const data = await response.json() as { content?: string; choices?: { message?: { content?: string | OpenAIResponsePart[] } }[] };

    let content: string | undefined;
    if (data.content && typeof data.content === 'string') {
      content = data.content;
    } else if (Array.isArray(data.choices) && data.choices.length > 0) {
      content = this.extractMessageText(data.choices[0]?.message?.content as string | OpenAIResponsePart[] | undefined);
    }

    if (content) {
      handlers.onPartial(content);
      handlers.onDone(content);
      return;
    }

    handlers.onError(new Error('Proxy ChatGPT returned no content'));
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

  private extractMessageText(content: string | OpenAIResponsePart[] | undefined): string {
    if (typeof content === 'string') {
      return content.trim();
    }

    if (Array.isArray(content)) {
      const text = content
        .map(part => (part.type === 'text' && part.text) ? part.text : '')
        .filter(Boolean)
        .join('\n')
        .trim();
      return text;
    }

    return '';
  }

  private async consumeSseStream(body: ReadableStream<Uint8Array>): Promise<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullText = '';

    let finished = false;
    while (!finished) {
      const { done, value } = await reader.read();
      finished = done;
      if (done) break;
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.replace(/^data:\s*/, '');
          if (payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload) as {
              choices?: { delta?: { content?: { text?: string }[] } }[];
              message?: { content?: string };
              content?: string;
            };
            // Handle both OpenAI delta shape and proxy-wrapped content
            const delta = json.choices?.[0]?.delta?.content?.[0]?.text || json.content || json.message?.content || '';
            if (delta) fullText += delta;
          } catch (err) {
            console.warn('[ChatGPT] Failed to parse SSE chunk:', err);
          }
        }
      }
    }

    if (buffer.trim()) {
      try {
        const json = JSON.parse(buffer.replace(/^data:\s*/, '')) as {
          choices?: { delta?: { content?: { text?: string }[] } }[];
          message?: { content?: string };
          content?: string;
        };
        const delta = json.choices?.[0]?.delta?.content?.[0]?.text || json.content || json.message?.content || '';
        if (delta) fullText += delta;
      } catch {
        // ignore trailing parse issues
      }
    }

    return fullText.trim();
  }

  private async consumeSseStreamWithHandlers(
    body: ReadableStream<Uint8Array>,
    handlers: StreamingHandlers
  ): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullText = '';

    let finished = false;
    while (!finished) {
      const { done, value } = await reader.read();
      finished = done;
      if (done) break;
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.replace(/^data:\s*/, '');
          if (payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload) as {
              choices?: { delta?: { content?: { text?: string }[] } }[];
              message?: { content?: string };
              content?: string;
            };
            const delta = json.choices?.[0]?.delta?.content?.[0]?.text || json.content || json.message?.content || '';
            if (delta) {
              fullText += delta;
              try {
                handlers.onPartial(delta);
              } catch (err) {
                console.warn('[ChatGPT] onPartial handler failed:', err);
              }
            }
          } catch (err) {
            console.warn('[ChatGPT] Failed to parse SSE chunk:', err);
          }
        }
      }
    }

    if (buffer.trim()) {
      try {
        const json = JSON.parse(buffer.replace(/^data:\s*/, '')) as {
          choices?: { delta?: { content?: { text?: string }[] } }[];
          message?: { content?: string };
          content?: string;
        };
        const delta = json.choices?.[0]?.delta?.content?.[0]?.text || json.content || json.message?.content || '';
        if (delta) {
          fullText += delta;
          try {
            handlers.onPartial(delta);
          } catch (err) {
            console.warn('[ChatGPT] onPartial handler failed (tail):', err);
          }
        }
      } catch {
        // ignore trailing parse issues
      }
    }

    try {
      handlers.onDone(fullText.trim());
    } catch (err) {
      console.warn('[ChatGPT] onDone handler failed:', err);
    }
  }
}
