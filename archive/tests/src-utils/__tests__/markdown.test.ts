import { describe, it, expect } from 'vitest';
import { extractMarkdownSegments, extractTranslatableTextWithInlineDebug, applyTranslations, reconstructFromSegments } from '../markdown';

describe('markdown utils', () => {
  it('handles numbered lists with multiple items without placeholder collision', () => {
    const md = `1. First item with *italic* text\n2. Second item with **bold** text\n3. Third item with [link](http://example.com)`;
  const segments = extractMarkdownSegments(md);
  const { texts, inlinePerSegment } = extractTranslatableTextWithInlineDebug(segments);

  // Log inline structure for debugging
  // eslint-disable-next-line no-console
  console.log('inlinePerSegment:', inlinePerSegment);

    // Simulate translations by appending "-tr" to each text piece
  const translated = texts.map((t: string) => t + '-tr');
  // eslint-disable-next-line no-console
  console.log('texts:', texts);
  // eslint-disable-next-line no-console
  console.log('translated:', translated);

  const translatedSegments = applyTranslations(segments, translated);
    const reconstructed = reconstructFromSegments(translatedSegments);

    // Each list item should preserve its numbering prefix and original formatting restored
    expect(reconstructed).toContain('1. First item');
    expect(reconstructed).toContain('2. Second item');
    expect(reconstructed).toContain('3. Third item');

    // The inline formatting placeholders should not leak (no __INLINE_CODE or __BOLD_ etc.)
    expect(reconstructed).not.toMatch(/__INLINE_CODE_|__LINK_|__BOLD_|__ITALIC_/);
  });

  it('preserves mixed markdown structure after translation', () => {
    const md = `# Heading\n\nSome intro with ` + "`inline code`" + ` and a [link](https://example.com).\n\n- list item one\n- list item two\n\n| col1 | col2 |\n| ---- | ---- |\n| a | b |`;
    const segments = extractMarkdownSegments(md);
  // const texts = extractTranslatableTextWithInline(segments);
  const { texts, inlinePerSegment } = extractTranslatableTextWithInlineDebug(segments);
  // eslint-disable-next-line no-console
  console.log('inlinePerSegment (mixed):', inlinePerSegment);
  // Simulate translation but preserve placeholders ( @@...@@ ) so they can be restored
  const translated = texts.map((t: string) =>
    t.replace(/@@[^@]+@@|./g, (m: string) => (m.startsWith('@@') ? m : 'x'))
  );
  // eslint-disable-next-line no-console
  console.log('mixed texts:', texts);
  // eslint-disable-next-line no-console
  console.log('mixed translated:', translated);
  const translatedSegments = applyTranslations(segments, translated);
    const reconstructed = reconstructFromSegments(translatedSegments);

  // Heading prefix and table/list markup should be preserved
  expect(reconstructed.startsWith('# ')).toBe(true);
  expect(reconstructed).toMatch(/\| .* \|/);
  expect(reconstructed).toMatch(/- \w+/);
  // Inline code should be restored (original formatting restored)
  expect(reconstructed).toContain('`inline code`');
  });
});
