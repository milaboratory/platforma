import { createVitestConfig } from '@milaboratories/build-configs';
import { defineProject } from 'vitest/config';

export default defineProject(
  createVitestConfig({
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts'],
      coverage: {
        exclude: ['node_modules/', 'dist/', 'tests/', '**/*.d.ts'],
      },
    },
  }),
);
