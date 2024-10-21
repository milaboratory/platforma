import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  build: {
    emptyOutDir: false,
    lib: {
      // Could also be a dictionary or array of multiple entry points
      entry: [resolve(__dirname, 'src/lib.ts')],
      name: 'SdkVueLib',
      // the proper extensions will be added
      fileName: 'lib',
    },
    rollupOptions: {
      external: [
        'vue',
        '@ag-grid-community/core',
        '@ag-grid-community/client-side-row-model',
        '@ag-grid-community/infinite-row-model',
        '@ag-grid-community/styles',
        '@ag-grid-community/vue3',
        '@ag-grid-community/csv-export',
        '@ag-grid-enterprise/core',
        '@ag-grid-enterprise/clipboard',
        '@ag-grid-enterprise/range-selection',
        '@ag-grid-enterprise/rich-select',
        '@ag-grid-enterprise/menu',
        '@ag-grid-enterprise/excel-export',
      ],
      output: {
        globals: {
          vue: 'Vue',
        },
      },
    },
  },
});
