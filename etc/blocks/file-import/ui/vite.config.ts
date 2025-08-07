import { createViteDevConfig } from '@milaboratories/build-configs';
import { defineConfig, mergeConfig } from 'vite';

export default defineConfig((configEnv) => {
  return mergeConfig(createViteDevConfig(configEnv), {});
});
