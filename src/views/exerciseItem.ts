import * as vscode from 'vscode';
import { Exercise, ExerciseStatus } from '../models';

const STATUS_TEXT: Partial<Record<ExerciseStatus, string>> = {
  [ExerciseStatus.Published]: 'published',
  [ExerciseStatus.Completed]: 'completed',
  [ExerciseStatus.Iterated]: 'submitted',
  [ExerciseStatus.Started]: 'in progress',
  [ExerciseStatus.Downloaded]: 'in progress',
};

function icon(exercise: Exercise): vscode.ThemeIcon {
  if (exercise.isIncomplete) { return new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground')); }
  if (exercise.isRecommended) { return new vscode.ThemeIcon('star-full', new vscode.ThemeColor('charts.yellow')); }
  switch (exercise.status) {
    case ExerciseStatus.Published:
    case ExerciseStatus.Completed:
      return new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('testing.iconPassed'));
    case ExerciseStatus.Iterated:
    case ExerciseStatus.Started:
    case ExerciseStatus.Downloaded:
      return new vscode.ThemeIcon('edit', new vscode.ThemeColor('charts.blue'));
    case ExerciseStatus.Locked:
      return new vscode.ThemeIcon('lock');
    default:
      return new vscode.ThemeIcon('circle-large-outline');
  }
}

/** package.json menus key off these values. */
function contextValue(exercise: Exercise): string {
  if (!exercise.isDownloaded) { return 'exerciseRemote'; }
  if (exercise.status === ExerciseStatus.Completed || exercise.status === ExerciseStatus.Published) { return 'exerciseCompleted'; }
  if (exercise.status === ExerciseStatus.Iterated) { return 'exerciseIterated'; }
  return 'exercise';
}

export class ExerciseItem extends vscode.TreeItem {
  constructor(readonly exercise: Exercise) {
    super(exercise.name, vscode.TreeItemCollapsibleState.None);
    this.id = `exercise:${exercise.track}/${exercise.slug}`;
    this.contextValue = contextValue(exercise);
    this.iconPath = icon(exercise);
    this.description = [
      exercise.order !== undefined ? `#${exercise.order + 1}` : '',
      exercise.difficulty ?? '',
      STATUS_TEXT[exercise.status] ?? '',
      exercise.isRecommended ? 'recommended' : '',
      exercise.isIncomplete ? 'repair needed' : '',
    ].filter(Boolean).join(' · ');
    if (exercise.isIncomplete) {
      this.tooltip = 'Some files of this download are missing. Open it to repair them.';
    }
    // Downloaded exercises open; the rest download first.
    this.command = exercise.isDownloaded
      ? { command: 'exercismWorkbench.openInstructions', title: 'Open Instructions', arguments: [exercise] }
      : { command: 'exercismWorkbench.downloadExercise', title: 'Download Exercise', arguments: [exercise] };
  }
}
