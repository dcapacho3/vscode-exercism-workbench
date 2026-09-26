import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { WebProgressSnapshot } from '../progress/webProgress';
import { fetchProgressSnapshot } from '../progress/progressApi';
import { parseDownloadPath } from './parseDownloadOutput';
import { combineProcessOutput, diagnoseTestFailure, TestDiagnostic } from './testDiagnostics';
import * as fs from 'fs';
import * as path from 'path';

export interface ExercismConfig {
  workspace: string;    // Absolute path to exercism workspace
  token: string;        // API token
  apiBaseUrl: string;   // API base URL
}

export interface TestResult {
  passed: boolean;      // Overall pass/fail
  output: string;       // Raw CLI stdout
  exitCode: number;     // Process exit code
  diagnostic?: TestDiagnostic;
}

export interface SubmitResult {
  success: boolean;
  url?: string;         // URL to the submitted solution on exercism.io
  output: string;       // Raw CLI stdout
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

export class ExercismCli {
  private _cache = new Map<string, CacheEntry<any>>();
  private _configCache: CacheEntry<ExercismConfig> | undefined;

  private getCached<T>(key: string): T | undefined {
    const entry = this._cache.get(key);
    if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
      return entry.data as T;
    }
    this._cache.delete(key);
    return undefined;
  }

  private setCache<T>(key: string, data: T): void {
    this._cache.set(key, { data, timestamp: Date.now() });
  }

  clearCache(): void {
    this._cache.clear();
    this._configCache = undefined;
  }
  private get cliPath(): string {
    return vscode.workspace.getConfiguration('exercismWorkbench').get<string>('cliPath', 'exercism');
  }

  private get timeout(): number {
    return vscode.workspace.getConfiguration('exercismWorkbench').get<number>('cliTimeout', 60000);
  }

  private run(
    args: string[],
    options: { cwd?: string; token?: vscode.CancellationToken } = {}
  ): Promise<{ stdout: string; stderr: string }> {
    return this.runExecutable(this.cliPath, args, options);
  }

  private runExecutable(
    executable: string,
    args: string[],
    options: { cwd?: string; token?: vscode.CancellationToken } = {}
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = execFile(
        executable,
        args,
        { cwd: options.cwd, timeout: this.timeout },
        (error, stdout, stderr) => {
          if (error) {
            reject(Object.assign(error, { stdout, stderr }));
          } else {
            resolve({ stdout, stderr });
          }
        }
      );

      if (options.token) {
        options.token.onCancellationRequested(() => {
          child.kill();
          reject(new Error('Operation cancelled'));
        });
      }
    });
  }

  private async getJson(url: string, headers: Record<string, string> = {}): Promise<any> {
    const https = await import('https');
    return new Promise((resolve, reject) => {
      const request = https.get(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'exercism-workbench-vscode',
          ...headers,
        },
      }, (res) => {
        let data = '';
        let receivedBytes = 0;
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          receivedBytes += Buffer.byteLength(chunk, 'utf8');
          if (receivedBytes > MAX_RESPONSE_BYTES) {
            res.destroy(new Error(`Response too large from ${url}`));
            return;
          }
          data += chunk;
        });
        res.on('end', () => {
          const status = res.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            reject(new Error(`HTTP ${status} from ${url}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Invalid JSON from ${url}`));
          }
        });
        res.on('error', reject);
      });
      request.on('error', reject);
      request.setTimeout(this.timeout, () => {
        request.destroy(new Error(`Request timed out: ${url}`));
      });
    });
  }

  async checkInstalled(): Promise<{ installed: boolean; version?: string }> {
    try {
      const { stdout } = await this.run(['version']);
      const version = stdout.trim();
      return { installed: true, version };
    } catch {
      return { installed: false };
    }
  }

  async getConfig(): Promise<ExercismConfig> {
    if (this._configCache && Date.now() - this._configCache.timestamp < CACHE_TTL) {
      return this._configCache.data;
    }
    const { stdout, stderr } = await this.run(['configure']);
    // exercism configure outputs to stderr, not stdout
    const output = stdout || stderr;

    const workspace = this.parseConfigField(output, 'Workspace');
    const token = this.parseConfigField(output, 'Token');
    const apiBaseUrl = this.parseConfigField(output, 'API Base URL');

    const config = { workspace, token, apiBaseUrl };
    this._configCache = { data: config, timestamp: Date.now() };
    return config;
  }

  private parseConfigField(output: string, field: string): string {
    const match = output.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'));
    if (!match) { return ''; }
    let value = match[1].trim();
    // CLI output may include flag hints like "(-w, --workspace)  /actual/path"
    // Strip the parenthesized flag description if present
    const parenMatch = value.match(/\(.*?\)\s+(.*)/);
    if (parenMatch) {
      value = parenMatch[1].trim();
    }
    return value;
  }

  async fetchTracks(): Promise<Array<{ slug: string; title: string; numExercises: number }>> {
    const cached = this.getCached<Array<{ slug: string; title: string; numExercises: number }>>('tracks');
    if (cached) { return cached; }
    const json = await this.getJson('https://api.exercism.org/v2/tracks');
    const tracks = (json.tracks || []).map((t: any) => ({
      slug: t.slug,
      title: t.title,
      numExercises: t.num_exercises || 0,
    }));
    if (tracks.length === 0) {
      throw new Error('Exercism returned an empty track catalog');
    }
    this.setCache('tracks', tracks);
    return tracks;
  }

  async fetchExercises(track: string, token?: string): Promise<Array<{ slug: string; title: string; difficulty: string; isUnlocked: boolean; isRecommended: boolean; type: string; blurb: string }>> {
    const cacheKey = `exercises:${track}:${token ? 'auth' : 'anon'}`;
    const cached = this.getCached<Array<{ slug: string; title: string; difficulty: string; isUnlocked: boolean; isRecommended: boolean; type: string; blurb: string }>>(cacheKey);
    if (cached) { return cached; }
    const headers: Record<string, string> = {};
    if (token) { headers['Authorization'] = `Bearer ${token}`; }
    try {
      const json = await this.getJson(`https://api.exercism.org/v2/tracks/${track}/exercises`, headers);
      const exercises = (json.exercises || []).map((e: any) => ({
        slug: e.slug,
        title: e.title || e.slug,
        difficulty: String(e.difficulty || ''),
        isUnlocked: e.is_unlocked ?? false,
        isRecommended: e.is_recommended ?? false,
        type: e.type || 'practice',
        blurb: e.blurb || '',
      }));
      if (exercises.length === 0) { throw new Error('Empty exercise catalog'); }
      this.setCache(cacheKey, exercises);
      return exercises;
    } catch {
      // Exercism's API may be protected by a browser-only Cloudflare challenge.
      // Every track's public config.json is also maintained by Exercism on GitHub.
      const config = await this.getJson(
        `https://raw.githubusercontent.com/exercism/${encodeURIComponent(track)}/main/config.json`
      );
      const concept = Array.isArray(config.exercises?.concept) ? config.exercises.concept : [];
      const practice = Array.isArray(config.exercises?.practice) ? config.exercises.practice : [];
      const exercises = [
        ...concept.map((e: any) => ({ ...e, type: 'concept' })),
        ...practice.map((e: any) => ({ ...e, type: 'practice' })),
      ]
        .filter((e: any) => e.status !== 'deprecated' && e.status !== 'wip')
        .map((e: any) => ({
          slug: e.slug,
          title: e.name || e.slug,
          difficulty: e.difficulty ? `difficulty ${e.difficulty}` : e.type,
          isUnlocked: true,
          isRecommended: false,
          type: e.type,
          blurb: '',
        }));
      if (exercises.length === 0) {
        throw new Error(`No exercises found for track '${track}'`);
      }
      this.setCache(cacheKey, exercises);
      return exercises;
    }
  }

  async fetchUserSolutions(track: string, token: string): Promise<Map<string, string>> {
    const cacheKey = `solutions:${track}`;
    const cached = this.getCached<Map<string, string>>(cacheKey);
    if (cached) { return cached; }
    const solutionMap = new Map<string, string>();
    const headers = { 'Authorization': `Bearer ${token}` };
    let page = 1;
    let totalPages = 1;

    do {
      const url = `https://api.exercism.org/v2/solutions?track_slug=${encodeURIComponent(track)}&per_page=100&page=${page}`;
      const json = await this.getJson(url, headers);
      const results = Array.isArray(json.results) ? json.results : [];

      for (const solution of results) {
        let slug: string | undefined = solution.exercise?.slug;
        if (!slug && typeof solution.private_url === 'string') {
          slug = solution.private_url.match(/\/exercises\/([^/]+)/)?.[1];
        }
        if (slug && typeof solution.status === 'string') {
          solutionMap.set(slug, solution.status);
        }
      }

      totalPages = Number(json.meta?.total_pages ?? 1);
      if (!Number.isInteger(totalPages) || totalPages < 1 || totalPages > 1000) {
        throw new Error('Exercism returned invalid solution pagination data');
      }
      page += 1;
    } while (page <= totalPages);

    this.setCache(cacheKey, solutionMap);
    return solutionMap;
  }

  async fetchWebProgress(token: string): Promise<WebProgressSnapshot> {
    if (!token) { throw new Error('Exercism CLI is not configured with an API token.'); }
    const headers = { 'Authorization': `Bearer ${token}` };
    return fetchProgressSnapshot(url => this.getJson(url, headers));
  }

  async configure(token: string): Promise<void> {
    await this.run(['configure', '--token', token]);
  }

  async download(
    track: string,
    exercise: string,
    token?: vscode.CancellationToken,
    force = false,
  ): Promise<string> {
    const args = ['download', `--track=${track}`, `--exercise=${exercise}`];
    if (force) { args.push('--force'); }
    const { stdout } = await this.run(
      args,
      { token }
    );

    const downloadPath = parseDownloadPath(stdout);
    if (!downloadPath) {
      throw new Error('The Exercism CLI did not report the downloaded exercise path.');
    }
    return downloadPath;
  }

  async test(
    exercisePath: string,
    token?: vscode.CancellationToken
  ): Promise<TestResult> {
    if (fs.existsSync(path.join(exercisePath, 'CMakeLists.txt'))
      && fs.existsSync(path.join(exercisePath, 'build', 'CMakeCache.txt'))) {
      return this.runCmakeTests(exercisePath, token);
    }

    try {
      const { stdout, stderr } = await this.run(['test'], { cwd: exercisePath, token });
      const output = combineProcessOutput(stdout, stderr);
      return { passed: true, output, exitCode: 0 };
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number };
      const output = combineProcessOutput(error.stdout, error.stderr, error.message);

      if ((output.includes('no makefile found') || output.includes('No targets specified'))
        && fs.existsSync(path.join(exercisePath, 'CMakeLists.txt'))) {
        return this.runCmakeTests(exercisePath, token);
      }

      const exitCode = typeof error.code === 'number' ? error.code : 1;
      return { passed: false, output, exitCode, diagnostic: diagnoseTestFailure(output) };
    }
  }

  private async runCmakeTests(
    exercisePath: string,
    token?: vscode.CancellationToken,
  ): Promise<TestResult> {
    const buildPath = path.join(exercisePath, 'build');
    const heading = 'Exercism Workbench initialized the C++ build with CMake.\n';
    try {
      const configured = await this.runExecutable(
        'cmake',
        ['-S', '.', '-B', 'build'],
        { cwd: exercisePath, token },
      );
      const built = await this.runExecutable(
        'cmake',
        ['--build', buildPath],
        { cwd: exercisePath, token },
      );
      const output = [
        heading,
        combineProcessOutput(configured.stdout, configured.stderr),
        combineProcessOutput(built.stdout, built.stderr),
      ].filter(Boolean).join('\n');
      return { passed: true, output, exitCode: 0 };
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number | string };
      const processOutput = combineProcessOutput(error.stdout, error.stderr, error.message);
      const output = `${heading}\n${processOutput}`.trim();
      const diagnostic = error.code === 'ENOENT'
        ? {
            kind: 'environment' as const,
            message: 'CMake was not found. Install CMake and a C++ compiler, then run the tests again.',
            helpUrl: 'https://exercism.org/docs/tracks/cpp/installation',
            helpLabel: 'C++ Setup',
          }
        : diagnoseTestFailure(output);
      return {
        passed: false,
        output,
        exitCode: typeof error.code === 'number' ? error.code : 1,
        diagnostic,
      };
    }
  }

  async submit(
    files: string[],
    token?: vscode.CancellationToken
  ): Promise<SubmitResult> {
    try {
      const { stdout } = await this.run(['submit', ...files], { token });

      // Parse the solution URL from output, e.g.:
      // Your solution has been submitted successfully.
      // https://exercism.org/tracks/python/exercises/hello-world/solutions/...
      const urlMatch = stdout.match(/https?:\/\/exercism\.\w+\/[^\s]+/);

      return {
        success: true,
        url: urlMatch ? urlMatch[0] : undefined,
        output: stdout,
      };
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException & { stdout?: string };
      const output = error.stdout ?? error.message ?? '';
      return { success: false, output };
    }
  }
}
