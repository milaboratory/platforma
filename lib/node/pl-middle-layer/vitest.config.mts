import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.mts';

export default defineConfig(
  mergeConfig(
    viteConfig, {
    test: {
        globals: true,
        watch: false,
        testTimeout: 80000,
        hookTimeout: 80000, 
      }
    }
  )
);
