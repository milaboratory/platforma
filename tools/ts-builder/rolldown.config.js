import { globSync } from "node:fs";
import { isAbsolute } from "node:path";
import { defineConfig } from "rolldown";
import copy from "rollup-plugin-copy";

// Externalize bare specifiers only. `external` is consulted both before and after
// resolution, so a plain /^[^./]/ would also match resolved absolute paths on
// Windows ("C:\...") and wrongly externalize our own modules.
const external = (id) => !id.startsWith(".") && !isAbsolute(id);

export default defineConfig([
  {
    input: "./src/cli.ts",
    external,
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
    external,
    output: {
      dir: "dist/configs",
      format: "es",
      preserveModules: true,
    },
  },
]);
