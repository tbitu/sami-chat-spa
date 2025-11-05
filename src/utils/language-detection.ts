// Language detection utilities for Northern Sami chat application
// Detects languages at 3 critical checkpoints: pre-translation, post-LLM, post-translation

export type Language = 'sme' | 'fin' | 'en' | 'nb' | 'ru' | 'unknown';

export interface InvalidCharResult {
  isValid: boolean;
  detectedScript?: string;
  sampleChars?: string;
}

export interface ArtifactResult {
  isValid: boolean;
  errors: string[];
}

export interface ValidationResult {
  isValid: boolean;
  language?: Language;
  confidence: number; // 0-1 scale
  errors: string[];
  warnings: string[];
}

/**
 * Main language detection function using hybrid heuristics
 * Returns detected language with confidence score
 */
export function detectLanguage(text: string): { language: Language; confidence: number } {
  if (!text || text.trim().length === 0) {
    return { language: 'unknown', confidence: 0 };
  }

  const cleanText = text.trim().toLowerCase();
  const scores = {
    sme: 0,
    fin: 0,
    en: 0,
    nb: 0,
    ru: 0,
  };

  // Fast path: Check for Cyrillic (Russian)
  if (hasCyrillic(cleanText)) {
    scores.ru += 0.8;
  }

  // Character frequency analysis
  scores.sme += getSamiCharScore(cleanText);
  scores.fin += getFinnishCharScore(cleanText);
  scores.en += getEnglishCharScore(cleanText);
  scores.nb += getNorwegianCharScore(cleanText);

  // Keyword matching
  scores.sme += getSamiKeywordScore(cleanText);
  scores.fin += getFinnishKeywordScore(cleanText);
  scores.en += getEnglishKeywordScore(cleanText);
  scores.nb += getNorwegianKeywordScore(cleanText);

  // Pattern matching (Finnish double consonants, etc.)
  scores.fin += getFinnishPatternScore(cleanText);

  // Find highest scoring language
  let maxScore = 0;
  let detectedLang: Language = 'unknown';

  for (const [lang, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      detectedLang = lang as Language;
    }
  }

  // Normalize confidence to 0-1 range (max possible score is ~2.0)
  const confidence = Math.min(maxScore / 2.0, 1.0);

  // If confidence too low, mark as unknown
  if (confidence < 0.3) {
    return { language: 'unknown', confidence };
  }

  return { language: detectedLang, confidence };
}

/**
 * Check if text is Northern Sami with high confidence
 */
export function isSami(text: string, threshold: number = 0.6): boolean {
  const result = detectLanguage(text);
  return result.language === 'sme' && result.confidence >= threshold;
}

/**
 * Check if text is Finnish with high confidence
 */
export function isFinnish(text: string, threshold: number = 0.6): boolean {
  const result = detectLanguage(text);
  return result.language === 'fin' && result.confidence >= threshold;
}

/**
 * Check for Cyrillic characters (Russian, etc.)
 */
function hasCyrillic(text: string): boolean {
  return /[\u0400-\u04FF]/.test(text);
}

/**
 * Score text based on Northern Sami specific characters
 * Sami-specific: á, č, đ, ŋ, š, ŧ, ž (and uppercase)
 */
function getSamiCharScore(text: string): number {
  const samiChars = /[áčđŋšŧž]/gi;
  const matches = text.match(samiChars);
  if (!matches) return 0;

  // More Sami chars = higher confidence
  const charRatio = matches.length / text.length;
  return Math.min(charRatio * 10, 0.6); // Max 0.6 from char analysis
}

/**
 * Score text based on Finnish specific characters and patterns
 * Finnish-specific: ä, ö, double consonants, vowel harmony
 */
function getFinnishCharScore(text: string): number {
  let score = 0;

  // Check for ä and ö (also in Swedish/Estonian but common in Finnish)
  const finnishVowels = /[äö]/gi;
  const vowelMatches = text.match(finnishVowels);
  if (vowelMatches) {
    score += Math.min(vowelMatches.length / text.length * 5, 0.3);
  }

  return score;
}

/**
 * Score text based on English character patterns
 */
function getEnglishCharScore(text: string): number {
  // English has high frequency of: w, y (as vowel), q
  // And lacks special Nordic characters
  const englishIndicators = /[wq]/gi;
  const matches = text.match(englishIndicators);
  if (!matches) return 0;

  return Math.min(matches.length / text.length * 8, 0.3);
}

/**
 * Score text based on Norwegian character patterns
 */
function getNorwegianCharScore(text: string): number {
  // Norwegian-specific: æ, ø, å
  const norwegianChars = /[æøå]/gi;
  const matches = text.match(norwegianChars);
  if (!matches) return 0;

  return Math.min(matches.length / text.length * 8, 0.4);
}

/**
 * Score based on common Northern Sami words
 */
function getSamiKeywordScore(text: string): number {
  const samiWords = [
    'lea', 'leat', 'dát', 'dat', 'mii', 'gii', 'go', 'vai', 'ahte',
    'dahje', 'muhto', 'ja', 'vai', 'son', 'sii', 'don', 'mun',
    'gii', 'maid', 'man', 'gos', 'goas', 'movt',
  ];

  let matches = 0;
  for (const word of samiWords) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    if (regex.test(text)) {
      matches++;
    }
  }

  // Each matched word adds to confidence
  return Math.min(matches * 0.15, 0.8);
}

/**
 * Score based on common Finnish words
 */
function getFinnishKeywordScore(text: string): number {
  const finnishWords = [
    'on', 'ovat', 'että', 'jos', 'kun', 'tai', 'ja', 'ei', 'ole',
    'voi', 'olla', 'tämä', 'se', 'niin', 'mutta', 'kuin', 'kaikki',
    'hän', 'he', 'minä', 'sinä', 'mitä', 'mikä', 'missä', 'milloin',
  ];

  let matches = 0;
  for (const word of finnishWords) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    if (regex.test(text)) {
      matches++;
    }
  }

  return Math.min(matches * 0.15, 0.8);
}

/**
 * Score based on common English words
 */
function getEnglishKeywordScore(text: string): number {
  const englishWords = [
    'the', 'is', 'are', 'that', 'if', 'when', 'or', 'and', 'not', 'can',
    'will', 'would', 'this', 'what', 'where', 'how', 'who', 'why',
    'have', 'has', 'had', 'do', 'does', 'did',
  ];

  let matches = 0;
  for (const word of englishWords) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    if (regex.test(text)) {
      matches++;
    }
  }

  return Math.min(matches * 0.15, 0.8);
}

/**
 * Score based on common Norwegian words
 */
function getNorwegianKeywordScore(text: string): number {
  const norwegianWords = [
    'er', 'er', 'at', 'hvis', 'når', 'eller', 'og', 'ikke', 'kan',
    'vil', 'være', 'dette', 'hva', 'hvor', 'hvordan', 'hvem', 'hvorfor',
    'har', 'hadde', 'gjør', 'gjorde',
  ];

  let matches = 0;
  for (const word of norwegianWords) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    if (regex.test(text)) {
      matches++;
    }
  }

  return Math.min(matches * 0.15, 0.8);
}

/**
 * Score based on Finnish-specific patterns (double consonants)
 */
function getFinnishPatternScore(text: string): number {
  // Finnish has frequent double consonants: kk, tt, pp, ll, nn, mm, ss, etc.
  const doubleConsonants = /([bcdfghjklmnpqrstvwxz])\1/gi;
  const matches = text.match(doubleConsonants);
  if (!matches) return 0;

  // More double consonants = more likely Finnish
  return Math.min(matches.length / text.length * 15, 0.4);
}

/**
 * Check for invalid character sets (non-Nordic scripts)
 * Returns validation result with details about detected scripts
 */
export function hasInvalidCharacters(text: string): InvalidCharResult {
  const invalidRanges = [
    { name: 'Cyrillic', regex: /[\u0400-\u04FF]/g },
    { name: 'Chinese', regex: /[\u4E00-\u9FFF]/g },
    { name: 'Japanese (Hiragana)', regex: /[\u3040-\u309F]/g },
    { name: 'Japanese (Katakana)', regex: /[\u30A0-\u30FF]/g },
    { name: 'Arabic', regex: /[\u0600-\u06FF]/g },
    { name: 'Greek', regex: /[\u0370-\u03FF]/g },
    { name: 'Hebrew', regex: /[\u0590-\u05FF]/g },
    { name: 'Thai', regex: /[\u0E00-\u0E7F]/g },
  ];

  for (const range of invalidRanges) {
    const matches = text.match(range.regex);
    if (matches && matches.length > 0) {
      return {
        isValid: false,
        detectedScript: range.name,
        sampleChars: matches.slice(0, 5).join(''),
      };
    }
  }

  return { isValid: true };
}

/**
 * Detect translation artifacts and errors
 * Checks for: extremely long words, repetitive patterns, placeholder leakage, malformed markdown
 */
export function detectTranslationArtifacts(text: string): ArtifactResult {
  const errors: string[] = [];

  // Check for extremely long words (likely concatenation errors)
  const words = text.split(/\s+/);
  const longWords = words.filter(w => w.length > 40);
  if (longWords.length > 0) {
    errors.push(`Extremely long words: ${longWords.slice(0, 3).join(', ')}`);
  }

  // Check for repetitive patterns (same chars/substring repeated multiple times)
  // Matches: "aaaaaaa", "samesamesame", "lalala" (3+ char pattern repeated 3+ times)
  const repetitivePattern = /(.{3,})\1{2,}/g;
  const repetitiveMatches = text.match(repetitivePattern);
  if (repetitiveMatches && repetitiveMatches.length > 0) {
    errors.push(`Repetitive patterns: ${repetitiveMatches.slice(0, 3).join(', ')}`);
  }

  // Check for placeholder leakage (markdown utility placeholders not restored)
  const placeholderPattern = /@@[A-Z_]+\d+@@/g;
  const placeholders = text.match(placeholderPattern);
  if (placeholders && placeholders.length > 0) {
    errors.push(`Untranslated placeholders: ${placeholders.slice(0, 3).join(', ')}`);
  }

  // Check for malformed markdown code blocks (unmatched triple backticks)
  const codeBlockPattern = /```/g;
  const codeBlockMatches = text.match(codeBlockPattern);
  if (codeBlockMatches && codeBlockMatches.length % 2 !== 0) {
    errors.push('Malformed code blocks (unmatched triple backticks)');
  }

  // Check for broken tables (inconsistent pipe counts per line)
  const lines = text.split('\n');
  const tableLines = lines.filter(line => line.includes('|'));
  if (tableLines.length > 2) {
    const pipeCounts = tableLines.map(line => (line.match(/\|/g) || []).length);
    const firstCount = pipeCounts[0];
    const inconsistent = pipeCounts.some(count => count !== firstCount);
    if (inconsistent) {
      errors.push('Malformed markdown table (inconsistent column counts)');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Comprehensive validation for Sami output (Stage 3)
 * Combines invalid character check + artifact detection
 */
export function validateSamiOutput(text: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let confidence = 1.0;

  // Check 1: Invalid character sets
  const charCheck = hasInvalidCharacters(text);
  if (!charCheck.isValid) {
    // Find context around invalid characters for debugging
    const regex = charCheck.detectedScript === 'Cyrillic' ? /[\u0400-\u04FF]/g : 
                  charCheck.detectedScript === 'Chinese' ? /[\u4E00-\u9FFF]/g : null;
    if (regex) {
      const match = regex.exec(text);
      if (match) {
        const pos = match.index;
        const contextStart = Math.max(0, pos - 30);
        const contextEnd = Math.min(text.length, pos + 30);
        const context = text.substring(contextStart, contextEnd);
        console.error(`[Validation] Invalid ${charCheck.detectedScript} at position ${pos}:`, context);
      }
    }
    errors.push(`Invalid character set detected: ${charCheck.detectedScript} (${charCheck.sampleChars})`);
    confidence = 0;
  }

  // Check 2: Translation artifacts
  const artifactCheck = detectTranslationArtifacts(text);
  if (!artifactCheck.isValid) {
    errors.push(...artifactCheck.errors);
    confidence = Math.min(confidence, 0.3);
  }

  // Check 3: Verify it's actually Sami (soft check for warnings)
  const langCheck = detectLanguage(text);
  if (langCheck.language !== 'sme' && langCheck.confidence > 0.5) {
    warnings.push(`Output appears to be ${langCheck.language} instead of Sami (confidence: ${langCheck.confidence.toFixed(2)})`);
    confidence = Math.min(confidence, 0.5);
  }

  // Check 4: Verify minimum Sami characteristics (if no errors yet)
  if (errors.length === 0 && langCheck.language === 'sme' && langCheck.confidence < 0.4) {
    warnings.push(`Low Sami language confidence: ${langCheck.confidence.toFixed(2)}`);
  }

  return {
    isValid: errors.length === 0,
    language: langCheck.language,
    confidence,
    errors,
    warnings,
  };
}

/**
 * Validate Finnish LLM output (Stage 2)
 * Checks if LLM responded in correct language
 */
export function validateFinnishOutput(text: string, threshold: number = 0.7): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const langCheck = detectLanguage(text);

  if (langCheck.language !== 'fin') {
    errors.push(`Expected Finnish, but detected ${langCheck.language} (confidence: ${langCheck.confidence.toFixed(2)})`);
  } else if (langCheck.confidence < threshold) {
    warnings.push(`Low Finnish confidence: ${langCheck.confidence.toFixed(2)} (threshold: ${threshold})`);
  }

  return {
    isValid: errors.length === 0,
    language: langCheck.language,
    confidence: langCheck.confidence,
    errors,
    warnings,
  };
}
