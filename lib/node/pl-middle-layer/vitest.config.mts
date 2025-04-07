import { defineConfig } from 'vitest/config';
import viteCfg from './vite.config.mjs';
import path from 'node:path';

export default defineConfig({
  ...viteCfg,
  test: {
    globals: true,
    watch: false,
    testTimeout: 80000,
    hookTimeout: 80000, 
  },
  define: {
    __WORKER_PATH__: JSON.stringify(path.resolve(__dirname, 'dist/worker.js')),
  },
});
