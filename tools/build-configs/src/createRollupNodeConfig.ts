import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import type { OutputOptions, PreRenderedChunk, RollupOptions } from 'rollup';
import { cleandir } from 'rollup-plugin-cleandir';
import nodeExternals from 'rollup-plugin-node-externals';

export function createRollupNodeConfig(props?: {
  entry?: string[];
  output?: string;
  formats?: ('es' | 'cjs')[];
}): RollupOptions[] {
  const input = props?.entry ?? ['./src/index.ts'];
  const output = props?.output ?? 'dist';
  const formats = props?.formats ?? ['es', 'cjs'];
  const useSources = process.env.USE_SOURCES === '1';

  return [
    {
      input,
      plugins: [
        cleandir(output),
        typescript({ declaration: true, declarationMap: true, declarationDir: output, moduleResolution: useSources ? 'bundler' : 'node' }),
        resolve(useSources ? { exportConditions: ['sources'] } : {}),
        commonjs(),
        json(),
        nodeExternals(),
      ],
      output: [
        formats.includes('es') && {
          dir: output,
          format: 'es',
          preserveModules: true,
          preserveModulesRoot: 'src',
          entryFileNames: createEntryFileNames('.js'),
          sourcemap: true,
        },
        formats.includes('cjs') && {
          dir: output,
          format: 'cjs',
          preserveModules: true,
          preserveModulesRoot: 'src',
          entryFileNames: createEntryFileNames('.cjs'),
          sourcemap: true,
        },
      ].filter((v) => v !== null && typeof v === 'object') as OutputOptions[],
    },
  ];
}

function createEntryFileNames(ext: string) {
  return (chunkInfo: PreRenderedChunk) => {
    if (chunkInfo.name.includes('node_modules')) {
      return chunkInfo.name.replace(/node_modules/g, '__external') + ext;
    }
    return `[name]${ext}`;
  };
}
