import { describe, it, expect } from 'vitest';
import {
  extractMarkdownSegments,
  extractTranslationUnits,
  reconstructSegmentsFromUnits,
  reconstructFromSegments,
} from '../../utils/markdown';

describe('translation chunking with markdown preservation', () => {
  it('preserves bold formatting when batching translation units', () => {
    const originalText = 'Hello **world** and **universe**';
    
    // Extract segments and units like translatePreserveFormattingChunk does
    const segments = extractMarkdownSegments(originalText);
    const units = extractTranslationUnits(segments);
    
    // Verify we have the expected units
    expect(units.length).toBeGreaterThan(0);
    
    // Simulate translation with pipe separator (like the fixed code does)
    const unitsBySegment = new Map<number, typeof units>();
    for (const u of units) {
      const arr = unitsBySegment.get(u.segmentIndex) || [];
      arr.push(u);
      unitsBySegment.set(u.segmentIndex, arr as typeof units);
    }
    
    // For each segment, batch units with pipe separator
    const translatedUnits = new Map<string, string>();
    for (const [segmentIndex, segUnits] of unitsBySegment.entries()) {
      const batchText = segUnits.map((u: any) => u.text).join('|');
      
      // Simulate translation (in real scenario, this would call the API)
      // Here we just uppercase as a mock translation
      const translatedBatch = batchText.split('|').map(t => t.toUpperCase()).join('|');
      
      // Split and verify count matches
      const parts = translatedBatch.split('|');
      expect(parts.length).toBe(segUnits.length);
      
      // Store translated units
      for (let i = 0; i < segUnits.length; i++) {
        const key = `${segmentIndex}:${segUnits[i].tokenIndex}`;
        translatedUnits.set(key, parts[i]);
      }
    }
    
    // Reconstruct
    const translatedSegments = reconstructSegmentsFromUnits(segments, translatedUnits);
    const result = reconstructFromSegments(translatedSegments);
    
    // Verify that bold formatting is preserved and applied correctly
    expect(result).toBe('HELLO **WORLD** AND **UNIVERSE**');
    // Most importantly, verify that bold markers are NOT applied to wrong words
    expect(result).not.toContain('**HELLO**');
    expect(result).not.toContain('**AND**');
  });

  it('preserves mixed formatting when batching', () => {
    // Test case: Multiple bold items in one line
    const originalText = 'Use **method1()** and **method2()** functions';
    
    const segments = extractMarkdownSegments(originalText);
    const units = extractTranslationUnits(segments);
    
    const unitsBySegment = new Map<number, typeof units>();
    for (const u of units) {
      const arr = unitsBySegment.get(u.segmentIndex) || [];
      arr.push(u);
      unitsBySegment.set(u.segmentIndex, arr as typeof units);
    }
    
    const translatedUnits = new Map<string, string>();
    for (const [segmentIndex, segUnits] of unitsBySegment.entries()) {
      const batchText = segUnits.map((u: any) => u.text).join('|');
      // Simulate translation: add [T] prefix to show it was translated
      const translatedBatch = batchText.split('|').map(t => `[T]${t}`).join('|');
      const parts = translatedBatch.split('|');
      
      for (let i = 0; i < segUnits.length; i++) {
        const key = `${segmentIndex}:${segUnits[i].tokenIndex}`;
        translatedUnits.set(key, parts[i]);
      }
    }
    
    const translatedSegments = reconstructSegmentsFromUnits(segments, translatedUnits);
    const result = reconstructFromSegments(translatedSegments);
    
    // KEY TEST: Verify that bold wrappers are applied to the correct parts only
    // The fix ensures that when batching with pipes, markdown doesn't leak between units
    expect(result).toContain('**[T]method1()**');
    expect(result).toContain('**[T]method2()**');
    // Bold should NOT wrap the plain text tokens - check for incorrect double-wrapping
    expect(result).not.toMatch(/\*\*\*\*/); // No quadruple asterisks from double-wrapping
    // Verify the text tokens are translated but not bolded
    expect(result).toContain('[T]Use');
    expect(result).toContain('[T] and ');
    expect(result).toContain('[T] functions');
  });

  it('handles segments with inline code correctly', () => {
    const originalText = 'Use `console.log()` to **debug** your code';
    
    const segments = extractMarkdownSegments(originalText);
    const units = extractTranslationUnits(segments);
    
    // Inline code should be filtered out from units
    const hasInlineCode = units.some((u: any) => u.kind === 'inline-code');
    expect(hasInlineCode).toBe(false);
    
    const unitsBySegment = new Map<number, typeof units>();
    for (const u of units) {
      const arr = unitsBySegment.get(u.segmentIndex) || [];
      arr.push(u);
      unitsBySegment.set(u.segmentIndex, arr as typeof units);
    }
    
    const translatedUnits = new Map<string, string>();
    for (const [segmentIndex, segUnits] of unitsBySegment.entries()) {
      const batchText = segUnits.map((u: any) => u.text).join('|');
      const translatedBatch = batchText.toUpperCase();
      const parts = translatedBatch.split('|');
      
      for (let i = 0; i < segUnits.length; i++) {
        const key = `${segmentIndex}:${segUnits[i].tokenIndex}`;
        translatedUnits.set(key, parts[i]);
      }
    }
    
    const translatedSegments = reconstructSegmentsFromUnits(segments, translatedUnits);
    const result = reconstructFromSegments(translatedSegments);
    
    // Inline code should remain unchanged
    expect(result).toContain('`console.log()`');
    // Bold should be preserved
    expect(result).toContain('**DEBUG**');
  });

  it('correctly handles empty segments', () => {
    const originalText = 'Line 1\n\nLine 2 with **bold**';
    
    const segments = extractMarkdownSegments(originalText);
    const units = extractTranslationUnits(segments);
    
    const unitsBySegment = new Map<number, typeof units>();
    for (const u of units) {
      const arr = unitsBySegment.get(u.segmentIndex) || [];
      arr.push(u);
      unitsBySegment.set(u.segmentIndex, arr as typeof units);
    }
    
    const translatedUnits = new Map<string, string>();
    for (const [segmentIndex, segUnits] of unitsBySegment.entries()) {
      const batchText = segUnits.map((u: any) => u.text).join('|');
      const translatedBatch = batchText.toLowerCase();
      const parts = translatedBatch.split('|');
      
      for (let i = 0; i < segUnits.length; i++) {
        const key = `${segmentIndex}:${segUnits[i].tokenIndex}`;
        translatedUnits.set(key, parts[i]);
      }
    }
    
    const translatedSegments = reconstructSegmentsFromUnits(segments, translatedUnits);
    const result = reconstructFromSegments(translatedSegments);
    
    // Structure should be preserved
    expect(result.split('\n').length).toBe(originalText.split('\n').length);
    expect(result).toContain('**bold**');
  });
});
