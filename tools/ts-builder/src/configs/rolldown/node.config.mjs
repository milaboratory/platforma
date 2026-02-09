import { defineConfig } from "rolldown";
import { dtsResolvePlugin } from "./plugins.mjs";
import { commonOutputConfig } from "./common.mjs";

export default defineConfig({
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
});
