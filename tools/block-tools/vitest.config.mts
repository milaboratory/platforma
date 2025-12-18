import { createVitestConfig } from '@milaboratories/build-configs';
import { defineProject } from 'vitest/config';

export default defineProject(
  createVitestConfig({
    test: {
      coverage: {
        exclude: ['**/*.js'],
      },
    },
  }),
);

