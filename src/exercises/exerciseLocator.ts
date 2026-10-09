import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Exercise, ExerciseStatus, slugToName } from '../models';
import { resolveExerciseStatus } from '../progress/exerciseStatus';
import { WebProgressSnapshot } from '../progress/webProgress';
import { ExerciseItem } from '../views/exerciseItem';
import { inspectSolutionFiles } from '../workspace/solutionFiles';

export function buildExerciseFromPath(exercisePath: string, track: string, slug: string): Exercise {
  return {
    slug,
    name: slugToName(slug),
    track,
    path: exercisePath,
    status: ExerciseStatus.Downloaded,
    hasHints: fs.existsSync(path.join(exercisePath, 'HINTS.md')),
    hasHelp: fs.existsSync(path.join(exercisePath, 'HELP.md')),
    isDownloaded: true,
    isIncomplete: inspectSolutionFiles(exercisePath).isIncomplete,
  };
}

/**
 * An exercise built from its folder alone has no status yet. Fill it in from the
 * synced progress, so opening from the editor shows the same status as the tree.
 */
export function withSyncedStatus(exercise: Exercise, progress: WebProgressSnapshot | undefined): Exercise {
  if (exercise.status !== ExerciseStatus.Downloaded) { return exercise; }
  const solution = progress?.solutions.find(s => s.track.slug === exercise.track && s.exercise.slug === exercise.slug);
  return solution ? { ...exercise, status: resolveExerciseStatus(solution.status, true, true) } : exercise;
}

/** Finds the exercise that contains the file in the active editor. */
export function detectExercise(): Exercise | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) { return undefined; }

  // Walk up from the file to the folder that holds .exercism/metadata.json.
  let dir = path.dirname(editor.document.uri.fsPath);
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.exercism', 'metadata.json'))) {
      return buildExerciseFromPath(dir, path.basename(path.dirname(dir)), path.basename(dir));
    }
    dir = path.dirname(dir);
  }
  return undefined;
}

/**
 * Tree menus pass an ExerciseItem, the panel passes an Exercise, and the
 * command palette passes nothing, so fall back to the active editor.
 */
export function resolveExercise(arg?: Exercise | ExerciseItem): Exercise | undefined {
  const exercise = (arg instanceof ExerciseItem ? arg.exercise : arg) ?? detectExercise();
  if (!exercise) {
    vscode.window.showWarningMessage('Open a file from an exercise first.');
  }
  return exercise;
}

export function readExerciseMetadata(exercise: Exercise): { id?: unknown; url?: unknown } {
  try {
    return JSON.parse(fs.readFileSync(path.join(exercise.path, '.exercism', 'metadata.json'), 'utf8'));
  } catch {
    return {};
  }
}
