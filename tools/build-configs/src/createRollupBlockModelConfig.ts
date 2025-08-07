import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import { RollupOptions } from 'rollup';
import { createRollupNodeConfig } from './createRollupNodeConfig';

export function createRollupBlockModelConfig(): RollupOptions[] {
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