import * as vscode from 'vscode';
import * as path from 'path';
import { SubmitResult } from '../cli/exercismCli';
import { explainSubmitFailure } from '../cli/submitDiagnostics';
import { Exercise } from '../models';
import { ExerciseItem } from '../views/exerciseItem';
import { ExercisePreviewPanel } from '../webview/exercisePreview';
import { inspectSolutionFiles } from '../workspace/solutionFiles';
import { readExerciseMetadata, resolveExercise } from '../exercises/exerciseLocator';
import { errorMessage, showCliNotInstalledError, Workbench } from '../workbench';

export function registerSubmitCommands(workbench: Workbench): void {
  workbench.register('exercismWorkbench.submit', (arg?: Exercise | ExerciseItem) => submit(workbench, arg));
  workbench.register('exercismWorkbench.submitIteration', (arg?: Exercise | ExerciseItem) => submit(workbench, arg));
  workbench.register('exercismWorkbench.markComplete', (arg?: Exercise | ExerciseItem) => markComplete(workbench, arg));
}

async function submit(workbench: Workbench, arg?: Exercise | ExerciseItem): Promise<void> {
  const { cli, output } = workbench;
  if (!(await cli.checkInstalled()).installed) {
    showCliNotInstalledError();
    return;
  }
  const exercise = resolveExercise(arg);
  if (!exercise) { return; }

  const solutionFiles = inspectSolutionFiles(exercise.path).files;
  if (solutionFiles.length === 0) {
    vscode.window.showWarningMessage(`${exercise.slug} has no solution files to submit.`);
    return;
  }
  if (!(await confirmDespiteLintProblems(workbench, exercise, solutionFiles))) { return; }

  let result: SubmitResult | undefined;
  let cancelled = false;
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Submitting ${exercise.slug}...`, cancellable: true },
    async (_progress, token) => {
      result = await cli.submit(solutionFiles, token);
      cancelled = token.isCancellationRequested;
      output.appendLine(result.output);
    },
  );

  if (cancelled || !result) { return; }
  if (!result.success) {
    const failure = explainSubmitFailure(result.output);
    if (failure.kind === 'other') {
      const action = await vscode.window.showErrorMessage(failure.message, 'Show Output');
      if (action) { output.show(true); }
    } else {
      vscode.window.showWarningMessage(failure.message);
    }
    return;
  }

  ExercisePreviewPanel.markSubmitted(exercise);
  await workbench.syncAfterChange('Post-submit');
  const url = result.url;
  const buttons = url ? ['Open in Browser', 'Mark as Complete'] : ['Mark as Complete'];
  const action = await vscode.window.showInformationMessage(`Submitted ${exercise.slug}.`, ...buttons);
  if (action === 'Open in Browser' && url) {
    workbench.syncOnReturn();
    vscode.env.openExternal(vscode.Uri.parse(url));
  } else if (action === 'Mark as Complete') {
    await markComplete(workbench, exercise);
  }
}

/**
 * Exercism's analyzer flags lint problems, so stop and ask while the editor reports any.
 * shortcut: relies on the linters VS Code already runs; a file no linter has analyzed passes, run our own linter per track if that bites.
 */
async function confirmDespiteLintProblems(workbench: Workbench, exercise: Exercise, files: string[]): Promise<boolean> {
  const problems = files.flatMap(file =>
    vscode.languages.getDiagnostics(vscode.Uri.file(file))
      .filter(d => d.severity <= vscode.DiagnosticSeverity.Warning)
      .map(d => `${path.basename(file)}:${d.range.start.line + 1}: ${d.message}`));
  if (problems.length === 0) { return true; }

  workbench.output.clear();
  workbench.output.appendLine(`Lint problems in ${exercise.slug}:\n`);
  workbench.output.appendLine(problems.join('\n'));
  const action = await vscode.window.showWarningMessage(
    `${exercise.slug} has ${problems.length} lint problem(s). Exercism's analyzer may flag them.`,
    'Show Problems',
    'Submit Anyway',
  );
  if (action === 'Show Problems') {
    await vscode.commands.executeCommand('workbench.actions.view.problems');
  }
  return action === 'Submit Anyway';
}

async function markComplete(workbench: Workbench, arg?: Exercise | ExerciseItem): Promise<void> {
  const exercise = resolveExercise(arg);
  if (!exercise) { return; }
  const { id } = readExerciseMetadata(exercise);
  if (typeof id !== 'string' || !id) {
    vscode.window.showErrorMessage(`Could not find the solution id for ${exercise.slug} in .exercism/metadata.json.`);
    return;
  }

  // Exercism has no way to undo completion, so ask first.
  const confirm = await vscode.window.showWarningMessage(
    `Mark ${exercise.slug} as complete on Exercism? This cannot be undone. You can still submit new iterations.`,
    { modal: true },
    'Mark as Complete',
  );
  if (confirm !== 'Mark as Complete') { return; }

  try {
    const { token } = await workbench.cli.getConfig();
    await workbench.cli.completeSolution(id, token);
  } catch (error) {
    const action = await vscode.window.showErrorMessage(
      `Could not mark ${exercise.slug} as complete: ${errorMessage(error)}`,
      'Open on Exercism',
    );
    if (action === 'Open on Exercism') {
      await vscode.commands.executeCommand('exercismWorkbench.openInBrowser', exercise);
    }
    return;
  }

  ExercisePreviewPanel.markCompleted(exercise);
  await workbench.syncAfterChange('Post-complete');
  vscode.window.showInformationMessage(`${exercise.slug} is complete.`);
}
