import { describe, expect, it } from 'vitest';
import { Exercise, ExerciseStatus, slugToName } from '../models/exercise';
import { withSyncedStatus } from '../exercises/exerciseLocator';
import { WebProgressSnapshot } from '../progress/webProgress';

describe('slugToName', () => {
  it('capitalizes each word of a slug', () => {
    expect(slugToName('hello-world')).toBe('Hello World');
    expect(slugToName('guidos-gorgeous-lasagna')).toBe('Guidos Gorgeous Lasagna');
  });

  it('keeps digits and single words intact', () => {
    expect(slugToName('leap')).toBe('Leap');
    expect(slugToName('99-bottles')).toBe('99 Bottles');
  });

  it('returns an empty name for an empty slug', () => {
    expect(slugToName('')).toBe('');
  });
});

describe('withSyncedStatus', () => {
  const opened: Exercise = {
    slug: 'card-games', name: 'Card Games', track: 'python', path: '/ws/python/card-games',
    status: ExerciseStatus.Downloaded, hasHints: true, hasHelp: true, isDownloaded: true,
  };
  const progress = {
    solutions: [{ status: 'completed', track: { slug: 'python' }, exercise: { slug: 'card-games' } }],
  } as unknown as WebProgressSnapshot;

  it('takes the status from synced progress for an exercise opened from its folder', () => {
    expect(withSyncedStatus(opened, progress).status).toBe(ExerciseStatus.Completed);
  });

  it('keeps a status the tree already resolved, and works without progress', () => {
    const fromTree = { ...opened, status: ExerciseStatus.Iterated };
    expect(withSyncedStatus(fromTree, progress).status).toBe(ExerciseStatus.Iterated);
    expect(withSyncedStatus(opened, undefined).status).toBe(ExerciseStatus.Downloaded);
  });
});
