import { describe, expect, it } from 'vitest';
import { Exercise, ExerciseStatus } from '../models/exercise';
import { InstructionsPage, renderInstructionsPage } from '../webview/instructionsHtml';

function page(overrides: Partial<Exercise> = {}, documents: Partial<InstructionsPage> = {}): string {
  return renderInstructionsPage({
    exercise: {
      slug: 'card-games',
      name: 'Card Games',
      track: 'python',
      path: '/tmp/card-games',
      status: ExerciseStatus.Started,
      hasReadme: true,
      hasHints: false,
      hasHelp: false,
      ...overrides,
    },
    readme: '<p>Read me</p>',
    styleUri: 'styles.css',
    scriptUri: 'panel.js',
    cspSource: 'vscode-resource:',
    nonce: 'abc123',
    ...documents,
  });
}

describe('instructions page', () => {
  it('shows no tabs when the README is the only document', () => {
    expect(page()).not.toContain('role="tablist"');
  });

  it('adds a tab for each extra document, with only the first visible', () => {
    const html = page({}, { hints: '<p>hint</p>', help: '<p>help</p>' });
    expect(html).toContain('data-tab="hints"');
    expect(html).toContain('data-tab="help"');
    expect(html).toContain('id="doc-instructions" aria-labelledby="tab-instructions">');
    expect(html).toContain('id="doc-hints" aria-labelledby="tab-hints" hidden>');
  });

  it('labels submit by whether an iteration exists', () => {
    expect(page()).toContain('Submit solution');
    expect(page({ status: ExerciseStatus.Iterated })).toContain('Submit new iteration');
    expect(page({ status: ExerciseStatus.Completed })).toContain('Submit new iteration');
  });

  it('offers Mark as complete only for a submitted, unfinished exercise', () => {
    expect(page({ status: ExerciseStatus.Iterated })).toContain('data-command="markComplete"');
    expect(page({ status: ExerciseStatus.Started })).not.toContain('data-command="markComplete"');
    expect(page({ status: ExerciseStatus.Completed })).not.toContain('data-command="markComplete"');
  });

  it('escapes exercise fields and ties the script to the nonce', () => {
    const html = page({ name: '<img src=x onerror=alert(1)>' });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain(`script-src 'nonce-abc123'`);
    expect(html).toContain('<script nonce="abc123" src="panel.js">');
  });

  it('says so when the README is missing', () => {
    expect(page({}, { readme: undefined })).toContain('This exercise has no README.');
  });
});
