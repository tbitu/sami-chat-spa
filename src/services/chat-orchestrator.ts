// Chat orchestration service
import { AIProvider, AIService, Message, ChatSession } from '../types/chat';
import { sanitizePlaceholders } from '../utils/markdown';
import { GeminiService } from './gemini';
import { ChatGPTService } from './chatgpt';
import { translateWithMarkdown } from './translation';
import {
  detectLanguage,
  isSami,
  validateFinnishOutput,
  validateSamiOutput,
} from '../utils/language-detection';

const SYSTEM_INSTRUCTION = `You are a helpful AI assistant. The user is communicating with you in Northern Sami (Davvisámegiella), however you receive their messages in Finnish. IMPORTANT: Under no circumstances should you output any language other than Finnish (suomi). All assistant replies MUST be in Finnish.

The purpose of this requirement is that the Finnish replies will be translated back to Northern Sami for the user. The translation step only works correctly if you reply in Finnish — if you reply in any other language, the final Sami output will be incorrect or missing.

Therefore, when composing answers:
- Always reply in clear, simple Finnish (suomi). Do not use other languages.
- Use phrasing that translates well into Northern Sami: avoid slang, idioms, or culturally-specific expressions that don't translate directly.
- Be culturally sensitive to Sami context and respect local conventions.
- Preserve formatting and markdown structure (code blocks, tables, links) so that translations do not corrupt content.

Remember: the end user reads the conversation in Northern Sami after translation. Your internal answer language must be Finnish for the translation step to deliver a correct Sami reply.`;

// Retry configuration
const MAX_LLM_LANGUAGE_RETRIES = 2; // Max retries for wrong language from LLM (Stage 2)
const MAX_TRANSLATION_RETRIES = 1;  // Max retries for translation quality issues (Stage 3)
const FINNISH_CONFIDENCE_THRESHOLD = 0.7; // Minimum confidence to accept Finnish output
const SAMI_BYPASS_THRESHOLD = 0.6; // Minimum confidence to detect non-Sami input

const SESSION_STORAGE_KEY = 'sami_chat_session';

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

  constructor(geminiApiKey?: string, openaiApiKey?: string, geminiModel?: string) {
    if (geminiApiKey) {
      this.geminiService = new GeminiService(geminiApiKey, geminiModel);
    }
    if (openaiApiKey) {
      this.chatGptService = new ChatGPTService(openaiApiKey);
    }
    
    // Try to restore session from sessionStorage
    this.restoreSession();
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

  async sendMessage(userMessageInSami: string): Promise<string> {
    if (!this.currentSession) {
      throw new Error('No active session. Create a session first.');
    }

    // STAGE 1: Pre-Translation - Detect if input is actually Sami
    console.log('[Orchestrator] Stage 1: Detecting input language...');
    const inputLangDetection = detectLanguage(userMessageInSami);
    console.log(`[Orchestrator] Detected: ${inputLangDetection.language} (confidence: ${inputLangDetection.confidence.toFixed(2)})`);

    let userMessageInFinnish: string;
    
    if (!isSami(userMessageInSami, SAMI_BYPASS_THRESHOLD)) {
      // Input is NOT Sami - bypass translation and send directly
      console.log(`[Orchestrator] Input is ${inputLangDetection.language}, bypassing sme→fin translation`);
      userMessageInFinnish = userMessageInSami;
      
      // Update system instruction to handle non-Sami input
      // Note: Still require Finnish output for translation back to Sami UI
    } else {
      // Normal flow: Translate user message from Sami to Finnish
      console.log('[Orchestrator] Translating user message from Sami to Finnish...');
      userMessageInFinnish = await translateWithMarkdown(
        userMessageInSami,
        'sme-fin'
      );
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
    let assistantResponseInFinnish = await service.sendMessage(
      this.currentSession.messages,
      this.currentSession.systemInstruction
    );

    // STAGE 2: Post-LLM - Validate LLM responded in Finnish
    console.log('[Orchestrator] Stage 2: Validating LLM response language...');
    let llmRetryCount = 0;
    let finnishValidation = validateFinnishOutput(assistantResponseInFinnish, FINNISH_CONFIDENCE_THRESHOLD);
    
    while (!finnishValidation.isValid && llmRetryCount < MAX_LLM_LANGUAGE_RETRIES) {
      llmRetryCount++;
      console.warn(`[Orchestrator] LLM validation failed (attempt ${llmRetryCount}/${MAX_LLM_LANGUAGE_RETRIES}):`, finnishValidation.errors);
      console.warn(`[Orchestrator] Detected language: ${finnishValidation.language}, confidence: ${finnishValidation.confidence.toFixed(2)}`);
      
      // Build retry instruction emphasizing Finnish requirement
      const retryInstruction = `${this.currentSession.systemInstruction}

⚠️ RETRY NOTICE: Your previous response was detected as ${finnishValidation.language} with ${(finnishValidation.confidence * 100).toFixed(0)}% confidence. This is INCORRECT.

You MUST respond ONLY in Finnish (suomi). The translation system requires Finnish output.
Please reformulate your answer in clear, simple Finnish.`;

      // Remove the failed response from history
      this.currentSession.messages.pop();
      
      // Retry with enhanced instruction
      assistantResponseInFinnish = await service.sendMessage(
        this.currentSession.messages,
        retryInstruction
      );
      
      // Re-validate
      finnishValidation = validateFinnishOutput(assistantResponseInFinnish, FINNISH_CONFIDENCE_THRESHOLD);
    }
    
    if (!finnishValidation.isValid) {
      console.error('[Orchestrator] LLM still not responding in Finnish after retries. Proceeding with translation anyway.');
      // Log warnings but continue (fallback behavior)
      for (const warning of finnishValidation.warnings) {
        console.warn(`[Orchestrator] ${warning}`);
      }
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
    let assistantResponseInSami = await translateWithMarkdown(
      assistantResponseInFinnish,
      'fin-sme'
    );

    // STAGE 3: Post-Translation - Validate Sami output quality
    console.log('[Orchestrator] Stage 3: Validating Sami output...');
    let translationRetryCount = 0;
    let samiValidation = validateSamiOutput(assistantResponseInSami);
    
    while (!samiValidation.isValid && translationRetryCount < MAX_TRANSLATION_RETRIES) {
      translationRetryCount++;
      console.warn(`[Orchestrator] Sami validation failed (attempt ${translationRetryCount}/${MAX_TRANSLATION_RETRIES}):`, samiValidation.errors);
      
      // Request LLM to rephrase in simpler Finnish
      const rephraseInstruction = `The following Finnish response caused translation errors when converted to Northern Sami:

--- ORIGINAL FINNISH RESPONSE ---
${assistantResponseInFinnish}
--- END ORIGINAL ---

Translation errors detected:
${samiValidation.errors.join('\n')}

Please rewrite this ENTIRE response in simpler, clearer Finnish that will translate better to Northern Sami.
Requirements:
- Keep the same information and structure
- Use shorter, simpler sentences
- Avoid complex compound words
- Use common, everyday vocabulary
- Maintain the same level of detail and helpfulness

Provide the complete rewritten response in Finnish:`;

      const rephraseMessage: Message = {
        role: 'user',
        content: rephraseInstruction,
      };
      
      // Get rephrased response (don't add rephrase message to permanent history)
      const rephrasedFinnish = await service.sendMessage(
        [...this.currentSession.messages, rephraseMessage],
        this.currentSession.systemInstruction
      );
      
      console.log('[Orchestrator] Received rephrased response:', rephrasedFinnish.substring(0, 200) + '...');
      
      // Update the original Finnish response for re-translation
      assistantResponseInFinnish = rephrasedFinnish;
      
      // Also update the assistant message in history with rephrased version
      this.currentSession.messages[this.currentSession.messages.length - 1].content = rephrasedFinnish;
      saveSessionToStorage(this.currentSession);
      
      // Re-translate
      assistantResponseInSami = await translateWithMarkdown(rephrasedFinnish, 'fin-sme');
      
      // Re-validate
      samiValidation = validateSamiOutput(assistantResponseInSami);
    }
    
    if (!samiValidation.isValid) {
      console.error('[Orchestrator] Sami output still invalid after retries:', samiValidation.errors);
      throw new Error(`Translation quality issue: ${samiValidation.errors.join(', ')}`);
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
