import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
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
        exec('npm run build:types', (err, stdout, stderr) => {
          if (err) {
            console.error(`Error running build:types: ${stderr}`, err);
            return;
          }
        });
      },
    },
  ],
  define: {
    APP_VERSION: JSON.stringify(process.env.npm_package_version),
  },
  build: {
    sourcemap: true,
    emptyOutDir: true,
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
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
      },
    },
  },
});
