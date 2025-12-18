import { mergeConfig, type ViteUserConfig } from 'vitest/config';

export const createVitestConfig = (overrides: ViteUserConfig = {}): ViteUserConfig => {
  return mergeConfig(
    {
      test: {
        pool: 'threads',
        watch: false,
        passWithNoTests: true,
        coverage: {
          include: ['src/**/*.{ts,js,vue,mts,mjs,cts,cjs}'],
          provider: 'istanbul',
          reporter: ['lcov', 'text'],
          reportsDirectory: './coverage',
        },
      },
    },
    overrides,
  );
};
