import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  define: {
    APP_VERSION: 'unknown', // @todo
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@icons': fileURLToPath(new URL('./src/lib/assets/icons', import.meta.url)),
    },
  },
});
