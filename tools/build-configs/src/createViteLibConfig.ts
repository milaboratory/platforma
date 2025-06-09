import type { ConfigEnv } from 'vite';
import { mergeConfig } from 'vite';
import { createViteDevConfig } from './createViteDevConfig.ts';

export const createViteLibConfig = ((configEnv: ConfigEnv) => {
    return mergeConfig(createViteDevConfig(configEnv), {
      build: {
        lib: {
          fileName: 'lib',
          formats: ['es'],
        },
      },
    });
  })
