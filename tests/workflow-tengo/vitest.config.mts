import { createVitestConfig } from "@milaboratories/build-configs";
import { configDefaults, defineConfig } from "vitest/config";

// The 10k-file workdir test makes the backend workflow controller busy for
// about a minute. The controller runs one template at a time, so in this time
// the templates of all other tests wait, and tests with a 15s budget fail on
// timeouts. This test must not run at the same time as other test files: its
// project has a higher groupOrder, so it starts only after all other files end.
const ISOLATED_TESTS = ["src/exec/large-workdir.test.ts"];

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
      projects: [
        {
          extends: true,
          test: {
            name: "shared-backend",
            exclude: [...configDefaults.exclude, ...ISOLATED_TESTS],
            sequence: { groupOrder: 0 },
          },
        },
        {
          extends: true,
          test: {
            name: "isolated",
            include: ISOLATED_TESTS,
            sequence: { groupOrder: 1 },
          },
        },
      ],
    },
  }),
);
