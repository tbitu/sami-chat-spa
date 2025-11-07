// AI Provider types and interfaces

export type AIProvider = 'gemini' | 'chatgpt';

export type TranslationService = 'tartunlp-public' | 'local-llm';

// Sami languages supported by TartuNLP with Finnish language pairs
// sme = Northern Sami, smj = Lule Sami, sma = Southern Sami, smn = Inari Sami, sms = Skolt Sami
export type SamiLanguage = 'sme' | 'smj' | 'sma' | 'smn' | 'sms';

export type Language = 'sme' | 'smj' | 'sma' | 'smn' | 'sms' | 'fin' | 'en' | 'nb' | 'ru' | 'unknown';

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
  application?: string; // Optional application identifier sent to TartuNLP
  domain?: string; // Optional domain/style for translations
  samiLanguage?: SamiLanguage; // Selected Sami language for translation (default: 'sme')
}

export interface AIService {
  sendMessage(
    messages: Message[],
    systemInstruction: string
  ): Promise<string>;
}
