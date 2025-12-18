import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [vue()],
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
