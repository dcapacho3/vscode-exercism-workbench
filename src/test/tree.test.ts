import { describe, expect, it } from 'vitest';
import { Exercise, ExerciseStatus, Track } from '../models';
import { buildTrackExercises, CatalogExercise } from '../views/trackExercises';
import { orderExercises, orderTracks } from '../views/treeOrder';
import { ScannedExercise } from '../workspace/workspaceScanner';

const track = (name: string, lastActivity?: number): Track =>
  ({ slug: name.toLowerCase(), name, path: '', exercises: [], lastActivity });

const exercise = (slug: string, difficulty: string): Exercise => ({
  slug, name: slug, track: 'python', path: '', status: ExerciseStatus.Available,
  hasReadme: false, hasHints: false, hasHelp: false, difficulty,
});

const entry = (slug: string, extra: Partial<CatalogExercise> = {}): CatalogExercise =>
  ({ slug, title: slug.toUpperCase(), difficulty: 'easy', isUnlocked: true, isRecommended: false, ...extra });

const scanned = (slug: string): ScannedExercise =>
  ({ slug, track: 'python', path: `/ws/python/${slug}`, hasReadme: true, hasHints: false, isIncomplete: false, lastModified: 0 });

describe('orderTracks', () => {
  it('puts the most recently active track first and the rest by name', () => {
    const ordered = orderTracks([track('ABAP'), track('Rust', 100), track('Go'), track('Python', 500)]);
    expect(ordered.map(t => t.name)).toEqual(['Python', 'Rust', 'ABAP', 'Go']);
  });
});

describe('orderExercises', () => {
  const list = [exercise('a', 'hard'), exercise('b', 'easy'), exercise('c', 'medium'), exercise('d', 'easy')];

  it('keeps learning-path order by default and reverses it on request', () => {
    expect(orderExercises(list, 'path').map(e => e.slug)).toEqual(['a', 'b', 'c', 'd']);
    expect(orderExercises(list, 'reverse').map(e => e.slug)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('sorts by difficulty without reordering exercises of equal difficulty', () => {
    expect(orderExercises(list, 'easy-first').map(e => e.slug)).toEqual(['b', 'd', 'c', 'a']);
    expect(orderExercises(list, 'hard-first').map(e => e.slug)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('does not change the list it was given', () => {
    orderExercises(list, 'reverse');
    expect(list.map(e => e.slug)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('buildTrackExercises', () => {
  const noHelp = () => false;

  it('follows the catalog and marks downloaded exercises and solution status', () => {
    const result = buildTrackExercises(
      'python',
      [entry('hello-world'), entry('bob', { isRecommended: true }), entry('leap', { isUnlocked: false })],
      [scanned('hello-world')],
      new Map([['hello-world', 'completed']]),
      noHelp,
    );
    expect(result.map(e => [e.slug, e.status, e.isDownloaded, e.order])).toEqual([
      ['hello-world', ExerciseStatus.Completed, true, 0],
      ['bob', ExerciseStatus.Available, false, 1],
      ['leap', ExerciseStatus.Locked, false, 2],
    ]);
    expect(result[0].path).toBe('/ws/python/hello-world');
    expect(result[1].isRecommended).toBe(true);
  });

  it('falls back to downloaded exercises when there is no catalog', () => {
    const result = buildTrackExercises('python', [], [scanned('two-fer')], new Map(), () => true);
    expect(result).toMatchObject([{ slug: 'two-fer', name: 'Two Fer', isDownloaded: true, hasHelp: true }]);
  });
});
