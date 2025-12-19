import vue from '@vitejs/plugin-vue';
import { mergeConfig, type ViteUserConfig } from 'vitest/config';
import { createVitestConfig } from './createVitestConfig';

export const createVitestVueConfig = (overrides: ViteUserConfig = {}): ViteUserConfig => {
  return createVitestConfig(
    mergeConfig(
      {
        plugins: [vue()],
        test: {
          coverage: {
            reporter: ['text'],
          },
        },
      },
      overrides,
    ),
  );
};
