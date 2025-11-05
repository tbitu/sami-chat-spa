// Translation service using local TartuNLP models via backend server
import {
  extractMarkdownSegments,
  reconstructFromSegments,
  
  extractTranslationUnits,
  reconstructSegmentsFromUnits,
  ExportedTranslationUnit as TranslationUnit,
  hasMarkdown,
} from '../utils/markdown.ts';
import type { TranslationConfig } from '../types/chat.ts';

// Default configuration - can be overridden
// Translation configuration - MUST be set by user via configureTranslationService()
// No default service is set to ensure the user explicitly chooses
let translationConfig: TranslationConfig | null = null;

// Public TartuNLP API
const PUBLIC_TARTUNLP_API = 'https://api.tartunlp.ai/translation/v2';

// Client-side retry and timeout configuration
const MAX_RETRIES = 3; // Retry up to 3 times for transient errors
const CLIENT_TIMEOUT_MS = 25000; // Abort fetch after 25s on the client side

export type TranslationDirection = 'sme-fin' | 'fin-sme';

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
  translationConfig = config;
  console.log('[Translation] Service configured:', config);
}

/**
 * Get the current API URL based on configuration
 */
function getApiUrl(): string {
  if (!translationConfig) {
    throw new Error('Translation service not configured. Please select a translation service in the API configuration screen.');
  }
  
  if (translationConfig.service === 'tartunlp-public') {
    return PUBLIC_TARTUNLP_API;
  }
  return translationConfig.apiUrl || 'http://localhost:8000/translation/v2';
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
  
  const [src, tgt] = direction.split('-');
  const apiUrl = getApiUrl();

  console.log(`[Translation] Attempting translation (${text.length} chars): ${src} -> ${tgt} via ${translationConfig.service}`);
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
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        src,
        tgt,
      } as TartuNLPRequest),
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
    if ((error as any)?.name === 'AbortError') {
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

/**
 * Translate text with markdown preservation
 */
export async function translateWithMarkdown(
  text: string,
  direction: TranslationDirection
): Promise<string> {
  if (!text.trim()) {
    return text;
  }

  // Check if text contains markdown
  if (!hasMarkdown(text)) {
    // Simple translation for plain text
    return translateText(text, direction);
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
    // Batch unit texts joined by pipe (|) separator which the translation API preserves.
    // We require strict 1:1 mapping on pipe-splits (no fallbacks).
    const SEP = '|';
    const batchText = segUnits.map(u => u.text).join(SEP);
    try {
  // Only log Finnish texts per user's preference:
  // - When direction === 'fin-sme', the batchText here is Finnish (LLM reply).
  //   Log it as the LLM reply (Finnish) but do not log translated result.
  // - When direction === 'sme-fin', the translatedBatch will be Finnish
  //   (what will be sent to the LLM); log that after translation.
      if (direction === 'fin-sme') {
        try {
          console.log('[Translation] LLM reply (Finnish):', {
            items: segUnits.length,
            length: batchText.length,
            text: batchText,
          });
        } catch (err) {
          // ignore logging errors
        }
      }

      const translatedBatch = await translateText(batchText, direction);

      if (direction === 'sme-fin') {
        try {
          console.log('[Translation] Finnish sent to LLM:', {
            items: segUnits.length,
            length: translatedBatch.length,
            text: translatedBatch,
          });
        } catch (err) {}
      }

  const parts = translatedBatch.split(SEP);
  if (parts.length !== segUnits.length) {
        // Log warning but don't throw - translation API may have merged/modified separators
        console.warn(`[Translation] Split mismatch: expected ${segUnits.length} parts but got ${parts.length}. Using fallback strategy.`);
        
        // Fallback: if we got fewer parts, distribute them or use the whole batch for first unit
        if (parts.length === 1) {
          // Translation API merged everything - use the whole result for the first unit
          const first = segUnits[0] as any;
          const key = first.lineIndex !== undefined ? `${segmentIndex}:${first.lineIndex}:${first.tokenIndex}` : `${segmentIndex}:${first.tokenIndex}`;
          translatedUnits.set(key, translatedBatch);
        } else {
          // Distribute available parts, use originals for missing ones
          for (let i = 0; i < segUnits.length; i++) {
            const u = segUnits[i] as any;
            const key = u.lineIndex !== undefined ? `${segmentIndex}:${u.lineIndex}:${u.tokenIndex}` : `${segmentIndex}:${u.tokenIndex}`;
            translatedUnits.set(key, parts[i] || u.text);
          }
        }
      } else {
        // Normal path: 1:1 mapping
        for (let i = 0; i < segUnits.length; i++) {
          const u = segUnits[i] as any;
          const key = u.lineIndex !== undefined ? `${segmentIndex}:${u.lineIndex}:${u.tokenIndex}` : `${segmentIndex}:${u.tokenIndex}`;
          translatedUnits.set(key, parts[i]);
        }
      }
    } catch (error) {
      console.error('[Translation] Segment batch error:', error);
      // Fallback to original text for this segment's units
      for (const unit of segUnits) {
        const u = unit as any;
        const key = u.lineIndex !== undefined ? `${segmentIndex}:${u.lineIndex}:${u.tokenIndex}` : `${segmentIndex}:${u.tokenIndex}`;
        translatedUnits.set(key, u.text);
      }
    }
  }

  // Reconstruct segments from units
  const translatedSegments = reconstructSegmentsFromUnits(segments, translatedUnits);
  // Final sanitize pass to remove any legacy placeholder artifacts
  const final = reconstructFromSegments(translatedSegments);
  // Import sanitizePlaceholders lazily to avoid circular import at top-level
  // (utils are local and safe to import here)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { sanitizePlaceholders } = await import('../utils/markdown');
  return sanitizePlaceholders(final);
}

/**
 * Translate a chunk while preserving markdown/formatting by only sending
 * the inner text portions (what's between markdown formattings) to the
 * translation API. This is intended for streaming/batched translations
 * where we want to avoid sending markdown syntax itself to the backend.
 */
export async function translatePreserveFormattingChunk(
  chunk: string,
  direction: TranslationDirection
): Promise<string> {
  if (!chunk || !chunk.trim()) return chunk;

  // Always treat chunk as potentially containing markdown and split into segments
  const segments = extractMarkdownSegments(chunk);
  // Build translation units (no placeholders)
  const units = extractTranslationUnits(segments);

  if (units.length === 0) return chunk;

  const unitsBySegment = new Map<number, typeof units>();
  for (const u of units) {
    const arr = unitsBySegment.get(u.segmentIndex) || [];
    arr.push(u);
    unitsBySegment.set(u.segmentIndex, arr as typeof units);
  }

  const translatedUnits = new Map<string, string>();

  for (const [segmentIndex, segUnits] of unitsBySegment.entries()) {
    // Use pipe separator like translateWithMarkdown for consistency and reliability.
    // The translation API has been tested to preserve pipe separators well.
    const SEP = '|';
    const batchText = segUnits.map((u: any) => u.text).join(SEP);
    try {
      if (direction === 'fin-sme') {
        try {
          console.log('[Translation] LLM reply (Finnish):', {
            items: segUnits.length,
            length: batchText.length,
            text: batchText,
          });
        } catch (err) {}
      }

      const translatedBatch = await translateText(batchText, direction);

      if (direction === 'sme-fin') {
        try {
          console.log('[Translation] Finnish sent to LLM:', {
            items: segUnits.length,
            length: translatedBatch.length,
            text: translatedBatch,
          });
        } catch (err) {}
      }

      // Split by pipe separator and verify count matches
      const parts = translatedBatch.split(SEP);
      if (parts.length !== segUnits.length) {
        // Log warning but don't throw - translation API may have merged/modified separators
        console.warn(`[Translation] Chunk split mismatch: expected ${segUnits.length} parts but got ${parts.length}. Using fallback strategy.`);

        // Fallback: if we got fewer parts, distribute them or use the whole batch for first unit
        if (parts.length === 1) {
          // Translation API merged everything - use the whole result for the first unit
          // and leave others as original (they'll be reconstructed later)
          const first = segUnits[0] as any;
          const key = first.lineIndex !== undefined ? `${segmentIndex}:${first.lineIndex}:${first.tokenIndex}` : `${segmentIndex}:${first.tokenIndex}`;
          translatedUnits.set(key, translatedBatch);
        } else {
          // Distribute available parts, use originals for missing ones
          for (let i = 0; i < segUnits.length; i++) {
            const u = segUnits[i] as any;
            const key = u.lineIndex !== undefined ? `${segmentIndex}:${u.lineIndex}:${u.tokenIndex}` : `${segmentIndex}:${u.tokenIndex}`;
            translatedUnits.set(key, parts[i] || u.text);
          }
        }
      } else {
        // Normal path: 1:1 mapping
        for (let i = 0; i < segUnits.length; i++) {
          const u = segUnits[i] as any;
          const key = u.lineIndex !== undefined ? `${segmentIndex}:${u.lineIndex}:${u.tokenIndex}` : `${segmentIndex}:${u.tokenIndex}`;
          translatedUnits.set(key, parts[i]);
        }
      }
    } catch (error) {
      console.error('[Translation] Chunk segment batch error:', error);
      // Fallback to original text for this segment's units
      for (const unit of segUnits) {
        const u = unit as any;
        const key = u.lineIndex !== undefined ? `${segmentIndex}:${u.lineIndex}:${u.tokenIndex}` : `${segmentIndex}:${u.tokenIndex}`;
        translatedUnits.set(key, u.text);
      }
    }
  }

  const translatedSegments = reconstructSegmentsFromUnits(segments, translatedUnits);
  return reconstructFromSegments(translatedSegments);
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
