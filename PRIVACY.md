# Privacy

Exercism Workbench has no analytics, advertising or telemetry of its own.

To do its job, the extension:

- runs the Exercism CLI installed on your machine to configure it, download
  exercises, run tests and submit solutions;
- reads the API token saved in the CLI's configuration;
- sends that token only to `https://api.exercism.org`, to read your tracks,
  exercises and solutions and, when you confirm Mark as Complete, to mark a
  solution complete;
- reads track exercise lists from `https://raw.githubusercontent.com/exercism/`
  without a token, but only when the Exercism API cannot be reached;
- opens `https://exercism.org` in your browser when you ask; and
- stores a copy of your progress in VS Code's extension storage.

The token never appears in logs or exported progress, and it is never sent to
the extension's author. The clipboard and file import commands only read data
you give them.

For how Exercism handles your account data, see Exercism's own privacy policy.
