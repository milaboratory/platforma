import { createVitestConfig } from '@milaboratories/build-configs';
import { defineProject } from 'vitest/config';

export default defineProject(
  createVitestConfig({
    test: {
      testTimeout: 10000,
      maxConcurrency: 1,
    },
  }),
);
