import type { ConfigEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import sourcemaps from 'rollup-plugin-sourcemaps2';

export const createViteDevConfig = (({ mode }: ConfigEnv) => {
  const isDev = mode === 'development';
  const isProd = mode === 'production';

  return {
    plugins: [vue()],
    build: {
      emptyOutDir: isProd,
      sourcemap: isProd,
      minify: isProd,
      rollupOptions: {
        plugins: isProd ? [sourcemaps()] : [],
      },
    },
    define: {
      'import.meta.vitest': 'undefined',
    },
  }
})
