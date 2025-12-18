import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'threads',
    environment: 'node',
    passWithNoTests: true,
    include: ['tests/**/*.test.ts'],
    coverage: {
      include: ['src'],
      provider: 'istanbul',
      reporter: ['lcov', 'text'],
      reportsDirectory: './coverage'
    }
  }
});
