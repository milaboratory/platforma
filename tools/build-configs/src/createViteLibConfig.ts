import type { ConfigEnv } from 'vite';
import { mergeConfig } from 'vite';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';
import dts from 'vite-plugin-dts';
import { createViteDevConfig } from './createViteDevConfig';

export const createViteLibConfig = ((configEnv: ConfigEnv) => {
  const isProd = configEnv.mode === 'production';

  return mergeConfig(createViteDevConfig(configEnv), {
    plugins: [
      dts({ tsconfigPath: 'tsconfig.lib.json' }),
      cssInjectedByJsPlugin({ relativeCSSInjection: true }),
    ],
    build: {
      lib: {
        fileName: 'lib',
        formats: ['es'],
      },
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          format: 'es',
          preserveModules: true,
          preserveModulesRoot: 'src',
          inlineDynamicImports: false,
          entryFileNames: '[name].js',
          chunkFileNames: '[name]-[hash].js',
          assetFileNames: '[name][extname]'
        }
      },
    },
  });
})
