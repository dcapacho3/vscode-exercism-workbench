/** Where the learner stands on an exercise. String values match Exercism's solution statuses. */
export enum ExerciseStatus {
  Locked = 'locked',
  Available = 'available',
  Started = 'started',
  /** At least one iteration submitted, not yet marked complete. */
  Iterated = 'iterated',
  Completed = 'completed',
  /** Completed and shared publicly. */
  Published = 'published',
  /** On disk with no status from Exercism yet; shown as in progress. */
  Downloaded = 'downloaded',
}

export interface Exercise {
  slug: string;
  /** Display name, e.g. "Hello World". */
  name: string;
  /** Track slug, e.g. "python". */
  track: string;
  /** Exercise folder; empty when not downloaded. */
  path: string;
  status: ExerciseStatus;
  hasHints: boolean;
  hasHelp: boolean;
  isRecommended?: boolean;
  isDownloaded?: boolean;
  /** Downloaded, but files listed in .exercism/config.json are missing. */
  isIncomplete?: boolean;
  difficulty?: string;
  /** Zero-based position in the track's learning path. */
  order?: number;
}

/** "hello-world" becomes "Hello World". */
export function slugToName(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}
