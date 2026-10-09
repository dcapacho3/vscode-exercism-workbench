import { describe, expect, it } from 'vitest';
import { explainSubmitFailure, RATE_LIMIT_MESSAGE } from '../cli/submitDiagnostics';

describe('submit failure messages', () => {
  it('recognizes a resubmit with no changes', () => {
    const failure = explainSubmitFailure('Error: No files you submitted have changed since your last submission');
    expect(failure.kind).toBe('unchanged');
  });

  it('recognizes the Exercism rate limit', () => {
    expect(explainSubmitFailure('Error: A rate limit has been hit')).toEqual({
      kind: 'rateLimited',
      message: RATE_LIMIT_MESSAGE,
    });
  });

  it('shows the first line of any other error', () => {
    const failure = explainSubmitFailure('\nError: the file is too large\nmore detail');
    expect(failure).toEqual({ kind: 'other', message: 'Submit failed: Error: the file is too large' });
  });

  it('still says something when the CLI prints nothing', () => {
    expect(explainSubmitFailure('').message).toBe('Submit failed: The Exercism CLI gave no reason.');
  });
});
