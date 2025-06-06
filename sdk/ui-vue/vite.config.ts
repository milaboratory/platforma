import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
import sourcemaps from 'rollup-plugin-sourcemaps2';
import { defineConfig } from 'vite';

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
      formats: ['es'],
    },
    rollupOptions: {
      plugins: [sourcemaps()],
      external: [
        'vue',
        'ag-grid-enterprise',
        'ag-grid-vue3',
        '@milaboratories/biowasm-tools',
      ],
      output: {
        globals: {
          vue: 'Vue',
        },
      },
    },
  },
  define: {
    'import.meta.vitest': 'undefined',
  },
});
