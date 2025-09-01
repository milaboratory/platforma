import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    watch: false,
    testTimeout: 15000,
    maxConcurrency: 1, // do not run tests of one file in parallel, even when they are marked with .concurrent()
    maxWorkers: 2,
    minWorkers: 1,
    // fileParallelism: false // is equal to minWorkers = 1, maxWorkwrs = 1
    retry: 2,


    reporters: ['verbose'],
    
    // --- Order / Sharding
    sequence: {
      shuffle: { files: true, tests: true }, // randomize order of files and tests to smoke out hidden coupling
      seed: Number(process.env.VITEST_SEED ?? Date.now()),
      concurrent: false, // run tests per-file sequentially by default
    },
  }
});
