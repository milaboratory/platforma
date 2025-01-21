import { defineConfig } from 'vitest/config';
import viteCfg from './vite.config.mjs';

export default defineConfig({
  ...viteCfg,
  test: {
    watch: false,
    testTimeout: 80000,
    hookTimeout: 80000, 
  }
});
