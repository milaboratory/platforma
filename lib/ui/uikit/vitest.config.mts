import { fileURLToPath } from 'node:url';
import { createVitestConfig } from '@milaboratories/build-configs';
import { configDefaults, defineProject, mergeConfig } from 'vitest/config';
import viteConfig from './build.browser-lib.config';

export default defineProject((configEnv) =>
  createVitestConfig(
    mergeConfig(viteConfig(configEnv), {
      test: {
        setupFiles: ['./src/__tests__/setup.ts'],
        environment: 'jsdom',
        exclude: [...configDefaults.exclude, 'e2e/**'],
        root: fileURLToPath(new URL('./', import.meta.url)),
      },
    }),
  ),
);
