# Contributing

Thanks for helping improve Exercism Workbench.

## Development setup

Requirements: Node.js 22+, npm, VS Code, and the Exercism CLI.

```bash
npm ci
npm run verify
```

Press `F5` in VS Code to launch an Extension Development Host. Use
`npm run watch` while editing TypeScript.

## Pull requests

- Keep changes focused and explain the user-facing behavior they affect.
- Add or update tests for progress parsing, status resolution, and sync policy
  changes.
- Run `npm run verify` before opening a pull request.
- Do not commit API tokens, downloaded solutions, personal progress exports, or
  packaged `.vsix` files.

For large behavioral or UI changes, open an issue first so the approach can be
discussed.

