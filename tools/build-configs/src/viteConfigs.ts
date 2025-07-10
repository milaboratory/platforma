import vue from '@vitejs/plugin-vue';
import sourcemaps from 'rollup-plugin-sourcemaps2';
import { mergeConfig, type ConfigEnv } from 'vite';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';
import dts from 'vite-plugin-dts';

export const createBaseViteConfig = (({ mode, command }: ConfigEnv) => {
  const isProd = mode === 'production';
  const isServe = command === 'serve';

  return {
    base: './',
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
  }
})

export const createBaseViteLibConfig = (({ mode, command }: ConfigEnv) => {
  const isProd = mode === 'production';

  return {
    plugins: [
      dts({ tsconfigPath: isProd ? 'tsconfig.lib.build.json' : undefined }),
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
          preserveModules: true,
          preserveModulesRoot: 'src',
          inlineDynamicImports: false,
          entryFileNames: '[name].js',
          chunkFileNames: '[name]-[hash].js',
          assetFileNames: '[name][extname]'
        }
      },
    },
  }
})

export const createViteVueConfig = () => {
    return {
        plugins: [vue()],
        define: {
            'import.meta.vitest': 'undefined',
        }
    }
}

/**
 * @deprecated Use composition of `createBaseViteConfig`, `createBaseViteLibConfig`, and `createViteVueConfig` instead.
 */
export const createViteLibConfig = (configEnv: ConfigEnv) => {
    return mergeConfig(
        mergeConfig(createBaseViteConfig(configEnv), createBaseViteLibConfig(configEnv)),
        createViteVueConfig()
    );
}

/**
 * @deprecated Use composition of `createBaseViteConfig` and `createViteVueConfig` instead.
 */
export const createViteDevConfig = (configEnv: ConfigEnv) => {
  return mergeConfig(createBaseViteConfig(configEnv),  createViteVueConfig())
};
