import { createVitestConfig } from '@milaboratories/build-configs';
import { defineProject } from 'vitest/config';

export default defineProject(
  createVitestConfig({
    test: {
      maxConcurrency: 3,
      testTimeout: 5000,
    },
  }),
);
