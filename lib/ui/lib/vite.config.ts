import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
import { fileURLToPath, URL } from 'node:url';
// import dts from 'vite-plugin-dts';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => {
            return tag.startsWith('web');
          },
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
    // dts({}),
  ],
  define: {
    APP_VERSION: JSON.stringify(process.env.npm_package_version),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@icons': fileURLToPath(new URL('./src/lib/assets/icons', import.meta.url)),
    },
  },
  build: {
    emptyOutDir: false,
    lib: {
      // Could also be a dictionary or array of multiple entry points
      entry: [resolve(__dirname, 'src/index.ts')],
      name: 'pl-uikit',
      // the proper extensions will be added
      fileName: 'pl-uikit',
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
});
