import nodeResolve from '@rollup/plugin-node-resolve';
import nodeExternals from 'rollup-plugin-node-externals';
import { defineConfig, UserConfig } from 'vite';
import dts from 'vite-plugin-dts';

/**
 * @deprecated Use `createRollupNodeConfig`.
 */
export function PlViteStdNode(overrideConfig?: UserConfig) {
  return defineConfig({
    build: {
      lib: {
        entry: 'src/index.ts',
        fileName: 'index',
        formats: ['es', 'cjs']
      },
      sourcemap: true,
      rollupOptions: {}
    },
    plugins: [
      nodeExternals(),
      nodeResolve(),
      dts({
        staticImport: true
      })
    ],
    ...(overrideConfig ?? {})
  });
}