import { createViteLibConfig } from '@milaboratories/build-configs';
import { resolve } from 'path';
import { defineConfig, mergeConfig } from 'vite';

export default defineConfig((configEnv) => {
  return mergeConfig(createViteLibConfig(configEnv), {
    define: {
      APP_VERSION: JSON.stringify(process.env.npm_package_version),
    },
    build: {
      lib: {
        // Could also be a dictionary or array of multiple entry points
        entry: [resolve(process.cwd(), 'src/index.ts')],
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
