import { describe, expect, it } from 'vitest';
import { mergeWebProgressPayload, parseWebProgress } from '../progress/webProgress';

describe('parseWebProgress', () => {
  it('accepts a version 1 Exercism progress export', () => {
    const snapshot = parseWebProgress({
      format: 'exercism-vscode-progress',
      version: 1,
      exportedAt: '2026-09-25T00:00:00.000Z',
      tracks: [],
      exercises: {},
      solutions: [],
    });
    expect(snapshot.version).toBe(1);
  });

  it('rejects ordinary API responses and malformed exports', () => {
    expect(() => parseWebProgress({ tracks: [] })).toThrow(/not an Exercism/i);
  });
});

describe('mergeWebProgressPayload', () => {
  it('merges ordinary track, exercise, and solution API responses', () => {
    const tracks = mergeWebProgressPayload(undefined, {
      tracks: [{ slug: 'python', title: 'Python', is_joined: true, num_exercises: 146, num_completed_exercises: 3, num_concepts: 17, num_learnt_concepts: 2 }],
    });
    const exercises = mergeWebProgressPayload(tracks.progress, {
      exercises: [{ slug: 'currency-exchange', title: 'Currency Exchange', type: 'concept', difficulty: 'easy', blurb: '', is_unlocked: true, is_recommended: true }],
    }, 'python');
    const solutions = mergeWebProgressPayload(exercises.progress, {
      results: [{ uuid: 'abc', status: 'completed', private_url: '', num_iterations: 1, exercise: { slug: 'hello-world', title: 'Hello World' }, track: { slug: 'python', title: 'Python' } }],
      meta: { total_pages: 1 },
    });

    expect(solutions.progress.tracks[0].slug).toBe('python');
    expect(solutions.progress.exercises.python[0].is_recommended).toBe(true);
    expect(solutions.progress.solutions[0].status).toBe('completed');
  });

  it('updates matching solutions without deleting existing ones', () => {
    const first = mergeWebProgressPayload(undefined, {
      results: [{ uuid: 'abc', status: 'started', private_url: '', num_iterations: 1, exercise: { slug: 'hello-world', title: 'Hello World' }, track: { slug: 'python', title: 'Python' } }],
    });
    const second = mergeWebProgressPayload(first.progress, {
      results: [{ uuid: 'abc', status: 'completed', private_url: '', num_iterations: 2, exercise: { slug: 'hello-world', title: 'Hello World' }, track: { slug: 'python', title: 'Python' } }],
    });
    expect(second.progress.solutions).toHaveLength(1);
    expect(second.progress.solutions[0].status).toBe('completed');
  });
});
