// Markdown handling utilities

export interface MarkdownSegment {
  // Note: we keep the original type names but some segments may now contain
  // multiple logical lines (e.g. a whole table or a paragraph of text).
  type: 'text' | 'code' | 'table-row' | 'heading' | 'list-item';
  content: string;
  prefix?: string; // For markdown syntax preservation (e.g., "# ", "- ", "| ")
  prefixLines?: string[]; // For multi-line list segments: per-line prefixes
  suffix?: string;
}

export interface InlineMarkdown {
  type: 'inline-code' | 'bold' | 'italic' | 'link';
  placeholder: string;
  original: string;
  linkText?: string; // For links, the text to translate
  linkUrl?: string;  // For links, the URL to preserve
  trailingPunctuation?: string; // Punctuation directly following the inline element in the original text
}

// Token produced from tokenization of a segment
export interface Token {
  kind: 'text' | 'inline-code' | 'bold' | 'italic' | 'link';
  // raw inner text (for inline elements, the inner content; for text, the substring)
  text: string;
  // original full match (for inline-code we preserve exactly)
  original?: string;
  // wrapper strings around the inner text (e.g. '**', '_', '`')
  wrapperStart?: string;
  wrapperEnd?: string;
  // for links
  url?: string;
}

// Unit sent to translator: localized inner text belonging to a specific segment/token
export interface TranslationUnit {
  segmentIndex: number;
  tokenIndex: number;
  lineIndex?: number;
  kind: Token['kind'];
  text: string;
}

export type { TranslationUnit as ExportedTranslationUnit };

/**
 * Extract inline markdown elements (code, bold, italic, links) from text
 * Returns the cleaned text and a map of placeholders to original markdown
 */
function extractInlineMarkdown(text: string): { text: string; inlineElements: InlineMarkdown[] } {
  const inlineElements: InlineMarkdown[] = [];
  const matches: { start: number; end: number; type: InlineMarkdown['type']; original: string; groups?: string[] }[] = [];

  // Helper to add matches while avoiding overlaps
  function addMatch(start: number, end: number, type: InlineMarkdown['type'], original: string, groups?: string[]) {
    // Check for overlap
    for (const m of matches) {
      if (!(end <= m.start || start >= m.end)) {
        // overlap detected - skip this match
        return;
      }
    }
    matches.push({ start, end, type, original, groups });
  }

  // Patterns in priority order: inline code, links, bold, italic
  const inlineCodeRe = /`([^`]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = inlineCodeRe.exec(text)) !== null) {
    addMatch(m.index, m.index + m[0].length, 'inline-code', m[0], [m[1]]);
  }

  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
  while ((m = linkRe.exec(text)) !== null) {
    addMatch(m.index, m.index + m[0].length, 'link', m[0], [m[1], m[2]]);
  }

  const boldRe = /(\*\*|__)([^*_]+)\1/g;
  while ((m = boldRe.exec(text)) !== null) {
    addMatch(m.index, m.index + m[0].length, 'bold', m[0], [m[2]]);
  }

  const italicRe = /(\*|_)([^*_]+)\1/g;
  while ((m = italicRe.exec(text)) !== null) {
    addMatch(m.index, m.index + m[0].length, 'italic', m[0], [m[2]]);
  }

  // Sort matches by start index
  matches.sort((a, b) => a.start - b.start);

  // Build result with placeholders
  let result = '';
  let cursor = 0;
  let placeholderIndex = globalPlaceholderCounter;
  for (const mm of matches) {
    // append text before match
    if (cursor < mm.start) {
      result += text.slice(cursor, mm.start);
    }
    const placeholder = `@@${(mm.type).toUpperCase()}_${placeholderIndex}@@`;
    const nextChar = text[mm.end] ?? '';
    const trailingPunctuation = nextChar && !/\s/.test(nextChar) && /[.,;:!?)}\]}'"]/.test(nextChar) ? nextChar : undefined;
    inlineElements.push({
      type: mm.type,
      placeholder,
      original: mm.original,
      linkText: mm.groups && mm.groups[0],
      linkUrl: mm.groups && mm.groups[1],
      trailingPunctuation,
    });
    result += placeholder;
    placeholderIndex++;
    cursor = mm.end;
  }

  // append remaining text
  if (cursor < text.length) {
    result += text.slice(cursor);
  }

  globalPlaceholderCounter = placeholderIndex;
  return { text: result, inlineElements };
}

// Global placeholder counter to ensure uniqueness across multiple segments/calls
let globalPlaceholderCounter = 0;

/**
 * Restore inline markdown elements back into translated text
 * For links, translate the link text if it appears in the translated content
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function deriveWrappers(element: InlineMarkdown): { wrapperStart?: string; wrapperEnd?: string } {
  if (element.type === 'bold') {
    const match = element.original.match(/^(\*\*|__)([\s\S]+?)(\*\*|__)$/);
    if (match) {
      return { wrapperStart: match[1], wrapperEnd: match[3] };
    }
  } else if (element.type === 'italic') {
    const match = element.original.match(/^(\*|_)([\s\S]+?)(\*|_)$/);
    if (match) {
      return { wrapperStart: match[1], wrapperEnd: match[3] };
    }
  } else if (element.type === 'inline-code') {
    const match = element.original.match(/^(`+)([\s\S]+?)(`+)$/);
    if (match) {
      return { wrapperStart: match[1], wrapperEnd: match[3] };
    }
  }

  return {};
}

function normalizePlaceholderContext(text: string, element: InlineMarkdown): string {
  const placeholder = element.placeholder;
  const placeholderPattern = escapeRegExp(placeholder);
  let result = text;

  if (element.type === 'link') {
    // Collapse bracketed/parenthesized placeholders back to the raw placeholder
    const linkPattern = new RegExp(`\\[\\s*${placeholderPattern}\\s*\\]\\s*\\(([^)]+)\\)`, 'g');
    result = result.replace(linkPattern, placeholder);

    const bracketOnlyPattern = new RegExp(`\\[\\s*${placeholderPattern}\\s*\\]`, 'g');
    result = result.replace(bracketOnlyPattern, placeholder);

    const parenOnlyPattern = new RegExp(`\\(\\s*${placeholderPattern}\\s*\\)`, 'g');
    result = result.replace(parenOnlyPattern, placeholder);
  } else {
    const { wrapperStart, wrapperEnd } = deriveWrappers(element);
    if (wrapperStart && wrapperEnd) {
      const bothPattern = new RegExp(`${escapeRegExp(wrapperStart)}\\s*${placeholderPattern}\\s*${escapeRegExp(wrapperEnd)}`, 'g');
      result = result.replace(bothPattern, placeholder);
    }
    if (wrapperStart) {
      const startPattern = new RegExp(`${escapeRegExp(wrapperStart)}\\s*${placeholderPattern}`, 'g');
      result = result.replace(startPattern, placeholder);
    }
    if (wrapperEnd) {
      const endPattern = new RegExp(`${placeholderPattern}\\s*${escapeRegExp(wrapperEnd)}`, 'g');
      result = result.replace(endPattern, placeholder);
    }
  }

  if (element.trailingPunctuation) {
    const escapedPunctuation = escapeRegExp(element.trailingPunctuation);
    const trailingPunctPattern = new RegExp(placeholderPattern + '\\s+' + escapedPunctuation, 'g');
    result = result.replace(trailingPunctPattern, `${placeholder}${element.trailingPunctuation}`);
  }

  return result;
}

function normalizeBulletSpacing(text: string): string {
  if (!text || text.indexOf('•') === -1) {
    return text;
  }

  const withLineBreaks = text.replace(/([^\n])\s*•\s*/g, (_match, prev) => `${prev}\n• `);
  return withLineBreaks.replace(/(^|\n)[ \t]*•[ \t]*/g, (_match, prefix) => `${prefix}• `);
}

export function restoreInlineMarkdown(text: string, inlineElements: InlineMarkdown[]): string {
  let result = text;

  for (const element of inlineElements) {
    if (result.includes(element.placeholder)) {
      result = normalizePlaceholderContext(result, element);
      result = result.split(element.placeholder).join(element.original);
    }
  }

  return result;
}

/**
 * Extract markdown segments from text, preserving structure
 */
export function extractMarkdownSegments(text: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  const lines = text.split('\n');
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  // We'll walk lines and group them into larger logical blocks:
  // - Consecutive non-empty plain text (or blockquote lines with same prefix)
  //   form one 'text' segment (a "wall of text" / paragraph)
  // - Consecutive table rows form one table block (kept as 'table-row' type for
  //   compatibility) where content contains the raw table lines joined with \n
  // - Consecutive list items form one list block (type 'list-item') where
  //   content contains the raw list lines joined with \n
  // - Code blocks and headings remain as before

  let pendingText: { prefix?: string; lines: string[] } | null = null;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Code block handling (unchanged)
    if (line.trim().startsWith('```') || line.trim().startsWith('~~~')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockContent = [line];
      } else {
        codeBlockContent.push(line);
        segments.push({ type: 'code', content: codeBlockContent.join('\n') });
        codeBlockContent = [];
        inCodeBlock = false;
      }
      i++;
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      i++;
      continue;
    }

    // Table row block
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      // flush any pending text
      if (pendingText) {
        segments.push({ type: 'text', content: pendingText.lines.join('\n'), prefix: pendingText.prefix });
        pendingText = null;
      }

      const tableLines: string[] = [];
      let j = i;
      while (j < lines.length && lines[j].trim().startsWith('|') && lines[j].trim().endsWith('|')) {
        tableLines.push(lines[j]);
        j++;
      }
      // Parse table lines into inner cell content (without leading/trailing pipes)
      const innerLines: string[] = [];
      for (const tl of tableLines) {
        const raw = tl.trim();
        // parse cells similar to previous logic
        const cells: string[] = [];
        let current = '';
        let escaping = false;
        for (let idx = 1; idx < raw.length - 1; idx++) {
          const ch = raw[idx];
          if (ch === '\\' && !escaping) {
            escaping = true;
            current += ch;
            continue;
          }
          if (ch === '|' && !escaping) {
            cells.push(current.trim());
            current = '';
            continue;
          }
          current += ch;
          escaping = false;
        }
        cells.push(current.trim());
        innerLines.push(cells.join(' | '));
      }
      // store as table-row segment: keep prefix/suffix for reconstruction
      segments.push({ type: 'table-row', content: innerLines.join('\n'), prefix: '| ', suffix: ' |' });
      i = j;
      continue;
    }

    // Blockquote lines - group by same prefix
    const blockquoteMatch = line.match(/^(\s*>+\s*)(.+)$/);
    if (blockquoteMatch) {
      const prefix = blockquoteMatch[1];
      // start or continue pendingText if same prefix
      if (!pendingText || pendingText.prefix !== prefix) {
        if (pendingText) {
          segments.push({ type: 'text', content: pendingText.lines.join('\n'), prefix: pendingText.prefix });
        }
        pendingText = { prefix, lines: [blockquoteMatch[2]] };
      } else {
        pendingText.lines.push(blockquoteMatch[2]);
      }
      i++;
      continue;
    }

    // Headings - flush pending text then push heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      if (pendingText) {
        segments.push({ type: 'text', content: pendingText.lines.join('\n'), prefix: pendingText.prefix });
        pendingText = null;
      }
      segments.push({ type: 'heading', content: headingMatch[2], prefix: headingMatch[1] + ' ' });
      i++;
      continue;
    }

    // List block (task/bullet/numbered) - collect contiguous list lines
    const taskListMatch = line.match(/^(\s*[-*+]\s*\[[ xX]\]\s+)(.+)$/);
    const listMatch = line.match(/^(\s*[-*+]\s+)(.+)$/);
    const numberedListMatch = line.match(/^(\s*\d+\.\s+)(.+)$/);
    if (taskListMatch || listMatch || numberedListMatch) {
      if (pendingText) {
        segments.push({ type: 'text', content: pendingText.lines.join('\n'), prefix: pendingText.prefix });
        pendingText = null;
      }
      const listLines: string[] = [];
      let j = i;
      while (j < lines.length) {
        const l = lines[j];
        if (l.match(/^(\s*[-*+]\s*\[[ xX]\]\s+)(.+)$/) || l.match(/^(\s*[-*+]\s+)(.+)$/) || l.match(/^(\s*\d+\.\s+)(.+)$/)) {
          listLines.push(l);
          j++;
          continue;
        }
        break;
      }
      // Parse each list line to separate prefix (e.g., '- ', '1. ') from inner text
      const innerLines: string[] = [];
      const prefixes: string[] = [];
      for (const ll of listLines) {
        const mTask = ll.match(/^(\s*[-*+]\s*\[[ xX]\]\s+)(.+)$/);
        const mBullet = ll.match(/^(\s*[-*+]\s+)(.+)$/);
        const mNum = ll.match(/^(\s*\d+\.\s+)(.+)$/);
        if (mTask) {
          prefixes.push(mTask[1]);
          innerLines.push(mTask[2]);
        } else if (mBullet) {
          prefixes.push(mBullet[1]);
          innerLines.push(mBullet[2]);
        } else if (mNum) {
          prefixes.push(mNum[1]);
          innerLines.push(mNum[2]);
        } else {
          prefixes.push('');
          innerLines.push(ll);
        }
      }
      segments.push({ type: 'list-item', content: innerLines.join('\n'), prefixLines: prefixes });
      i = j;
      continue;
    }

    // Blank line: flush pending text and preserve empty line as its own text segment
    if (line.trim() === '') {
      if (pendingText) {
        segments.push({ type: 'text', content: pendingText.lines.join('\n'), prefix: pendingText.prefix });
        pendingText = null;
      }
      segments.push({ type: 'text', content: '' });
      i++;
      continue;
    }

    // Regular text line: accumulate into pendingText (paragraph grouping)
    const plain = line;
    if (!pendingText) {
      pendingText = { prefix: undefined, lines: [plain] };
    } else if (pendingText.prefix === undefined) {
      pendingText.lines.push(plain);
    } else {
      // different prefix (shouldn't happen for plain text) - flush and start new
      segments.push({ type: 'text', content: pendingText.lines.join('\n'), prefix: pendingText.prefix });
      pendingText = { prefix: undefined, lines: [plain] };
    }
    i++;
  }

  if (inCodeBlock && codeBlockContent.length > 0) {
    segments.push({ type: 'code', content: codeBlockContent.join('\n') });
  }

  if (pendingText) {
    segments.push({ type: 'text', content: pendingText.lines.join('\n'), prefix: pendingText.prefix });
    pendingText = null;
  }

  // Handle unclosed code block
  if (inCodeBlock && codeBlockContent.length > 0) {
    segments.push({
      type: 'code',
      content: codeBlockContent.join('\n'),
    });
  }

  return segments;
}

/**
 * Reconstruct text from markdown segments
 */
export function reconstructFromSegments(segments: MarkdownSegment[]): string {
  return segments
    .map(segment => {
      if (segment.type === 'code') {
        return segment.content;
      }
      if (segment.type === 'table-row') {
        // content may contain multiple inner lines; apply prefix/suffix per line
        const lines = segment.content.split('\n');
        return lines.map(l => `${segment.prefix || ''}${l}${segment.suffix || ''}`).join('\n');
      }

      if (segment.type === 'list-item') {
        // If prefixLines exist, reapply them per line
        if (segment.prefixLines && segment.prefixLines.length > 0) {
          const lines = segment.content.split('\n');
          return lines.map((l, idx) => `${segment.prefixLines![idx] || ''}${l}`).join('\n');
        }
        return `${segment.prefix || ''}${segment.content}`;
      }

      return `${segment.prefix || ''}${segment.content}`;
    })
    .join('\n');
}

/**
 * Extract only translatable text from segments
 * Also extracts inline markdown and stores them for later restoration
 */
export function extractTranslatableText(segments: MarkdownSegment[]): string[] {
  // Use same translatability rules as the inline-with-debug extractor
  const isHorizontalRule = (s: string) => /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(s.trim());
  return segments
    .filter(segment => {
      if (segment.type === 'code') return false;
      if (segment.content.trim() === '') return false;
      if (isHorizontalRule(segment.content)) return false;
      if (segment.prefix && /^\s*>/.test(segment.prefix)) return false; // blockquote
      if (segment.prefix && /\[[ xX]\]/.test(segment.prefix)) return false; // task list
      return true;
    })
    .map(segment => {
      // Extract inline markdown before translation
      const { text } = extractInlineMarkdown(segment.content);
      return text;
    });
}

/**
 * Tokenize a single segment content into tokens.
 * Tokens preserve inline formatting kinds and raw text pieces.
 */
export function tokenizeSegmentContent(content: string): Token[] {
  const tokens: Token[] = [];

  // We'll scan content left-to-right, finding inline-code, links, bold, italic in priority
  let cursor = 0;
  const text = content;

  // Patterns
  const inlineCodeRe = /`([^`]+)`/g;
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
  const boldRe = /(\*\*|__)([^*_]+?)\1/g;
  const italicRe = /(\*|_)([^*_]+?)\1/g;

  // Helper to push plain text between matches
  function pushPlain(from: number, to: number) {
    if (to > from) {
      tokens.push({ kind: 'text', text: text.slice(from, to) });
    }
  }

  // Collect all matches with positions and priority
  type Match = { start: number; end: number; kind: Token['kind']; inner: string; original?: string; wrapperStart?: string; wrapperEnd?: string; url?: string };
  const matches: Match[] = [];

  let m: RegExpExecArray | null;
  while ((m = inlineCodeRe.exec(text)) !== null) matches.push({ start: m.index, end: m.index + m[0].length, kind: 'inline-code', inner: m[1], original: m[0], wrapperStart: '`', wrapperEnd: '`' });
  while ((m = linkRe.exec(text)) !== null) matches.push({ start: m.index, end: m.index + m[0].length, kind: 'link', inner: m[1], original: m[0], url: m[2], wrapperStart: '[', wrapperEnd: ')' });
  while ((m = boldRe.exec(text)) !== null) matches.push({ start: m.index, end: m.index + m[0].length, kind: 'bold', inner: m[2], original: m[0], wrapperStart: m[1], wrapperEnd: m[1] });
  while ((m = italicRe.exec(text)) !== null) matches.push({ start: m.index, end: m.index + m[0].length, kind: 'italic', inner: m[2], original: m[0], wrapperStart: m[1], wrapperEnd: m[1] });

  // sort by start index and then by longer matches first
  matches.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));

  // Remove overlaps by preferring earlier/longer matches
  const chosen: Match[] = [];
  for (const mt of matches) {
    if (chosen.some(c => !(mt.end <= c.start || mt.start >= c.end))) continue; // overlap
    chosen.push(mt);
  }

  for (const ch of chosen) {
    pushPlain(cursor, ch.start);
    tokens.push({ kind: ch.kind, text: ch.inner, original: ch.original, wrapperStart: ch.wrapperStart, wrapperEnd: ch.wrapperEnd, url: ch.url });
    cursor = ch.end;
  }
  pushPlain(cursor, text.length);

  return tokens;
}

/**
 * From segments produce translation units (no placeholders) — one unit per translatable token.
 */
export function extractTranslationUnits(segments: MarkdownSegment[]): TranslationUnit[] {
  const units: TranslationUnit[] = [];

  const isHorizontalRule = (s: string) => /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(s.trim());

  segments.forEach((segment, si) => {
    // skip non-translatable segments
    if (segment.type === 'code') return;
    if (segment.content.trim() === '') return;
    if (isHorizontalRule(segment.content)) return;
    if (segment.prefix && /^\s*>/.test(segment.prefix)) return; // blockquote prefix - skip prefix
    if (segment.prefix && /\[[ xX]\]/.test(segment.prefix)) return; // task list prefix

    if (segment.type === 'table-row' || segment.type === 'list-item') {
      // multi-line content: tokenize each line and emit units with lineIndex
      const lines = segment.content.split('\n');
      lines.forEach((ln, li) => {
        const tokens = tokenizeSegmentContent(ln);
        tokens.forEach((t, ti) => {
          if (t.kind === 'inline-code') return;
          units.push({ segmentIndex: si, lineIndex: li, tokenIndex: ti, kind: t.kind, text: t.text });
        });
      });
    } else {
      const tokens = tokenizeSegmentContent(segment.content);
      tokens.forEach((t, ti) => {
        if (t.kind === 'inline-code') return; // do not translate code
        // Only translate text, bold, italic, link (link text)
        units.push({ segmentIndex: si, tokenIndex: ti, kind: t.kind, text: t.text });
      });
    }
  });

  return units;
}

/**
 * Reconstruct segments from translated units. Units must provide segmentIndex/tokenIndex mapping with translated text.
 */
export function reconstructSegmentsFromUnits(segments: MarkdownSegment[], translatedUnits: Map<string, string>): MarkdownSegment[] {
  // translatedUnits key is `${segmentIndex}:${tokenIndex}`
  return segments.map((segment, si) => {
    if (segment.type === 'code' || segment.content.trim() === '') return segment;

    // For table-row and list-item segments we treat content as multiple
    // logical lines that should be tokenized and reconstructed per-line.
    if (segment.type === 'table-row' || segment.type === 'list-item') {
      const lines = segment.content.split('\n');
      const rebuiltLines = lines.map((ln, lineIndex) => {
        const tokens = tokenizeSegmentContent(ln);
        const rebuilt = tokens.map((t, ti) => {
          const key = `${si}:${lineIndex}:${ti}`; // use extended key for multiple lines
          if (t.kind === 'inline-code') return t.original || (t.wrapperStart || '`') + t.text + (t.wrapperEnd || '`');
          const translated = translatedUnits.get(key) || t.text;
          switch (t.kind) {
            case 'text': {
              // Preserve leading/trailing whitespace from original token
              const originalLeadingSpace = t.text.match(/^\s+/)?.[0] || '';
              const originalTrailingSpace = t.text.match(/\s+$/)?.[0] || '';
              const trimmedTranslated = translated.trim();
              return originalLeadingSpace + trimmedTranslated + originalTrailingSpace;
            }
            case 'bold': {
              const normalized = translated.trim();
              return `${t.wrapperStart || '**'}${normalized}${t.wrapperEnd || '**'}`;
            }
            case 'italic': {
              const normalized = translated.trim();
              return `${t.wrapperStart || '_'}${normalized}${t.wrapperEnd || '_'}`;
            }
            case 'link': {
              const normalized = translated.trim();
              return `[${normalized}](${t.url || ''})`;
            }
            default: {
              return translated;
            }
          }
        }).join('');
        return rebuilt;
      });

  return { ...segment, content: normalizeBulletSpacing(rebuiltLines.join('\n')) };
    }

    // tokenization for regular single-line (or paragraph) text
    const tokens = tokenizeSegmentContent(segment.content);
    const rebuilt = tokens.map((t, ti) => {
      const key = `${si}:${ti}`;
      if (t.kind === 'inline-code') return t.original || (t.wrapperStart || '`') + t.text + (t.wrapperEnd || '`');
      const translated = translatedUnits.get(key) || t.text;
      switch (t.kind) {
        case 'text': {
          // Preserve leading/trailing whitespace from original token
          // Translation API may trim spaces, but we need them for proper formatting
          const originalLeadingSpace = t.text.match(/^\s+/)?.[0] || '';
          const originalTrailingSpace = t.text.match(/\s+$/)?.[0] || '';
          const trimmedTranslated = translated.trim();
          return originalLeadingSpace + trimmedTranslated + originalTrailingSpace;
        }
        case 'bold': {
          const normalized = translated.trim();
          return `${t.wrapperStart || '**'}${normalized}${t.wrapperEnd || '**'}`;
        }
        case 'italic': {
          const normalized = translated.trim();
          return `${t.wrapperStart || '_'}${normalized}${t.wrapperEnd || '_'}`;
        }
        case 'link': {
          // t.url exists
          const normalized = translated.trim();
          return `[${normalized}](${t.url || ''})`;
        }
        default: {
          return translated;
        }
      }
    }).join('');

    return { ...segment, content: normalizeBulletSpacing(rebuilt) };
  });
}

// Store inline elements for each segment during extraction
const segmentInlineElements: Map<number, InlineMarkdown[]> = new Map();

/**
 * Extract only translatable text from segments with inline markdown handling
 * Returns both the cleaned text and stores inline elements for restoration
 */
export function extractTranslatableTextWithInline(segments: MarkdownSegment[]): string[] {
  segmentInlineElements.clear();
  let segmentIndex = 0;
  const isHorizontalRule = (s: string) => /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(s.trim());

  return segments
    .filter(segment => {
      if (segment.type === 'code') return false;
      if (segment.content.trim() === '') return false;
      if (isHorizontalRule(segment.content)) return false;
      // table-row and list-item now contain inner text (without markers) and are translatable
      if (segment.prefix && /^\s*>/.test(segment.prefix)) return false; // blockquote
      if (segment.prefix && /\[[ xX]\]/.test(segment.prefix)) return false; // task list
      return true;
    })
    .map(segment => {
      // Extract inline markdown before translation
      const { text, inlineElements } = extractInlineMarkdown(segment.content);
      if (inlineElements.length > 0) {
        segmentInlineElements.set(segmentIndex, inlineElements);
      }
      segmentIndex++;
      return text;
    });
}

// Debug helper: returns both texts and the inline elements per filtered segment
export function extractTranslatableTextWithInlineDebug(segments: MarkdownSegment[]): { texts: string[]; inlinePerSegment: InlineMarkdown[][] } {
  segmentInlineElements.clear();
  let segmentIndex = 0;
  const texts: string[] = [];
  const inlinePerSegment: InlineMarkdown[][] = [];

  const isHorizontalRule = (s: string) => /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(s.trim());

  for (const segment of segments.filter(s => {
    if (s.type === 'code') return false;
    if (s.content.trim() === '') return false;
    if (isHorizontalRule(s.content)) return false;
    if (s.prefix && /^\s*>/.test(s.prefix)) return false; // blockquote
    if (s.prefix && /\[[ xX]\]/.test(s.prefix)) return false; // task list
    return true;
  })) {
    const { text, inlineElements } = extractInlineMarkdown(segment.content);
    texts.push(text);
    inlinePerSegment.push(inlineElements);
    if (inlineElements.length > 0) {
      segmentInlineElements.set(segmentIndex, inlineElements);
    }
    segmentIndex++;
  }

  return { texts, inlinePerSegment };
}

/**
 * Apply translated text back to segments
 */
export function applyTranslations(
  segments: MarkdownSegment[],
  translations: string[]
): MarkdownSegment[] {
  let translationIndex = 0;
  const isHorizontalRule = (s: string) => /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(s.trim());

  return segments.map(segment => {
    // Use same translatability rules as extraction
    const isTranslatable = (seg: MarkdownSegment) => {
      if (seg.type === 'code') return false;
      if (seg.content.trim() === '') return false;
      if (isHorizontalRule(seg.content)) return false;
      if (seg.type === 'table-row') return false;
      if (seg.prefix && /^\s*>/.test(seg.prefix)) return false; // blockquote
      if (seg.prefix && /\[[ xX]\]/.test(seg.prefix)) return false; // task list
      return true;
    };

    if (isTranslatable(segment)) {
      let translatedContent = translations[translationIndex] || segment.content;

      // Restore inline markdown if we have saved elements for this segment
      const inlineElements = segmentInlineElements.get(translationIndex);
      if (inlineElements && inlineElements.length > 0) {
        translatedContent = restoreInlineMarkdown(translatedContent, inlineElements);
      }

      translatedContent = normalizeBulletSpacing(translatedContent);

      translationIndex++;
      return {
        ...segment,
        content: translatedContent,
      };
    }
    return segment;
  });
}

/**
 * Check if text contains markdown
 */
export function hasMarkdown(text: string): boolean {
  const markdownPatterns = [
    /^#{1,6}\s+/m, // Headings
    /\*\*[^*]+\*\*/g, // Bold
    /\*[^*]+\*/g, // Italic
    /\[[^\]]+\]\([^)]+\)/g, // Links
    /^```/m, // Code blocks
    /`[^`]+`/g, // Inline code
    /^[-*+]\s+/m, // Lists
    /^\d+\.\s+/m, // Numbered lists
    /^\|.+\|$/m, // Tables
  ];

  return markdownPatterns.some(pattern => pattern.test(text));
}

/**
 * Remove known placeholder artifacts from text (migration helper).
 * Matches patterns like @@BOLD_0@@, @BOLD_0@, __BOLD_0__, etc.
 */
export function sanitizePlaceholders(text: string): string {
  if (!text) return text;
  // Remove both @@TOKEN_1@@ and @TOKEN_1@ and __TOKEN_1__ forms
  return text.replace(/(@@?|__)[A-Z-]+_?\d+(@@?|__)/g, '').replace(/@{1}[A-Z-]+_?\d+/g, '');
}
