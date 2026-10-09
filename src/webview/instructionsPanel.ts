import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Exercise, ExerciseStatus } from '../models/exercise';
import { renderInstructionsPage } from './instructionsHtml';
import { renderMarkdown } from './markdown';

/** Panel buttons and the command each one runs; anything else the webview sends is ignored. */
const PANEL_COMMANDS = new Map([
  ['runTests', 'exercismWorkbench.test'],
  ['submit', 'exercismWorkbench.submit'],
  ['markComplete', 'exercismWorkbench.markComplete'],
  ['openInBrowser', 'exercismWorkbench.openInBrowser'],
]);

/** The single instructions panel; opening another exercise reuses it. */
export class InstructionsPanel {
  private static current: InstructionsPanel | undefined;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    private exercise: Exercise,
  ) {
    panel.webview.onDidReceiveMessage((message: { command?: unknown }) => this.handleMessage(message));
    panel.onDidDispose(() => { InstructionsPanel.current = undefined; });
    this.render();
  }

  static show(exercise: Exercise, extensionUri: vscode.Uri): void {
    const readerPosition = vscode.workspace.getConfiguration('exercismWorkbench').get<string>('readerPosition', 'left');
    const column = readerPosition === 'left' ? vscode.ViewColumn.One : vscode.ViewColumn.Beside;
    if (InstructionsPanel.current) {
      InstructionsPanel.current.exercise = exercise;
      InstructionsPanel.current.render();
      InstructionsPanel.current.panel.reveal(column);
      return;
    }
    const panel = vscode.window.createWebviewPanel('exercismWorkbench.instructions', exercise.name, column, {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'webview-ui')],
    });
    InstructionsPanel.current = new InstructionsPanel(panel, extensionUri, exercise);
  }

  /** A submit means at least one iteration exists, so relabel the panel without waiting for a sync. */
  static markSubmitted(exercise: Exercise): void {
    InstructionsPanel.setStatus(exercise, ExerciseStatus.Iterated);
  }

  static markCompleted(exercise: Exercise): void {
    InstructionsPanel.setStatus(exercise, ExerciseStatus.Completed);
  }

  static currentExercise(): Exercise | undefined {
    return InstructionsPanel.current?.exercise;
  }

  static close(): void {
    InstructionsPanel.current?.panel.dispose();
  }

  private static setStatus(exercise: Exercise, status: ExerciseStatus): void {
    const current = InstructionsPanel.current;
    const shown = current?.exercise;
    if (!current || !shown || shown.slug !== exercise.slug || shown.track !== exercise.track) { return; }
    if (shown.status === ExerciseStatus.Completed || shown.status === ExerciseStatus.Published) { return; }
    current.exercise = { ...shown, status };
    current.render();
  }

  private render(): void {
    const { exercise, panel } = this;
    const document = (name: string, present = true) => {
      if (!present) { return undefined; }
      try {
        return renderMarkdown(fs.readFileSync(path.join(exercise.path, name), 'utf8'));
      } catch {
        return undefined;
      }
    };
    const asset = (name: string) =>
      panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'webview-ui', name)).toString();

    panel.title = `${exercise.name} · ${exercise.track}`;
    panel.webview.html = renderInstructionsPage({
      exercise,
      readme: document('README.md'),
      hints: document('HINTS.md', exercise.hasHints),
      help: document('HELP.md', exercise.hasHelp),
      styleUri: asset('styles.css'),
      scriptUri: asset('panel.js'),
      cspSource: panel.webview.cspSource,
      nonce: crypto.randomBytes(16).toString('base64'),
    });
  }

  private handleMessage(message: { command?: unknown }): void {
    const readmePath = path.join(this.exercise.path, 'README.md');
    switch (message.command) {
      case 'copyInstructions':
        // Raw Markdown, ready to paste into a chat or notes.
        try {
          vscode.env.clipboard.writeText(fs.readFileSync(readmePath, 'utf8'));
          vscode.window.showInformationMessage('Copied the instructions.');
        } catch {
          vscode.window.showWarningMessage('Could not read README.md.');
        }
        return;
      case 'openReadme':
        // As a normal editor tab it can be searched, split or attached to a chat.
        vscode.workspace.openTextDocument(readmePath).then(
          doc => vscode.window.showTextDocument(doc, vscode.ViewColumn.Active),
          () => vscode.window.showWarningMessage('Could not open README.md.'),
        );
        return;
      default: {
        const command = PANEL_COMMANDS.get(String(message.command));
        if (command) { vscode.commands.executeCommand(command, this.exercise); }
      }
    }
  }
}
