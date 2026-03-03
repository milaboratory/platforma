import type { ConfigEnv, UserConfig } from "vite";
import { mergeConfig } from "vite";
import dts from "vite-plugin-dts";
import { externalizeDeps } from "vite-plugin-externalize-deps";
import { libInjectCss } from "vite-plugin-lib-inject-css";
import { createViteDevConfig } from "./createViteDevConfig";
import { sanitizeVueOutputPlugin } from "./sanitizeVueOutputPlugin";

// typescript ModuleResolutionKind constants (avoid importing typescript at runtime)
const ModuleResolutionKind_NodeJs = 2;
const ModuleResolutionKind_Bundler = 100;

export function createViteLibConfig(configEnv: ConfigEnv): UserConfig {
  const useSources = process.env.USE_SOURCES === "1";

  return mergeConfig(createViteDevConfig(configEnv), {
    plugins: [
      libInjectCss(),
      dts({
        compilerOptions: {
          declaration: true,
          declarationMap: true,
          moduleResolution: useSources ? ModuleResolutionKind_Bundler : ModuleResolutionKind_NodeJs,
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
          hoistTransitiveImports: false,
          inlineDynamicImports: false,
          entryFileNames: "[name].js",
          chunkFileNames: "[name]-[hash].js",
          assetFileNames: (chunkInfo) => {
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
