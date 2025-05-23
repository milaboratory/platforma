import { defineConfig } from 'vitest/config';
import viteCfg from './vite.config.mjs';

export default defineConfig({
  ...viteCfg,
  test: {
    watch: false,
    coverage: {
      exclude: ['src/proto'],
      include: ['src'],
    }
  }
});
