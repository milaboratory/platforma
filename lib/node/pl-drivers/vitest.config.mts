import { createVitestConfig } from "@milaboratories/build-configs";
import { defineConfig } from "vitest/config";

export default defineConfig(
  createVitestConfig({
    test: {
      testTimeout: 30_000,
      coverage: {
        exclude: ["src/proto", "**/*.js"],
      },
    },
  }),
);
