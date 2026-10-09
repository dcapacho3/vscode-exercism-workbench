import { Exercise, ExerciseStatus } from '../models/exercise';

/** Everything the page needs; kept free of the vscode API so it can be unit tested. */
export interface InstructionsPage {
  exercise: Exercise;
  /** Rendered HTML for each document, or undefined when the file is missing. */
  readme?: string;
  hints?: string;
  help?: string;
  styleUri: string;
  scriptUri: string;
  cspSource: string;
  nonce: string;
}

const STATUS_LABELS: Record<ExerciseStatus, string> = {
  [ExerciseStatus.Published]: 'Published',
  [ExerciseStatus.Completed]: 'Completed',
  [ExerciseStatus.Iterated]: 'Submitted',
  [ExerciseStatus.Started]: 'In progress',
  [ExerciseStatus.Downloaded]: 'In progress',
  [ExerciseStatus.Available]: 'Available',
  [ExerciseStatus.Locked]: 'Locked',
};

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function hasIteration(status: ExerciseStatus): boolean {
  return status === ExerciseStatus.Iterated
    || status === ExerciseStatus.Completed
    || status === ExerciseStatus.Published;
}

export function renderInstructionsPage(page: InstructionsPage): string {
  const { exercise, nonce } = page;
  const tabs = [
    { id: 'instructions', label: 'Instructions', html: page.readme ?? '<p class="empty">This exercise has no README.</p>' },
    ...(page.hints ? [{ id: 'hints', label: 'Hints', html: page.hints }] : []),
    ...(page.help ? [{ id: 'help', label: 'Help', html: page.help }] : []),
  ];
  const tabList = tabs.length > 1
    ? `<nav class="tabs" role="tablist" aria-label="Exercise documents">${tabs.map((tab, i) =>
      `<button class="tab" role="tab" id="tab-${tab.id}" aria-controls="doc-${tab.id}" aria-selected="${i === 0}" data-tab="${tab.id}">${tab.label}</button>`,
    ).join('')}</nav>`
    : '';
  const documents = tabs.map((tab, i) =>
    `<article class="doc" role="tabpanel" id="doc-${tab.id}" aria-labelledby="tab-${tab.id}"${i === 0 ? '' : ' hidden'}>${tab.html}</article>`,
  ).join('\n');

  const submitLabel = hasIteration(exercise.status) ? 'Submit new iteration' : 'Submit solution';
  const completeButton = exercise.status === ExerciseStatus.Iterated
    ? '<button class="button" data-command="markComplete">Mark as complete</button>'
    : '';
  const csp = [
    `default-src 'none'`,
    `style-src ${page.cspSource} 'nonce-${nonce}'`,
    // READMEs align table cells with style attributes; <style> blocks still need the nonce.
    `style-src-attr 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    `img-src ${page.cspSource} https: data:`,
  ].join('; ');
  const title = `${escapeHtml(exercise.name)} · ${escapeHtml(exercise.track)}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${page.styleUri}">
  <title>${title}</title>
</head>
<body data-exercise="${escapeHtml(`${exercise.track}/${exercise.slug}`)}">
  <header class="masthead">
    <p class="eyebrow">${escapeHtml(exercise.track)}</p>
    <h1>${escapeHtml(exercise.name)}</h1>
    <ul class="facts">
      <li class="fact status-${exercise.status}">${STATUS_LABELS[exercise.status] ?? 'Exercise'}</li>
      ${exercise.difficulty ? `<li class="fact">${escapeHtml(exercise.difficulty)}</li>` : ''}
      ${exercise.isRecommended ? '<li class="fact recommended">Recommended next</li>' : ''}
    </ul>
    ${tabList}
  </header>
  <main>
${documents}
  </main>
  <footer class="actions">
    <div class="actions-main">
      <button class="button primary" data-command="runTests">Run tests</button>
      <button class="button" data-command="submit">${submitLabel}</button>
      ${completeButton}
    </div>
    <div class="actions-extra">
      <button class="button quiet" data-command="copyInstructions" title="Copy the README as Markdown">Copy</button>
      <button class="button quiet" data-command="openReadme" title="Open README.md in an editor">README</button>
      <button class="button quiet" data-command="openInBrowser" title="Open this exercise on exercism.org">Open on Exercism</button>
    </div>
  </footer>
  <script nonce="${nonce}" src="${page.scriptUri}"></script>
</body>
</html>`;
}
