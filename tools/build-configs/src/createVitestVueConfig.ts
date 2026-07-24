import vue from "@vitejs/plugin-vue";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { mergeConfig, type ViteUserConfig } from "vitest/config";
import { createVitestConfig } from "./createVitestConfig";

// @vue/compiler-sfc resolves types imported into SFC macros (e.g.
// withDefaults(defineProps<ImportedType>())) by reading files. By default it
// falls back to `ts.sys` for file access — but TypeScript 7 is the native
// compiler and no longer exposes `ts.sys`, so the fallback is undefined and the
// compiler throws "No fs option provided ... non-Node environment". Provide an
// explicit Node fs (mirrors ts-builder's createViteDevConfig).
const sfcFileSystem = {
  fileExists: (file: string): boolean => existsSync(file),
  readFile: (file: string): string | undefined =>
    existsSync(file) ? readFileSync(file, "utf-8") : undefined,
  realpath: (file: string): string => realpathSync(file),
};

export const createVitestVueConfig = (overrides: ViteUserConfig = {}): ViteUserConfig => {
  return createVitestConfig(
    mergeConfig(
      {
        plugins: [vue({ script: { fs: sfcFileSystem } })],
      },
      overrides,
    ),
  );
};
