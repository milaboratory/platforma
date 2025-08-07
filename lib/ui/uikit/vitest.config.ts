import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './build.browser-lib.config';

export default defineConfig((configEnv) => mergeConfig(
  viteConfig(configEnv),
  {
    test: {
      setupFiles: ['./src/__tests__/setup.ts'],
      environment: 'jsdom',
      exclude: [...configDefaults.exclude, 'e2e/**'],
      root: fileURLToPath(new URL('./', import.meta.url)),
    },
  },
));
