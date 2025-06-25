import type { UserConfig } from 'vite';
import { defineConfig, mergeConfig } from 'vite';
import { createViteDevConfig } from '@milaboratories/platforma-build-configs';

// https://vitejs.dev/config/
export default defineConfig((configEnv): UserConfig => {
  return mergeConfig(createViteDevConfig(configEnv), {});
});
