import { createVitestVueConfig } from "@milaboratories/build-configs";
import { defineConfig } from "vitest/config";

export default defineConfig(
  createVitestVueConfig({
    resolve: {
      conditions: ["sources"],
    },
    test: {
      includeSource: ["src/**/*.{js,ts}"],
      setupFiles: ["./src/__tests__/setup.ts"],
      projects: [
        {
          extends: true,
          test: {
            name: "node",
            environment: "node",
            include: ["src/**/*.test.ts"],
          },
        },
        {
          extends: true,
          test: {
            name: "jsdom",
            environment: "jsdom",
            include: ["src/**/*.jsdomtest.ts"],
          },
        },
      ],
    },
  }),
);
