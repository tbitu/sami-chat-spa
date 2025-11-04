import { describe, it, expect } from 'vitest';
import { hasNaturalBreak, splitAtLastBreak } from '../chunk-aggregator';

describe('chunk-aggregator markdown-aware splitting', () => {
  describe('hasNaturalBreak', () => {
    it('detects sentence endings without markdown', () => {
      expect(hasNaturalBreak('This is a sentence.')).toBe(true);
      expect(hasNaturalBreak('Is this a question?')).toBe(true);
      expect(hasNaturalBreak('What an exclamation!')).toBe(true);
    });

    it('does NOT break inside unclosed bold markdown', () => {
      // Key: if markdown is UNCLOSED, don't break
      expect(hasNaturalBreak('Dette er en **løsning.')).toBe(false); // Unclosed **
      expect(hasNaturalBreak('Use **method().')).toBe(false); // Unclosed **
      expect(hasNaturalBreak('Some **bold.')).toBe(false); // Unclosed **
    });

    it('DOES break after closed bold markdown', () => {
      // If markdown is properly closed, breaking is OK
      expect(hasNaturalBreak('Dette er en **løsning.**')).toBe(true); // Closed **
      expect(hasNaturalBreak('Use **method().**')).toBe(true); // Closed **
      expect(hasNaturalBreak('Some **bold.**')).toBe(true); // Closed **
    });

    it('does NOT break inside unclosed italic markdown', () => {
      expect(hasNaturalBreak('This is *italic.')).toBe(false); // Unclosed *
      expect(hasNaturalBreak('Use _underscore italic.')).toBe(false); // Unclosed _
    });

    it('DOES break after closed italic markdown', () => {
      expect(hasNaturalBreak('This is *italic.*')).toBe(true); // Closed *
      expect(hasNaturalBreak('Use _underscore italic._')).toBe(true); // Closed _
    });

    it('does NOT break inside inline code', () => {
      expect(hasNaturalBreak('Run `command.sh`')).toBe(false);
      expect(hasNaturalBreak('Use `function()`')).toBe(false);
    });

    it('does NOT break inside links', () => {
      expect(hasNaturalBreak('See [documentation]')).toBe(false);
      expect(hasNaturalBreak('Click [here](http://example.com')).toBe(false);
    });

    it('DOES break after complete bold markdown', () => {
      expect(hasNaturalBreak('Dette er en **løsning.** ')).toBe(true);
      expect(hasNaturalBreak('Use **method().**')).toBe(true);
    });

    it('DOES break after complete italic markdown', () => {
      expect(hasNaturalBreak('This is *italic.* ')).toBe(true);
    });

    it('DOES break after complete inline code', () => {
      expect(hasNaturalBreak('Run `command.sh`. ')).toBe(true);
    });

    it('DOES break after complete links', () => {
      expect(hasNaturalBreak('See [docs](http://example.com). ')).toBe(true);
    });

    it('handles multiple markdown elements correctly', () => {
      // Unclosed: should not break
      expect(hasNaturalBreak('Use **method1()** and **method2().')).toBe(false); // Last ** unclosed
      // Closed: should break
      expect(hasNaturalBreak('Use **method1()** and **method2().**')).toBe(true); // All closed
      expect(hasNaturalBreak('Use **method1()** and **method2().** ')).toBe(true); // All closed with space
    });
  });

  describe('splitAtLastBreak', () => {
    it('splits at sentence ending without markdown', () => {
      const [before, after] = splitAtLastBreak('First sentence. Second sentence. Third');
      expect(before).toBe('First sentence. Second sentence. ');
      expect(after).toBe('Third');
    });

    it('does NOT split inside bold markdown at sentence ending', () => {
      const [before, after] = splitAtLastBreak('Dette er en **løsning.** Du må planlegge');
      // Should not split at "løsning.**" because bold is not closed
      // Wait - actually "løsning.**" has both ** so it IS closed. Let me reconsider...
      
      // The issue in the user's case is: "...løsning.** Du må..."
      // After "løsning." we have "**" which closes the bold, then " Du"
      // So the text should be: "...løsning.** " is a valid break point
      expect(before).toBe('Dette er en **løsning.** ');
      expect(after).toBe('Du må planlegge');
    });

    it('does NOT split when bold would be left unclosed', () => {
      // Text: "This is **bold text. More text"
      // The period after "text." is inside unclosed bold
      const [before, after] = splitAtLastBreak('This is **bold text. More text');
      expect(before).toBe(''); // Should not split
      expect(after).toBe('This is **bold text. More text');
    });

    it('splits at last valid sentence when there are multiple', () => {
      const text = 'First. Second. Start **bold. Third.** Fourth';
      const [before, after] = splitAtLastBreak(text);
      // Should split at the LAST valid point, which is after ".** "
      // The split at "bold. " would leave unclosed **, so it's rejected
      expect(before).toBe('First. Second. Start **bold. Third.** ');
      expect(after).toBe('Fourth');
    });

    it('handles the reported bug case', () => {
      // Simulating: "...løsning.** Du må planlegge..."
      // After the bold closes, there's a sentence ending with space
      const text = 'Dette er en **løsning.** Du må planlegge videre.';
      const [before, after] = splitAtLastBreak(text);
      
      // Should split after "**løsning.** " because bold is properly closed
      expect(before).toBe('Dette er en **løsning.** ');
      expect(after).toBe('Du må planlegge videre.');
    });

    it('handles incomplete markdown at end', () => {
      const text = 'First sentence. Second with **bold';
      const [before, after] = splitAtLastBreak(text);
      // Should split at first sentence since second has unclosed bold
      expect(before).toBe('First sentence. ');
      expect(after).toBe('Second with **bold');
    });

    it('handles inline code correctly', () => {
      const text = 'Use `code.sh`. More text. Even more.';
      const [before, after] = splitAtLastBreak(text);
      expect(before).toBe('Use `code.sh`. More text. ');
      expect(after).toBe('Even more.');
    });

    it('does not split inside unclosed inline code', () => {
      const text = 'Use `code with. period inside backtick';
      const [before, after] = splitAtLastBreak(text);
      expect(before).toBe('');
      expect(after).toBe(text);
    });
  });
});
