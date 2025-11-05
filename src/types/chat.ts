// AI Provider types and interfaces

export type AIProvider = 'gemini' | 'chatgpt';

export type TranslationService = 'tartunlp-public' | 'local-llm';

export type Language = 'sme' | 'fin' | 'en' | 'nb' | 'ru' | 'unknown';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatSession {
  id: string;
  provider: AIProvider;
  messages: Message[];
  systemInstruction: string;
  createdAt: Date;
}

export interface AIProviderConfig {
  apiKey: string;
}

export interface TranslationConfig {
  service: TranslationService;
  apiUrl?: string; // Optional custom URL
}

export interface AIService {
  sendMessage(
    messages: Message[],
    systemInstruction: string
  ): Promise<string>;
}
