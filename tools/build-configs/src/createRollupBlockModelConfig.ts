import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import type { RollupOptions } from 'rollup';
import { createRollupNodeConfig } from './createRollupNodeConfig';
import { createRollupResolvePlugin, createRollupTypescriptPlugin } from './rollupUtils';

export function createRollupBlockModelConfig(props?: {
  entry?: string[];
  output?: string;
  formats?: ('es' | 'cjs')[];
}): RollupOptions[] {
  const base = createRollupNodeConfig(props);
  const input = props?.entry ?? ['./src/index.ts'];
  const output = props?.output ?? 'dist';
  const useSources = process.env.USE_SOURCES === '1';

  return [
    ...base,
    {
      input,
      plugins: [
        createRollupTypescriptPlugin({ output, useSources }),
        createRollupResolvePlugin({ useSources }),
        commonjs(),
        json(),
      ],
      onwarn(warning, warn) {
        // Suppress TS5098: customConditions requires moduleResolution bundler/node16/nodenext
        if (warning.code === 'PLUGIN_WARNING' && warning.message?.includes('TS5098')) {
          return;
        }
        warn(warning);
      },
      output: [
        {
          dir: output,
          name: 'block-model',
          format: 'umd',
          entryFileNames: 'bundle.js',
          sourcemap: true,
        },
      ],
    },
  ];
}
