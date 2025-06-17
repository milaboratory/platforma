import type { ConfigEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import sourcemaps from 'rollup-plugin-sourcemaps2';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
    
const __dirname = dirname(fileURLToPath(import.meta.url));

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
    resolve: {
      alias: {
        "@milaboratories/uikit": resolve(__dirname, "../../../lib/ui/uikit/src"),
        "@platforma-sdk/ui-vue": resolve(__dirname, "../../../sdk/ui-vue/src"),
      },
    }
  }
})
