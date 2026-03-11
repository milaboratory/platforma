import vue from "@vitejs/plugin-vue";
import sourcemaps from "rollup-plugin-sourcemaps2";
import type { ConfigEnv, UserConfig } from "vite";
import commonjs from "vite-plugin-commonjs";

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
      vue(),
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
