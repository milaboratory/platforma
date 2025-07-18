import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import nodeExternals from 'rollup-plugin-node-externals';
import dts from 'unplugin-dts/rollup';

export function createRollupNodeConfig() {
  const input = './src/index.ts';
  return [
    {
      input,
      plugins: [
        typescript(),
        dts(),
        commonjs(),
        nodeExternals(),
      ],
      output: [
        {
          dir: 'dist',
          format: 'es',
          preserveModules: true,
          preserveModulesRoot: 'src',
          entryFileNames: '[name].js',
          chunkFileNames: '[name]-[hash].js',
          assetFileNames: '[name][extname]',
          sourcemap: true,
        },
        {
          dir: 'dist',
          format: 'cjs',
          preserveModules: true,
          preserveModulesRoot: 'src',
          entryFileNames: '[name].cjs',
          chunkFileNames: '[name]-[hash].cjs',
          assetFileNames: '[name][extname]',
          sourcemap: true,
        },
      ],
    },
  ];
}