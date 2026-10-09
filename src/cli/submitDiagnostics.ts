export const RATE_LIMIT_MESSAGE = 'Exercism is limiting requests right now. Wait a minute, then try again.';

export interface SubmitFailure {
  kind: 'unchanged' | 'rateLimited' | 'other';
  message: string;
}

/** Turns `exercism submit` error output into a message the learner can act on. */
export function explainSubmitFailure(output: string): SubmitFailure {
  const normalized = output.toLowerCase();
  // Exercism's duplicate_submission error.
  if (normalized.includes('have changed since your last')) {
    return { kind: 'unchanged', message: 'Nothing changed since your last iteration. Edit your solution, then submit again.' };
  }
  // Exercism's too_many_requests error.
  if (normalized.includes('rate limit') || normalized.includes('429')) {
    return { kind: 'rateLimited', message: RATE_LIMIT_MESSAGE };
  }
  const detail = output.trim().split('\n').find(line => line.trim()) ?? 'The Exercism CLI gave no reason.';
  return { kind: 'other', message: `Submit failed: ${detail.trim()}` };
}
