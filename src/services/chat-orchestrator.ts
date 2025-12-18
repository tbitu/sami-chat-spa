// Chat orchestration service
import { AIProvider, AIService, Message, ChatSession, StreamingHandlers } from '../types/chat';
import { sanitizePlaceholders } from '../utils/markdown';
import { normalizeTranslatedSpacing } from '../utils/markdown';
import { GeminiService } from './gemini';
import { ChatGPTService } from './chatgpt';
import { translateWithMarkdown, translateText } from './translation';
import {
  detectLanguage,
  shouldTranslate,
  validateFinnishOutput,
  validateSamiOutput,
  detectTranslationArtifacts,
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

  async streamMessage(
    userMessageInSami: string,
    preserveFormatting: boolean = false,
    handlers: StreamingHandlers
  ): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active session. Create a session first.');
    }

    console.log('[Orchestrator] streamMessage preserveFormatting:', preserveFormatting);

    console.log('[Orchestrator] Stage 1: Detecting input language (stream)...');
    const inputLangDetection = detectLanguage(userMessageInSami);
    console.log(`[Orchestrator] Detected: ${inputLangDetection.language} (confidence: ${inputLangDetection.confidence.toFixed(2)})`);

    let userMessageInFinnish: string;

    if (!shouldTranslate(userMessageInSami)) {
      console.log(`[Orchestrator] Input is ${inputLangDetection.language}, bypassing sme→fin translation`);
      userMessageInFinnish = userMessageInSami;
    } else {
      console.log('[Orchestrator] Input is Sami or unknown, translating to Finnish...');
      userMessageInFinnish = await translateWithMarkdown(
        userMessageInSami,
        'sami-fin',
        preserveFormatting
      );
    }

    if (!preserveFormatting) {
      userMessageInFinnish += '\n\nVastaa pelkkänä tekstinä ilman markdown-muotoilua (ei lihavointia, kursivointia, otsikoita, taulukoita tai koodilohkoja).';
    }

    const userMessage: Message = {
      role: 'user',
      content: userMessageInFinnish,
    };
    this.currentSession.messages.push(userMessage);

    const service = this.getService(this.currentSession.provider);

    // If the provider does not support streaming, fall back to the non-streaming path
    if (!service.streamMessage) {
      console.log('[Orchestrator] Provider lacks streamMessage, using buffered flow');
      const assistantResponseInFinnish = await service.sendMessage(
        this.currentSession.messages,
        this.currentSession.systemInstruction
      );

      const assistantMessage: Message = {
        role: 'assistant',
        content: assistantResponseInFinnish,
      };
      this.currentSession.messages.push(assistantMessage);
      saveSessionToStorage(this.currentSession);

      console.log('[Orchestrator] Stage 2: Validating Finnish output (non-stream fallback)...');
      const finnishValidation = validateFinnishOutput(assistantResponseInFinnish, FINNISH_CONFIDENCE_THRESHOLD);
      if (!finnishValidation.isValid) {
        console.warn('[Orchestrator] LLM language validation failed (fallback, no-retry):', finnishValidation.errors);
        console.warn(`[Orchestrator] Detected language: ${finnishValidation.language}, confidence: ${finnishValidation.confidence.toFixed(2)}`);
        for (const w of finnishValidation.warnings) console.warn('[Orchestrator]', w);
      }

      console.log('[Orchestrator] Translating buffered response fin→sami...');
      const assistantResponseInSami = await translateWithMarkdown(
        assistantResponseInFinnish,
        'fin-sami',
        preserveFormatting
      );

      console.log('[Orchestrator] Stage 3: Validating Sami output (fallback)...');
      const samiValidation = validateSamiOutput(assistantResponseInSami);

      if (!samiValidation.isValid) {
        console.error('[Orchestrator] Sami output invalid (fallback):', samiValidation.errors);

        const localized = i18n.t('errors.fallbackWarning', { errors: samiValidation.errors.join('; ') });
        let warningToShow = localized as string;
        try {
          const translatedWarning = await translateWithMarkdown(localized as string, 'fin-sami', preserveFormatting);
          if (translatedWarning && translatedWarning.trim().length > 0) {
            warningToShow = translatedWarning;
          }
        } catch (err) {
          console.warn('[Orchestrator] Warning translation failed (fallback), using localized warning:', err);
        }

        const WARNING_START = '@@WARNING_START@@';
        const WARNING_END = '@@WARNING_END@@';
        const fallbackResponse = `${WARNING_START}${warningToShow}${WARNING_END}\n\n${assistantResponseInSami}`;

        handlers.onPartial(fallbackResponse);
        handlers.onDone(fallbackResponse);
        return;
      }

      for (const warning of samiValidation.warnings) {
        console.warn(`[Orchestrator] ${warning}`);
      }

      handlers.onPartial(assistantResponseInSami);
      handlers.onDone(assistantResponseInSami);
      return;
    }

    let finnishBuffer = '';
    let pendingLines = '';
    let structuredBuffer: string[] = []; // Buffer for lists/tables/code blocks
    let inStructuredBlock: 'list' | 'table' | 'code' | null = null;
    let currentListType: 'numbered' | 'bullet' | null = null; // Track list marker type
    let pendingTranslations = 0; // Track ongoing translation work
    let llmDone = false; // Track if LLM has finished streaming

    // Helper to check line types
    const isListStart = (line: string) => /^\s*(\d+\.|[-*+]|\[[ xX]\])\s/.test(line);
    const getListType = (line: string): 'numbered' | 'bullet' | null => {
      if (/^\s*\d+\./.test(line)) return 'numbered';
      if (/^\s*[-*+]/.test(line)) return 'bullet';
      return null;
    };
    const isTableRow = (line: string) => line.trim().startsWith('|') && line.trim().endsWith('|');
    const isCodeBlockMarker = (line: string) => /^\s*```/.test(line) || /^\s*~~~/.test(line);

    let isFlushingBlock = false; // Guard against concurrent flushes
    
    // Helper to signal completion when all work is done
    const checkCompletion = () => {
      if (llmDone && pendingTranslations === 0 && !isFlushingBlock) {
        console.log('[Orchestrator] All translations complete, signaling done');
        handlers.onDone('');
      }
    };
    
    const flushStructuredBlock = async () => {
      if (structuredBuffer.length === 0 || isFlushingBlock) {
        return; // Already flushing or nothing to flush
      }
      
      isFlushingBlock = true;
      const linesToTranslate = [...structuredBuffer];
      const blockType = inStructuredBlock;
      
      // Clear immediately to prevent re-entrance
      structuredBuffer = [];
      inStructuredBlock = null;
      currentListType = null;
      
      try {
        console.log(`[Orchestrator] Flushing ${blockType} block (${linesToTranslate.length} lines)`);
        pendingTranslations++;
        
        // For lists: translate each item individually to avoid pipe separator corruption
        // For code/tables: translate as a single block to preserve structure
        if (blockType === 'list') {
          for (const line of linesToTranslate) {
            try {
              // Split very long list items (>200 chars) into sentences to avoid API corruption
              const MAX_LIST_ITEM_LENGTH = 200;
              let translated: string;
              
              if (line.length > MAX_LIST_ITEM_LENGTH) {
                console.log(`[Orchestrator] List item too long (${line.length} chars), splitting into sentences`);
                
                // Split by sentence boundaries while preserving the list marker
                const listMarkerMatch = line.match(/^(\s*(?:\d+\.|[-*+]|\[[ xX]\])\s*)/);
                const marker = listMarkerMatch ? listMarkerMatch[0] : '';
                const content = line.substring(marker.length);
                
                // Split on sentence boundaries: period/exclamation/question mark followed by space and capital
                // This preserves the punctuation with the sentence
                const sentenceRegex = /(?<=[.!?])\s+(?=[A-ZČĐŊŠŦŽÄÖØÅÆ])/;
                const sentences = content.split(sentenceRegex);
                
                if (sentences.length <= 1) {
                  // Couldn't split meaningfully, translate as whole
                  translated = await translateWithMarkdown(line, 'fin-sami', preserveFormatting);
                  const artifactCheck = detectTranslationArtifacts(translated);
                  if (!artifactCheck.isValid) {
                    console.warn('[Orchestrator] Artifact in long item (no split), using Finnish');
                    translated = line;
                  }
                } else {
                  console.log(`[Orchestrator] Split into ${sentences.length} sentences`);
                  const translatedParts: string[] = [];
                  
                  // Translate first sentence with marker
                  const firstPart = marker + sentences[0];
                  let firstTranslated = await translateWithMarkdown(firstPart, 'fin-sami', preserveFormatting);
                  firstTranslated = normalizeTranslatedSpacing(firstTranslated);
                  
                  const artifactCheck1 = detectTranslationArtifacts(firstTranslated);
                  if (!artifactCheck1.isValid) {
                    console.warn('[Orchestrator] Artifact in first sentence, retrying whole line with plain translation');
                    // Retry whole line with plain translation (no markdown processing)
                    try {
                      await new Promise(resolve => setTimeout(resolve, 300));
                      translated = await translateText(line, 'fin-sami');
                      translated = normalizeTranslatedSpacing(translated);
                      const retryCheck = detectTranslationArtifacts(translated);
                      if (!retryCheck.isValid) {
                        console.error('[Orchestrator] Plain retry corrupted, using Finnish');
                        translated = line;
                      }
                      handlers.onPartial(translated + '\n');
                      continue; // Skip rest of splitting logic
                    } catch (retryErr) {
                      console.error('[Orchestrator] Retry failed:', retryErr);
                      translated = line;
                      handlers.onPartial(translated + '\n');
                      continue;
                    }
                  }
                  translatedParts.push(firstTranslated);
                  
                  // Translate remaining sentences
                  for (let i = 1; i < sentences.length; i++) {
                    const sentence = sentences[i];
                    let sentenceTranslated = await translateWithMarkdown(sentence, 'fin-sami', preserveFormatting);
                    sentenceTranslated = normalizeTranslatedSpacing(sentenceTranslated);
                    
                    const artifactCheck = detectTranslationArtifacts(sentenceTranslated);
                    if (!artifactCheck.isValid) {
                      console.warn(`[Orchestrator] Artifact in sentence ${i}, using Finnish`);
                      sentenceTranslated = sentence;
                    }
                    translatedParts.push(sentenceTranslated);
                  }
                  
                  // Join with space
                  translated = translatedParts.join(' ');
                  handlers.onPartial(translated + '\n');
                  continue; // Skip to next line
                }
              } else {
                // Normal length - translate as one unit
                translated = await translateWithMarkdown(line, 'fin-sami', preserveFormatting);
                translated = normalizeTranslatedSpacing(translated);
                
                // Check for artifacts in list items
                const artifactCheck = detectTranslationArtifacts(translated);
                if (!artifactCheck.isValid) {
                  console.warn(`[Orchestrator] Artifact in list item:`, artifactCheck.errors);
                  console.warn(`[Orchestrator] Retrying with plain translation (no markdown):`, line);
                  
                  try {
                    await new Promise(resolve => setTimeout(resolve, 300));
                    // Use plain translateText - this skips all markdown processing
                    // and preserves list markers like "9. " in the output
                    const plainTranslation = await translateText(line, 'fin-sami');
                    const normalized = normalizeTranslatedSpacing(plainTranslation);
                    
                    const retryCheck = detectTranslationArtifacts(normalized);
                    if (!retryCheck.isValid) {
                      console.error('[Orchestrator] Plain retry also corrupted');
                      console.warn('[Orchestrator] Attempting sentence-level split');
                      
                      // Last resort: split into smaller pieces
                      const listMarkerMatch = line.match(/^(\\s*(?:\\d+\\.|[-*+]|\\[[ xX]\\])\\s*)/);
                      const marker = listMarkerMatch ? listMarkerMatch[0] : '';
                      const content = line.substring(marker.length);
                      
                      // Split on sentence boundaries
                      const sentenceRegex = /(?<=[.!?])\\s+(?=[A-Z\u010c\u0110\u014a\u0160\u0166\u017d\u00c4\u00d6\u00d8\u00c5\u00c6])/;
                      const sentences = content.split(sentenceRegex);
                      
                      if (sentences.length > 1) {
                        console.log(`[Orchestrator] Translating ${sentences.length} sentences individually`);
                        const parts: string[] = [marker];
                        
                        for (let i = 0; i < sentences.length; i++) {
                          try {
                            const sentTrans = await translateText(sentences[i], 'fin-sami');
                            parts.push((i > 0 ? ' ' : '') + sentTrans);
                          } catch {
                            parts.push((i > 0 ? ' ' : '') + sentences[i]);
                          }
                        }
                        
                        translated = parts.join('');
                      } else {
                        // Can't split further - use Finnish
                        console.error('[Orchestrator] Cannot split further, using Finnish');
                        translated = line;
                      }
                    } else {
                      console.log('[Orchestrator] Plain retry successful');
                      translated = normalized;
                    }
                  } catch (retryErr) {
                    console.error('[Orchestrator] List item retry failed:', retryErr);
                    translated = line; // Fall back to Finnish with marker
                  }
                }
              }
              
              handlers.onPartial(translated + '\n');
            } catch (err) {
              console.warn(`[Orchestrator] List item translation failed:`, err);
              handlers.onPartial(line + '\n'); // fallback to original
            }
          }
        } else {
          // Code blocks and tables: translate as single block
          const blockText = linesToTranslate.join('\n');
          let translated = await translateWithMarkdown(blockText, 'fin-sami', preserveFormatting);
          translated = normalizeTranslatedSpacing(translated);
          
          // Check for artifacts in blocks
          const artifactCheck = detectTranslationArtifacts(translated);
          if (!artifactCheck.isValid) {
            console.warn(`[Orchestrator] Artifact in ${blockType} block:`, artifactCheck.errors);
            console.warn(`[Orchestrator] Retrying ${blockType} block (${linesToTranslate.length} lines)`);
            
            try {
              await new Promise(resolve => setTimeout(resolve, 300));
              translated = await translateWithMarkdown(blockText, 'fin-sami', preserveFormatting);
              translated = normalizeTranslatedSpacing(translated);
              
              const retryCheck = detectTranslationArtifacts(translated);
              if (!retryCheck.isValid) {
                console.error(`[Orchestrator] ${blockType} block retry corrupted, using Finnish`);
                translated = blockText;
              }
            } catch (retryErr) {
              console.error(`[Orchestrator] ${blockType} block retry failed:`, retryErr);
              translated = blockText;
            }
          }
          
          handlers.onPartial(translated + '\n');
        }
      } catch (err) {
        console.warn(`[Orchestrator] ${blockType} block translation failed:`, err);
      } finally {
        pendingTranslations--;
        checkCompletion();
        isFlushingBlock = false;
      }
    };

    try {
      await service.streamMessage(
        this.currentSession.messages,
        this.currentSession.systemInstruction,
        {
          onPartial: async (chunk: string) => {
            finnishBuffer += chunk;
            pendingLines += chunk;

            const lines = pendingLines.split('\n');
            pendingLines = lines.pop() || '';

            for (const line of lines) {
              // Empty line - flush any structured block and send the empty line
              if (line.trim() === '') {
                await flushStructuredBlock();
                handlers.onPartial('\n');
                continue;
              }

              // Code block markers
              if (isCodeBlockMarker(line)) {
                if (inStructuredBlock === 'code') {
                  // Closing code block
                  structuredBuffer.push(line);
                  await flushStructuredBlock();
                } else {
                  // Opening code block - flush any other block first
                  await flushStructuredBlock();
                  structuredBuffer = [line];
                  inStructuredBlock = 'code';
                }
                continue;
              }

              // Inside code block - just accumulate
              if (inStructuredBlock === 'code') {
                structuredBuffer.push(line);
                continue;
              }

              // Table row
              if (isTableRow(line)) {
                if (inStructuredBlock === 'table') {
                  structuredBuffer.push(line);
                } else {
                  await flushStructuredBlock();
                  structuredBuffer = [line];
                  inStructuredBlock = 'table';
                }
                continue;
              } else if (inStructuredBlock === 'table') {
                // End of table
                await flushStructuredBlock();
              }

              // List item
              if (isListStart(line)) {
                const lineListType = getListType(line);
                if (inStructuredBlock === 'list' && currentListType === lineListType) {
                  // Same list type, add to buffer
                  structuredBuffer.push(line);
                } else {
                  // Different list type or starting new list, flush previous
                  await flushStructuredBlock();
                  structuredBuffer = [line];
                  inStructuredBlock = 'list';
                  currentListType = lineListType;
                }
                continue;
              } else if (inStructuredBlock === 'list') {
                // Check if it's a continuation (indented) or end of list
                if (/^\s{2,}/.test(line)) {
                  structuredBuffer.push(line);
                  continue;
                } else {
                  // End of list - flush it
                  await flushStructuredBlock();
                }
              }

              
              // Regular line - flush any block and translate
              await flushStructuredBlock();
              pendingTranslations++;
              try {
                let translated = await translateWithMarkdown(line, 'fin-sami', preserveFormatting);
                translated = normalizeTranslatedSpacing(translated);
                
                // Check for artifacts and retry if needed
                const artifactCheck = detectTranslationArtifacts(translated);
                if (!artifactCheck.isValid) {
                  console.warn('[Orchestrator] Artifact detected in streaming line:', artifactCheck.errors);
                  console.warn('[Orchestrator] Retrying translation for line:', line);
                  
                  // Retry once
                  try {
                    await new Promise(resolve => setTimeout(resolve, 300));
                    translated = await translateWithMarkdown(line, 'fin-sami', preserveFormatting);
                    translated = normalizeTranslatedSpacing(translated);
                    
                    // Check again
                    const retryCheck = detectTranslationArtifacts(translated);
                    if (!retryCheck.isValid) {
                      console.error('[Orchestrator] Retry still corrupted, using original Finnish:', line);
                      // Add space before Finnish fallback to prevent concatenation with previous Sami text
                      translated = ' ' + line;
                    } else {
                      console.log('[Orchestrator] Retry successful');
                    }
                  } catch (retryErr) {
                    console.error('[Orchestrator] Retry failed:', retryErr);
                    translated = ' ' + line; // Fallback with space
                  }
                }
                
                handlers.onPartial(translated + '\n');
              } catch (err) {
                console.warn('[Orchestrator] Line translation failed:', err);
              } finally {
                pendingTranslations--;
                checkCompletion();
              }
            }
          },
          onDone: async (finalFinnish: string) => {
            llmDone = true;
            
            const assistantFinnish = (finalFinnish && finalFinnish.trim().length > 0)
              ? finalFinnish
              : finnishBuffer;

            // Flush any remaining structured block
            await flushStructuredBlock();

            // Translate any remaining incomplete line
            if (pendingLines.trim().length > 0) {
              pendingTranslations++;
              try {
                let translated = await translateWithMarkdown(pendingLines, 'fin-sami', preserveFormatting);
                
                // Check for artifacts
                const artifactCheck = detectTranslationArtifacts(translated);
                if (!artifactCheck.isValid) {
                  console.warn('[Orchestrator] Artifact in final line:', artifactCheck.errors);
                  console.warn('[Orchestrator] Retrying final line:', pendingLines);
                  
                  try {
                    await new Promise(resolve => setTimeout(resolve, 300));
                    translated = await translateWithMarkdown(pendingLines, 'fin-sami', preserveFormatting);
                    translated = normalizeTranslatedSpacing(translated);
                    
                    const retryCheck = detectTranslationArtifacts(translated);
                    if (!retryCheck.isValid) {
                      console.error('[Orchestrator] Final line retry corrupted, using Finnish');
                      translated = pendingLines;
                    }
                  } catch (retryErr) {
                    console.error('[Orchestrator] Final line retry failed:', retryErr);
                    translated = pendingLines;
                  }
                }
                
                handlers.onPartial(translated);
              } catch (err) {
                console.warn('[Orchestrator] Final line translation failed:', err);
              } finally {
                pendingTranslations--;
              }
            }

            const assistantMessage: Message = {
              role: 'assistant',
              content: assistantFinnish,
            };
            this.currentSession!.messages.push(assistantMessage);

            // Stage 2: Validate Finnish output (no retries)
            console.log('[Orchestrator] Stage 2 (stream): Validating Finnish output...');
            const finnishValidation = validateFinnishOutput(assistantFinnish, FINNISH_CONFIDENCE_THRESHOLD);
            if (!finnishValidation.isValid) {
              console.warn('[Orchestrator] LLM language validation failed (stream no-retry):', finnishValidation.errors);
              console.warn(`[Orchestrator] Detected language: ${finnishValidation.language}, confidence: ${finnishValidation.confidence.toFixed(2)}`);
              for (const w of finnishValidation.warnings) console.warn('[Orchestrator]', w);
            }

            saveSessionToStorage(this.currentSession!);

            // Signal completion
            console.log('[Orchestrator] Streaming translation complete');
            console.log('[Orchestrator] Stage 3 (stream): Sami output validation skipped (done incrementally)');
            
            // Check if all translations are done
            checkCompletion();
          },
          onError: (err: Error) => {
            handlers.onError(err);
          },
        }
      );
    } catch (err) {
      handlers.onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  getMessageHistory(): Message[] {
    return this.currentSession?.messages || [];
  }

  clearSession(): void {
    this.currentSession = undefined;
    clearSessionFromStorage();
  }
}
