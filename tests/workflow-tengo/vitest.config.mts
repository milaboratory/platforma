import { createVitestConfig } from "@milaboratories/build-configs";
import { defineConfig } from "vitest/config";

export default defineConfig(
  createVitestConfig({
    test: {
      pool: "forks",
      setupFiles: ["./vitest/setup.worker-jitter.ts"],
      testTimeout: 15000,
      maxConcurrency: 1,
      // PL_TEST_MAX_WORKERS lets a CI backend with spare job capacity run more
      // test files at once; 2 when unset.
      maxWorkers: Number(process.env.PL_TEST_MAX_WORKERS) || 2,
      retry: 2,
      reporters: ["verbose"],
      sequence: {
        shuffle: { files: true, tests: true },
        seed: Number(process.env.VITEST_SEED ?? Date.now()),
        concurrent: false,
      },
    },
  }),
);
