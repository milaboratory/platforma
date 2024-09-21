import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import nodeExternals from 'rollup-plugin-node-externals';
import nodeResolve from '@rollup/plugin-node-resolve';
import dts from 'vite-plugin-dts';

export function PlViteStdNode() {
  return defineConfig({
    build: {
      lib: {
        entry: resolve('src', 'index.ts'),
        fileName: 'index',
        formats: ['es', 'cjs']
      },
      sourcemap: true,
      rollupOptions: {}
    },
    plugins: [nodeExternals(), nodeResolve(), dts()]
  });
}
