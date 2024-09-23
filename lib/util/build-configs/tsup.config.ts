import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  splitting: false,
  treeshake: true,
  clean: true,
  format: ['cjs', 'esm'],
  minify: false,
  sourcemap: true,
  dts: true
});
