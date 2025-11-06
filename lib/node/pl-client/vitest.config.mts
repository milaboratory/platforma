import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    watch: false,
    coverage: {
      exclude: ['src/proto', '**/*.js'],
      include: ['src'],
    }
  }
});

