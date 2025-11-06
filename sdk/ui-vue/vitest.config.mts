import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'threads',
    includeSource: ['src/**/*.{js,ts}'],
  },
});
