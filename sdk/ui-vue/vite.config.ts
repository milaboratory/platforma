import type { UserConfig } from 'vite';
import { defineConfig, mergeConfig } from 'vite';
import { resolve } from 'path';
import { createViteLibConfig } from '@milaboratories/build-configs';

// https://vitejs.dev/config/
export default defineConfig((configEnv): UserConfig => {
  return mergeConfig(createViteLibConfig(configEnv), {
    build: {
      lib: { name: 'SdkVueLib', entry: resolve(__dirname, 'src/lib.ts') },
      rollupOptions: {
        external: [
          'vue',
          'ag-grid-enterprise',
          'ag-grid-vue3',
          '@milaboratories/biowasm-tools',
          '@milaboratories/miplots4',
        ],
        output: {
          globals: {
            vue: 'Vue',
          },
        },
      },
    },
  } satisfies UserConfig);
});
