import { BaseTsupOptions } from '@milaboratories/platforma-build-configs/tsup';
import { defineConfig } from 'tsup';

export default defineConfig({
  ...BaseTsupOptions,
  entry: ['src/index.ts']
});
