import { createVitestConfig } from "@milaboratories/build-configs";
import { defineConfig } from "vitest/config";

export default defineConfig(
  createVitestConfig({
    test: {
      environment: "node",
      include: ["tests/**/*.test.ts"],
      coverage: {
        exclude: ["node_modules/", "dist/", "tests/", "**/*.d.ts"],
      },
    },
  }),
);
