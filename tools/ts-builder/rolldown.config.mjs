import { defineConfig } from "rolldown";
import copy from "rollup-plugin-copy";

export default defineConfig({
  input: "./src/cli.ts",
  external: [/^[^./]/, /^node:/],
  plugins: [
    copy({
      targets: [{ src: "src/configs/*", dest: "dist/configs" }],
    }),
  ],
  output: {
    dir: "dist",
    format: "es",
    sourcemap: true,
    banner: "#!/usr/bin/env node",
  },
});
