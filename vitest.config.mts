import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

const configDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/test/**/*.test.ts'],
  },
  resolve: {
    alias: {
      vscode: path.resolve(configDirectory, 'src/test/__mocks__/vscode.ts'),
    },
  },
});
