import { fileURLToPath, URL } from 'url';
import { defineConfig, mergeConfig } from 'vite';
import { createViteDevConfig } from '@milaboratories/build-configs';

export default defineConfig((configEnv) => {
  return mergeConfig(createViteDevConfig(configEnv), {
    define: {
      APP_VERSION: JSON.stringify('unknown'), // @todo
    },
    resolve: {
      alias: {
        'milaboratories/uikit/styles': fileURLToPath(new URL('../../lib/ui/uikit/src/assets/ui.scss', import.meta.url)),
        'milaboratories/uikit': fileURLToPath(new URL('../../lib/ui/uikit/src/index.ts', import.meta.url)),
      },
    },
  });
});
