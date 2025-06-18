import { resolve } from 'path';
import { defineConfig, mergeConfig, type UserConfig } from 'vite';
import { createViteDevConfig } from '@milaboratories/platforma-build-configs';

export default defineConfig((configEnv): UserConfig => {
  return mergeConfig(createViteDevConfig(configEnv), {
    define: {
      APP_VERSION: JSON.stringify(process.env.npm_package_version),
    },
    build: {
      lib: {
        // Could also be a dictionary or array of multiple entry points
        entry: [resolve(__dirname, 'src/index.ts')],
        name: 'pl-uikit',
        // the proper extensions will be added
        fileName: 'pl-uikit',
      },
      rollupOptions: {
        external: ['vue'],
        output: {
          globals: {
            vue: 'Vue',
          },
        },
      },
    },
  });
});
