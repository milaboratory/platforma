import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';

export function createRollupTypescriptPlugin({ output, useSources }: {
  output?: string;
  useSources?: boolean;
} = {}) {
  return typescript({
    compilerOptions: {
      declaration: true,
      declarationMap: true,
      declarationDir: output,
      moduleResolution: useSources ? 'bundler' : 'node',
      customConditions: useSources ? ['sources'] : [],
    },
  });
}

export function createRollupResolvePlugin({ useSources }: {
  useSources?: boolean;
} = {}) {
  return resolve({ exportConditions: useSources ? ['sources'] : [] });
}
