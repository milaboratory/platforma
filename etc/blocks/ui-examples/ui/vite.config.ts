import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import sourceMaps from 'rollup-plugin-sourcemaps';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  base: './',
  build: {
    sourcemap: true,
    rollupOptions: {
      plugins: [sourceMaps()],
    },
  },
});
