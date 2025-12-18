import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'threads',
    watch: false,
    passWithNoTests: true,
    testTimeout: 80000,
    hookTimeout: 80000,
    coverage: {
      include: ['src'],
      provider: 'istanbul',
      reporter: ['lcov', 'text'],
      reportsDirectory: './coverage'
    }
  },
  define: {
    __WORKER_PATH__: JSON.stringify(resolve(__dirname, 'dist', 'worker', 'worker.js')),
  },
});

