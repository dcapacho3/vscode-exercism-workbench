import * as vscode from 'vscode';
import { ExerciseStatus, Track } from '../models';

function isFinished(status: ExerciseStatus): boolean {
  return status === ExerciseStatus.Completed || status === ExerciseStatus.Published;
}

export class TrackItem extends vscode.TreeItem {
  /** `generation` changes when Expand/Collapse All runs, so VS Code applies the new state instead of its remembered one. */
  constructor(readonly track: Track, collapsed: boolean, generation: number) {
    const total = track.totalExercises ?? track.exercises.length;
    const done = track.completedExercises ?? track.exercises.filter(e => isFinished(e.status)).length;
    super(
      track.name,
      collapsed ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded,
    );
    this.id = `track:${track.slug}:${generation}`;
    this.contextValue = 'track';
    this.description = total > 0 ? `${done}/${total}` : undefined;
    this.iconPath = new vscode.ThemeIcon('symbol-folder');

    const lines = [`${done} of ${total} exercises completed`];
    if (track.learnedConcepts !== undefined && track.totalConcepts !== undefined) {
      lines.push(`${track.learnedConcepts} of ${track.totalConcepts} concepts learned`);
    }
    if (track.lastActivity) {
      lines.push(`Last active ${new Date(track.lastActivity).toLocaleString()}`);
    }
    this.tooltip = lines.join('\n');
  }
}
