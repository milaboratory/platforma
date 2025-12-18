import { resolve } from 'path';
import { createVitestConfig } from '@milaboratories/build-configs';
import { defineProject } from 'vitest/config';

export default defineProject(
  createVitestConfig({
    test: {
      testTimeout: 80000,
      hookTimeout: 80000,
    },
    define: {
      __WORKER_PATH__: JSON.stringify(resolve(__dirname, 'dist', 'worker', 'worker.js')),
    },
  }),
);

