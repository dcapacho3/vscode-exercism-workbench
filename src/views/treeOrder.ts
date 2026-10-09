import { Exercise, Track } from '../models';

/** Most recently active track first; tracks with no known activity follow, by name. */
export function orderTracks(tracks: Track[]): Track[] {
  return [...tracks].sort((a, b) =>
    (b.lastActivity ?? 0) - (a.lastActivity ?? 0) || a.name.localeCompare(b.name));
}

export const EXERCISE_ORDERS = ['path', 'reverse', 'easy-first', 'hard-first'] as const;
export type ExerciseOrder = typeof EXERCISE_ORDERS[number];

export const EXERCISE_ORDER_LABELS: Record<ExerciseOrder, string> = {
  'path': 'Learning path',
  'reverse': 'Learning path, reversed',
  'easy-first': 'Easy to hard',
  'hard-first': 'Hard to easy',
};

const DIFFICULTY_RANK: Record<string, number> = { easy: 1, medium: 2, hard: 3 };

function difficultyRank(exercise: Exercise): number {
  return DIFFICULTY_RANK[exercise.difficulty ?? ''] ?? 2;
}

/** Exercises arrive in learning-path order; ties keep that order because sort is stable. */
export function orderExercises(exercises: Exercise[], order: ExerciseOrder): Exercise[] {
  const sorted = [...exercises];
  switch (order) {
    case 'reverse': return sorted.reverse();
    case 'easy-first': return sorted.sort((a, b) => difficultyRank(a) - difficultyRank(b));
    case 'hard-first': return sorted.sort((a, b) => difficultyRank(b) - difficultyRank(a));
    default: return sorted;
  }
}
