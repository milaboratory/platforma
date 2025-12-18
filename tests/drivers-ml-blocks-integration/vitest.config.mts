import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'threads',
    watch: false,
    passWithNoTests: true,
    testTimeout: 10000,
    coverage: {
      include: ['src'],
      provider: 'istanbul',
      reporter: ['lcov', 'text'],
      reportsDirectory: './coverage'
    }
  }
});
