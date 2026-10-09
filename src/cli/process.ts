import { execFile } from 'child_process';
import { combineProcessOutput } from './testDiagnostics';

export interface ProcessOutput {
  stdout: string;
  stderr: string;
}

/** A program that exited with an error, could not start, or was cancelled. */
export class ProcessError extends Error {
  constructor(
    message: string,
    readonly stdout = '',
    readonly stderr = '',
    /** Exit code, or a Node error code such as 'ENOENT' when the program is missing. */
    readonly code?: number | string,
  ) {
    super(message);
  }

  /** Everything the program printed, or the error message when it printed nothing. */
  get output(): string {
    return combineProcessOutput(this.stdout, this.stderr, this.message);
  }
}

export interface RunOptions {
  cwd?: string;
  timeoutMs: number;
  /** Called with a function that stops the program; wire it to a cancel button. */
  onCancel?: (cancel: () => void) => void;
}

/** Runs a program directly, without a shell, so arguments are never interpreted. */
export function runProcess(program: string, args: string[], options: RunOptions): Promise<ProcessOutput> {
  return new Promise((resolve, reject) => {
    const child = execFile(program, args, { cwd: options.cwd, timeout: options.timeoutMs }, (error, stdout, stderr) => {
      if (!error) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new ProcessError(error.message, stdout, stderr, (error as NodeJS.ErrnoException).code ?? undefined));
    });
    options.onCancel?.(() => {
      child.kill();
      reject(new ProcessError('Cancelled'));
    });
  });
}
