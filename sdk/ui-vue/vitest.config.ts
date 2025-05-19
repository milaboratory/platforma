import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    includeSource: ['src/**/*.{js,ts}'],
  },
  resolve: {
    alias: [
      {
        find: /^.*\/chemical-properties\.worker\?worker&inline$/,
        replacement: path.resolve(__dirname, 'src/components/PlMultiSequenceAlignment/highlight/__mocks__/chemical-properties.worker.ts')
      },
    ],
  },
});
