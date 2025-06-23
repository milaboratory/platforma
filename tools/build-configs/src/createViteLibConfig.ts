import type { ConfigEnv } from 'vite';
import { mergeConfig } from 'vite';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'
import { createViteDevConfig } from './createViteDevConfig';

export const createViteLibConfig = ((configEnv: ConfigEnv) => {
    return mergeConfig(createViteDevConfig(configEnv), {
      plugins: [cssInjectedByJsPlugin({ relativeCSSInjection: true })],
      build: {
        lib: {
          fileName: 'lib',
          formats: ['es'],
        },
        cssCodeSplit: true,
        rollupOptions: {
          output: {
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
