import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { parseDownloadPath } from './parseDownloadOutput';
import { ProcessError, ProcessOutput, runProcess } from './process';
import { combineProcessOutput, diagnoseTestFailure, TestDiagnostic } from './testDiagnostics';

export interface CliConfig {
  workspace: string;
  token: string;
}

export interface TestResult {
  passed: boolean;
  output: string;
  diagnostic?: TestDiagnostic;
}

export interface SubmitResult {
  success: boolean;
  /** Link to the new iteration, when the CLI printed one. */
  url?: string;
  output: string;
}

/**
 * Reads `exercism configure` output, which lists settings as
 * `Workspace:     (-w, --workspace)  /home/me/exercism`.
 */
export function parseConfigureOutput(output: string): CliConfig {
  const field = (label: string) =>
    output.match(new RegExp(`^${label}:[ \\t]*(?:\\([^)]*\\)[ \\t]*)?(.*)$`, 'm'))?.[1].trim() ?? '';
  return { workspace: field('Workspace'), token: field('Token') };
}

const CONFIG_TTL_MS = 5 * 60 * 1000;

/** Runs the Exercism CLI. Web API calls live in ExercismApi. */
export class ExercismCli {
  private config: { value: CliConfig; at: number } | undefined;

  private get settings() {
    const config = vscode.workspace.getConfiguration('exercismWorkbench');
    return {
      program: config.get<string>('cliPath', 'exercism'),
      timeoutMs: config.get<number>('cliTimeout', 60000),
    };
  }

  private run(program: string, args: string[], cwd?: string, cancel?: vscode.CancellationToken): Promise<ProcessOutput> {
    return runProcess(program, args, {
      cwd,
      timeoutMs: this.settings.timeoutMs,
      onCancel: cancel && (stop => cancel.onCancellationRequested(stop)),
    });
  }

  private exercism(args: string[], cwd?: string, cancel?: vscode.CancellationToken): Promise<ProcessOutput> {
    return this.run(this.settings.program, args, cwd, cancel);
  }

  clearCache(): void {
    this.config = undefined;
  }

  async checkInstalled(): Promise<{ installed: boolean; version?: string }> {
    try {
      return { installed: true, version: (await this.exercism(['version'])).stdout.trim() };
    } catch {
      return { installed: false };
    }
  }

  async getConfig(): Promise<CliConfig> {
    if (this.config && Date.now() - this.config.at < CONFIG_TTL_MS) { return this.config.value; }
    const { stdout, stderr } = await this.exercism(['configure']);
    // Older CLI versions print the settings to stderr.
    const value = parseConfigureOutput(stdout || stderr);
    this.config = { value, at: Date.now() };
    return value;
  }

  async configure(token: string): Promise<void> {
    await this.exercism(['configure', '--token', token]);
    this.clearCache();
  }

  /** Downloads an exercise and returns its folder. `force` overwrites local files. */
  async download(track: string, exercise: string, cancel?: vscode.CancellationToken, force = false): Promise<string> {
    const args = ['download', `--track=${track}`, `--exercise=${exercise}`, ...(force ? ['--force'] : [])];
    const folder = parseDownloadPath((await this.exercism(args, undefined, cancel)).stdout);
    if (!folder) { throw new Error('The Exercism CLI did not say where it saved the exercise.'); }
    return folder;
  }

  async test(exercisePath: string, cancel?: vscode.CancellationToken): Promise<TestResult> {
    const hasCmake = fs.existsSync(path.join(exercisePath, 'CMakeLists.txt'));
    // A configured C++ build is run with CMake directly; `exercism test` only runs make.
    if (hasCmake && fs.existsSync(path.join(exercisePath, 'build', 'CMakeCache.txt'))) {
      return this.cmakeTest(exercisePath, cancel);
    }
    try {
      const { stdout, stderr } = await this.exercism(['test'], exercisePath, cancel);
      return { passed: true, output: combineProcessOutput(stdout, stderr) };
    } catch (error) {
      const output = error instanceof ProcessError ? error.output : String(error);
      // The C++ track has no Makefile until CMake has configured the build.
      if (hasCmake && (output.includes('no makefile found') || output.includes('No targets specified'))) {
        return this.cmakeTest(exercisePath, cancel);
      }
      return { passed: false, output, diagnostic: diagnoseTestFailure(output) };
    }
  }

  private async cmakeTest(exercisePath: string, cancel?: vscode.CancellationToken): Promise<TestResult> {
    const heading = 'Exercism Workbench configured and built the C++ project with CMake.\n';
    try {
      const configured = await this.run('cmake', ['-S', '.', '-B', 'build'], exercisePath, cancel);
      const built = await this.run('cmake', ['--build', path.join(exercisePath, 'build')], exercisePath, cancel);
      return {
        passed: true,
        output: [heading, combineProcessOutput(configured.stdout, configured.stderr), combineProcessOutput(built.stdout, built.stderr)]
          .filter(Boolean).join('\n'),
      };
    } catch (error) {
      const output = `${heading}\n${error instanceof ProcessError ? error.output : String(error)}`.trim();
      const missingCmake = error instanceof ProcessError && error.code === 'ENOENT';
      return {
        passed: false,
        output,
        diagnostic: missingCmake
          ? {
            kind: 'environment',
            message: 'CMake was not found. Install CMake and a C++ compiler, then run the tests again.',
            helpUrl: 'https://exercism.org/docs/tracks/cpp/installation',
            helpLabel: 'C++ Setup',
          }
          : diagnoseTestFailure(output),
      };
    }
  }

  async submit(files: string[], cancel?: vscode.CancellationToken): Promise<SubmitResult> {
    try {
      const { stdout } = await this.exercism(['submit', ...files], undefined, cancel);
      return { success: true, url: stdout.match(/https?:\/\/exercism\.\w+\/\S+/)?.[0], output: stdout };
    } catch (error) {
      // The CLI prints API errors to stderr.
      return { success: false, output: error instanceof ProcessError ? error.output : String(error) };
    }
  }
}
