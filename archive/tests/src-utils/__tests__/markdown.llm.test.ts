import { describe, it, expect } from 'vitest';
import { extractMarkdownSegments, extractTranslatableTextWithInlineDebug, applyTranslations, reconstructFromSegments } from '../markdown';

describe('markdown utils - LLM markdown cases', () => {
  it('handles fenced code blocks with language and inline code', () => {
    const md = "Here is some code:\n```ts\nconst x = 1;\nconsole.log(x);\n```\nAnd some text with `inline` code.";
    const segments = extractMarkdownSegments(md);
  const { texts, inlinePerSegment } = extractTranslatableTextWithInlineDebug(segments);
  // debug
  // eslint-disable-next-line no-console
  console.log('fenced inlinePerSegment:', inlinePerSegment);
  // eslint-disable-next-line no-console
  console.log('fenced texts:', texts);
    const translated = texts.map((t: string) =>
      t.replace(/@@[^@]+@@|./g, (m: string) => (m.startsWith('@@') ? m : 'y'))
    );
  // eslint-disable-next-line no-console
  console.log('fenced translated:', translated);
    const translatedSegments = applyTranslations(segments, translated);
    const reconstructed = reconstructFromSegments(translatedSegments);

    expect(reconstructed).toContain('```ts');
    expect(reconstructed).toContain('console.log(x);');
    expect(reconstructed).toContain('`inline`');
  });

  it('handles blockquotes and nested formatting', () => {
    const md = "> This is a quote with **bold** and _italic_.\n> - list inside quote\n\nNormal text.";
    const segments = extractMarkdownSegments(md);
  const { texts, inlinePerSegment } = extractTranslatableTextWithInlineDebug(segments);
  // eslint-disable-next-line no-console
  console.log('blockquote inlinePerSegment:', inlinePerSegment);
  // eslint-disable-next-line no-console
  console.log('blockquote texts:', texts);
    const translated = texts.map((t: string) =>
      t.replace(/@@[^@]+@@|./g, (m: string) => (m.startsWith('@@') ? m : 'z'))
    );
  // eslint-disable-next-line no-console
  console.log('blockquote translated:', translated);
    const translatedSegments = applyTranslations(segments, translated);
    const reconstructed = reconstructFromSegments(translatedSegments);

    expect(reconstructed).toContain('> This is a quote');
    expect(reconstructed).toContain('- list inside quote');
  });

  it('handles task lists and horizontal rules', () => {
    const md = "- [x] done\n- [ ] todo\n\n---\n\nEnd.";
    const segments = extractMarkdownSegments(md);
  const { texts, inlinePerSegment } = extractTranslatableTextWithInlineDebug(segments);
  // eslint-disable-next-line no-console
  console.log('task inlinePerSegment:', inlinePerSegment);
  // eslint-disable-next-line no-console
  console.log('task texts:', texts);
    const translated = texts.map((t: string) =>
      t.replace(/@@[^@]+@@|./g, (m: string) => (m.startsWith('@@') ? m : 'm'))
    );
  // eslint-disable-next-line no-console
  console.log('task translated:', translated);
    const translatedSegments = applyTranslations(segments, translated);
    const reconstructed = reconstructFromSegments(translatedSegments);

  expect(reconstructed).toContain('[x]');
  // Horizontal rule should be present exactly as '---' in reconstructed output
  expect(reconstructed).toMatch(/(^|\n)---(\n|$)/);
  });

  it('handles tables with pipes and escaped pipes', () => {
    const md = "| col1 | col2 |\n| --- | --- |\n| a \| with pipe | b |";
    const segments = extractMarkdownSegments(md);
  const { texts, inlinePerSegment } = extractTranslatableTextWithInlineDebug(segments);
  // eslint-disable-next-line no-console
  console.log('table inlinePerSegment:', inlinePerSegment);
  // eslint-disable-next-line no-console
  console.log('table texts:', texts);
    const translated = texts.map((t: string) =>
      t.replace(/@@[^@]+@@|./g, (m: string) => (m.startsWith('@@') ? m : 'n'))
    );
  // eslint-disable-next-line no-console
  console.log('table translated:', translated);
    const translatedSegments = applyTranslations(segments, translated);
    const reconstructed = reconstructFromSegments(translatedSegments);

    expect(reconstructed).toContain('| col1 | col2 |');
    expect(reconstructed).toContain('a \| with pipe');
  });
});
