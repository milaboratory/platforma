import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';

export function createRollupBlockModelConfig() {
  const input = './src/index.ts';
  return [
    // {
    //   input,
    //   plugins: [
    //     typescript(),
    //     dts(),
    //     commonjs(),
    //     nodeExternals(),
    //   ],
    //   output: [
    //     {
    //       dir: 'dist',
    //       format: 'es',
    //       preserveModules: true,
    //       preserveModulesRoot: 'src',
    //       entryFileNames: '[name].mjs',
    //       chunkFileNames: '[name]-[hash].mjs',
    //       assetFileNames: '[name][extname]',
    //       sourcemap: true,
    //     },
    //     {
    //       dir: 'dist',
    //       format: 'cjs',
    //       preserveModules: true,
    //       preserveModulesRoot: 'src',
    //       entryFileNames: '[name].js',
    //       chunkFileNames: '[name]-[hash].js',
    //       assetFileNames: '[name][extname]',
    //       sourcemap: true,
    //     },
    //   ],
    // },

    {
      input,
      plugins: [
        typescript(),
        commonjs(),
        resolve(),
      ],
      output: [
        {
          dir: 'dist',
          name: 'block-model',
          format: 'umd',
          entryFileNames: 'bundle.js',
          sourcemap: true,
        },
      ],
    },
  ];
}