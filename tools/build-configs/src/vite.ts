import nodeResolve from '@rollup/plugin-node-resolve';
import nodeExternals from 'rollup-plugin-node-externals';
import { defineConfig, mergeConfig, UserConfig } from 'vite';
import dts from 'vite-plugin-dts';

export function PlViteStdNode(overrideConfig?: UserConfig) {
  return defineConfig(mergeConfig({
    build: {
      lib: {
        entry: './src/index.ts',
        fileName: 'index',
        formats: ['es', 'cjs']
      },
      sourcemap: true,
      rollupOptions: {
        output: [
          {
            format: 'es',
            preserveModules: true,
            preserveModulesRoot: 'src',
            entryFileNames: '[name].mjs',
            chunkFileNames: '[name]-[hash].mjs',
            assetFileNames: '[name][extname]'
          },
          {
            format: 'cjs',
            preserveModules: true,
            preserveModulesRoot: 'src',
            entryFileNames: '[name].js',
            chunkFileNames: '[name]-[hash].js',
            assetFileNames: '[name][extname]'
          }
        ]
      }
    },
    plugins: [
      nodeExternals(),
      nodeResolve(),
      dts({
        staticImport: true
      })
    ],
  }, overrideConfig ?? {}));
}
