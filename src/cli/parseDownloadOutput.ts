import * as path from 'path';

export function parseDownloadPath(output: string): string | undefined {
  const lines = output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  for (const line of [...lines].reverse()) {
    const labelled = line.match(/^Downloaded to\s+(.+)$/i)?.[1]?.trim();
    const candidate = labelled ?? line;
    if (path.isAbsolute(candidate)) { return candidate; }
  }
  return undefined;
}

