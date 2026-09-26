import { describe, expect, it, vi } from 'vitest';
import { EXERCISM_PROGRESS_API, fetchProgressSnapshot } from '../progress/progressApi';

const pythonTrack = {
  slug: 'python',
  title: 'Python',
  is_joined: true,
  num_exercises: 146,
  num_completed_exercises: 9,
  num_concepts: 17,
  num_learnt_concepts: 5,
};

const blackJack = {
  slug: 'black-jack',
  title: 'Black Jack',
  type: 'concept',
  difficulty: 'easy',
  blurb: '',
  is_unlocked: true,
  is_recommended: false,
};

function solution(uuid: string, slug: string) {
  return {
    uuid,
    status: 'completed',
    private_url: `https://exercism.org/tracks/python/exercises/${slug}`,
    num_iterations: 1,
    exercise: { slug, title: slug },
    track: { slug: 'python', title: 'Python' },
  };
}

describe('fetchProgressSnapshot', () => {
  it('loads tracks, exercises, and every page of solutions', async () => {
    const fetchJson = vi.fn(async (url: string): Promise<unknown> => {
      if (url.endsWith('/tracks?status=joined')) { return { tracks: [pythonTrack] }; }
      if (url.endsWith('/tracks/python/exercises')) { return { exercises: [blackJack] }; }
      if (url.endsWith('page=1')) {
        return { results: [solution('one', 'black-jack')], meta: { total_pages: 2 } };
      }
      if (url.endsWith('page=2')) {
        return { results: [solution('two', 'grains')], meta: { total_pages: 2 } };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const snapshot = await fetchProgressSnapshot(fetchJson);

    expect(snapshot.tracks).toEqual([pythonTrack]);
    expect(snapshot.exercises.python).toEqual([blackJack]);
    expect(snapshot.solutions.map(item => item.exercise.slug)).toEqual(['black-jack', 'grains']);
    expect(fetchJson).toHaveBeenCalledWith(
      `${EXERCISM_PROGRESS_API}/solutions?track_slug=python&per_page=100&page=2`
    );
  });

  it('rejects malformed API responses instead of silently clearing progress', async () => {
    await expect(fetchProgressSnapshot(async () => ({ tracks: 'not-an-array' })))
      .rejects.toThrow(/missing or malformed/i);
  });

  it('rejects a response with no joined tracks', async () => {
    await expect(fetchProgressSnapshot(async () => ({ tracks: [] })))
      .rejects.toThrow(/no joined/i);
  });

  it('deduplicates a solution repeated across pages', async () => {
    const repeated = solution('same-id', 'black-jack');
    const fetchJson = async (url: string): Promise<unknown> => {
      if (url.endsWith('/tracks?status=joined')) { return { tracks: [pythonTrack] }; }
      if (url.endsWith('/tracks/python/exercises')) { return { exercises: [blackJack] }; }
      return { results: [repeated], meta: { total_pages: url.endsWith('page=1') ? 2 : 2 } };
    };
    const snapshot = await fetchProgressSnapshot(fetchJson);
    expect(snapshot.solutions).toHaveLength(1);
  });
});
