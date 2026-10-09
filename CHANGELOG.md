# Changelog

## 0.8.0

- Order tracks by recent activity: the latest of Exercism's last activity on
  the track and the last time a solution file was saved. Saving a solution
  moves its track to the top.
- Show each track's completed count beside its name, and its last activity in
  the tooltip.
- Watch the workspace folder the CLI uses for new downloads. The watcher used
  to ignore the CLI setting and always watch ~/exercism.
- Keep tracks expanded or collapsed across refreshes.

## 0.7.0

- Rebuild the instructions panel. Hints and Help now open as tabs next to the
  instructions instead of fold-out sections at the bottom, and each tab keeps
  its own scroll position.
- Color code blocks with the current VS Code theme.
- Arrow keys move between tabs.

## 0.6.3

- Show why a submit failed. The CLI prints API errors to stderr, which was
  dropped, so the message read "Submit failed:" with nothing after it.
- Explain the two common submit failures: no changes since the last
  iteration, and Exercism's rate limit.
- Explain HTTP 429 from Exercism as a rate limit wherever it appears.
- Reword messages to be shorter and plainer.
- Split the command code out of extension.ts into one module per area.

## 0.6.2

- Add Submit Anyway to the lint warning shown before a submit, so a warning
  from an unrelated extension cannot block submitting.

## 0.6.1

- Render the raw HTML some exercise instructions use, such as tables and line
  breaks, instead of showing the tags as text. Allow inline style attributes so
  their alignment shows as it does on the website.

## 0.6.0

- Mark exercises complete from VS Code. The CLI has no command for this, so
  the extension calls the same Exercism API endpoint the website uses, with
  the CLI token, after asking for confirmation. The instructions panel gains
  a "Mark as complete" button for submitted exercises.
- Refuse to submit while VS Code reports errors or warnings in the solution
  files, since Exercism's analyzer flags lint problems.

## 0.5.2

- Show submitted exercises as "submitted" and replace the Submit Solution
  button with Submit New Iteration once the first iteration is in.
- Add Mark as Complete, which opens the exercise page on Exercism, since the
  CLI cannot mark a solution complete. Submitting also offers it.

## 0.5.1

- Treat an exercise as incomplete when a test file listed in
  `.exercism/config.json` is missing, so the Repair Download prompt appears
  instead of the test run failing with "file not found".
- Keep existing solution code when Repair Download runs, since
  `exercism download --force` overwrites every file.

## 0.5.0

- Verify the complete browse, download, open, test, submit, and progress-sync
  workflow for the Python track. Other tracks remain best-effort while their
  language-specific toolchains are evaluated.

- Rename the extension to Exercism Workbench with an independent command and
  settings namespace.
- Add a distinct brace-and-check icon and a cleaner, responsive instruction
  reader.
- Add configurable background synchronization with a five-minute default
  interval and a manual-only option.
- Separate progress retrieval, status resolution, and synchronization policy
  into tested modules.
- Add validation and pagination safeguards for Exercism API responses.
- Replace file-based debug logging with VS Code output channels.
- Add linting, type checking, 42 automated tests, dependency auditing, and
  public project documentation.
- Update production and build dependencies; the production dependency audit
  now reports no known vulnerabilities.

## 0.4.3

- Synchronize progress silently when the Exercism sidebar becomes visible or VS Code regains focus.
- Debounce background synchronization and share in-flight requests to avoid duplicate API traffic.

## 0.4.2

- Rebuild expanded track children after every refresh so a successful progress sync cannot leave stale exercise statuses visible.
- Fix completed exercises such as Grains or Black Jack remaining visually in progress until the entire VS Code window was reloaded.

## 0.4.1

- Distinguish completed downloaded exercises from in-progress exercises in the tree view.
- Show explicit completed/published status text next to each exercise.
- Hide the inline upload action for completed exercises while retaining a deliberate **Submit New Iteration** context action.

## 0.4.0

- Synchronize progress automatically through `api.exercism.org/v2` using the existing Exercism CLI token.
- Retrieve all joined tracks, exercises, recommendations, unlock states, and paginated solutions with one click.
- Keep the guided clipboard workflow as a fallback command.
- Use the dedicated API host for the ordinary track, exercise, and solution requests to avoid website Cloudflare challenges.

## 0.3.2

- Apply the completed-progress lifecycle fix to testing, submission, and configuration notifications.
- Suppress result notifications when a cancellable test or submission is cancelled.

## 0.3.1

- Close the download progress notification before showing the downloaded-exercise action, preventing a completed download from appearing stuck.

## 0.3.0

- Add guided web-progress sync using the normal browser and VS Code clipboard, with no browser add-on required.
- Accept ordinary Exercism tracks, exercises, and solutions API responses in addition to combined export files.
- Merge incremental sync data into the locally saved snapshot without discarding previously imported progress.
- Open the exact authenticated API pages and provide retry, reopen, and skip controls for each step.

## 0.2.0

- Add a personal browser userscript that exports joined tracks, exercises, recommendations, and paginated solution progress.
- Add `Exercism: Import Web Progress` and persist imported progress in VS Code.
- Display joined web tracks even when no exercise has been downloaded locally.
- Use Exercism's authoritative completion and concept counts in the sidebar.
- Merge web status with locally downloaded exercise files.

## 0.1.4

- Fall back to official Exercism track repositories when Cloudflare blocks the catalog API.
- Show local tracks and allow manual track entry when the remote track list is unavailable.
- Report invalid or empty API responses instead of displaying an empty picker.

## [0.1.1] - 2026-03-28

### Changed
- Optimize bundle size from 2MB to 361KB by importing only Exercism-relevant highlight.js languages instead of all 197

## [0.1.0] - 2026-03-28

### Added
- Sidebar Tree View for browsing tracks and exercises
- Exercise instruction preview with Markdown rendering
- One-click test running via `exercism test`
- Solution submission from within VS Code
- Download exercises without leaving the editor
- Theme-aware Webview (light/dark/high-contrast)
- Configurable CLI path and workspace location
