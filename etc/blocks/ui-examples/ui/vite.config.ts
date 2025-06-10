import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import sourcemaps from 'rollup-plugin-sourcemaps2';
import { BuildAndWatchDepsPlugin } from './plugin';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), BuildAndWatchDepsPlugin(['../../../../sdk/ui-vue'])],
  base: './',
  server: {
    fs: {
      strict: true,
    },
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      plugins: [sourcemaps()],
    },
  },
});
