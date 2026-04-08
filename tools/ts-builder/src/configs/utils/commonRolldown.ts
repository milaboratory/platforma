import { dts } from "rolldown-plugin-dts";
import type { RolldownOptions, RolldownPluginOption } from "rolldown";

const useSources = process.env.USE_SOURCES === "1";

const dtsPlugin = dts({
  sourcemap: true,
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
    external: (id: string) =>
      id.startsWith("node:") || (/^[^./]/.test(id) && !id.startsWith("@oxc-project/runtime")),
    ...(useSources && {
      resolve: { conditionNames: ["sources"] },
    }),
    output: {
      dir: output,
      format,
      entryFileNames,
      sourcemap: true,
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
