import * as vscode from 'vscode';
import { CLI_INSTALL_URL, errorMessage, Workbench } from '../workbench';

export function registerSetupCommands(workbench: Workbench): void {
  workbench.register('exercismWorkbench.configure', () => configure(workbench));
}

async function configure(workbench: Workbench): Promise<void> {
  const { cli } = workbench;
  workbench.log('Command: exercismWorkbench.configure triggered');

  const { installed } = await cli.checkInstalled();
  workbench.log(`CLI installed: ${installed}`);
  if (!installed) {
    const action = await vscode.window.showErrorMessage(
      'Install the Exercism CLI first, then run Configure again.',
      'How to Install',
    );
    if (action) { vscode.env.openExternal(vscode.Uri.parse(CLI_INSTALL_URL)); }
    return;
  }

  let existingToken = '';
  try {
    existingToken = (await cli.getConfig()).token;
  } catch { /* not configured */ }
  if (existingToken) {
    const action = await vscode.window.showInformationMessage(
      `Exercism is already set up with token ****${existingToken.slice(-4)}.`,
      'Change Token',
    );
    if (action !== 'Change Token') { return; }
  }

  const action = await vscode.window.showInformationMessage(
    'Workbench needs your Exercism API token.',
    'Get My Token',
    'I Have It',
  );
  if (!action) { return; }
  if (action === 'Get My Token') {
    vscode.env.openExternal(vscode.Uri.parse('https://exercism.org/settings/api_cli'));
  }

  const token = await vscode.window.showInputBox({
    prompt: action === 'Get My Token'
      ? 'Copy the token from the page that just opened and paste it here'
      : 'Paste your Exercism API token',
    placeHolder: 'Token from exercism.org/settings/api_cli',
    password: true,
    ignoreFocusOut: true,
  });
  if (!token) { return; }

  let configureError = '';
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Saving your token...' },
    async () => {
      try {
        await cli.configure(token);
        workbench.clearCache();
        await workbench.updateConfiguredContext();
        workbench.treeProvider.refresh();
      } catch (error) {
        configureError = errorMessage(error);
      }
    },
  );

  if (configureError) {
    vscode.window.showErrorMessage(`Could not save your token: ${configureError}`);
  } else {
    vscode.window.showInformationMessage('Exercism is set up. Pick an exercise in the sidebar to start.');
  }
}
