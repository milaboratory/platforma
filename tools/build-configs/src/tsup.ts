import { Options } from 'tsup';

export const BaseTsupOptions: Options = {
  splitting: false,
  treeshake: true,
  clean: true,
  format: ['cjs', 'esm'],
  minify: false,
  sourcemap: true,
  dts: true
};
