import { CatalogExercise } from '../api/exercismApi';
import { Exercise, slugToName } from '../models';
import { resolveExerciseStatus } from '../progress/exerciseStatus';
import { ScannedExercise } from '../workspace/workspaceScanner';

/**
 * Builds a track's exercises in learning-path order, marking the ones on disk and
 * their solution status. Without a catalog (offline), only downloaded exercises appear.
 */
export function buildTrackExercises(
  track: string,
  catalog: CatalogExercise[],
  local: ScannedExercise[],
  solutionStatus: Map<string, string>,
  hasHelp: (exercisePath: string) => boolean,
): Exercise[] {
  const onDisk = new Map(local.map(exercise => [exercise.slug, exercise]));
  const fromDisk = (scanned: ScannedExercise | undefined) => ({
    path: scanned?.path ?? '',
    hasHints: scanned?.hasHints ?? false,
    hasHelp: scanned ? hasHelp(scanned.path) : false,
    isDownloaded: !!scanned,
    isIncomplete: scanned?.isIncomplete ?? false,
  });

  if (catalog.length === 0) {
    return local.map(scanned => ({
      slug: scanned.slug,
      name: slugToName(scanned.slug),
      track,
      status: resolveExerciseStatus(solutionStatus.get(scanned.slug), true, true),
      isRecommended: false,
      ...fromDisk(scanned),
    }));
  }

  return catalog.map((entry, index) => {
    const scanned = onDisk.get(entry.slug);
    return {
      slug: entry.slug,
      name: entry.title || slugToName(entry.slug),
      track,
      status: resolveExerciseStatus(solutionStatus.get(entry.slug), !!scanned, entry.isUnlocked),
      isRecommended: entry.isRecommended,
      difficulty: entry.difficulty,
      order: index,
      ...fromDisk(scanned),
    };
  });
}
