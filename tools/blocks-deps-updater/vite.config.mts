import { defineConfig } from "vite";
import { resolve } from "node:path";
import nodeExternals from "rollup-plugin-node-externals";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve("src", "index.ts"),
      },
      formats: ["es", "cjs"],
    },
    sourcemap: true,
    rolldownOptions: {},
  },
  plugins: [nodeExternals(), dts()],
});
