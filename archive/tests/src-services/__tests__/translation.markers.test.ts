import { describe, it, expect } from 'vitest';
import { extractMarkedUnits } from '../translation';

describe('extractMarkedUnits (deprecated)', () => {
  // Note: extractMarkedUnits is no longer used in production code
  // We now use simple pipe separators (|) for batching translation units
  // These tests are kept for backwards compatibility documentation
  
  it('extracts three marked units from a translated batch', () => {
    const batch = ' <SEP0> First translated <SEP0>  <SEP1> Second translated <SEP1>  <SEP2> Third translated <SEP2> ';
    const parts = extractMarkedUnits(batch, 3);
    expect(parts.length).toBe(3);
    expect(parts[0].trim()).toBe('First translated');
    expect(parts[1].trim()).toBe('Second translated');
    expect(parts[2].trim()).toBe('Third translated');
  });

  it('throws when a marker is missing', () => {
    const batch = ' <SEP0> First <SEP0>  <SEP1> Second <SEP1>  Third without markers ';
    expect(() => extractMarkedUnits(batch, 3)).toThrow();
  });
});

describe('pipe separator batching (current approach)', () => {
  it('splits translated batch by pipe separator', () => {
    const batch = 'First translated|Second translated|Third translated';
    const parts = batch.split('|');
    expect(parts.length).toBe(3);
    expect(parts[0]).toBe('First translated');
    expect(parts[1]).toBe('Second translated');
    expect(parts[2]).toBe('Third translated');
  });

  it('handles empty parts', () => {
    const batch = 'First||Third';
    const parts = batch.split('|');
    expect(parts.length).toBe(3);
    expect(parts[0]).toBe('First');
    expect(parts[1]).toBe('');
    expect(parts[2]).toBe('Third');
  });
});