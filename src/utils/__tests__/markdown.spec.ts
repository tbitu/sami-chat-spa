import { describe, it, expect } from 'vitest';
import {
  restoreInlineMarkdown,
  InlineMarkdown,
  applyTranslations,
  extractTranslatableTextWithInline,
  MarkdownSegment
} from '../markdown';

describe('restoreInlineMarkdown spacing edge cases', () => {
  it('restores bold without stray spaces around placeholder', () => {
    const inlineElements: InlineMarkdown[] = [
      { type: 'bold', placeholder: '@@BOLD_0@@', original: '**strong**' }
    ];

    // translator returned a space after the wrapper
    expect(restoreInlineMarkdown('This is ** @@BOLD_0@@ test', inlineElements)).toBe('This is **strong** test');
    // translator returned a space before the wrapper
    expect(restoreInlineMarkdown('This is @@BOLD_0@@ ** test', inlineElements)).toBe('This is **strong** test');
    // translator removed spaces entirely
    expect(restoreInlineMarkdown('This is**@@BOLD_0@@**test', inlineElements)).toBe('This is**strong**test');
  });

  it('restores italic and code wrappers with stray spaces', () => {
    const inlineElements: InlineMarkdown[] = [
      { type: 'italic', placeholder: '@@ITALIC_0@@', original: '*em*' },
      { type: 'inline-code', placeholder: '@@CODE_0@@', original: '`x()`' }
    ];

    expect(restoreInlineMarkdown('Start * @@ITALIC_0@@ end', inlineElements)).toBe('Start *em* end');
    expect(restoreInlineMarkdown('Code: @@CODE_0@@ .', inlineElements)).toBe('Code: `x()` .');
    // spaces both sides
    expect(restoreInlineMarkdown('A * @@ITALIC_0@@ * B', inlineElements)).toBe('A *em* B');
  });

  it('restores link text and preserves URL while trimming spaces', () => {
    const inlineElements: InlineMarkdown[] = [
      { type: 'link', placeholder: '@@LINK_0@@', original: '[Click here](https://example.com)', linkText: 'Click here', linkUrl: 'https://example.com' }
    ];

    expect(restoreInlineMarkdown('Go to @@LINK_0@@ now', inlineElements)).toBe('Go to [Click here](https://example.com) now');
    expect(restoreInlineMarkdown('Go to [ @@LINK_0@@ ](https://example.com) now', inlineElements)).toBe('Go to [Click here](https://example.com) now');
  });

  it('handles multiple placeholders and mixed wrappers', () => {
    const inlineElements: InlineMarkdown[] = [
      { type: 'bold', placeholder: '@@BOLD_0@@', original: '**B**' },
      { type: 'italic', placeholder: '@@ITALIC_1@@', original: '*i*' },
      { type: 'inline-code', placeholder: '@@CODE_2@@', original: '`c`', trailingPunctuation: '.' }
    ];

    const text = 'Mix @@BOLD_0@@ and @@ITALIC_1@@ and @@CODE_2@@.';
    expect(restoreInlineMarkdown(text, inlineElements)).toBe('Mix **B** and *i* and `c`.');

    // translator added various spaces
    const spaced = 'Mix ** @@BOLD_0@@ and @@ITALIC_1@@ * and @@CODE_2@@ .';
    expect(restoreInlineMarkdown(spaced, inlineElements)).toBe('Mix **B** and *i* and `c`.');
  });
});

describe('applyTranslations formatting cleanup', () => {
  it('moves inline bullets to their own line', () => {
    const segments: MarkdownSegment[] = [
      { type: 'text', content: '2. Álggat pumpema.' }
    ];

    // mimic extraction to populate inline metadata map
    extractTranslatableTextWithInline(segments);

    const translated = applyTranslations(segments, ['2. Álggat pumpema.   •   Deavdde báŋku njozet vai ii čuovggan bensiidna.']);

    expect(translated[0].content).toBe('2. Álggat pumpema.\n• Deavdde báŋku njozet vai ii čuovggan bensiidna.');
  });
});
