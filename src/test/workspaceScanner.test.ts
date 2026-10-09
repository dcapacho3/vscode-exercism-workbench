import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { scanWorkspace, WorkspaceScanner } from '../workspace/workspaceScanner';

const created: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-scan-'));
  created.push(dir);
  return dir;
}

/** Writes an exercise the way the Exercism CLI lays it out. */
function addExercise(root: string, track: string, slug: string, files: Record<string, string> = {}): string {
  const dir = path.join(root, track, slug);
  fs.mkdirSync(path.join(dir, '.exercism'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.exercism', 'metadata.json'), '{}');
  const solution = `${slug.replace(/-/g, '_')}.py`;
  fs.writeFileSync(path.join(dir, '.exercism', 'config.json'), JSON.stringify({ files: { solution: [solution] } }));
  fs.writeFileSync(path.join(dir, solution), 'pass\n');
  for (const [name, content] of Object.entries(files)) { fs.writeFileSync(path.join(dir, name), content); }
  return dir;
}

afterEach(() => {
  for (const dir of created.splice(0)) { fs.rmSync(dir, { recursive: true, force: true }); }
});

describe('scanWorkspace', () => {
  it('finds exercises grouped by track and records which documents exist', async () => {
    const root = tempDir();
    addExercise(root, 'python', 'bob', { 'README.md': '# Bob' });
    addExercise(root, 'rust', 'leap', { 'HINTS.md': 'hint' });

    const tracks = await scanWorkspace(root);
    const python = tracks.find(t => t.slug === 'python')!;
    const rust = tracks.find(t => t.slug === 'rust')!;
    expect(python.exercises).toMatchObject([{ slug: 'bob', track: 'python', hasReadme: true, hasHints: false, isIncomplete: false }]);
    expect(rust.exercises).toMatchObject([{ slug: 'leap', hasReadme: false, hasHints: true }]);
  });

  it('ignores folders that are not exercises and tracks with none', async () => {
    const root = tempDir();
    fs.mkdirSync(path.join(root, 'notes', 'ideas'), { recursive: true });
    fs.writeFileSync(path.join(root, 'stray-file.txt'), '');
    addExercise(root, 'python', 'bob');
    fs.mkdirSync(path.join(root, 'python', 'scratch'));

    const tracks = await scanWorkspace(root);
    expect(tracks.map(t => t.slug)).toEqual(['python']);
    expect(tracks[0].exercises.map(e => e.slug)).toEqual(['bob']);
  });

  it('records when the solution was last edited', async () => {
    const root = tempDir();
    const dir = addExercise(root, 'python', 'bob');
    const edited = new Date('2026-10-01T12:00:00Z');
    fs.utimesSync(path.join(dir, 'bob.py'), edited, edited);

    const [track] = await scanWorkspace(root);
    expect(track.exercises[0].lastModified).toBe(edited.getTime());
  });

  it('returns nothing for a missing folder', async () => {
    expect(await scanWorkspace(path.join(tempDir(), 'missing'))).toEqual([]);
  });
});

describe('WorkspaceScanner.getWorkspacePath', () => {
  it('uses the CLI workspace when it exists', async () => {
    const cliRoot = tempDir();
    const scanner = new WorkspaceScanner(async () => ({ workspace: cliRoot }), tempDir());
    expect(await scanner.getWorkspacePath()).toBe(cliRoot);
  });

  it('falls back to the default folder when the CLI fails or points nowhere', async () => {
    const fallback = tempDir();
    const failing = new WorkspaceScanner(async () => { throw new Error('no cli'); }, fallback);
    const missing = new WorkspaceScanner(async () => ({ workspace: '/no/such/folder' }), fallback);
    expect(await failing.getWorkspacePath()).toBe(fallback);
    expect(await missing.getWorkspacePath()).toBe(fallback);
  });

  it('returns undefined when no candidate exists', async () => {
    const scanner = new WorkspaceScanner(async () => ({ workspace: '' }), '/no/such/folder');
    expect(await scanner.getWorkspacePath()).toBeUndefined();
  });
});
