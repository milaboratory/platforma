import { dts } from "rolldown-plugin-dts";
import type { RolldownOptions, RolldownPluginOption } from "rolldown";
import { sourcemapsEnabled } from "./sourcemaps";

const useSources = process.env.USE_SOURCES === "1";

// The dts plugin turns on output source maps for the whole build when its own
// `sourcemap` is set, so it has to follow the same switch.
const dtsPlugin = dts({
  sourcemap: sourcemapsEnabled(),
  ...(useSources && {
    compilerOptions: {
      customConditions: ["sources"],
    },
  }),
});

type Format = "es" | "cjs";

const formatConfig: Record<
  Format,
  { entryFileNames: (chunkInfo: { name: string }) => string; plugins?: RolldownPluginOption[] }
> = {
  es: { entryFileNames: createEntryFileNames(".js"), plugins: [dtsPlugin] },
  cjs: { entryFileNames: createEntryFileNames(".cjs") },
};

export function createBuildEntry(input: string[], output: string, format: Format): RolldownOptions {
  const { entryFileNames, plugins } = formatConfig[format];
  return {
    input,
    plugins,
    external: (id: string, _importer: string | undefined, isResolved: boolean) =>
      !isResolved &&
      (id.startsWith("node:") || (/^[^./]/.test(id) && !id.startsWith("@oxc-project/runtime"))),
    ...(useSources && {
      resolve: { conditionNames: ["sources"] },
    }),
    output: {
      dir: output,
      format,
      entryFileNames,
      sourcemap: sourcemapsEnabled(),
      preserveModules: true,
      preserveModulesRoot: "src",
    },
    transform: {
      target: "ES2022",
    },
  };
}

function createEntryFileNames(ext: string) {
  return (chunkInfo: { name: string }) => {
    if (chunkInfo.name.includes("node_modules")) {
      return chunkInfo.name.replace(/node_modules/g, "__external") + ext;
    }
    return `[name]${ext}`;
  };
}
