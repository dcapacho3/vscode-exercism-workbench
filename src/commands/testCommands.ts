import * as vscode from 'vscode';
import * as path from 'path';
import { TestResult } from '../cli/exercismCli';
import { Exercise } from '../models';
import { ExerciseItem } from '../views/exerciseItem';
import { resolveExercise } from '../exercises/exerciseLocator';
import { ensureCompleteDownload } from '../exercises/exerciseWorkspace';
import { showCliNotInstalledError, Workbench } from '../workbench';

export function registerTestCommands(workbench: Workbench): void {
  workbench.register('exercismWorkbench.test', (arg?: Exercise | ExerciseItem) => runTests(workbench, arg));
}

async function runTests(workbench: Workbench, arg?: Exercise | ExerciseItem): Promise<void> {
  const { cli, output } = workbench;
  workbench.log(`Command: exercismWorkbench.test triggered, arg=${(arg instanceof ExerciseItem ? arg.exercise : arg)?.slug ?? 'none'}`);
  if (!(await cli.checkInstalled()).installed) {
    showCliNotInstalledError();
    return;
  }

  const found = resolveExercise(arg);
  if (!found) { return; }
  const exercise = await ensureCompleteDownload(workbench, found);
  if (!exercise) { return; }

  output.clear();
  output.show(true);
  output.appendLine(`Running tests for ${exercise.track}/${exercise.slug}...\n`);
  let result: TestResult | undefined;
  let cancelled = false;
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Running tests for ${exercise.slug}...`, cancellable: true },
    async (_progress, token) => {
      result = await cli.test(exercise.path, token);
      cancelled = token.isCancellationRequested;
      output.appendLine(result.output);
    },
  );

  if (cancelled || !result) { return; }
  if (result.passed) {
    vscode.window.showInformationMessage(`All tests pass for ${exercise.slug}.`);
    return;
  }

  const diagnostic = result.diagnostic;
  const message = diagnostic
    ? `Tests could not run for ${exercise.slug}. ${diagnostic.message}`
    : `Some tests fail for ${exercise.slug}.`;
  const helpUrl = diagnostic?.helpUrl;
  const helpLabel = diagnostic?.helpLabel;
  const actions = ['Show Output', helpUrl && helpLabel ? helpLabel : 'Track Test Guide'];
  if (exercise.hasHelp) { actions.push('Exercise Help'); }

  const action = await vscode.window.showErrorMessage(message, ...actions);
  if (action === 'Show Output') {
    output.show(true);
  } else if (action === helpLabel && helpUrl) {
    vscode.env.openExternal(vscode.Uri.parse(helpUrl));
  } else if (action === 'Track Test Guide') {
    vscode.env.openExternal(vscode.Uri.parse(
      `https://exercism.org/docs/tracks/${encodeURIComponent(exercise.track)}/tests`,
    ));
  } else if (action === 'Exercise Help') {
    const helpDocument = await vscode.workspace.openTextDocument(path.join(exercise.path, 'HELP.md'));
    await vscode.window.showTextDocument(helpDocument, vscode.ViewColumn.Active);
  }
}
