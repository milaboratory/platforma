import { createVitestConfig } from "@milaboratories/build-configs";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  defineConfig(createVitestConfig()),
  defineConfig({
    test: {
      setupFiles: ["./vitest.setup.mts"],
    },
  }),
);
