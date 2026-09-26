import * as fs from 'fs';
import * as path from 'path';

export interface SolutionFileInspection {
  files: string[];
  missing: string[];
  usesExerciseConfig: boolean;
  isIncomplete: boolean;
}

const DOCUMENTATION_FILES = new Set(['README.md', 'HELP.md', 'HINTS.md']);

export function inspectSolutionFiles(exercisePath: string): SolutionFileInspection {
  const configPath = path.join(exercisePath, '.exercism', 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (Array.isArray(config.files?.solution)) {
        const candidates: unknown[] = config.files.solution;
        const expected = candidates
          .filter((file: unknown): file is string => typeof file === 'string' && file.length > 0);
        const files = expected
          .map(file => path.join(exercisePath, file))
          .filter(file => fs.existsSync(file));
        const missing = expected.filter(file => !fs.existsSync(path.join(exercisePath, file)));
        return { files, missing, usesExerciseConfig: true, isIncomplete: missing.length > 0 };
      }
    } catch {
      // Fall back to a conservative root-file scan.
    }
  }

  try {
    const files = fs.readdirSync(exercisePath, { withFileTypes: true })
      .filter(entry => entry.isFile())
      .filter(entry => !entry.name.startsWith('.'))
      .filter(entry => !entry.name.toLowerCase().includes('test'))
      .filter(entry => !DOCUMENTATION_FILES.has(entry.name))
      .map(entry => path.join(exercisePath, entry.name));
    const metadataExists = fs.existsSync(path.join(exercisePath, '.exercism', 'metadata.json'));
    const configExists = fs.existsSync(configPath);
    return {
      files,
      missing: files.length === 0 && metadataExists ? [configExists ? 'valid .exercism/config.json' : '.exercism/config.json'] : [],
      usesExerciseConfig: false,
      isIncomplete: files.length === 0 && metadataExists,
    };
  } catch {
    return { files: [], missing: [], usesExerciseConfig: false, isIncomplete: false };
  }
}
