import { resolve } from 'path';
import { defineConfig, mergeConfig, type UserConfig } from 'vite';
import { createViteLibConfig } from '@milaboratories/build-configs';

export default defineConfig((configEnv): UserConfig => {
  return mergeConfig(createViteLibConfig(configEnv), {
    define: {
      APP_VERSION: JSON.stringify(process.env.npm_package_version),
    },
    build: {
      lib: {
        // Could also be a dictionary or array of multiple entry points
        entry: [resolve(__dirname, 'src/index.ts')],
        name: 'pl-uikit',
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
