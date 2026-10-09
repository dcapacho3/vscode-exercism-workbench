import { Exercise } from './exercise';

export interface Track {
  slug: string;
  name: string;
  /** Track folder on disk; empty when nothing from the track is downloaded. */
  path: string;
  /** Filled in when the track is expanded in the tree. */
  exercises: Exercise[];
  totalExercises?: number;
  /** From Exercism progress; more reliable than counting local folders. */
  completedExercises?: number;
  learnedConcepts?: number;
  totalConcepts?: number;
  /** Latest of the last Exercism activity and the last local solution edit, in ms since the epoch. */
  lastActivity?: number;
}
