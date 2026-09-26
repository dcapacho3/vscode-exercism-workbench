export const WEB_PROGRESS_STORAGE_KEY = 'exercismWorkbench.webProgress';

export interface WebTrack {
  slug: string;
  title: string;
  num_exercises: number;
  num_completed_exercises: number;
  num_concepts: number;
  num_learnt_concepts: number;
  is_joined: boolean;
  last_touched_at?: string;
}

export interface WebExercise {
  slug: string;
  type: string;
  title: string;
  difficulty: string;
  blurb: string;
  is_unlocked: boolean;
  is_recommended: boolean;
  icon_url?: string;
}

export interface WebSolution {
  uuid: string;
  status: string;
  private_url: string;
  public_url?: string;
  num_iterations: number;
  completed_at?: string | null;
  published_at?: string | null;
  exercise: { slug: string; title: string };
  track: { slug: string; title: string };
}

export interface WebProgressSnapshot {
  format: 'exercism-vscode-progress';
  version: 1;
  exportedAt: string;
  tracks: WebTrack[];
  exercises: Record<string, WebExercise[]>;
  solutions: WebSolution[];
}

export type WebProgressPayloadKind = 'snapshot' | 'tracks' | 'exercises' | 'solutions';

export interface WebProgressMergeResult {
  progress: WebProgressSnapshot;
  kind: WebProgressPayloadKind;
  imported: number;
  totalPages?: number;
}

export function emptyWebProgress(): WebProgressSnapshot {
  return {
    format: 'exercism-vscode-progress',
    version: 1,
    exportedAt: new Date().toISOString(),
    tracks: [],
    exercises: {},
    solutions: [],
  };
}

export function parseWebProgress(value: unknown): WebProgressSnapshot {
  if (!value || typeof value !== 'object') {
    throw new Error('The selected file does not contain a JSON object.');
  }
  const candidate = value as Partial<WebProgressSnapshot>;
  if (candidate.format !== 'exercism-vscode-progress' || candidate.version !== 1) {
    throw new Error('This is not an Exercism VS Code progress export.');
  }
  if (!Array.isArray(candidate.tracks) || !candidate.exercises || !Array.isArray(candidate.solutions)) {
    throw new Error('The progress export is missing tracks, exercises, or solutions.');
  }
  return candidate as WebProgressSnapshot;
}

/**
 * Merge an ordinary response copied from exercism.org into our saved snapshot.
 * This deliberately accepts only the three read-only response shapes used by
 * the guided sync, plus the original combined export format.
 */
export function mergeWebProgressPayload(
  current: WebProgressSnapshot | undefined,
  value: unknown,
  trackSlug?: string,
): WebProgressMergeResult {
  if (!value || typeof value !== 'object') {
    throw new Error('The clipboard does not contain an Exercism JSON object.');
  }

  const payload = value as Record<string, unknown>;
  if (payload.format === 'exercism-vscode-progress') {
    const progress = parseWebProgress(value);
    return {
      progress: { ...progress, exportedAt: new Date().toISOString() },
      kind: 'snapshot',
      imported: progress.tracks.length + progress.solutions.length,
    };
  }

  const progress = cloneProgress(current);

  if (Array.isArray(payload.tracks)) {
    const tracks = payload.tracks.filter(isWebTrack) as WebTrack[];
    if (tracks.length === 0 && payload.tracks.length > 0) {
      throw new Error('The tracks response has an unexpected format.');
    }
    progress.tracks = mergeByKey(progress.tracks, tracks, item => item.slug);
    progress.exportedAt = new Date().toISOString();
    return { progress, kind: 'tracks', imported: tracks.length };
  }

  if (Array.isArray(payload.exercises)) {
    if (!trackSlug) {
      throw new Error('Choose a track before importing an exercises response.');
    }
    const exercises = payload.exercises.filter(isWebExercise) as WebExercise[];
    if (exercises.length === 0 && payload.exercises.length > 0) {
      throw new Error('The exercises response has an unexpected format.');
    }
    progress.exercises[trackSlug] = exercises;

    // Exercism can optionally sideload solutions with this response.
    if (Array.isArray(payload.solutions)) {
      const solutions = payload.solutions.filter(isWebSolution) as WebSolution[];
      progress.solutions = mergeByKey(progress.solutions, solutions, item => item.uuid);
    }
    progress.exportedAt = new Date().toISOString();
    return { progress, kind: 'exercises', imported: exercises.length };
  }

  if (Array.isArray(payload.results)) {
    const solutions = payload.results.filter(isWebSolution) as WebSolution[];
    if (solutions.length === 0 && payload.results.length > 0) {
      throw new Error('The solutions response has an unexpected format.');
    }
    progress.solutions = mergeByKey(progress.solutions, solutions, item => item.uuid);
    progress.exportedAt = new Date().toISOString();
    const meta = payload.meta as { total_pages?: unknown } | undefined;
    const totalPages = typeof meta?.total_pages === 'number' ? meta.total_pages : undefined;
    return { progress, kind: 'solutions', imported: solutions.length, totalPages };
  }

  throw new Error('Expected an Exercism tracks, exercises, solutions, or progress-export response.');
}

function cloneProgress(current: WebProgressSnapshot | undefined): WebProgressSnapshot {
  if (!current) { return emptyWebProgress(); }
  return {
    ...current,
    tracks: [...current.tracks],
    exercises: Object.fromEntries(
      Object.entries(current.exercises).map(([slug, exercises]) => [slug, [...exercises]])
    ),
    solutions: [...current.solutions],
  };
}

function mergeByKey<T>(existing: T[], incoming: T[], key: (item: T) => string): T[] {
  const merged = new Map(existing.map(item => [key(item), item]));
  for (const item of incoming) { merged.set(key(item), item); }
  return [...merged.values()];
}

function isWebTrack(value: unknown): value is WebTrack {
  const item = value as Partial<WebTrack> | undefined;
  return !!item && typeof item.slug === 'string' && typeof item.title === 'string';
}

function isWebExercise(value: unknown): value is WebExercise {
  const item = value as Partial<WebExercise> | undefined;
  return !!item && typeof item.slug === 'string' && typeof item.title === 'string';
}

function isWebSolution(value: unknown): value is WebSolution {
  const item = value as Partial<WebSolution> | undefined;
  return !!item && typeof item.uuid === 'string' && typeof item.status === 'string'
    && typeof item.exercise?.slug === 'string' && typeof item.track?.slug === 'string';
}
