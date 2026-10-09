import * as vscode from 'vscode';
import { ExercismApi } from './api/exercismApi';
import { ExercismCli } from './cli/exercismCli';
import { WorkspaceScanner } from './workspace/workspaceScanner';
import { ExerciseTreeProvider } from './views/exerciseTree';
import { WebProgressSnapshot, WEB_PROGRESS_STORAGE_KEY } from './progress/webProgress';
import { BackgroundSyncMode, shouldRunBackgroundSync } from './sync/syncPolicy';

/** Services and state shared by every command. */
export class Workbench {
  readonly cli = new ExercismCli();
  readonly api = new ExercismApi(
    () => this.cli.getConfig().then(config => config.token, () => ''),
    () => vscode.workspace.getConfiguration('exercismWorkbench').get<number>('cliTimeout', 60000),
  );
  readonly scanner = new WorkspaceScanner(() => this.cli.getConfig());
  readonly output = vscode.window.createOutputChannel('Exercism Workbench');
  readonly treeProvider: ExerciseTreeProvider;
  private readonly logChannel = vscode.window.createOutputChannel('Exercism Workbench Log');
  private progress: WebProgressSnapshot | undefined;
  private syncInFlight: Promise<WebProgressSnapshot> | undefined;
  private lastBackgroundSync = 0;

  constructor(readonly context: vscode.ExtensionContext) {
    context.subscriptions.push(this.output, this.logChannel);
    this.progress = context.globalState.get<WebProgressSnapshot>(WEB_PROGRESS_STORAGE_KEY);
    this.treeProvider = new ExerciseTreeProvider(this.scanner, this.api, this.progress);
  }

  get webProgress(): WebProgressSnapshot | undefined {
    return this.progress;
  }

  log(message: string): void {
    this.logChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
  }

  async saveWebProgress(progress: WebProgressSnapshot): Promise<void> {
    this.progress = progress;
    await this.context.globalState.update(WEB_PROGRESS_STORAGE_KEY, progress);
    this.treeProvider.setWebProgress(progress);
  }

  /** Fetches progress from Exercism; concurrent callers share one request. */
  async syncProgress(): Promise<WebProgressSnapshot> {
    if (this.syncInFlight) { return this.syncInFlight; }
    const activeSync = (async () => {
      const progress = await this.api.progress();
      await this.saveWebProgress(progress);
      return progress;
    })();
    this.syncInFlight = activeSync;
    try {
      return await activeSync;
    } finally {
      if (this.syncInFlight === activeSync) { this.syncInFlight = undefined; }
    }
  }

  /** Syncs after a change on Exercism; a failure only refreshes the tree from local state. */
  /** Forgets cached CLI settings and API replies so the next read sees Exercism's current state. */
  clearCache(): void {
    this.cli.clearCache();
    this.api.clearCache();
  }

  async syncAfterChange(reason: string): Promise<void> {
    this.clearCache();
    try {
      await this.syncProgress();
    } catch (error) {
      this.log(`${reason} progress sync skipped: ${errorMessage(error)}`);
      this.treeProvider.refresh();
    }
  }

  async backgroundSync(): Promise<void> {
    const now = Date.now();
    const config = vscode.workspace.getConfiguration('exercismWorkbench');
    const mode = config.get<BackgroundSyncMode>('syncMode', 'onFocus');
    const intervalMinutes = config.get<number>('syncIntervalMinutes', 5);
    if (!shouldRunBackgroundSync(mode, this.lastBackgroundSync, now, intervalMinutes)) { return; }
    this.lastBackgroundSync = now;
    try {
      await this.syncProgress();
      this.log('Background progress sync completed');
    } catch (error) {
      // Background sync is best-effort. Manual sync reports actionable errors.
      this.log(`Background progress sync skipped: ${errorMessage(error)}`);
    }
  }

  /** The learner is heading to the website, so sync as soon as VS Code regains focus. */
  syncOnReturn(): void {
    this.lastBackgroundSync = 0;
  }

  async updateConfiguredContext(): Promise<void> {
    let configured = false;
    try {
      configured = !!(await this.cli.getConfig()).token;
    } catch { /* not configured */ }
    await vscode.commands.executeCommand('setContext', 'exercismWorkbench.configured', configured);
    this.log(`Context exercismWorkbench.configured = ${configured}`);
  }

  register(command: string, handler: (...args: any[]) => unknown): void {
    this.context.subscriptions.push(vscode.commands.registerCommand(command, handler));
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const CLI_INSTALL_URL = 'https://exercism.org/docs/using/solving-exercises/working-locally';

export function showCliNotInstalledError(): void {
  vscode.window.showErrorMessage('The Exercism CLI is not installed.', 'How to Install').then(action => {
    if (action) { vscode.env.openExternal(vscode.Uri.parse(CLI_INSTALL_URL)); }
  });
}
