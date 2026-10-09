import * as vscode from 'vscode';
import { Exercise, ExerciseStatus } from '../models';

export class ExerciseItem extends vscode.TreeItem {
  constructor(public readonly exercise: Exercise) {
    super(exercise.name, vscode.TreeItemCollapsibleState.None);
    const isCompleted = exercise.status === ExerciseStatus.Completed
      || exercise.status === ExerciseStatus.Published;
    this.contextValue = exercise.isDownloaded
      ? (isCompleted ? 'exerciseCompleted' : exercise.status === ExerciseStatus.Iterated ? 'exerciseIterated' : 'exercise')
      : 'exerciseRemote';

    // Keep descriptions readable; the icon carries the primary status signal.
    const parts: string[] = [];
    if (exercise.order !== undefined) { parts.push(`#${exercise.order + 1}`); }
    parts.push(exercise.slug);
    if (exercise.difficulty) { parts.push(`[${exercise.difficulty}]`); }
    if (exercise.isRecommended) { parts.push('recommended'); }
    if (exercise.isIncomplete) { parts.push('repair needed'); }
    if (exercise.status === ExerciseStatus.Published) { parts.push('published'); }
    else if (exercise.status === ExerciseStatus.Completed) { parts.push('completed'); }
    else if (exercise.status === ExerciseStatus.Iterated) { parts.push('submitted'); }
    else if (exercise.status === ExerciseStatus.Started || exercise.status === ExerciseStatus.Downloaded) {
      parts.push('in progress');
    }
    this.description = parts.join(' ');

    // Recommended exercises get star icon regardless of status
    if (exercise.isIncomplete) {
      this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'));
      this.tooltip = 'This local download is incomplete. Open it to repair the missing files.';
    } else if (exercise.isRecommended) {
      this.iconPath = new vscode.ThemeIcon('star-full', new vscode.ThemeColor('charts.yellow'));
    } else {
      switch (exercise.status) {
        case ExerciseStatus.Published:
        case ExerciseStatus.Completed:
          this.iconPath = new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('testing.iconPassed'));
          break;
        case ExerciseStatus.Iterated:
        case ExerciseStatus.Started:
        case ExerciseStatus.Downloaded:
          this.iconPath = new vscode.ThemeIcon('edit', new vscode.ThemeColor('charts.blue'));
          break;
        case ExerciseStatus.Available:
          this.iconPath = new vscode.ThemeIcon('circle-large-outline');
          break;
        case ExerciseStatus.Locked:
          this.iconPath = new vscode.ThemeIcon('lock');
          break;
        default:
          this.iconPath = new vscode.ThemeIcon('circle-large-outline');
          break;
      }
    }

    if (exercise.isDownloaded) {
      // Downloaded: click opens instructions + solution file
      this.command = {
        command: 'exercismWorkbench.openInstructions',
        title: 'Open Instructions',
        arguments: [exercise],
      };
    } else {
      // Not downloaded: click triggers download
      this.command = {
        command: 'exercismWorkbench.downloadExercise',
        title: 'Download Exercise',
        arguments: [exercise],
      };
    }
  }
}
