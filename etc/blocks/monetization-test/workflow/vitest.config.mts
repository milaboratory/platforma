import { createVitestConfig } from '@milaboratories/build-configs';
import { defineConfig } from 'vitest/config';

export default defineConfig(
  createVitestConfig({
    test: {
      maxConcurrency: 3,
      testTimeout: 5000,
    },
  }),
);
