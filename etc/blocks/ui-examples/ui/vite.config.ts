import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import sourcemaps from 'rollup-plugin-sourcemaps2';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  base: './',
  build: {
    sourcemap: true,
    rollupOptions: {
      plugins: [sourcemaps()],
    },
  },
});
