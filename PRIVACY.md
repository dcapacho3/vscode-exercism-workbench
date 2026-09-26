# Privacy

Exercism Workbench does not include analytics, advertising, or independent
telemetry.

To provide its features, the extension:

- runs the locally installed Exercism CLI for configuration, downloads, tests,
  and submissions;
- reads the Exercism API token stored in the CLI configuration;
- sends authenticated progress requests only to `https://api.exercism.org`;
- opens `https://exercism.org` in your browser when requested; and
- stores a progress snapshot in VS Code's extension storage.

The API token is not written to logs, included in exported progress files, or
sent to the extension author. Clipboard and file import commands only process
data you explicitly provide.

For Exercism's own handling of account data, consult Exercism's privacy policy.

