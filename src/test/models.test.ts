import { describe, expect, it } from 'vitest';
import { slugToName } from '../models/exercise';

describe('slugToName', () => {
  it('capitalizes each word of a slug', () => {
    expect(slugToName('hello-world')).toBe('Hello World');
    expect(slugToName('guidos-gorgeous-lasagna')).toBe('Guidos Gorgeous Lasagna');
  });

  it('keeps digits and single words intact', () => {
    expect(slugToName('leap')).toBe('Leap');
    expect(slugToName('99-bottles')).toBe('99 Bottles');
  });

  it('returns an empty name for an empty slug', () => {
    expect(slugToName('')).toBe('');
  });
});
