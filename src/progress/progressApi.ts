import {
  WebExercise,
  WebProgressSnapshot,
  WebSolution,
  WebTrack,
} from './webProgress';

export const EXERCISM_PROGRESS_API = 'https://api.exercism.org/v2';

export type JsonFetcher = (url: string) => Promise<unknown>;

export async function fetchProgressSnapshot(fetchJson: JsonFetcher): Promise<WebProgressSnapshot> {
  const tracksPayload = asRecord(await fetchJson(`${EXERCISM_PROGRESS_API}/tracks?status=joined`), 'tracks response');
  const tracks = readArray(tracksPayload, 'tracks', isWebTrack).filter(track => track.is_joined);
  if (tracks.length === 0) {
    throw new Error('No joined Exercism tracks were found. Join a track on exercism.org first.');
  }

  const exercises: Record<string, WebExercise[]> = {};
  const solutionsById = new Map<string, WebSolution>();

  for (const track of tracks) {
    const slug = encodeURIComponent(track.slug);
    const exercisePayload = asRecord(
      await fetchJson(`${EXERCISM_PROGRESS_API}/tracks/${slug}/exercises`),
      `${track.slug} exercises response`,
    );
    exercises[track.slug] = readArray(exercisePayload, 'exercises', isWebExercise);

    let page = 1;
    let totalPages = 1;
    do {
      const solutionPayload = asRecord(
        await fetchJson(`${EXERCISM_PROGRESS_API}/solutions?track_slug=${slug}&per_page=100&page=${page}`),
        `${track.slug} solutions response`,
      );
      for (const solution of readArray(solutionPayload, 'results', isWebSolution)) {
        solutionsById.set(solution.uuid, solution);
      }
      const meta = asOptionalRecord(solutionPayload.meta);
      totalPages = readPositiveInteger(meta?.total_pages, 1);
      if (totalPages > 1_000) {
        throw new Error(`Refusing an unexpected ${totalPages}-page solutions response.`);
      }
      page += 1;
    } while (page <= totalPages);
  }

  return {
    format: 'exercism-vscode-progress',
    version: 1,
    exportedAt: new Date().toISOString(),
    tracks,
    exercises,
    solutions: [...solutionsById.values()],
  };
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label}: expected a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function asOptionalRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readArray<T>(
  payload: Record<string, unknown>,
  key: string,
  validate: (value: unknown) => value is T,
): T[] {
  const value = payload[key];
  if (!Array.isArray(value) || !value.every(validate)) {
    throw new Error(`Invalid Exercism response: '${key}' is missing or malformed.`);
  }
  return value;
}

function readPositiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

function isWebTrack(value: unknown): value is WebTrack {
  const item = asOptionalRecord(value);
  return !!item
    && typeof item.slug === 'string'
    && typeof item.title === 'string'
    && typeof item.is_joined === 'boolean'
    && typeof item.num_exercises === 'number'
    && typeof item.num_completed_exercises === 'number';
}

function isWebExercise(value: unknown): value is WebExercise {
  const item = asOptionalRecord(value);
  return !!item
    && typeof item.slug === 'string'
    && typeof item.title === 'string'
    && typeof item.is_unlocked === 'boolean'
    && typeof item.is_recommended === 'boolean';
}

function isWebSolution(value: unknown): value is WebSolution {
  const item = asOptionalRecord(value);
  const exercise = asOptionalRecord(item?.exercise);
  const track = asOptionalRecord(item?.track);
  return !!item
    && typeof item.uuid === 'string'
    && typeof item.status === 'string'
    && typeof exercise?.slug === 'string'
    && typeof track?.slug === 'string';
}
