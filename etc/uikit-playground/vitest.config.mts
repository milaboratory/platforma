import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [vue()],
  test: {
    pool: 'threads',
    watch: false,
    passWithNoTests: true,
    coverage: {
      include: ['src/**/*.{ts,js,vue,mts,mjs,cts,cjs}'],
      provider: 'istanbul',
      reporter: ['lcov', 'text'],
      reportsDirectory: './coverage'
    }
  }
});
