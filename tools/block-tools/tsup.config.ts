import { BaseTsupOptions } from '@milaboratories/platforma-build-configs/tsup';
import { defineConfig } from 'tsup';

export default defineConfig({
  ...BaseTsupOptions,
  entry: {
    "cli": "src/cmd/index.ts",
    "lib": "src/lib.ts"
  }
});
