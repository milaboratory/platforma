import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import sourcemaps from 'rollup-plugin-sourcemaps2';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  build: {
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      // Could also be a dictionary or array of multiple entry points
      entry: [resolve(__dirname, 'src/lib.ts')],
      name: 'SdkVueLib',
      // the proper extensions will be added
      fileName: 'lib',
    },
    rollupOptions: {
      plugins: [sourcemaps()],
      external: [
        'vue',
        'ag-grid-enterprise',
        'ag-grid-vue3',
      ],
      output: {
        globals: {
          vue: 'Vue',
        },
      },
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
      },
    },
  },
});
