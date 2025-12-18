import { createVitestConfig } from '@milaboratories/build-configs';
import { defineProject } from 'vitest/config';

export default defineProject(
  createVitestConfig({
    test: {
      testTimeout: 80000,
      hookTimeout: 80000,
    },
  }),
);
