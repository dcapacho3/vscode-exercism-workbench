// Runs inside the instructions panel. Buttons post their data-command to the extension;
// tabs switch documents and remember the open tab and its scroll position.
(function () {
  const vscode = acquireVsCodeApi();
  const exercise = document.body.dataset.exercise;
  const saved = vscode.getState();
  // The panel is reused across exercises, so only restore state saved for this one.
  const state = saved && saved.exercise === exercise ? saved : { exercise, tab: 'instructions', scroll: {} };
  const tabs = Array.from(document.querySelectorAll('.tab'));

  function showTab(id) {
    if (!document.getElementById('doc-' + id)) { id = 'instructions'; }
    for (const tab of tabs) {
      const selected = tab.dataset.tab === id;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      document.getElementById('doc-' + tab.dataset.tab).hidden = !selected;
    }
    state.tab = id;
    vscode.setState(state);
    window.scrollTo(0, state.scroll[id] || 0);
  }

  for (const tab of tabs) {
    tab.addEventListener('click', () => showTab(tab.dataset.tab));
    // Arrow keys move between tabs, as screen-reader users expect from a tab list.
    tab.addEventListener('keydown', event => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') { return; }
      const step = event.key === 'ArrowRight' ? 1 : -1;
      const next = tabs[(tabs.indexOf(tab) + step + tabs.length) % tabs.length];
      showTab(next.dataset.tab);
      next.focus();
    });
  }

  for (const button of document.querySelectorAll('[data-command]')) {
    button.addEventListener('click', () => vscode.postMessage({ command: button.dataset.command }));
  }

  window.addEventListener('scroll', () => {
    state.scroll[state.tab] = window.scrollY;
    vscode.setState(state);
  });

  showTab(state.tab);
})();
