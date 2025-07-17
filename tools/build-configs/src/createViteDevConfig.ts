import vue from '@vitejs/plugin-vue';
import sourcemaps from 'rollup-plugin-sourcemaps2';
import type { ConfigEnv } from 'vite';

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
      conditions: isServe ? ['development'] : ['module', 'require', 'default'],
    },
    define: {
      'import.meta.vitest': 'undefined',
    },
  }
})
