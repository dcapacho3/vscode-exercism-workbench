import { fetchProgressSnapshot } from '../progress/progressApi';
import { WebProgressSnapshot } from '../progress/webProgress';
import { requestJson } from './http';

const API = 'https://api.exercism.org/v2';
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface CatalogTrack {
  slug: string;
  title: string;
  numExercises: number;
}

/** One entry in a track's exercise list. */
export interface CatalogExercise {
  slug: string;
  title: string;
  difficulty: string;
  isUnlocked: boolean;
  isRecommended: boolean;
}

/** Reads the exercise list from the v2 API. */
export function catalogFromApi(json: any): CatalogExercise[] {
  return (Array.isArray(json?.exercises) ? json.exercises : []).map((e: any) => ({
    slug: e.slug,
    title: e.title || e.slug,
    difficulty: String(e.difficulty || ''),
    isUnlocked: e.is_unlocked ?? false,
    isRecommended: e.is_recommended ?? false,
  }));
}

/**
 * Reads the exercise list from a track repository's config.json, used when the API
 * sits behind a browser-only Cloudflare check. Concept exercises come first, as on the site.
 */
export function catalogFromTrackConfig(config: any): CatalogExercise[] {
  const list = (kind: string) => (Array.isArray(config?.exercises?.[kind]) ? config.exercises[kind] : [])
    .map((e: any) => ({ ...e, kind }));
  return [...list('concept'), ...list('practice')]
    .filter((e: any) => e.status !== 'deprecated' && e.status !== 'wip')
    .map((e: any) => ({
      slug: e.slug,
      title: e.name || e.slug,
      difficulty: e.difficulty ? `difficulty ${e.difficulty}` : e.kind,
      isUnlocked: true,
      isRecommended: false,
    }));
}

/** Exercism's web API, for what the CLI cannot do: listings, progress and completing solutions. */
export class ExercismApi {
  private cache = new Map<string, { value: unknown; at: number }>();

  constructor(
    /** The CLI's API token, or '' when the CLI is not configured. */
    private readonly token: () => Promise<string>,
    private readonly timeoutMs: () => number,
  ) {}

  clearCache(): void {
    this.cache.clear();
  }

  private async cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) { return hit.value as T; }
    const value = await load();
    this.cache.set(key, { value, at: Date.now() });
    return value;
  }

  private get(url: string, token?: string): Promise<any> {
    return requestJson(url, { token, timeoutMs: this.timeoutMs() });
  }

  private async requireToken(): Promise<string> {
    const token = await this.token();
    if (!token) { throw new Error('The Exercism CLI has no API token. Run Configure first.'); }
    return token;
  }

  /** Every Exercism track, for the download picker. */
  tracks(): Promise<CatalogTrack[]> {
    return this.cached('tracks', async () => {
      const json = await this.get(`${API}/tracks`);
      const tracks = (Array.isArray(json?.tracks) ? json.tracks : [])
        .map((t: any) => ({ slug: t.slug, title: t.title, numExercises: t.num_exercises || 0 }));
      if (tracks.length === 0) { throw new Error('Exercism returned no tracks.'); }
      return tracks;
    });
  }

  /** A track's exercises in learning-path order. Signed-in requests include unlock and recommendation state. */
  async exercises(track: string): Promise<CatalogExercise[]> {
    const token = await this.token();
    return this.cached(`exercises:${track}:${token ? 'user' : 'anonymous'}`, async () => {
      try {
        const exercises = catalogFromApi(await this.get(`${API}/tracks/${encodeURIComponent(track)}/exercises`, token || undefined));
        if (exercises.length > 0) { return exercises; }
      } catch { /* fall back to the public track config below */ }
      const exercises = catalogFromTrackConfig(
        await this.get(`https://raw.githubusercontent.com/exercism/${encodeURIComponent(track)}/main/config.json`),
      );
      if (exercises.length === 0) { throw new Error(`No exercises found for the ${track} track.`); }
      return exercises;
    });
  }

  /** Solution status by exercise slug, e.g. 'iterated' or 'completed'. */
  async solutionStatuses(track: string): Promise<Map<string, string>> {
    const token = await this.requireToken();
    return this.cached(`solutions:${track}`, async () => {
      const statuses = new Map<string, string>();
      for (let page = 1, pages = 1; page <= pages; page++) {
        const json = await this.get(
          `${API}/solutions?track_slug=${encodeURIComponent(track)}&per_page=100&page=${page}`,
          token,
        );
        for (const solution of Array.isArray(json?.results) ? json.results : []) {
          const slug = solution.exercise?.slug ?? solution.private_url?.match?.(/\/exercises\/([^/]+)/)?.[1];
          if (typeof slug === 'string' && typeof solution.status === 'string') { statuses.set(slug, solution.status); }
        }
        pages = Number(json?.meta?.total_pages ?? 1);
        // Guards against a bad reply looping forever.
        if (!Number.isInteger(pages) || pages < 1 || pages > 1000) {
          throw new Error('Exercism returned invalid page information for solutions.');
        }
      }
      return statuses;
    });
  }

  async progress(): Promise<WebProgressSnapshot> {
    const token = await this.requireToken();
    return fetchProgressSnapshot(url => this.get(url, token));
  }

  /** The endpoint behind the website's "Mark as complete" button; the CLI has no equivalent. */
  async complete(solutionId: string): Promise<void> {
    const token = await this.requireToken();
    await requestJson(`${API}/solutions/${encodeURIComponent(solutionId)}/complete`, {
      method: 'PATCH',
      token,
      timeoutMs: this.timeoutMs(),
    });
  }
}
