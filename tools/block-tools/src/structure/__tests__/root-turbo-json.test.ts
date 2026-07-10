// turbo.json is `managed`, not `fixed`: the engine re-asserts its own tasks
// but must leave author-added tasks (notably `software:reqs`, which a
// Python-block `requirements-sync` CI job runs via `turbo run software:reqs`)
// untouched. These guard that contract.

import { describe, test, expect } from "vitest";
import { runRulesAgainst } from "../engine/testing";
import { rootTurboJsonInitial, rootTurboJsonRules } from "../rules/root-turbo-json";

describe("root turbo.json rules", () => {
  test("corrects a drifted engine task and preserves an author task", () => {
    const drifted = {
      $schema: "https://turbo.build/schema.json",
      tasks: {
        build: { env: ["ONLY_ONE"] }, // engine task, drifted
        "build:dev": { dependsOn: ["build"], outputs: ["./dist/**"] }, // legacy, must go
        "software:reqs": { cache: false, outputs: ["./src/requirements.txt"] }, // author task
      },
    };

    const out = runRulesAgainst(drifted, () => rootTurboJsonRules());
    const tasks = out.tasks as Record<string, { env?: string[]; outputs?: string[] }>;

    // Engine task re-asserted to canonical.
    expect(tasks.build.env).toContain("PL_BUILD_CHANNEL");
    expect(tasks.build.outputs).toEqual(["./dist/**", "./block-pack/**", "./pkg-*.tgz"]);
    // Legacy task pruned.
    expect(tasks["build:dev"]).toBeUndefined();
    // Author task left exactly as it was.
    expect(tasks["software:reqs"]).toEqual({ cache: false, outputs: ["./src/requirements.txt"] });
    expect(out.globalDependencies).toEqual(["tsconfig.json"]);
  });

  test("initial owns the engine tasks but not software:reqs or legacy build:dev", () => {
    const keys = Object.keys(rootTurboJsonInitial().tasks as Record<string, unknown>);
    expect(keys).toContain("build");
    expect(keys).toContain("test");
    expect(keys).not.toContain("software:reqs");
    expect(keys).not.toContain("build:dev");
  });
});
