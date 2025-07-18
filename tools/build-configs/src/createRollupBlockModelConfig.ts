import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import { createRollupNodeConfig } from './createRollupNodeConfig';

export function createRollupBlockModelConfig() {
  const input = './src/index.ts';
  return [
    ...createRollupNodeConfig(),
    {
      input,
      plugins: [
        typescript(),
        resolve(),
        commonjs(),
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