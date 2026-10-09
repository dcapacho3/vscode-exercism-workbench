import { ExerciseStatus } from '../models/exercise';

export function resolveExerciseStatus(
  solutionStatus: string | undefined,
  isDownloaded: boolean,
  isUnlocked: boolean,
  localFallback: ExerciseStatus = ExerciseStatus.Downloaded,
): ExerciseStatus {
  if (solutionStatus === 'published') { return ExerciseStatus.Published; }
  if (solutionStatus === 'completed') { return ExerciseStatus.Completed; }
  if (solutionStatus === 'iterated') { return ExerciseStatus.Iterated; }
  if (solutionStatus === 'started') {
    return ExerciseStatus.Started;
  }
  if (isDownloaded) {
    return localFallback === ExerciseStatus.Downloaded ? ExerciseStatus.Started : localFallback;
  }
  return isUnlocked ? ExerciseStatus.Available : ExerciseStatus.Locked;
}
