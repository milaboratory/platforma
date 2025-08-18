import nodeResolve from '@rollup/plugin-node-resolve';
import { resolve } from 'node:path';
import nodeExternals from 'rollup-plugin-node-externals';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve('src', 'index.ts'),
        tsup: resolve('src', 'tsup.ts'),
        vite: resolve('src', 'vite.ts')
      },
      formats: ['es', 'cjs'],
    },
    minify: false,
    sourcemap: true,
  },
  plugins: [nodeExternals(), nodeResolve(), dts()]
});
