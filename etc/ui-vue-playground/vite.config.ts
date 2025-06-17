import { defineConfig, mergeConfig } from 'vite';
import { createViteDevConfig } from '@milaboratories/platforma-build-configs';

export default defineConfig((configEnv) => {
  return mergeConfig(createViteDevConfig(configEnv), {});
});
