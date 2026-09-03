import vue from "@vitejs/plugin-vue";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import sourcemaps from "rollup-plugin-sourcemaps2";
import type { ConfigEnv, UserConfig } from "vite";
import commonjs from "vite-plugin-commonjs";

// @vue/compiler-sfc resolves types imported into SFC macros (e.g.
// defineProps<ImportedType>()) by reading files. By default it falls back to
// `ts.sys` for file access — but TypeScript 7 is the native compiler and no
// longer exposes `ts.sys`, so the fallback is undefined and the compiler throws
// "No fs option provided ... non-Node environment". Provide an explicit Node fs.
const sfcFileSystem = {
  fileExists: (file: string): boolean => existsSync(file),
  readFile: (file: string): string | undefined =>
    existsSync(file) ? readFileSync(file, "utf-8") : undefined,
  realpath: (file: string): string => realpathSync(file),
};

export function createViteDevConfig({ mode, command }: ConfigEnv): UserConfig {
  const isProd = mode === "production";
  const isServe = command === "serve";
  const useSources = process.env.USE_SOURCES === "1" || isServe;

  return {
    base: "./",
    // With "sources" condition, workspace deps resolve to raw .ts/.vue source
    // files. Vue SFCs are loaded individually (the optimizer can't inline
    // them), so their CJS imports get served raw from /@fs/. The commonjs
    // plugin transforms those CJS modules to ESM at serve time.
    plugins: [
      vue({ script: { fs: sfcFileSystem } }),
      ...(isServe ? [commonjs({ filter: (id) => id.includes("node_modules") })] : []),
    ],
    build: {
      target: ["chrome140"],
      emptyOutDir: isProd,
      sourcemap: isProd,
      minify: isProd,
      rolldownOptions: {
        plugins: isProd ? [sourcemaps()] : [],
      },
    },
    resolve: {
      conditions: useSources ? ["sources"] : [],
    },
    define: {
      "import.meta.vitest": "undefined",
    },
  };
}
