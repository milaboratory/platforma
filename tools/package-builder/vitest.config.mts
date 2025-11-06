import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'threads',
    watch: false,
    testTimeout: 10000,
    maxConcurrency: 1,
  }
});
