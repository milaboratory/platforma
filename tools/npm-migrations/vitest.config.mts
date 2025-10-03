import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    watch: false,
    testTimeout: 10000,
    maxConcurrency: 1,
    include: ['src/**/*.test.ts'],
  }
});


