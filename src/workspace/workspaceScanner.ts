import * as vscode from 'vscode';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { inspectSolutionFiles } from './solutionFiles';

/** An exercise folder found on disk: <workspace>/<track>/<exercise>/.exercism/metadata.json */
export interface ScannedExercise {
  slug: string;
  track: string;
  path: string;
  hasReadme: boolean;
  hasHints: boolean;
  isIncomplete: boolean;
  /** Newest solution-file change, in ms since the epoch; 0 when there are no solution files. */
  lastModified: number;
}

export interface ScannedTrack {
  slug: string;
  path: string;
  exercises: ScannedExercise[];
}

async function subfolders(dir: string): Promise<string[]> {
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    return entries.filter(entry => entry.isDirectory()).map(entry => entry.name);
  } catch {
    return [];
  }
}

async function newestChange(files: string[]): Promise<number> {
  const times = await Promise.all(files.map(file => fsp.stat(file).then(s => s.mtimeMs, () => 0)));
  return Math.max(0, ...times);
}

async function scanExercise(track: string, exercisePath: string): Promise<ScannedExercise | undefined> {
  if (!fs.existsSync(path.join(exercisePath, '.exercism', 'metadata.json'))) { return undefined; }
  const inspection = inspectSolutionFiles(exercisePath);
  return {
    slug: path.basename(exercisePath),
    track,
    path: exercisePath,
    hasReadme: fs.existsSync(path.join(exercisePath, 'README.md')),
    hasHints: fs.existsSync(path.join(exercisePath, 'HINTS.md')),
    isIncomplete: inspection.isIncomplete,
    lastModified: await newestChange(inspection.files),
  };
}

/** Lists every downloaded exercise under an Exercism workspace folder. Tracks with none are left out. */
export async function scanWorkspace(root: string): Promise<ScannedTrack[]> {
  const tracks: ScannedTrack[] = [];
  for (const track of await subfolders(root)) {
    const trackPath = path.join(root, track);
    const found = await Promise.all(
      (await subfolders(trackPath)).map(name => scanExercise(track, path.join(trackPath, name))),
    );
    const exercises = found.filter((exercise): exercise is ScannedExercise => !!exercise);
    if (exercises.length > 0) { tracks.push({ slug: track, path: trackPath, exercises }); }
  }
  return tracks;
}

export class WorkspaceScanner {
  constructor(
    private readonly cliConfig: () => Promise<{ workspace: string }>,
    private readonly defaultRoot = path.join(os.homedir(), 'exercism'),
  ) {}

  /** The workspace folder, from the setting, then the CLI config, then ~/exercism. */
  async getWorkspacePath(): Promise<string | undefined> {
    const setting = vscode.workspace.getConfiguration('exercismWorkbench').get<string>('workspacePath', '').trim();
    let cliWorkspace = '';
    try {
      cliWorkspace = (await this.cliConfig()).workspace.trim();
    } catch { /* CLI missing or not configured */ }
    return [setting, cliWorkspace, this.defaultRoot].find(candidate => candidate && fs.existsSync(candidate));
  }

  async scan(): Promise<ScannedTrack[]> {
    const root = await this.getWorkspacePath();
    return root ? scanWorkspace(root) : [];
  }

  /** Calls onChange when an exercise is downloaded or deleted anywhere in the workspace. */
  async createWatcher(onChange: () => void): Promise<vscode.Disposable | undefined> {
    const root = await this.getWorkspacePath();
    if (!root) { return undefined; }
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(root, '**/.exercism/metadata.json'),
    );
    watcher.onDidCreate(onChange);
    watcher.onDidDelete(onChange);
    return watcher;
  }
}
