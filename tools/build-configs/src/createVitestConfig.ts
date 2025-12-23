import { mergeConfig, type ViteUserConfig } from 'vitest/config';

export const createVitestConfig = (overrides: ViteUserConfig = {}): ViteUserConfig => {
  return mergeConfig(
    {
      test: {
        pool: 'threads',
        watch: false,
        passWithNoTests: true,
        server: {
          deps: {
            inline: [/@milaboratories\//, /@platforma-open\//],
          },
        },
        coverage: {
          include: ['**/src/**/*.{ts,js,vue,mts,mjs,cts,cjs}'],
          exclude: ['**/*.test.ts', '**/*.spec.ts', '**/test/**', '**/tests/**'],
          provider: 'istanbul',
          reporter: ['lcov', 'text'],
          reportsDirectory: './coverage',
        },
        reporters: ['default', ['junit', { outputFile: 'test-report.junit.xml' }]],
      },
    },
    overrides,
  );
};
