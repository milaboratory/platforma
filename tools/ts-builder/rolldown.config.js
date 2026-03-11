import { globSync } from "node:fs";
import { defineConfig } from "rolldown";
import copy from "rollup-plugin-copy";

export default defineConfig([
  {
    input: "./src/cli.ts",
    external: [/^[^./]/, /^node:/],
    plugins: [
      copy({
        targets: [{ src: "public/*", dest: "dist/configs" }],
      }),
    ],
    output: {
      dir: "dist",
      format: "es",
      sourcemap: true,
      banner: "#!/usr/bin/env node",
    },
  },
  {
    input: [...globSync("./src/configs/rolldown/*.ts"), ...globSync("./src/configs/vite/*.ts")],
    external: [/^[^./]/, /^node:/],
    output: {
      dir: "dist/configs",
      format: "es",
      preserveModules: true,
    },
  },
]);
