// Translation service using local TartuNLP models via backend server
import {
  extractMarkdownSegments,
  reconstructFromSegments,
  
  extractTranslationUnits,
  reconstructSegmentsFromUnits,
  ExportedTranslationUnit as TranslationUnit,
  hasMarkdown,
  sanitizePlaceholders,
} from '../utils/markdown.ts';
import { detectTranslationArtifacts } from '../utils/language-detection.ts';
import type { TranslationConfig } from '../types/chat.ts';

// Default configuration - can be overridden
// Translation configuration - MUST be set by user via configureTranslationService()
// No default service is set to ensure the user explicitly chooses
let translationConfig: TranslationConfig | null = null;

function getEnvTranslationApiUrl(): string | undefined {
  try {
    // Vite exposes env vars via import.meta.env at build/runtime in the browser
    const maybeImportMeta = typeof import.meta !== 'undefined' ? (import.meta as unknown as { env?: Record<string, unknown> }) : undefined;
    const metaEnv = maybeImportMeta?.env;
    const fromImportMeta = metaEnv ? (metaEnv['VITE_TRANSLATION_API_URL'] as string | undefined) : undefined;
    if (typeof fromImportMeta === 'string' && fromImportMeta.trim()) {
      return fromImportMeta.trim();
    }
  } catch {
    // ignore access issues
  }

  try {
    // Allow Node-based scripts (ts-node) to pick up the same variable when bundled differently
    const maybeGlobal = typeof globalThis !== 'undefined' ? (globalThis as unknown as { process?: { env?: Record<string, string> } }) : undefined;
    const nodeEnv = maybeGlobal?.process?.env;
    const fromProcess = nodeEnv?.VITE_TRANSLATION_API_URL;
    if (typeof fromProcess === 'string' && fromProcess.trim()) {
      return fromProcess.trim();
    }
  } catch {
    // ignore when process is unavailable
  }

  return undefined;
}

// Public TartuNLP API
const PUBLIC_TARTUNLP_API = 'https://api.tartunlp.ai/translation/v2';

// Client-side retry and timeout configuration
const MAX_RETRIES = 3; // Retry up to 3 times for transient errors
const CLIENT_TIMEOUT_MS = 25000; // Abort fetch after 25s on the client side
const MAX_UNITS_PER_BATCH = 24; // Limit pipe-joined units per request to reduce LLM drift

export type TranslationDirection = 'sami-fin' | 'fin-sami';

interface TartuNLPRequest {
  text: string;
  src: string;
  tgt: string;
}

interface TartuNLPResponse {
  result: string;
}

/**
 * Configure the translation service
 */
export function configureTranslationService(config: TranslationConfig): void {
  const envApiUrl = getEnvTranslationApiUrl();
  translationConfig = {
    ...config,
    apiUrl: config.apiUrl ?? envApiUrl,
  };
  console.log('[Translation] Service configured:', translationConfig);
}

/**
 * Update the Sami language for translation without changing other config
 */
import type { SamiLanguage } from '../types/chat.ts';

export function updateSamiLanguage(language: SamiLanguage): void {
  if (translationConfig) {
    translationConfig.samiLanguage = language;
    console.log('[Translation] Sami language updated to:', language);
  }
}

/**
 * Get the current API URL based on configuration
 */
function getApiUrl(): string {
  if (!translationConfig) {
    throw new Error('Translation service not configured. Please select a translation service in the API configuration screen.');
  }

  const envOverride = translationConfig.apiUrl || getEnvTranslationApiUrl();
  if (envOverride) {
    return envOverride;
  }

  if (translationConfig.service === 'tartunlp-public') {
    return PUBLIC_TARTUNLP_API;
  }
  return 'http://localhost:8000/translation/v2';
}

function getApplicationName(): string | undefined {
  if (!translationConfig) return undefined;
  if (translationConfig.application) return translationConfig.application;
  // Local backend now mirrors the public API, so use the shared default identifier
  return 'sami-ai-lab-chat';
}

/**
 * Get the current Sami language code from configuration
 */
function getSamiLanguage(): string {
  if (!translationConfig) return 'sme'; // Default fallback
  return translationConfig.samiLanguage || 'sme';
}

/**
 * Translate text using TartuNLP API with timeout and retry logic
 */
async function translateText(
  text: string,
  direction: TranslationDirection,
  retryCount: number = 0
): Promise<string> {
  if (!translationConfig) {
    throw new Error('Translation service not configured. Please select a translation service in the API configuration screen.');
  }
  
  // Map direction to actual language codes
  const samiLang = getSamiLanguage();
  const [src, tgt] = direction === 'sami-fin' ? [samiLang, 'fin'] : ['fin', samiLang];
  const apiUrl = getApiUrl();

  console.log(`[Translation] Attempting translation (${text.length} chars): ${src} -> ${tgt} via ${translationConfig.service} (${apiUrl})`);
  console.log(`[Translation] Text to translate:`, text);

  // Use AbortController to enforce a client-side timeout so requests don't hang
  let controller: AbortController | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (typeof AbortController !== 'undefined') {
    controller = new AbortController();
    timeoutId = setTimeout(() => controller!.abort(), CLIENT_TIMEOUT_MS);
  }

  try {
    // Using configured translation service
    const appName = getApplicationName();
    const bodyPayload: Record<string, unknown> = {
      text,
      src,
      tgt,
    };
    if (translationConfig.domain) bodyPayload.domain = translationConfig.domain;
    if (appName) bodyPayload.application = appName;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (appName) {
      // Some deployments still require the legacy header, so send both body + header when available
      headers.application = appName;
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(bodyPayload as unknown as TartuNLPRequest),
      signal: controller?.signal,
    });

    if (timeoutId) clearTimeout(timeoutId);

    console.log(`[Translation] Response received: ${response.status} ${response.statusText}`);

    // Log retry-related headers to aid debugging (if present)
    try {
      const retryAfter = response.headers.get('Retry-After');
      const rateLimit = response.headers.get('X-RateLimit-Limit');
      const rateRemaining = response.headers.get('X-RateLimit-Remaining');
      if (retryAfter || rateLimit || rateRemaining) {
        console.debug('[Translation] Rate/Retry headers:', { retryAfter, rateLimit, rateRemaining });
      }
    } catch (err) {
      // ignore header-read errors
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error response');
      console.error('[Translation] API error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
        retryCount,
      });

      // Respect Retry-After header if provided
      const retryAfter = response.headers.get('Retry-After');
      const retryAfterMs = retryAfter ? (parseInt(retryAfter, 10) * 1000 || undefined) : undefined;

      // Retry on 408 timeout, 429 (rate limit) or 5xx server errors
      if ((response.status === 408 || response.status === 429 || response.status >= 500) && retryCount < MAX_RETRIES) {
        const backoff = retryAfterMs ?? (1000 * Math.pow(2, retryCount));
        console.log(`[Translation] Retrying (attempt ${retryCount + 1}/${MAX_RETRIES}) after ${backoff}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        return translateText(text, direction, retryCount + 1);
      }

      // If API times out even after retries, return original text (best-effort)
      if (response.status === 408) {
        console.warn(`[Translation] API timeout (408), returning original text`);
        return text; // Pass through unchanged
      }

      throw new Error(`Translation failed: ${response.statusText} (${response.status})`);
    }

    const data: TartuNLPResponse = await response.json();
    // Keep translateText itself minimal: it returns translated text. Higher-level
    // callers decide what to log (so we don't log source text or post-translation
    // Sami strings accidentally).
    return data.result;
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    console.error('[Translation] Request failed:', {
      error,
      direction,
      textLength: text.length,
      url: apiUrl,
      service: translationConfig?.service || 'not-configured',
      retryCount,
    });

    // If fetch was aborted by our timeout, surface a clearer message
  // In browsers the error name is usually 'AbortError'
  const _err = error as { name?: string };
  if (_err?.name === 'AbortError') {
      if (retryCount < MAX_RETRIES) {
        // exponential backoff before retrying
        const backoff = 1000 * Math.pow(2, retryCount);
        console.log(`[Translation] Request aborted (client timeout). Retrying after ${backoff}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        return translateText(text, direction, retryCount + 1);
      }
      // After retries, for timeouts return original text to avoid blocking UX
      console.warn('[Translation] Client-side timeout, returning original text');
      return text;
    }

    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      const errorMessage = translationConfig?.service === 'local-llm'
        ? 'Unable to reach local translation service. Make sure the backend server is running on port 8000.'
        : 'Unable to reach TartuNLP public API. Please check your internet connection.';
      throw new Error(errorMessage);
    }

    throw error;
  }
}

// Retry once more if translation output contains obvious artifacts (e.g., heavy repetition)
async function translateTextWithArtifactRetry(
  text: string,
  direction: TranslationDirection,
  attempt: number = 0
): Promise<string> {
  const translated = await translateText(text, direction);
  const artifactCheck = detectTranslationArtifacts(translated);

  if (!artifactCheck.isValid && attempt < 1) {
    const reason = artifactCheck.errors.join('; ');
    console.warn(`[Translation] Artifact detected (${reason}). Retrying translation (attempt ${attempt + 2}/2)...`);
    // Short backoff to avoid hammering the service
    await new Promise(resolve => setTimeout(resolve, 300));
    return translateTextWithArtifactRetry(text, direction, attempt + 1);
  }

  return translated;
}

/**
 * Detect if a translation appears corrupted based on common patterns.
 * Returns true if the translation should be retried.
 */
function isCorruptedTranslation(translated: string, original: string, direction: TranslationDirection): boolean {
  if (direction === 'fin-sami') {
    // Pattern: Short headers ending with ":" that get corrupted due to context bleeding
    // Corruption signs: starts with closing brackets/parens followed by lowercase text
    // Example: "Ohje:" -> ") help." instead of proper Sami translation
    if (original.trim().endsWith(':') && original.length < 30) {
      const trimmedTranslation = translated.trim();
      
      // Corrupted if: starts with ")", "]", "}" followed by space and lowercase
      // (Proper Sami headers should start with capital letter)
      if (/^[)\]}]+\s+[a-z]/.test(trimmedTranslation)) {
        return true;
      }
      
      // Also check for mixed language artifacts (English words appearing in Sami text)
      // Common corruption: partial English words like "help", "step", "note"
      if (/\b(help|step|note|tip|info)\b/i.test(trimmedTranslation)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Translate text with markdown preservation
 */
export async function translateWithMarkdown(
  text: string,
  direction: TranslationDirection,
  preserveFormatting: boolean = false
): Promise<string> {
  if (!text.trim()) {
    return text;
  }

  // If preserveFormatting is false, skip all segmentation and markdown handling
  // Just translate the entire text as one chunk (LLM is instructed not to use markdown)
  if (!preserveFormatting) {
    return translateTextWithArtifactRetry(text, direction);
  }

  // Check if text contains markdown
  if (!hasMarkdown(text)) {
    // Simple translation for plain text with artifact guard
    return translateTextWithArtifactRetry(text, direction);
  }

  // Extract markdown segments
  const segments = extractMarkdownSegments(text);
  // Build translation units (no placeholders)
  const units = extractTranslationUnits(segments);

  if (units.length === 0) return text;

  // We'll translate per-segment for units: gather units per segmentIndex
  const unitsBySegment = new Map<number, TranslationUnit[]>();
  for (const u of units) {
    const arr = unitsBySegment.get(u.segmentIndex) || [];
    arr.push(u);
    unitsBySegment.set(u.segmentIndex, arr);
  }

  // Map to store translated unit text: key `${segmentIndex}:${tokenIndex}`
  const translatedUnits = new Map<string, string>();

  for (const [segmentIndex, segUnits] of unitsBySegment.entries()) {
    // Break large segments into smaller batches to avoid overly long pipe-joined prompts
    const batches: TranslationUnit[][] = [];
    for (let start = 0; start < segUnits.length; start += MAX_UNITS_PER_BATCH) {
      batches.push(segUnits.slice(start, start + MAX_UNITS_PER_BATCH));
    }

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batchUnits = batches[batchIndex];
      // Batch unit texts joined by pipe separator. This is the most reliably preserved separator
      // by the translation LLM, though it occasionally causes context bleeding between units.
      // Alternative separators like \n---\n get interpreted as content by the LLM.
      const SEP = '|';
      const batchText = batchUnits.map(u => u.text).join(SEP);
      
      try {
  // Only log Finnish texts per user's preference:
  // - When direction === 'fin-sami', the batchText here is Finnish (segment from LLM reply).
  //   Log it before translation but do not log translated result.
  // - When direction === 'sami-fin', the translatedBatch will be Finnish
  //   (what will be sent to the LLM); log that after translation.
        if (direction === 'fin-sami') {
          try {
            console.log('[Translation] Finnish segment to translate:', {
              segmentIndex,
              batchIndex,
              batches: batches.length,
              units: batchUnits.length,
              length: batchText.length,
              text: batchText,
            });
          } catch (err) {
            // ignore logging errors
          }
        }

        const translatedBatch = await translateText(batchText, direction);

        if (direction === 'sami-fin') {
          try {
            console.log('[Translation] Finnish sent to LLM:', {
              segmentIndex,
              batchIndex,
              batches: batches.length,
              items: batchUnits.length,
              length: translatedBatch.length,
              text: translatedBatch,
            });
          } catch (err) {
            // Ignore logging errors
          }
        }

  const parts = translatedBatch.split(SEP);
  if (parts.length !== batchUnits.length) {
          // Log warning but don't throw - translation API may have merged/modified separators
          console.warn(`[Translation] Split mismatch: expected ${batchUnits.length} parts but got ${parts.length}. Using fallback strategy.`);
          console.warn(`[Translation] Original units:`, batchUnits.map(u => u.text));
          console.warn(`[Translation] Translated batch:`, translatedBatch);
          console.warn(`[Translation] Split parts:`, parts);
          
          // Fallback: if we got fewer parts, distribute them or use the whole batch for first unit
          if (parts.length === 1) {
            // Translation API merged everything - use the whole result for the first unit
            const first = batchUnits[0] as TranslationUnit;
            const key = first.lineIndex !== undefined ? `${segmentIndex}:${first.lineIndex}:${first.tokenIndex}` : `${segmentIndex}:${first.tokenIndex}`;
            translatedUnits.set(key, translatedBatch);
          } else if (parts.length > batchUnits.length) {
            // Translation API split more than expected - need to merge some parts
            // Strategy: Use alternating pattern detection - headers (short, ends with :) alternate with content
            console.warn(`[Translation] Got more parts than expected, using pattern-based merging`);
            
            let partIndex = 0;
            for (let i = 0; i < batchUnits.length; i++) {
              const u = batchUnits[i] as TranslationUnit;
              const key = u.lineIndex !== undefined ? `${segmentIndex}:${u.lineIndex}:${u.tokenIndex}` : `${segmentIndex}:${u.tokenIndex}`;
              
              if (partIndex >= parts.length) {
                console.warn(`[Translation] Ran out of parts at unit ${i}`);
                translatedUnits.set(key, u.text);
                continue;
              }
              
              // Check if current unit is a header (short and ends with :)
              const isHeader = u.text.trim().endsWith(':') && u.text.length < 50;
              
              if (isHeader) {
                // Headers should map 1:1 to a part ending with :
                if (parts[partIndex].trim().endsWith(':')) {
                  translatedUnits.set(key, parts[partIndex]);
                  partIndex++;
                } else {
                  // Mismatch - use original
                  console.warn(`[Translation] Header mismatch at unit ${i}, using original`);
                  translatedUnits.set(key, u.text);
                }
              } else {
                // Content unit - may need to merge multiple parts
                // Collect parts until we hit the next header or reach expected count
                const partsNeeded = batchUnits.length - i; // remaining units
                const partsAvailable = parts.length - partIndex; // remaining parts
                const extraParts = partsAvailable - partsNeeded;
                
                // If we have extra parts and this is a content unit, merge extras here
                const collectedParts = [parts[partIndex]];
                partIndex++;
                
                // Merge extra parts into this content unit, but stop before the next header
                let merged = 0;
                while (merged < extraParts && partIndex < parts.length && !parts[partIndex].trim().endsWith(':')) {
                  collectedParts.push(parts[partIndex]);
                  partIndex++;
                  merged++;
                }
                
                // Smart joining: if parts look like separate sentences (start with capital), use space
                // otherwise join with nothing (they were split mid-sentence)
                const joinedContent = collectedParts.map((part, idx) => {
                  if (idx === 0) return part;
                  // Check if this part starts a new sentence (capital letter or number after trimming)
                  const trimmed = part.trim();
                  const startsWithCapital = trimmed.length > 0 && /^[A-ZČĐŊŠŦŽ]/.test(trimmed[0]);
                  // If previous part ended with punctuation or this starts with capital, it's a new sentence
                  if (startsWithCapital || collectedParts[idx - 1].trim().endsWith('.')) {
                    return ' ' + part;
                  }
                  return part;
                }).join('');
                
                translatedUnits.set(key, joinedContent);
              }
            }
          } else {
            // Translation API merged some parts (fewer parts than expected)
            // Strategy: Try to align headers first (they end with :), then fill in content
            console.warn(`[Translation] Got fewer parts than expected, attempting smart alignment`);
            
            // Build a map of which parts are headers
            const partIsHeader: boolean[] = parts.map(p => p.trim().endsWith(':'));
            const unitIsHeader: boolean[] = batchUnits.map(u => u.text.trim().endsWith(':'));
            
            let partIndex = 0;
            for (let i = 0; i < batchUnits.length; i++) {
              const u = batchUnits[i] as TranslationUnit;
              const key = u.lineIndex !== undefined ? `${segmentIndex}:${u.lineIndex}:${u.tokenIndex}` : `${segmentIndex}:${u.tokenIndex}`;
              
              if (partIndex >= parts.length) {
                // Ran out of parts - translate individually
                console.warn(`[Translation] Missing translation for unit ${i}, translating individually:`, u.text);
                try {
                  const individualTranslation = await translateText(u.text, direction);
                  console.log(`[Translation] Individual result for unit ${i}:`, {original: u.text, translated: individualTranslation});
                  // Strip any markdown formatting that the API might have added
                  const cleaned = individualTranslation.replace(/^\*\*(.+)\*\*$/, '$1').trim();
                  translatedUnits.set(key, cleaned);
                } catch (err) {
                  console.error(`[Translation] Individual translation failed for unit ${i}, using original:`, err);
                  translatedUnits.set(key, u.text);
                }
                continue;
              }
              
              // If both unit and part are headers, it's a 1:1 match
              if (unitIsHeader[i] && partIsHeader[partIndex]) {
                // Check for corruption and retry if needed
                if (isCorruptedTranslation(parts[partIndex], u.text, direction)) {
                  console.warn(`[Translation] Corrupted header at unit ${i}, re-translating:`, u.text);
                  try {
                    const retranslated = await translateText(u.text, direction);
                    translatedUnits.set(key, retranslated.trim());
                  } catch (err) {
                    translatedUnits.set(key, parts[partIndex]);
                  }
                } else {
                  translatedUnits.set(key, parts[partIndex]);
                }
                partIndex++;
              } 
              // If unit is header but part is not, the API might have merged it with next unit
              else if (unitIsHeader[i] && !partIsHeader[partIndex]) {
                // Try to translate this header individually
                console.warn(`[Translation] Header mismatch at unit ${i}, translating individually:`, u.text);
                try {
                  const individualTranslation = await translateText(u.text, direction);
                  // Strip any markdown formatting that the API might have added
                  const cleaned = individualTranslation.replace(/^\*\*(.+)\*\*$/, '$1').trim();
                  translatedUnits.set(key, cleaned);
                } catch (err) {
                  translatedUnits.set(key, u.text);
                }
                // Don't advance partIndex - this part belongs to next unit
              }
              // If unit is content (not header), use current part
              else if (!unitIsHeader[i]) {
                translatedUnits.set(key, parts[partIndex]);
                partIndex++;
              }
              // Both are not headers - simple match
              else {
                translatedUnits.set(key, parts[partIndex]);
                partIndex++;
              }
            }
          }
        } else {
          // Normal path: 1:1 mapping
          for (let i = 0; i < batchUnits.length; i++) {
            const u = batchUnits[i] as TranslationUnit;
            const key = u.lineIndex !== undefined ? `${segmentIndex}:${u.lineIndex}:${u.tokenIndex}` : `${segmentIndex}:${u.tokenIndex}`;
            
            // Check if translation is corrupted and needs retry
            if (isCorruptedTranslation(parts[i], u.text, direction)) {
              console.warn(`[Translation] Detected corruption in unit ${i}: "${u.text}" -> "${parts[i]}"`);
              console.warn(`[Translation] Re-translating individually to fix corruption`);
              try {
                const retranslated = await translateText(u.text, direction);
                translatedUnits.set(key, retranslated.trim());
              } catch (err) {
                console.error(`[Translation] Re-translation failed, using corrupted version:`, err);
                translatedUnits.set(key, parts[i]);
              }
            } else {
              translatedUnits.set(key, parts[i]);
            }
          }
        }
      } catch (error) {
        console.error('[Translation] Segment batch error:', error);
        // Fallback to original text for this segment's units
        for (const unit of batchUnits) {
          const u = unit as TranslationUnit;
          const key = u.lineIndex !== undefined ? `${segmentIndex}:${u.lineIndex}:${u.tokenIndex}` : `${segmentIndex}:${u.tokenIndex}`;
          translatedUnits.set(key, u.text);
        }
      }
    }
  }

  // Reconstruct segments from units
  const translatedSegments = reconstructSegmentsFromUnits(segments, translatedUnits);
  // Final sanitize pass to remove any legacy placeholder artifacts
  const final = reconstructFromSegments(translatedSegments);
  return sanitizePlaceholders(final);
}

/**
 * Extract translated unit texts wrapped with markers like " <SEP0> ... <SEP0> "
 * Returns an array of extracted strings (length == unitCount) or throws when
 * any marker is missing.
 * 
 * @deprecated This function is no longer used in production. We now use pipe separators (|)
 * for batching translation units, which are more reliably preserved by the translation API.
 * Kept for backwards compatibility and testing documentation.
 */
export function extractMarkedUnits(translatedBatch: string, unitCount: number): string[] {
  const parts: string[] = [];
  for (let i = 0; i < unitCount; i++) {
    const marker = `<SEP${i}>`;
    const re = new RegExp(`${marker}\\s*([\\s\\S]*?)\\s*${marker}`);
    const m = translatedBatch.match(re);
    if (!m || m.length < 2) {
      throw new Error(`[Translation] Marker missing for unit ${i}. API must preserve markers like ' ${marker} ' for batching.`);
    }
    parts.push(m[1]);
  }
  return parts;
}

/**
 * Translate array of messages
 */
export async function translateMessages(
  messages: string[],
  direction: TranslationDirection
): Promise<string[]> {
  const results: string[] = [];
  for (const message of messages) {
    const translated = await translateWithMarkdown(message, direction);
    results.push(translated);
  }
  return results;
}

/**
 * Batch translate with rate limiting
 */
export async function batchTranslate(
  texts: string[],
  direction: TranslationDirection,
  delayMs: number = 100
): Promise<string[]> {
  const results: string[] = [];
  
  for (let i = 0; i < texts.length; i++) {
    const translated = await translateWithMarkdown(texts[i], direction);
    results.push(translated);
    
    // Add delay between requests to avoid rate limiting
    if (i < texts.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  return results;
}
