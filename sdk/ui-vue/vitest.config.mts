import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'threads',
    includeSource: ['src/**/*.{js,ts}'],
    passWithNoTests: true,
    coverage: {
      include: ['src/**/*.{ts,js,vue,mts,mjs,cts,cjs}'],
      provider: 'istanbul',
      reporter: ['lcov', 'text'],
      reportsDirectory: './coverage'
    }
  },
});
