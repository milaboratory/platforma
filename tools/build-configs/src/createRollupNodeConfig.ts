import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import typescript from '@rollup/plugin-typescript';
import { OutputOptions, RollupOptions } from 'rollup';
import { cleandir } from 'rollup-plugin-cleandir';
import nodeExternals from 'rollup-plugin-node-externals';
import dts from 'unplugin-dts/rollup';

export function createRollupNodeConfig(props?: {
  entry?: string[];
  output?: string;
  formats?: ('es' | 'cjs')[]
}): RollupOptions[] {
  const input = props?.entry ?? ['./src/index.ts'];
  const output = props?.output ?? 'dist';
  const formats = props?.formats ?? ['es', 'cjs'];
  return [
    {
      input,
      plugins: [
        cleandir(output),
        typescript(),
        dts({ entryRoot: 'src'}),
        json(),
        commonjs(),
        nodeExternals()
      ],
      output: [
        formats.includes('es') && {
          dir: output,
          format: 'es',
          preserveModules: true,
          preserveModulesRoot: 'src',
          entryFileNames: '[name].js',
          chunkFileNames: '[name]-[hash].js',
          assetFileNames: '[name][extname]',
          sourcemap: true
        },
        formats.includes('cjs') && {
          dir: output,
          format: 'cjs',
          preserveModules: true,
          preserveModulesRoot: 'src',
          entryFileNames: '[name].cjs',
          chunkFileNames: '[name]-[hash].cjs',
          assetFileNames: '[name][extname]',
          sourcemap: true
        },
      ].filter((v) => v !== null && typeof v === 'object') as OutputOptions[],
    },
  ];
}