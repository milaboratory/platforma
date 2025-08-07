import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: 'src/index.ts',
      name: 'model',
      fileName: (format) => `my-lib.${format}.js`
    },
    minify: false,
    sourcemap: true,
    rollupOptions: {
      output: {
        format: 'iife',
        entryFileNames: 'bundle.js'
      }
    }
  }
});
