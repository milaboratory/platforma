// Root `turbo.json`: the initial generator and the drift-correcting body
// rules, co-located. Managed (not fixed) so the engine OWNS its own task
// graph but LEAVES author-added tasks alone — `ensureFieldEntries("tasks", …)`
// merges the canonical engine tasks over whatever is there, preserving any
// other key under `tasks`.
//
// Why this matters: blocks with a Python software package carry a
// `software:reqs` task (a `requirements-sync` CI job runs `turbo run
// software:reqs`). When turbo.json was `fixed`, every `upgrade-sdk` wiped that
// task and CI failed with "Could not find task software:reqs". `software:reqs`
// is deliberately NOT in the engine-owned set below — it (and any custom task)
// is author-owned and survives refresh via the merge.

import { ensureField, ensureFieldEntries, enforceFieldOrder } from "../engine/api";

const SCHEMA = "https://turbo.build/schema.json";
const GLOBAL_DEPENDENCIES = ["tsconfig.json"];

// The tasks the engine owns. Re-asserted on every refresh; author tasks
// (e.g. `software:reqs`) are merged around these, never clobbered.
const ENGINE_TASKS: Record<string, unknown> = {
  fmt: { cache: false },
  check: { dependsOn: ["^build"], outputs: [] },
  build: {
    dependsOn: ["^build", "check"],
    inputs: ["$TURBO_DEFAULT$"],
    env: [
      "PL_DOCKER_REGISTRY_PUSH_TO",
      "PL_BUILD_CHANNEL",
      "PL_BUILD_VARIANT",
      "PL_BUILD_LOCATION",
      "PL_BUILD_USE_PUBLISHED",
      "PL_DEV_DOCKER_PUSH_URL",
      "PL_DEV_DOCKER_PULL_URL",
      "PL_DEV_BINARY_UPLOAD_URL",
      "PL_RELEASE_DOCKER_PUSH_URL",
      "PL_RELEASE_DOCKER_PULL_URL",
      "PL_RELEASE_BINARY_UPLOAD_URL",
      "PL_REGISTRY_PLATFORMA_OPEN_UPLOAD_URL",
    ],
    passThroughEnv: ["AWS_*", "PL_AWS_*"],
    outputs: ["./dist/**", "./block-pack/**", "./pkg-*.tgz"],
  },
  "build:dev": { dependsOn: ["build"], outputs: ["./dist/**"] },
  "do-pack": { dependsOn: ["build"], outputs: ["package.tgz"] },
  test: {
    dependsOn: ["build", "check"],
    passThroughEnv: ["PL_ADDRESS", "PL_TEST_PASSWORD", "PL_TEST_USER", "PL_TEST_PROXY", "DEBUG"],
  },
  "mark-stable": { passThroughEnv: ["PL_REGISTRY", "AWS_*"], cache: false },
};

export function rootTurboJsonInitial(): Record<string, unknown> {
  return {
    $schema: SCHEMA,
    globalDependencies: GLOBAL_DEPENDENCIES,
    tasks: { ...ENGINE_TASKS },
  };
}

export function rootTurboJsonRules(): void {
  ensureField("$schema", SCHEMA);
  ensureField("globalDependencies", GLOBAL_DEPENDENCIES);
  // Merge the engine tasks, preserving any author task (software:reqs, …).
  ensureFieldEntries("tasks", ENGINE_TASKS);
  enforceFieldOrder(["$schema", "globalDependencies", "tasks"]);
}
