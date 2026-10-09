import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { inspectSolutionFiles } from '../workspace/solutionFiles';

const temporaryDirectories: string[] = [];

function exerciseDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'exercism-workbench-'));
  temporaryDirectories.push(directory);
  fs.mkdirSync(path.join(directory, '.exercism'));
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('inspectSolutionFiles', () => {
  it('uses the official exercise configuration to select solution files', () => {
    const directory = exerciseDirectory();
    fs.writeFileSync(path.join(directory, '.exercism', 'config.json'), JSON.stringify({
      files: { solution: ['bob.py'], test: ['bob_test.py'] },
    }));
    fs.writeFileSync(path.join(directory, 'bob.py'), 'def response(): pass\n');
    fs.writeFileSync(path.join(directory, 'bob_test.py'), 'tests\n');

    expect(inspectSolutionFiles(directory)).toEqual({
      files: [path.join(directory, 'bob.py')],
      missing: [],
      usesExerciseConfig: true,
      isIncomplete: false,
    });
  });

  it('reports an incomplete download when configured solution files are missing', () => {
    const directory = exerciseDirectory();
    fs.writeFileSync(path.join(directory, '.exercism', 'config.json'), JSON.stringify({
      files: { solution: ['bob.py'] },
    }));

    expect(inspectSolutionFiles(directory)).toEqual({
      files: [],
      missing: ['bob.py'],
      usesExerciseConfig: true,
      isIncomplete: true,
    });
  });

  it('reports an incomplete download when configured test files are missing', () => {
    const directory = exerciseDirectory();
    fs.writeFileSync(path.join(directory, '.exercism', 'config.json'), JSON.stringify({
      files: { solution: ['armstrong_numbers.py'], test: ['armstrong_numbers_test.py'] },
    }));
    fs.writeFileSync(path.join(directory, 'armstrong_numbers.py'), 'pass\n');

    expect(inspectSolutionFiles(directory)).toEqual({
      files: [path.join(directory, 'armstrong_numbers.py')],
      missing: ['armstrong_numbers_test.py'],
      usesExerciseConfig: true,
      isIncomplete: true,
    });
  });

  it('does not treat exercise documentation as a solution', () => {
    const directory = exerciseDirectory();
    fs.writeFileSync(path.join(directory, 'README.md'), 'instructions\n');
    fs.writeFileSync(path.join(directory, 'HELP.md'), 'help\n');
    fs.writeFileSync(path.join(directory, 'solution.py'), 'pass\n');

    expect(inspectSolutionFiles(directory).files).toEqual([
      path.join(directory, 'solution.py'),
    ]);
  });

  it('detects a metadata-only partial download with no exercise config', () => {
    const directory = exerciseDirectory();
    fs.writeFileSync(path.join(directory, '.exercism', 'metadata.json'), '{}');

    expect(inspectSolutionFiles(directory)).toEqual({
      files: [],
      missing: ['.exercism/config.json'],
      usesExerciseConfig: false,
      isIncomplete: true,
    });
  });
});
