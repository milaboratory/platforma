import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'threads',
    watch: false,
    maxConcurrency: 3,
    testTimeout: 5000
  }
});
