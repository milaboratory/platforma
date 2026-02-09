import { defineConfig } from "rolldown";
import { commonOutputConfig } from "./common.mjs";
import { dtsResolvePlugin } from "./plugins.mjs";

export default defineConfig([
  {
    input: "./src/index.ts",
    external: [/^[^./]/, /^node:/],
    plugins: [dtsResolvePlugin()],
    output: [
      {
        format: "es",
        ...commonOutputConfig,
      },
      {
        format: "cjs",
        ...commonOutputConfig,
      },
    ],
  },
  {
    input: "./src/index.ts",
    plugins: [dtsResolvePlugin()],
    output: {
      dir: "dist",
      name: "block-model",
      format: "umd",
      entryFileNames: "bundle.js",
      sourcemap: true,
    },
  },
]);
