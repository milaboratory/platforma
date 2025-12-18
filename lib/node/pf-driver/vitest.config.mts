import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    coverage: {
      include: ['src'],
      provider: 'istanbul',
      reporter: ['lcov', 'text'],
      reportsDirectory: './coverage'
    }
  }
});
