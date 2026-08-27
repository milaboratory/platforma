import { readdirSync } from "node:fs";
import type { ConfigEnv, UserConfig } from "vite";
import { mergeConfig } from "vite";
import dts from "vite-plugin-dts";
import { externalizeDeps } from "vite-plugin-externalize-deps";
import { libInjectCss } from "vite-plugin-lib-inject-css";
import { createViteDevConfig } from "./createViteDevConfig";
import { sanitizeVueOutputPlugin } from "./sanitizeVueOutputPlugin";

// typescript ModuleResolutionKind constants (avoid importing typescript at runtime)
const ModuleResolutionKind_Bundler = 100;

export function createViteLibConfig(configEnv: ConfigEnv): UserConfig {
  const useSources = process.env.USE_SOURCES === "1";
  const isServe = configEnv.command === "serve";

  return mergeConfig(createViteDevConfig(configEnv), {
    plugins: isServe
      ? []
      : [
          libInjectCss(),
          dts({
            // vite-plugin-dts >= 5 picks its program processor automatically, but its
            // detector only scans two directory levels below the package root. Our SFCs
            // live deeper (src/components/**), so the detector misses them, falls back to
            // the plain TS processor and silently emits no *.vue.d.ts — while lib.d.ts
            // still re-exports those .vue specifiers. Decide it ourselves.
            processor: hasVueFiles("src") ? "vue" : "ts",
            compilerOptions: {
              declaration: true,
              declarationMap: true,
              moduleResolution: ModuleResolutionKind_Bundler,
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

// Internals

function hasVueFiles(dir: string): boolean {
  try {
    return readdirSync(dir, { recursive: true }).some((entry) => String(entry).endsWith(".vue"));
  } catch {
    return false;
  }
}
