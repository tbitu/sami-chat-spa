// Utility for aggregating streaming chunks and detecting natural breaks
// Uses queue-based sequential processing to prevent duplicate translations

/**
 * Configuration for chunk aggregation:
 * 
 * - minChunkSize: Minimum characters needed before considering translation
 *   Recommended: 150-200 chars (2-3 sentences) to reduce API overhead
 * 
 * Strategy: Accumulate text until BOTH conditions are met:
 * 1. Natural break point found (sentence end, paragraph, etc.)
 * 2. Accumulated enough text (>= minChunkSize)
 * 
 * Processing: Sequential queue-based processing (one translation at a time)
 * - Prevents race conditions and duplicate translations
 * - Maintains proper ordering of translated chunks
 * - Simpler reasoning about state
 */

/**
 * Detects if text ends with a natural break point for translation
 * Natural breaks include:
 * - Sentence endings: . ! ?
 * - Double newlines (paragraph breaks)
 * - Table row endings
 * - List item endings
 * 
 * IMPORTANT: Avoids breaking inside markdown formatting (bold, italic, etc.)
 */
export function hasNaturalBreak(text: string): boolean {
  if (!text) return false;
  
  const trimmed = text.trimEnd();
  
  // Check for sentence endings (with or without trailing space)
  // Pattern matches: punctuation optionally followed by markdown closing markers
  if (/[.!?](\*\*|\*|`|_)*$/.test(trimmed)) {
    // CRITICAL: Only allow break if markdown is properly closed
    if (isInsideMarkdownFormatting(trimmed)) {
      return false; // Don't break - markdown is unclosed
    }
    return true;
  }
  
  // Check for double newline (paragraph break)
  if (/\n\n$/.test(text)) {
    return true;
  }
  
  // Check for table row ending (markdown table)
  if (/\|\s*$/.test(trimmed) && trimmed.includes('|')) {
    return true;
  }
  
  // Check for list item ending
  if (/\n[-*+]\s/.test(text) || /\n\d+\.\s/.test(text)) {
    return true;
  }
  
  // Check for code block ending
  if (/```\s*$/.test(text)) {
    return true;
  }
  
  return false;
}

/**
 * Check if text appears to be inside unclosed markdown formatting.
 * This prevents breaking in the middle of **bold**, *italic*, `code`, or [links](urls).
 * 
 * Returns true if there's unclosed markdown (odd number of markers).
 */
function isInsideMarkdownFormatting(text: string): boolean {
  // Count markdown markers to detect unclosed formatting
  
  // Check for unclosed bold: odd number of ** pairs
  const boldCount = (text.match(/\*\*/g) || []).length;
  if (boldCount % 2 !== 0) {
    return true; // Unclosed bold
  }
  
  // Check for unclosed inline code: odd number of backticks
  const backtickCount = (text.match(/`/g) || []).length;
  if (backtickCount % 2 !== 0) {
    return true; // Unclosed inline code
  }
  
  // Check for unclosed italic: count single asterisks (excluding those in **)
  // Remove all ** first, then count remaining *
  const textWithoutBold = text.replace(/\*\*/g, '');
  const singleAsteriskCount = (textWithoutBold.match(/\*/g) || []).length;
  if (singleAsteriskCount % 2 !== 0) {
    return true; // Unclosed italic
  }
  
  // Check for unclosed italic with underscores (that aren't part of words)
  // Simplified: just count underscores at word boundaries (start/end of words)
  // This matches markdown italic like _word_ but not snake_case
  const underscoreCount = (text.match(/\b_|_\b/g) || []).length;
  if (underscoreCount % 2 !== 0) {
    return true; // Unclosed italic with underscores
  }
  
  // Check for unclosed link bracket
  const openBrackets = (text.match(/\[/g) || []).length;
  const closeBrackets = (text.match(/\]/g) || []).length;
  if (openBrackets !== closeBrackets) {
    return true; // Unclosed link
  }
  
  return false;
}

/**
 * Splits text at the last natural break point
 * Returns [textUpToBreak, remainingText]
 * 
 * IMPORTANT: Ensures we don't split inside markdown formatting
 */
export function splitAtLastBreak(text: string): [string, string] {
  if (!text) return ['', ''];
  
  // Find all sentence endings, allowing for markdown closing markers before the space
  // Pattern: punctuation, optional markdown closers (**, *, `, _), then whitespace
  const sentenceRegex = /[.!?](\*\*|\*|`|_)*\s+/g;
  let lastValidSplit: [string, string] | null = null;
  let match: RegExpExecArray | null;
  
  while ((match = sentenceRegex.exec(text)) !== null) {
    const splitPoint = match.index + match[0].length;
    const beforeSplit = text.slice(0, splitPoint);
    const afterSplit = text.slice(splitPoint);
    
    // Only consider this split if it doesn't leave unclosed markdown
    if (!isInsideMarkdownFormatting(beforeSplit.trimEnd())) {
      lastValidSplit = [beforeSplit, afterSplit];
    }
  }
  
  if (lastValidSplit) {
    return lastValidSplit;
  }
  
  // Find the last paragraph break
  const paragraphMatch = text.match(/^(.*\n\n)(.*)$/s);
  if (paragraphMatch && paragraphMatch[1] && !isInsideMarkdownFormatting(paragraphMatch[1])) {
    return [paragraphMatch[1], paragraphMatch[2]];
  }
  
  // Find the last table row
  const tableMatch = text.match(/^(.*\|\s*\n)(.*)$/s);
  if (tableMatch && tableMatch[1] && !isInsideMarkdownFormatting(tableMatch[1])) {
    return [tableMatch[1], tableMatch[2]];
  }
  
  // No natural break found, keep accumulating
  return ['', text];
}

interface QueuedChunk {
  text: string;
  timestamp: number;
}

export class ChunkAggregator {
  private accumulated: string = '';
  private onTranslate: (text: string) => Promise<void>;
  private translationQueue: QueuedChunk[] = [];
  private isProcessing: boolean = false;
  private minChunkSize: number;
  private sentTexts: Set<string> = new Set(); // Track sent text to prevent duplicates

  constructor(
    onTranslate: (text: string) => Promise<void>,
    _minTimeBetweenTranslations: number = 500, // Kept for backward compatibility but not used
    minChunkSize: number = 150, // Increased from 50 to reduce API calls
    _maxConcurrentTranslations: number = 1 // Always 1 for queue-based processing
  ) {
    this.onTranslate = onTranslate;
    this.minChunkSize = minChunkSize;
    
    console.log(`[ChunkAggregator] Initialized with minChunkSize=${minChunkSize}, sequential processing`);
  }

  async addChunk(chunk: string): Promise<void> {
    // Add to accumulated buffer
    this.accumulated += chunk;
    const now = Date.now();
    
    console.log(`[ChunkAggregator] Added chunk: ${chunk.length} chars, accumulated total: ${this.accumulated.length} chars`);
    
    // Check if we should queue a translation based on natural breaks
    if (hasNaturalBreak(this.accumulated)) {
      const [toTranslate, remaining] = splitAtLastBreak(this.accumulated);
      
      // Only queue if we have enough text
      const shouldQueue = 
        toTranslate &&
        toTranslate.trim().length >= this.minChunkSize;
      
      if (shouldQueue) {
        console.log(`[ChunkAggregator] Queueing ${toTranslate.length} chars for translation`);
        
        // Add to queue
        this.translationQueue.push({
          text: toTranslate,
          timestamp: now
        });
        
        // Update accumulated to keep only remaining text
        this.accumulated = remaining;
        
        // Start processing queue if not already processing
        if (!this.isProcessing) {
          this.processQueue().catch(error => {
            console.error('[ChunkAggregator] Queue processing error:', error);
          });
        }
      } else {
        console.log(`[ChunkAggregator] Not queueing yet (size: ${toTranslate?.length || 0} < ${this.minChunkSize})`);
      }
    } else {
      console.log(`[ChunkAggregator] No natural break found, continuing to accumulate (${this.accumulated.length} chars)`);
    }
  }

  /**
   * Process queued translations sequentially (one at a time)
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      console.log('[ChunkAggregator] Already processing queue');
      return;
    }

    this.isProcessing = true;
    console.log(`[ChunkAggregator] Starting queue processing, ${this.translationQueue.length} items in queue`);

    try {
      while (this.translationQueue.length > 0) {
        const queued = this.translationQueue.shift()!;
        const textToTranslate = queued.text.trim();
        
        // Skip if we've already sent this exact text (prevents duplicates)
        if (this.sentTexts.has(textToTranslate)) {
          console.warn(`[ChunkAggregator] Skipping duplicate text (${textToTranslate.length} chars):`, textToTranslate);
          continue;
        }
        
        console.log(`[ChunkAggregator] Processing queue item: ${textToTranslate.length} chars, ${this.translationQueue.length} remaining`);
        
        // Mark as sent before translating
        this.sentTexts.add(textToTranslate);
        
        try {
          await this.onTranslate(queued.text);
          console.log(`[ChunkAggregator] Translation completed successfully`);
        } catch (error) {
          console.error('[ChunkAggregator] Translation error:', error);
          // Remove from sent set so we can retry if needed
          this.sentTexts.delete(textToTranslate);
          // Continue processing other items in queue
        }
      }
    } finally {
      this.isProcessing = false;
      console.log('[ChunkAggregator] Queue processing complete');
    }
  }

  async flush(): Promise<void> {
    console.log(`[ChunkAggregator] Flush called - accumulated: ${this.accumulated.length} chars, queue: ${this.translationQueue.length} items, processing: ${this.isProcessing}`);
    
    // Queue any remaining accumulated text for translation
    if (this.accumulated.trim()) {
      const toTranslate = this.accumulated;
      this.accumulated = '';
      
      console.log(`[ChunkAggregator] Queueing remaining ${toTranslate.length} chars`);
      
      this.translationQueue.push({
        text: toTranslate,
        timestamp: Date.now()
      });
    }
    
    // Start processing if not already running
    if (!this.isProcessing && this.translationQueue.length > 0) {
      await this.processQueue();
    }
    
    // Wait for processing to complete
    console.log(`[ChunkAggregator] Waiting for queue processing to complete...`);
    
    // Poll until processing is done with timeout
    const startTime = Date.now();
    const timeout = 60000; // 60 seconds
    
    while (this.isProcessing || this.translationQueue.length > 0) {
      if (Date.now() - startTime > timeout) {
        throw new Error(`Flush timeout: processing did not complete within 60 seconds`);
      }
      
      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`[ChunkAggregator] Flush complete!`);
  }

  getAccumulated(): string {
    return this.accumulated;
  }
  
  isComplete(): boolean {
    return !this.isProcessing && this.translationQueue.length === 0 && !this.accumulated;
  }
}
