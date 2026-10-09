import * as vscode from 'vscode';
import { Workbench } from './workbench';
import { registerDownloadCommands } from './commands/downloadCommands';
import { registerProgressCommands } from './commands/progressCommands';
import { registerSetupCommands } from './commands/setupCommands';
import { registerSubmitCommands } from './commands/submitCommands';
import { registerTestCommands } from './commands/testCommands';
import { registerViewCommands } from './commands/viewCommands';

export function activate(context: vscode.ExtensionContext): void {
  const workbench = new Workbench(context);
  const { scanner, treeProvider } = workbench;
  workbench.log('=== Exercism Workbench activating ===');

  void workbench.updateConfiguredContext();
  logStartupDiagnostics(workbench);

  const treeView = vscode.window.createTreeView('exercismWorkbench.explorer', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(
    treeView,
    treeView.onDidChangeVisibility(event => {
      if (event.visible) { void workbench.backgroundSync(); }
    }),
    vscode.window.onDidChangeWindowState(event => {
      if (event.focused) { void workbench.backgroundSync(); }
    }),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('exercismWorkbench')) { treeProvider.refresh(); }
    }),
  );
  if (treeView.visible) { void workbench.backgroundSync(); }

  const watcher = scanner.createWatcher(() => treeProvider.refresh());
  if (watcher) { context.subscriptions.push(watcher); }

  registerSetupCommands(workbench);
  registerProgressCommands(workbench);
  registerDownloadCommands(workbench);
  registerTestCommands(workbench);
  registerSubmitCommands(workbench);
  registerViewCommands(workbench);

  workbench.output.appendLine('Exercism Workbench extension activated');
  workbench.log('=== Exercism Workbench activated successfully ===');
  workbench.log(`Extension URI: ${context.extensionUri.fsPath}`);
}

export function deactivate(): void {
  // Cleanup handled by disposables
}

function logStartupDiagnostics(workbench: Workbench): void {
  const { cli, scanner } = workbench;
  cli.checkInstalled()
    .then(result => workbench.log(`CLI check: installed=${result.installed}, version=${result.version ?? 'N/A'}`))
    .catch(err => workbench.log(`CLI check error: ${err}`));
  scanner.getWorkspacePath()
    .then(wp => workbench.log(`Workspace path resolved: ${wp ?? 'NONE'}`))
    .catch(err => workbench.log(`Workspace path error: ${err}`));
  scanner.scan()
    .then(tracks => {
      workbench.log(`Scan result: ${tracks.length} tracks found`);
      for (const t of tracks) {
        workbench.log(`  Track: ${t.slug} (${t.exercises.length} exercises)`);
        for (const e of t.exercises) {
          workbench.log(`    Exercise: ${e.slug} [readme=${e.hasReadme}, hints=${e.hasHints}]`);
        }
      }
    })
    .catch(err => workbench.log(`Scan error: ${err}`));
}
