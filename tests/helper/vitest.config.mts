import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'threads',
    watch: false,
    passWithNoTests: true,
    coverage: {
      include: ['src/**/*.{ts,js,vue,mts,mjs,cts,cjs}'],
      exclude: ['**/*.js'],
      provider: 'istanbul',
      reporter: ['lcov', 'text'],
      reportsDirectory: './coverage',
    },
  },
});
