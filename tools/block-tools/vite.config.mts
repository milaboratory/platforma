import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import nodeExternals from 'rollup-plugin-node-externals';
import nodeResolve from '@rollup/plugin-node-resolve';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: {
        cli: resolve('src', 'cmd', 'index.ts'),
        index: resolve('src', 'lib.ts')
      },
      formats: ['es', 'cjs']
    },
    sourcemap: true,
    rollupOptions: {}
  },
  plugins: [nodeExternals(), nodeResolve(), dts()]
});
