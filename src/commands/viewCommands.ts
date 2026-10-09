import * as vscode from 'vscode';
import { Exercise } from '../models';
import { ExerciseItem } from '../views/exerciseItem';
import { ExercisePreviewPanel } from '../webview/exercisePreview';
import { readExerciseMetadata, resolveExercise } from '../exercises/exerciseLocator';
import { openExerciseWorkspace } from '../exercises/exerciseWorkspace';
import { Workbench } from '../workbench';

const SORT_LABELS: Record<string, string> = {
  'default': 'Learning Path (official order)',
  'reverse': 'Learning Path (reversed)',
  'easy-first': 'Easy → Hard',
  'hard-first': 'Hard → Easy',
};

export function registerViewCommands(workbench: Workbench): void {
  const { cli, treeProvider } = workbench;

  workbench.register('exercismWorkbench.openInstructions', async (arg?: Exercise | ExerciseItem) => {
    workbench.log(`Command: exercismWorkbench.openInstructions triggered, arg=${JSON.stringify((arg instanceof ExerciseItem ? arg.exercise : arg)?.slug ?? 'none')}`);
    const exercise = resolveExercise(arg);
    if (exercise) { await openExerciseWorkspace(workbench, exercise); }
  });

  workbench.register('exercismWorkbench.openInBrowser', (arg?: Exercise | ExerciseItem) => {
    const exercise = resolveExercise(arg);
    if (!exercise) { return; }
    const { url } = readExerciseMetadata(exercise);
    const target = typeof url === 'string' && url
      ? url
      : `https://exercism.org/tracks/${exercise.track}/exercises/${exercise.slug}`;
    workbench.log(`Opening in browser: ${target}`);
    workbench.syncOnReturn();
    vscode.env.openExternal(vscode.Uri.parse(target));
  });

  workbench.register('exercismWorkbench.toggleLayout', () => toggleLayout(workbench));

  workbench.register('exercismWorkbench.refreshTree', () => {
    cli.clearCache();
    treeProvider.refresh();
  });

  workbench.register('exercismWorkbench.toggleSort', () => {
    treeProvider.toggleSort();
    vscode.window.showInformationMessage(`Sort: ${SORT_LABELS[treeProvider.sortOrder]}`);
  });

  workbench.register('exercismWorkbench.expandAll', () => treeProvider.toggleCollapse());
}

/** Swaps the reader and code columns, reopening the panel and text editors in their new places. */
async function toggleLayout(workbench: Workbench): Promise<void> {
  const config = vscode.workspace.getConfiguration('exercismWorkbench');
  const newValue = config.get<string>('readerPosition', 'left') === 'left' ? 'right' : 'left';
  await config.update('readerPosition', newValue, vscode.ConfigurationTarget.Global);

  // Collect state before closing anything.
  const currentExercise = ExercisePreviewPanel.getCurrentExercise();
  const openFileUris = vscode.window.tabGroups.all
    .flatMap(group => group.tabs)
    .filter(tab => tab.input instanceof vscode.TabInputText)
    .map(tab => (tab.input as vscode.TabInputText).uri);

  if (currentExercise) {
    ExercisePreviewPanel.dispose();
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');

    const reopenFiles = async (column: vscode.ViewColumn) => {
      for (const uri of openFileUris) {
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri), column, true);
      }
    };
    if (newValue === 'left') {
      // Reader left (column 1), code right (column 2).
      ExercisePreviewPanel.show(currentExercise, workbench.context.extensionUri);
      await reopenFiles(vscode.ViewColumn.Two);
    } else {
      // Code left (column 1), reader right (column 2).
      await reopenFiles(vscode.ViewColumn.One);
      ExercisePreviewPanel.show(currentExercise, workbench.context.extensionUri);
    }
  }

  vscode.window.showInformationMessage(`Layout: ${newValue === 'left' ? 'Reader | Code' : 'Code | Reader'}`);
}
