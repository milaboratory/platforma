import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    watch: false,
    testTimeout: 80000,
    hookTimeout: 80000, 
  }
});
