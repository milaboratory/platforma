import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'threads',
    watch: false,
    coverage: {
      exclude: ['src/proto', '**/*.js'],
      include: ['src'],
    }
  }
});

