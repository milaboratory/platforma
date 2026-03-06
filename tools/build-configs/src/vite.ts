import nodeExternals from 'rollup-plugin-node-externals';
import type { UserConfig } from 'vite';
import { defineConfig } from 'vite';
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
        formats: ['es', 'cjs'],
      },
      sourcemap: true,
      rolldownOptions: {},
    },
    plugins: [
      nodeExternals(),
      dts({
        staticImport: true,
      }),
    ],
    ...(overrideConfig ?? {}),
  });
}
