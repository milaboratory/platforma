import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import {resolve} from 'path';
import {fileURLToPath, URL} from 'node:url';


// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue() as any],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    lib: {
      // Could also be a dictionary or array of multiple entry points
      entry: [resolve(__dirname, 'src/lib.ts')],
      name: 'GraphMaker',
      // the proper extensions will be added
      fileName: 'graph-maker',
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
})
