import { describe, expect, it } from 'vitest';
import { ExerciseStatus } from '../models/exercise';
import { resolveExerciseStatus } from '../progress/exerciseStatus';

describe('resolveExerciseStatus', () => {
  it('treats remote completion as authoritative for a downloaded exercise', () => {
    expect(resolveExerciseStatus('completed', true, true)).toBe(ExerciseStatus.Completed);
  });

  it('treats publication as more specific than completion', () => {
    expect(resolveExerciseStatus('published', true, true)).toBe(ExerciseStatus.Published);
  });

  it('separates submitted exercises from unsubmitted ones', () => {
    expect(resolveExerciseStatus('iterated', true, true)).toBe(ExerciseStatus.Iterated);
    expect(resolveExerciseStatus('started', true, true)).toBe(ExerciseStatus.Started);
  });

  it('shows a downloaded but unsubmitted exercise as in progress', () => {
    expect(resolveExerciseStatus(undefined, true, true)).toBe(ExerciseStatus.Started);
  });

  it('distinguishes unlocked and locked remote exercises', () => {
    expect(resolveExerciseStatus(undefined, false, true)).toBe(ExerciseStatus.Available);
    expect(resolveExerciseStatus(undefined, false, false)).toBe(ExerciseStatus.Locked);
  });
});
