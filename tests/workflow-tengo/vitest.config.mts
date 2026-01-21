import { createVitestConfig } from '@milaboratories/build-configs';
import { defineConfig } from 'vitest/config';

export default defineConfig(
  createVitestConfig({
    test: {
      pool: 'forks',
      setupFiles: ['./vitest/setup.worker-jitter.ts'],
      testTimeout: 15000,
      maxConcurrency: 1,
      maxWorkers: 2,
      retry: 2,
      reporters: ['verbose'],
      sequence: {
        shuffle: { files: true, tests: true },
        seed: Number(process.env.VITEST_SEED ?? Date.now()),
        concurrent: false,
      },
    },
  }),
);
