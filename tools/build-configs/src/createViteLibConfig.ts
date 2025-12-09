import type { ConfigEnv, UserConfig } from 'vite';
import { mergeConfig } from 'vite';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';
import dts from 'vite-plugin-dts';
import { externalizeDeps } from 'vite-plugin-externalize-deps';
import { createViteDevConfig } from './createViteDevConfig';

export const createViteLibConfig = ((configEnv: ConfigEnv): UserConfig => {
  const isProd = configEnv.mode === 'production';
  const useSources = process.env.USE_SOURCES === '1';

  return mergeConfig(createViteDevConfig(configEnv), {
    plugins: [
      dts({
        // Override customConditions from tsconfig to not use 'sources' during build
        // unless USE_SOURCES is explicitly set
        compilerOptions: useSources ? undefined : { customConditions: [] },
      }),
      externalizeDeps(),
      cssInjectedByJsPlugin({ relativeCSSInjection: true }),
    ],
    build: {
      lib: {
        fileName: 'lib',
        formats: ['es'],
        entry: 'src/index.ts',
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
