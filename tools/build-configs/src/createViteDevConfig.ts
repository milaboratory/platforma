import vue from '@vitejs/plugin-vue';
import sourcemaps from 'rollup-plugin-sourcemaps2';
import type { ConfigEnv, UserConfig } from 'vite';

export const createViteDevConfig = (({ mode, command }: ConfigEnv): UserConfig => {
  const isDev = mode === 'development';
  const isProd = mode === 'production';
  const isServe = command === 'serve';
  const useSources = process.env.USE_SOURCES === '1' || isServe;

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
      conditions: useSources ? ['sources'] : [],
    },
    define: {
      'import.meta.vitest': 'undefined',
    },
  }
})
