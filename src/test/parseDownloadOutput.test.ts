import { describe, expect, it } from 'vitest';
import { parseDownloadPath } from '../cli/parseDownloadOutput';

describe('parseDownloadPath', () => {
  it('parses the current CLI stdout format', () => {
    expect(parseDownloadPath('/home/user/exercism/python/bob\n')).toBe(
      '/home/user/exercism/python/bob'
    );
  });

  it('parses labelled output from older CLI versions', () => {
    expect(parseDownloadPath('Downloaded to /home/user/exercism/python/bob\n')).toBe(
      '/home/user/exercism/python/bob'
    );
  });

  it('does not mistake a status message for a path', () => {
    expect(parseDownloadPath('Downloaded to\n')).toBeUndefined();
  });
});

