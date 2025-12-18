import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      './etc/blocks/*/*',
      './etc/uikit-playground',
      './lib/model/*',
      './lib/node/*',
      './lib/other/*',
      './lib/ptabler/*',
      './lib/ui/*',
      './lib/util/*',
      './sdk/*',
      './tests/*',
      './tools/*',
    ],
  },
});
