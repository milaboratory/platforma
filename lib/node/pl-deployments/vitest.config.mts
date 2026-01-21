import { createVitestConfig } from '@milaboratories/build-configs';
import { defineConfig } from 'vitest/config';

export default defineConfig(
  createVitestConfig({
    test: {
      testTimeout: 80000,
      hookTimeout: 80000,
    },
  }),
);
