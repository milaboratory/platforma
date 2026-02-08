import { createVitestConfig } from "@milaboratories/build-configs";
import { defineConfig } from "vitest/config";

export default defineConfig(
  createVitestConfig({
    test: {
      coverage: {
        exclude: ["src/proto", "**/*.js"],
      },
    },
  }),
);
