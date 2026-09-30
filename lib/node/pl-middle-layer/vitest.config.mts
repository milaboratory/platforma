import { resolve } from "path";
import { createVitestConfig } from "@milaboratories/build-configs";
import { configDefaults, defineConfig } from "vitest/config";

// The folder and sharing suites create and delete far more projects than any other, and while
// the backend cleans up after a deleted project every project written anywhere keeps conflicting
// with it. They run as a group of their own, after the rest, so they never do that under a test
// that waits for blocks to compute.
const projectHeavySuites = ["src/middle_layer/folders.test.ts", "src/middle_layer/sharing.test.ts"];

export default defineConfig(
  createVitestConfig({
    test: {
      testTimeout: 80000,
      hookTimeout: 80000,
      projects: [
        {
          extends: true,
          test: { name: "main", exclude: [...configDefaults.exclude, ...projectHeavySuites] },
        },
        {
          extends: true,
          test: { name: "project-heavy", include: projectHeavySuites, sequence: { groupOrder: 1 } },
        },
      ],
    },
    define: {
      __WORKER_PATH__: JSON.stringify(resolve(__dirname, "dist", "worker", "worker.js")),
    },
  }),
);
