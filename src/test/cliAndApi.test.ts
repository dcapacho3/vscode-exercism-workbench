import { describe, expect, it } from 'vitest';
import { catalogFromApi, catalogFromTrackConfig } from '../api/exercismApi';
import { parseConfigureOutput } from '../cli/exercismCli';
import { ProcessError, runProcess } from '../cli/process';

describe('parseConfigureOutput', () => {
  it('reads the token and workspace past the flag hints', () => {
    const output = [
      'You have configured the Exercism command-line client:',
      '',
      'Config dir:                       /home/me/.config/exercism',
      'Token:         (-t, --token)      abc-123',
      'Workspace:     (-w, --workspace)  /home/me/exercism',
      'API Base URL:  (-a, --api)        https://api.exercism.org/v1',
    ].join('\n');
    expect(parseConfigureOutput(output)).toEqual({ token: 'abc-123', workspace: '/home/me/exercism' });
  });

  it('handles lines without flag hints and missing fields', () => {
    expect(parseConfigureOutput('Workspace: /tmp/ws\n')).toEqual({ workspace: '/tmp/ws', token: '' });
  });
});

describe('exercise catalogs', () => {
  it('reads the v2 API list with safe defaults', () => {
    expect(catalogFromApi({ exercises: [{ slug: 'bob', difficulty: 'easy', is_unlocked: true }] })).toEqual([
      { slug: 'bob', title: 'bob', difficulty: 'easy', isUnlocked: true, isRecommended: false },
    ]);
    expect(catalogFromApi({})).toEqual([]);
  });

  it('reads a track config with concept exercises first and without retired ones', () => {
    const catalog = catalogFromTrackConfig({
      exercises: {
        practice: [{ slug: 'bob', name: 'Bob', difficulty: 2 }, { slug: 'old', status: 'deprecated' }],
        concept: [{ slug: 'lasagna', name: 'Lasagna' }, { slug: 'draft', status: 'wip' }],
      },
    });
    expect(catalog.map(e => [e.slug, e.difficulty])).toEqual([['lasagna', 'concept'], ['bob', 'difficulty 2']]);
  });
});

describe('runProcess', () => {
  const node = process.execPath;

  it('returns what the program printed', async () => {
    const result = await runProcess(node, ['-e', 'console.log("out"); console.error("err")'], { timeoutMs: 10000 });
    expect(result).toEqual({ stdout: 'out\n', stderr: 'err\n' });
  });

  it('keeps the output and exit code of a failing program', async () => {
    const error = await runProcess(node, ['-e', 'console.error("broken"); process.exit(3)'], { timeoutMs: 10000 })
      .catch(e => e);
    expect(error).toBeInstanceOf(ProcessError);
    expect(error.code).toBe(3);
    expect(error.output).toBe('broken');
  });

  it('reports a missing program as ENOENT', async () => {
    const error = await runProcess('no-such-program-xyz', [], { timeoutMs: 10000 }).catch(e => e);
    expect(error.code).toBe('ENOENT');
  });
});
