import * as vscode from 'vscode';
import * as fs from 'fs';
import { Exercise } from '../models';
import { InstructionsPanel } from '../webview/instructionsPanel';
import { inspectSolutionFiles } from '../workspace/solutionFiles';
import { errorMessage, Workbench } from '../workbench';
import { buildExerciseFromPath, withSyncedStatus } from './exerciseLocator';

/**
 * Runs `exercism download` behind a cancellable notification.
 * Returns the download path, or undefined after reporting a failure or cancel.
 */
export async function downloadWithProgress(
  workbench: Workbench,
  track: string,
  slug: string,
): Promise<string | undefined> {
  let downloadPath: string | undefined;
  let downloadError = '';
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Downloading ${track}/${slug}...`,
      cancellable: true,
    },
    async (_progress, token) => {
      try {
        downloadPath = await workbench.cli.download(track, slug, token);
        workbench.clearCache();
        workbench.treeProvider.refresh();
      } catch (error) {
        if (!token.isCancellationRequested) { downloadError = errorMessage(error); }
      }
    },
  );

  // The progress notification must finish before showing another prompt.
  if (downloadError) {
    vscode.window.showErrorMessage(`Could not download ${slug}: ${downloadError}`);
  }
  return downloadPath;
}

/** Offers to repair a download with missing files. Returns undefined if the exercise is unusable. */
export async function ensureCompleteDownload(workbench: Workbench, exercise: Exercise): Promise<Exercise | undefined> {
  let currentExercise = exercise;
  let inspection = inspectSolutionFiles(currentExercise.path);

  if (inspection.isIncomplete) {
    const action = await vscode.window.showWarningMessage(
      `${exercise.slug} is missing files: ${inspection.missing.join(', ')}`,
      'Repair Download',
    );
    if (action !== 'Repair Download') { return undefined; }

    // --force overwrites every file, so keep the learner's existing solution code.
    const savedSolutions = inspection.files.map(file => ({ file, content: fs.readFileSync(file) }));
    let repairedPath = '';
    let repairError = '';
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Repairing ${exercise.track}/${exercise.slug}...`,
        cancellable: true,
      },
      async (_progress, token) => {
        try {
          repairedPath = await workbench.cli.download(exercise.track, exercise.slug, token, true);
        } catch (error) {
          if (!token.isCancellationRequested) { repairError = errorMessage(error); }
        } finally {
          for (const { file, content } of savedSolutions) { fs.writeFileSync(file, content); }
        }
      },
    );

    if (repairError) {
      vscode.window.showErrorMessage(`Could not repair ${exercise.slug}: ${repairError}`);
      return undefined;
    }
    if (!repairedPath) { return undefined; }

    currentExercise = buildExerciseFromPath(repairedPath, exercise.track, exercise.slug);
    inspection = inspectSolutionFiles(repairedPath);
    workbench.clearCache();
    workbench.treeProvider.refresh();
  }

  if (inspection.files.length === 0) {
    vscode.window.showWarningMessage(`No solution file was found for ${exercise.slug}.`);
    return undefined;
  }
  return currentExercise;
}

/** Opens the solution file and the instructions panel side by side. */
export async function openExerciseWorkspace(workbench: Workbench, exercise: Exercise): Promise<void> {
  const repaired = await ensureCompleteDownload(workbench, exercise);
  if (!repaired) { return; }
  const currentExercise = withSyncedStatus(repaired, workbench.webProgress);

  const readerPosition = vscode.workspace.getConfiguration('exercismWorkbench').get<string>('readerPosition', 'left');
  const editorColumn = readerPosition === 'left' ? vscode.ViewColumn.Two : vscode.ViewColumn.One;
  const mainFile = inspectSolutionFiles(currentExercise.path).files[0];
  workbench.log(`Opening solution file: ${mainFile}`);
  const doc = await vscode.workspace.openTextDocument(mainFile);
  await vscode.window.showTextDocument(doc, editorColumn);
  InstructionsPanel.show(currentExercise, workbench.context.extensionUri);
}
