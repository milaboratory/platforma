import { createVitestConfig } from "@milaboratories/build-configs";
import { defineConfig } from "vitest/config";

export default defineConfig(
  createVitestConfig({
    test: {
      pool: "forks",
      maxConcurrency: 1,
      retry: 2,
      reporters: ["verbose"],
    },
  }),
);
