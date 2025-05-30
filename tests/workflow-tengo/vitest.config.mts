import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    watch: false,
    testTimeout: 15000,
    maxConcurrency: 1, // do not run tests of one file in parallel, even when they are marked with .concurrent()
    maxWorkers: 2,
    minWorkers: 1,
    // fileParallelism: false // is equal to minWorkers = 1, maxWorkwrs = 1
  }
});
