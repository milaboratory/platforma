import { dts } from "rolldown-plugin-dts";

function createEntryFileNames(ext) {
  return (chunkInfo) => {
    if (chunkInfo.name.includes("node_modules")) {
      return chunkInfo.name.replace(/node_modules/g, "__external") + ext;
    }
    return `[name]${ext}`;
  };
}

const useSources = process.env.USE_SOURCES === "1";

const dtsPlugin = dts({
  ...(useSources && {
    compilerOptions: {
      customConditions: ["sources"],
    },
  }),
});

const formatConfig = {
  es: { entryFileNames: createEntryFileNames(".js"), plugins: [dtsPlugin] },
  cjs: { entryFileNames: createEntryFileNames(".cjs") },
};

export function createBuildEntry(input, output, format) {
  const { entryFileNames, plugins } = formatConfig[format];
  return {
    input,
    plugins,
    external: [/^[^./]/, /^node:/],
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
  };
}
