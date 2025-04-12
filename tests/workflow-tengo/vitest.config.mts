import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    watch: false,
    testTimeout: 15000,
    maxWorkers: 2,
    minWorkers: 1,
    // fileParallelism: false // is equal to minWorkers = 1, maxWorkwrs = 1
  }
});
