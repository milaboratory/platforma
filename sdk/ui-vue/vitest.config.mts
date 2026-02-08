import { createVitestVueConfig } from "@milaboratories/build-configs";
import { defineConfig } from "vitest/config";

export default defineConfig(
  createVitestVueConfig({
    test: {
      includeSource: ["src/**/*.{js,ts}"],
    },
  }),
);
