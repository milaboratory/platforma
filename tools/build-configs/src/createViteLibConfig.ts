import type { ConfigEnv, UserConfig } from "vite";
import { mergeConfig } from "vite";
import dts from "vite-plugin-dts";
import { externalizeDeps } from "vite-plugin-externalize-deps";
import { libInjectCss } from "vite-plugin-lib-inject-css";
import { createViteDevConfig } from "./createViteDevConfig";
import { ModuleResolutionKind } from "typescript";
import { sanitizeVueOutputPlugin } from "./plugins/sanitizeVueOutputPlugin";

/**
 * @deprecated Use ts-builder internal configs
 * */
export function createViteLibConfig(configEnv: ConfigEnv): UserConfig {
  const useSources = process.env.USE_SOURCES === "1";

  return mergeConfig(createViteDevConfig(configEnv), {
    plugins: [
      libInjectCss(),
      dts({
        compilerOptions: {
          declaration: true,
          declarationMap: true,
          moduleResolution: useSources ? ModuleResolutionKind.Bundler : ModuleResolutionKind.NodeJs,
          customConditions: useSources ? ["sources"] : [],
        },
      }),
      externalizeDeps(),
      sanitizeVueOutputPlugin(),
    ],
    build: {
      cssCodeSplit: true,
      lib: {
        fileName: "lib",
        formats: ["es"],
        entry: ["src/index.ts"],
      },
      rolldownOptions: {
        output: {
          format: "es",
          preserveModules: true,
          preserveModulesRoot: "src",
          // Required for lib-inject-css: keeps CSS imports co-located
          // with the chunks that use them instead of hoisting to entry
          hoistTransitiveImports: false,
          inlineDynamicImports: false,
          entryFileNames: "[name].js",
          chunkFileNames: "[name]-[hash].js",
          assetFileNames: (chunkInfo) => {
            // Strip .module from CSS filenames so consumers don't
            // re-process already-compiled CSS modules.
            // See https://github.com/emosheeep/vite-plugin-lib-inject-css/issues/34
            const moduleCss = chunkInfo.names.find((n) => n.endsWith(".module.css"));
            if (moduleCss) {
              return moduleCss.replace(".module.css", ".css");
            }
            return "[name][extname]";
          },
        },
      },
    },
  } satisfies UserConfig);
}
