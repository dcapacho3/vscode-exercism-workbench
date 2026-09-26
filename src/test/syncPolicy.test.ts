import { describe, expect, it } from 'vitest';
import { shouldRunBackgroundSync } from '../sync/syncPolicy';

describe('shouldRunBackgroundSync', () => {
  it('never runs background synchronization in manual mode', () => {
    expect(shouldRunBackgroundSync('manual', 0, 10_000_000, 1)).toBe(false);
  });

  it('runs when the configured interval has elapsed', () => {
    const lastSync = 1_000_000;
    expect(shouldRunBackgroundSync('onFocus', lastSync, lastSync + 5 * 60_000, 5)).toBe(true);
  });

  it('does not run repeatedly within the configured interval', () => {
    const lastSync = 1_000_000;
    expect(shouldRunBackgroundSync('onFocus', lastSync, lastSync + 4 * 60_000, 5)).toBe(false);
  });

  it('enforces a one-minute minimum interval', () => {
    expect(shouldRunBackgroundSync('onFocus', 1_000, 1_000 + 59_999, 0)).toBe(false);
  });
});
