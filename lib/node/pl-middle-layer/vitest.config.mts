import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    watch: false,
    testTimeout: 80000,
    hookTimeout: 80000,
  },
  define: {
    __WORKER_PATH__: JSON.stringify(resolve(__dirname, 'dist', 'worker', 'worker.js')),
  },
});

