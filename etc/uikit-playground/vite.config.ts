import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
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
