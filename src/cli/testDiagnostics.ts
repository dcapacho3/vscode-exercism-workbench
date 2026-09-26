export interface TestDiagnostic {
  kind: 'environment' | 'setup';
  message: string;
  helpUrl?: string;
  helpLabel?: string;
}

export function diagnoseTestFailure(output: string): TestDiagnostic | undefined {
  const normalized = output.toLowerCase();

  if (normalized.includes('feature `edition2024` is required')
    || normalized.includes('edition 2024 is unstable')) {
    return {
      kind: 'environment',
      message: 'This exercise requires Rust/Cargo 1.85 or newer for Rust 2024 edition support. Update with `rustup update stable`, then run the tests again.',
      helpUrl: 'https://www.rust-lang.org/tools/install',
      helpLabel: 'Rust Setup',
    };
  }

  if (normalized.includes('cargo: command not found')
    || normalized.includes('executable file not found') && normalized.includes('cargo')) {
    return {
      kind: 'environment',
      message: 'Cargo was not found. Install a current Rust toolchain, then run the tests again.',
      helpUrl: 'https://www.rust-lang.org/tools/install',
      helpLabel: 'Rust Setup',
    };
  }

  if (normalized.includes('no makefile found') || normalized.includes('no targets specified')) {
    return {
      kind: 'setup',
      message: 'The C++ build has not been configured. Exercism Workbench attempted the CMake setup; check the output for the configuration error.',
      helpUrl: 'https://exercism.org/docs/tracks/cpp/tests',
      helpLabel: 'C++ Test Guide',
    };
  }

  const environmentSignals = [
    'command not found',
    'not recognized as an internal or external command',
    'permission denied',
    'unsupported toolchain',
    'unsupported compiler',
    'requires a newer version',
    'is not installed',
    'could not find compiler',
    'compiler identification is unknown',
  ];
  if (environmentSignals.some(signal => normalized.includes(signal))) {
    return {
      kind: 'environment',
      message: 'The test runner could not start because a required local tool is missing, outdated, or unavailable. Review the output and the track setup guide.',
    };
  }

  const setupSignals = [
    'failed to parse manifest',
    'could not resolve dependencies',
    'no such file or directory',
    'cannot find module',
    'module not found',
  ];
  if (setupSignals.some(signal => normalized.includes(signal))) {
    return {
      kind: 'setup',
      message: 'The test runner stopped during project setup. Review the output, local exercise help, and the track test guide.',
    };
  }

  return undefined;
}

export function combineProcessOutput(
  stdout?: string,
  stderr?: string,
  fallbackMessage?: string,
): string {
  const parts = [stdout, stderr]
    .map(part => part?.trim())
    .filter((part): part is string => !!part);
  const unique = [...new Set(parts)];
  if (unique.length > 0) { return unique.join('\n\n'); }
  return fallbackMessage?.trim() ?? '';
}
