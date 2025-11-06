import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    watch: false,
    coverage: {
      exclude: ['**/*.js'],
      include: ['src'],
    }
  }
});

