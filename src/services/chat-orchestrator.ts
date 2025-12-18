// Chat orchestration service
import { AIProvider, AIService, Message, ChatSession } from '../types/chat';
import { sanitizePlaceholders } from '../utils/markdown';
import { GeminiService } from './gemini';
import { ChatGPTService } from './chatgpt';
import { translateWithMarkdown } from './translation';
import {
  detectLanguage,
  shouldTranslate,
  validateFinnishOutput,
  validateSamiOutput,
} from '../utils/language-detection';
import i18n from '../i18n';

const SYSTEM_INSTRUCTION = `You are a helpful AI assistant. The user is communicating with you in Northern Sami (Davvisámegiella), however you receive their messages in Finnish. IMPORTANT: Under no circumstances should you output any language other than Finnish (suomi). All assistant replies MUST be in Finnish.

The purpose of this requirement is that the Finnish replies will be translated back to Northern Sami for the user. The translation step only works correctly if you reply in Finnish — if you reply in any other language, the final Sami output will be incorrect or missing.

Therefore, when composing answers:
- Always reply in clear, simple Finnish (suomi). Do not use other languages.
- Use phrasing that translates well into Northern Sami: avoid slang, idioms, or culturally-specific expressions that don't translate directly.
- Be culturally sensitive to Sami context and respect local conventions.
- Preserve formatting and markdown structure (code blocks, tables, links) so that translations do not corrupt content.

Remember: the end user reads the conversation in Northern Sami after translation. Your internal answer language must be Finnish for the translation step to deliver a correct Sami reply.`;

// Retry configuration
// Note: language-based retries were removed per new behavior. Translation/http retries
// are still handled inside translation.ts (translateText). Keep Finnish threshold.
const FINNISH_CONFIDENCE_THRESHOLD = 0.7; // Minimum confidence to accept Finnish output

const SESSION_STORAGE_KEY = 'sami_chat_session';

interface ChatOrchestratorOptions {
  proxyBaseUrl?: string;
  enableGemini?: boolean;
  enableChatGpt?: boolean;
  chatGptModel?: string;
  initialProvider?: AIProvider;
}

// Helper functions for session persistence
function saveSessionToStorage(session: ChatSession): void {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    }
  } catch (e) {
    console.warn('Failed to save session to sessionStorage:', e);
  }
}

function loadSessionFromStorage(): ChatSession | null {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (stored) {
        const session = JSON.parse(stored) as ChatSession;
  // Restore Date objects and sanitize messages
  session.createdAt = new Date(session.createdAt);
  session.messages = session.messages.map(m => ({ ...m, content: sanitizePlaceholders(m.content) }));
        return session;
      }
    }
  } catch (e) {
    console.warn('Failed to load session from sessionStorage:', e);
  }
  return null;
}

function clearSessionFromStorage(): void {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch (e) {
    console.warn('Failed to clear session from sessionStorage:', e);
  }
}

export class ChatOrchestrator {
  private geminiService?: GeminiService;
  private chatGptService?: ChatGPTService;
  private currentSession?: ChatSession;

  constructor(
    geminiApiKey?: string,
    openaiApiKey?: string,
    geminiModel?: string,
    options?: ChatOrchestratorOptions
  ) {
    const proxyBaseUrl = options?.proxyBaseUrl?.replace(/\/$/, '');
    const geminiEnabled = Boolean(geminiApiKey) || Boolean(options?.enableGemini);
    const chatGptEnabled = Boolean(openaiApiKey) || Boolean(options?.enableChatGpt);

    if (geminiEnabled && (geminiApiKey || proxyBaseUrl !== undefined)) {
      this.geminiService = new GeminiService(geminiApiKey, geminiModel, { proxyBaseUrl });
    }
    if (chatGptEnabled && (openaiApiKey || proxyBaseUrl !== undefined)) {
      this.chatGptService = new ChatGPTService(openaiApiKey, options?.chatGptModel, { proxyBaseUrl });
    }

    // Try to restore session from sessionStorage; discard it if provider is unavailable.
    this.restoreSession();
    if (this.currentSession && !this.hasProvider(this.currentSession.provider)) {
      this.currentSession = undefined;
    }

    // If we have no active session but at least one provider, create a new one using the preferred provider.
    if (!this.currentSession) {
      const available = this.getAvailableProviders();
      if (available.length > 0) {
        const initial = options?.initialProvider && available.includes(options.initialProvider)
          ? options.initialProvider
          : available[0];
        this.createSession(initial);
      }
    }
  }

  /**
   * Restore session from sessionStorage if available
   */
  private restoreSession(): void {
    const stored = loadSessionFromStorage();
    if (stored) {
      console.log('Restored session from sessionStorage:', stored.id);
      this.currentSession = stored;
    }
  }

  /**
   * Update the Gemini model used by the orchestrator at runtime.
   * Persists to the underlying GeminiService if present.
   */
  setGeminiModel(model?: string): void {
    if (!model) return;
    if (this.geminiService) {
      this.geminiService.setModel(model);
    }
  }

  getAvailableProviders(): AIProvider[] {
    const providers: AIProvider[] = [];
    if (this.geminiService) providers.push('gemini');
    if (this.chatGptService) providers.push('chatgpt');
    return providers;
  }

  private hasProvider(provider: AIProvider): boolean {
    return provider === 'gemini' ? Boolean(this.geminiService) : Boolean(this.chatGptService);
  }

  private getService(provider: AIProvider): AIService {
    if (provider === 'gemini') {
      if (!this.geminiService) {
        throw new Error('Gemini API key not configured');
      }
      return this.geminiService;
    } else {
      if (!this.chatGptService) {
        throw new Error('OpenAI API key not configured');
      }
      return this.chatGptService;
    }
  }

  createSession(provider: AIProvider, customInstruction?: string): ChatSession {
    if (!this.hasProvider(provider)) {
      throw new Error(`Provider ${provider} not configured`);
    }

    this.currentSession = {
      id: crypto.randomUUID(),
      provider,
      messages: [],
      systemInstruction: customInstruction || SYSTEM_INSTRUCTION,
      createdAt: new Date(),
    };
    saveSessionToStorage(this.currentSession);
    return this.currentSession;
  }

  getCurrentSession(): ChatSession | undefined {
    return this.currentSession;
  }

  async sendMessage(userMessageInSami: string, preserveFormatting: boolean = false): Promise<string> {
    if (!this.currentSession) {
      throw new Error('No active session. Create a session first.');
    }

    console.log('[Orchestrator] preserveFormatting:', preserveFormatting);

    // STAGE 1: Pre-Translation - Detect if input needs translation
    console.log('[Orchestrator] Stage 1: Detecting input language...');
    const inputLangDetection = detectLanguage(userMessageInSami);
    console.log(`[Orchestrator] Detected: ${inputLangDetection.language} (confidence: ${inputLangDetection.confidence.toFixed(2)})`);

    let userMessageInFinnish: string;
    
    if (!shouldTranslate(userMessageInSami)) {
      // Input is clearly NOT Sami (detected as fin/en/nb with confidence) - bypass translation
      console.log(`[Orchestrator] Input is ${inputLangDetection.language}, bypassing sme→fin translation`);
      userMessageInFinnish = userMessageInSami;
      
      // Update system instruction to handle non-Sami input
      // Note: Still require Finnish output for translation back to Sami UI
    } else {
      // Normal flow: Translate user message (Sami or unknown) from detected language to Finnish
      console.log('[Orchestrator] Input is Sami or unknown, translating to Finnish...');
      userMessageInFinnish = await translateWithMarkdown(
        userMessageInSami,
        'sami-fin',
        preserveFormatting
      );
    }

    // If formatting is disabled, append instruction to avoid markdown in response
    if (!preserveFormatting) {
      userMessageInFinnish += '\n\nVastaa pelkkänä tekstinä ilman markdown-muotoilua (ei lihavointia, kursivointia, otsikoita, taulukoita tai koodilohkoja).';
    }

    // Step 2: Add user message to history
    const userMessage: Message = {
      role: 'user',
      content: userMessageInFinnish,
    };
    this.currentSession.messages.push(userMessage);

    // Step 3: Send to AI provider with retry logic for language validation
    console.log(`[Orchestrator] Sending message to ${this.currentSession.provider}...`);
    const service = this.getService(this.currentSession.provider);
    const assistantResponseInFinnish = await service.sendMessage(
      this.currentSession.messages,
      this.currentSession.systemInstruction
    );

    // STAGE 2: Post-LLM - Validate LLM responded in Finnish
    // NOTE: Do not retry the LLM on language mismatch anymore. We validate and log
    // issues but proceed to translation so that downstream translation diagnostics
    // (including Cyrillic detection) can run and be surfaced to the user.
    console.log('[Orchestrator] Stage 2: Validating LLM response language (no-retry)...');
    const finnishValidation = validateFinnishOutput(assistantResponseInFinnish, FINNISH_CONFIDENCE_THRESHOLD);
    if (!finnishValidation.isValid) {
      console.warn('[Orchestrator] LLM language validation failed (no retries will be attempted):', finnishValidation.errors);
      console.warn(`[Orchestrator] Detected language: ${finnishValidation.language}, confidence: ${finnishValidation.confidence.toFixed(2)}`);
      for (const w of finnishValidation.warnings) console.warn('[Orchestrator]', w);
    }

    // Step 4: Add assistant response to history
    const assistantMessage: Message = {
      role: 'assistant',
      content: assistantResponseInFinnish,
    };
    this.currentSession.messages.push(assistantMessage);
    
    // Save session to persist the conversation
    saveSessionToStorage(this.currentSession);

    // Step 5: Translate response from Finnish to Sami
    console.log('[Orchestrator] Translating response from Finnish to Sami...');
    const assistantResponseInSami = await translateWithMarkdown(
      assistantResponseInFinnish,
      'fin-sami',
      preserveFormatting
    );

    // STAGE 3: Post-Translation - Validate Sami output quality
    console.log('[Orchestrator] Stage 3: Validating Sami output...');
    const samiValidation = validateSamiOutput(assistantResponseInSami);

    if (!samiValidation.isValid) {
      console.error('[Orchestrator] Sami output invalid:', samiValidation.errors);

      // Localize the warning with i18n, passing the error details. The locale string
      // includes a placeholder {{errors}} which we fill with a semicolon-joined list.
      const localized = i18n.t('errors.fallbackWarning', { errors: samiValidation.errors.join('; ') });

      // Try to obtain a Sami rendering of the localized warning by translating the localized
      // string (which may be in the current UI language) to Sami. If that fails, fall back to localized.
      let warningToShow = localized as string;
      try {
        const translatedWarning = await translateWithMarkdown(localized as string, 'fin-sami', preserveFormatting);
        if (translatedWarning && translatedWarning.trim().length > 0) {
          warningToShow = translatedWarning;
        }
      } catch (err) {
        console.warn('[Orchestrator] Warning translation failed, using localized warning:', err);
      }

      // Compose final response with a stable marker so the UI can render a discrete banner.
      const WARNING_START = '@@WARNING_START@@';
      const WARNING_END = '@@WARNING_END@@';
      const fallbackResponse = `${WARNING_START}${warningToShow}${WARNING_END}\n\n${assistantResponseInSami}`;

      // Log the fallback and return it to the caller instead of throwing
      console.warn('[Orchestrator] Returning fallback response (translated Sami text + warning)');
      return fallbackResponse;
    }

    // Log warnings if any
    for (const warning of samiValidation.warnings) {
      console.warn(`[Orchestrator] ${warning}`);
    }

    return assistantResponseInSami;
  }

  getMessageHistory(): Message[] {
    return this.currentSession?.messages || [];
  }

  clearSession(): void {
    this.currentSession = undefined;
    clearSessionFromStorage();
  }
}
