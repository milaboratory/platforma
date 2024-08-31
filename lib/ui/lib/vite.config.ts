import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
import { fileURLToPath, URL } from 'node:url';
import { exec } from 'child_process';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          whitespace: 'preserve',
          isCustomElement: (tag) => {
            return tag.startsWith('web');
          },
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
    {
      name: 'run-build-types',
      closeBundle() {
        // Your extra script logic here
        exec('npm run build:types', (err, stdout, stderr) => {
          if (err) {
            console.error(`Error running extra script: ${stderr}`);
            return;
          }
          console.log(`Extra script output: ${stdout}`);
        });
      },
    },
  ],
  define: {
    APP_VERSION: JSON.stringify(process.env.npm_package_version),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@icons': fileURLToPath(new URL('./src/assets/icons', import.meta.url)),
    },
  },
  build: {
    sourcemap: process.env.DEV_SOURCE_MAP === '1',
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
