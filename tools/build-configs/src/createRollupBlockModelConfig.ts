import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import type { RollupOptions } from 'rollup';
import { createRollupNodeConfig } from './createRollupNodeConfig';

export function createRollupBlockModelConfig(props?: {
  entry?: string[];
  output?: string;
  formats?: ('es' | 'cjs')[];
}): RollupOptions[] {
  const base = createRollupNodeConfig(props);
  const useSources = process.env.USE_SOURCES === '1';

  return [
    ...base,
    {
      input: props?.entry ?? ['./src/index.ts'],
      plugins: [
        typescript(),
        resolve(useSources ? { exportConditions: ['sources'] } : {}),
        commonjs(),
      ],
      output: [
        {
          dir: props?.output ?? 'dist',
          name: 'block-model',
          format: 'umd',
          entryFileNames: 'bundle.js',
          sourcemap: true,
        },
      ],
    },
  ];
}
