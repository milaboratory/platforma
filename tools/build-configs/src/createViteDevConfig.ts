import type { ConfigEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import sourcemaps from 'rollup-plugin-sourcemaps2';
import { resolve } from 'node:path';

export const createViteDevConfig = (({ mode, command }: ConfigEnv) => {
  const isDev = mode === 'development';
  const isProd = mode === 'production';
  const isServe = command === 'serve';

  return {
    base: './',
    plugins: [vue()],
    build: {
      emptyOutDir: isProd,
      sourcemap: isProd,
      minify: isProd,
      rollupOptions: {
        plugins: isProd ? [sourcemaps()] : [],
      },
    },
    resolve: {
      conditions: isServe ? ['development'] : undefined,
    },
    define: {
      'import.meta.vitest': 'undefined',
    }
  }
})
