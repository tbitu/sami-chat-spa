// Chat orchestration service
import { AIProvider, AIService, Message, ChatSession } from '../types/chat';
import { sanitizePlaceholders } from '../utils/markdown';
import { GeminiService } from './gemini';
import { ChatGPTService } from './chatgpt';
import { translateWithMarkdown, translatePreserveFormattingChunk } from './translation';
import { ChunkAggregator } from '../utils/chunk-aggregator';

const SYSTEM_INSTRUCTION = `You are a helpful AI assistant. The user is communicating with you in Northern Sami (Davvisámegiella), however you receive their messages in Finnish. IMPORTANT: Under no circumstances should you output any language other than Finnish (suomi). All assistant replies MUST be in Finnish.

The purpose of this requirement is that the Finnish replies will be translated back to Northern Sami for the user. The translation step only works correctly if you reply in Finnish — if you reply in any other language, the final Sami output will be incorrect or missing.

Therefore, when composing answers:
- Always reply in clear, simple Finnish (suomi). Do not use other languages.
- Use phrasing that translates well into Northern Sami: avoid slang, idioms, or culturally-specific expressions that don't translate directly.
- Be culturally sensitive to Sami context and respect local conventions.
- Preserve formatting and markdown structure (code blocks, tables, links) so that translations do not corrupt content.

Remember: the end user reads the conversation in Northern Sami after translation. Your internal answer language must be Finnish for the translation step to deliver a correct Sami reply.`;

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

  // Step 1: Translate user message from Sami to Finnish
    console.log('Translating user message from Sami to Finnish...');
    const userMessageInFinnish = await translateWithMarkdown(
      userMessageInSami,
      'sme-fin'
    );

    // Step 2: Add user message to history
    const userMessage: Message = {
      role: 'user',
      content: userMessageInFinnish,
    };
    this.currentSession.messages.push(userMessage);

    // Step 3: Send to AI provider
    console.log(`Sending message to ${this.currentSession.provider}...`);
    const service = this.getService(this.currentSession.provider);
    const assistantResponseInFinnish = await service.sendMessage(
      this.currentSession.messages,
      this.currentSession.systemInstruction
    );

    // Step 4: Add assistant response to history
    const assistantMessage: Message = {
      role: 'assistant',
      content: assistantResponseInFinnish,
    };
    this.currentSession.messages.push(assistantMessage);
    
    // Save session to persist the conversation
    saveSessionToStorage(this.currentSession);

  // Step 5: Translate response from Finnish to Sami
    console.log('Translating response from Finnish to Sami...');
    const assistantResponseInSami = await translateWithMarkdown(
      assistantResponseInFinnish,
      'fin-sme'
    );

    return assistantResponseInSami;
  }

  async sendMessageStreaming(
    userMessageInSami: string,
    onProgress: (translatedChunk: string) => void
  ): Promise<string> {
    console.log('[Orchestrator] sendMessageStreaming called');
    
    if (!this.currentSession) {
      throw new Error('No active session. Create a session first.');
    }

  // Step 1: Translate user message from Sami to Finnish
    console.log('Translating user message from Sami to Finnish...');
    const userMessageInFinnish = await translateWithMarkdown(
      userMessageInSami,
      'sme-fin'
    );
    console.log('[Orchestrator] User message translated (' + userMessageInFinnish.length + ' chars):', userMessageInFinnish);

    // Step 2: Add user message to history
    const userMessage: Message = {
      role: 'user',
      content: userMessageInFinnish,
    };
    this.currentSession.messages.push(userMessage);

    // Step 3: Stream from AI provider
    console.log(`[Orchestrator] Streaming message from ${this.currentSession.provider}...`);
    const service = this.getService(this.currentSession.provider);
    
    if (!service.streamMessage) {
      console.log('[Orchestrator] Streaming not supported, falling back to non-streaming');
      // Fallback to non-streaming if not supported
      return this.sendMessage(userMessageInSami);
    }

    console.log('[Orchestrator] Stream method exists, creating aggregator...');

    console.log('[Orchestrator] Stream method exists, creating aggregator...');
    
  let fullResponseInFinnish = '';
    let fullResponseInSami = '';

    // Create chunk aggregator that translates at natural breaks
    // Uses queue-based sequential processing to avoid duplicate/overlapping translations
    // minChunkSize: 200 chars - approximately 2-3 sentences, reduces API calls significantly
    // Processes one translation at a time to ensure ordering and prevent race conditions
    const aggregator = new ChunkAggregator(
      async (textToTranslate: string) => {
        console.log('[Orchestrator] Translation callback - translating chunk (preserve formatting):');
        console.log('[Orchestrator] Full text to translate (' + textToTranslate.length + ' chars):', textToTranslate);
        // Use the lower-level preserve-formatting translator which only sends
        // inner text between markdown formattings to the translation API.
        const translatedChunk = await translatePreserveFormattingChunk(
          textToTranslate,
          'fin-sme'
        );
        console.log('[Orchestrator] Translation completed (' + translatedChunk.length + ' chars):', translatedChunk);
        fullResponseInSami += translatedChunk;
        onProgress(translatedChunk);
      },
      0,     // Not used with queue-based processing
      200,   // Need at least 200 characters (2-3 sentences) before translating - reduced API calls
      1      // Always 1 for sequential processing
    );

    console.log('[Orchestrator] Aggregator created, setting up promise...');

    return new Promise((resolve, reject) => {
      console.log('[Orchestrator] Promise created, setting up timeout...');
      let streamingStarted = false;
      
      // Safety timeout: If no chunks received within 30 seconds, error out
      const timeoutId = setTimeout(() => {
        if (!streamingStarted) {
          console.error('[Orchestrator] Streaming timeout - no data received');
          reject(new Error('Streaming timeout - no response from server'));
        }
      }, 30000);
      
      console.log('[Orchestrator] Calling service.streamMessage...');
      
      service.streamMessage!(
        this.currentSession!.messages,
        this.currentSession!.systemInstruction,
        {
          onChunk: (chunk: string) => {
            streamingStarted = true;
            clearTimeout(timeoutId);
            console.log(`[Orchestrator] Received chunk: ${chunk.length} chars`);
            fullResponseInFinnish += chunk;
            // Don't await - let it run in parallel
            aggregator.addChunk(chunk).catch(error => {
              console.error('[Orchestrator] Error adding chunk:', error);
            });
          },
          onComplete: async () => {
            clearTimeout(timeoutId);
            console.log('[Orchestrator] AI streaming complete, flushing remaining translations...');
            console.log(`[Orchestrator] Full Finnish response: ${fullResponseInFinnish.length} chars`);
            try {
              // Flush and wait for ALL translations to complete
              await aggregator.flush();
              
              console.log('[Orchestrator] Flush complete, full Sami response:', fullResponseInSami.length, 'chars');
              
              // Add assistant response to history
              const assistantMessage: Message = {
                role: 'assistant',
                content: fullResponseInFinnish,
              };
              this.currentSession!.messages.push(assistantMessage);
              
              // Save session to persist the conversation
              saveSessionToStorage(this.currentSession!);
              
              console.log('[Orchestrator] All translations complete, resolving promise');
              resolve(fullResponseInSami);
            } catch (error) {
              console.error('[Orchestrator] Error during flush:', error);
              reject(error);
            }
          },
          onError: (error: Error) => {
            clearTimeout(timeoutId);
            console.error('[Orchestrator] Streaming error:', error);
            reject(error);
          },
        }
      );
    });
  }

  getMessageHistory(): Message[] {
    return this.currentSession?.messages || [];
  }

  clearSession(): void {
    this.currentSession = undefined;
    clearSessionFromStorage();
  }
}
