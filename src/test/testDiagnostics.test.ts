import { describe, expect, it } from 'vitest';
import { combineProcessOutput, diagnoseTestFailure } from '../cli/testDiagnostics';

describe('test failure diagnostics', () => {
  it('recognizes an outdated Rust toolchain for edition 2024', () => {
    const diagnostic = diagnoseTestFailure('feature `edition2024` is required');
    expect(diagnostic?.message).toContain('1.85');
    expect(diagnostic?.helpLabel).toBe('Rust Setup');
  });

  it('recognizes an unconfigured C++ build', () => {
    const diagnostic = diagnoseTestFailure('make: No targets specified and no makefile found. Stop.');
    expect(diagnostic?.helpLabel).toBe('C++ Test Guide');
  });

  it('does not invent guidance for an ordinary assertion failure', () => {
    expect(diagnoseTestFailure('Expected 2 but received 3')).toBeUndefined();
  });

  it('classifies unknown missing-tool errors without knowing the track', () => {
    const diagnostic = diagnoseTestFailure('frobnicator: command not found');
    expect(diagnostic?.kind).toBe('environment');
    expect(diagnostic?.message).toContain('required local tool');
  });

  it('classifies generic project setup failures', () => {
    const diagnostic = diagnoseTestFailure('failed to parse manifest at /project/file');
    expect(diagnostic?.kind).toBe('setup');
  });

  it('deduplicates identical stdout and stderr', () => {
    expect(combineProcessOutput('same output\n', 'same output\n', 'ignored')).toBe('same output');
  });

  it('uses the error message only when the process produced no output', () => {
    expect(combineProcessOutput('', '', 'command failed')).toBe('command failed');
  });
});
