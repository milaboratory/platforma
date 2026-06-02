// `whenFilesExist` resolves its glob MODULE-RELATIVE to the leaf's bound
// module, so the same predicate gates differently per scope when a scope
// frame fans out. Drives the real runner so the per-item TriggerContext
// threading (modulePath -> filesMatch) is exercised end-to-end.

import { describe, test, expect } from "vitest";
import { defineStructure, managed, scope, generate, when, whenFilesExist } from "../api";
import type { Structure } from "../ir";
import { createRunContext } from "../ctx";
import { MemoryFileSystem } from "../fs/memory";
import { run } from "../runner";
import { ensureField } from "../content-rules";

function structure(): Structure {
  return defineStructure(() => {
    for (const s of ["model", "ui"] as const) {
      scope(s, () => {
        managed(
          "tsconfig.json",
          generate(() => ({ extends: "base" })),
          () => {
            when(whenFilesExist("src/**/*.test.ts"), () => {
              ensureField("compilerOptions.types", ["node"]);
            });
          },
        );
      });
    }
  });
}

function ctx() {
  return createRunContext({
    blockVars: {
      facadeName: "@platforma-open/demo",
      baseName: "demo",
      npmOrg: "@platforma-open",
      orgScope: "demo",
      shortName: "demo",
    },
    modules: [
      { scope: "model", name: "@platforma-open/demo.model", path: "model" },
      { scope: "ui", name: "@platforma-open/demo.ui", path: "ui" },
    ],
  });
}

async function typesOf(fs: MemoryFileSystem, scopePath: string): Promise<unknown> {
  const json = JSON.parse(await fs.read(`${scopePath}/tsconfig.json`)) as {
    compilerOptions?: { types?: unknown };
  };
  return json.compilerOptions?.types;
}

describe("whenFilesExist — module-relative gating via the runner", () => {
  test("gates per module: only the scope whose own src has a test file fires", async () => {
    const fs = new MemoryFileSystem();
    // A co-located test under model/, none under ui/.
    await fs.write("model/src/label.test.ts", "// test");
    await fs.write("ui/src/main.ts", "// not a test");

    await run(structure(), fs, ctx());

    expect(await typesOf(fs, "model")).toEqual(["node"]);
    // ui has no test file -> predicate false -> no node types.
    expect(await typesOf(fs, "ui")).toBeUndefined();
  });

  test("nested test path (src/test/*.test.ts) still matches via **", async () => {
    const fs = new MemoryFileSystem();
    await fs.write("ui/src/test/import.test.ts", "// nested test");

    await run(structure(), fs, ctx());

    expect(await typesOf(fs, "ui")).toEqual(["node"]);
    expect(await typesOf(fs, "model")).toBeUndefined();
  });

  test("no test files anywhere -> neither scope gets node types", async () => {
    const fs = new MemoryFileSystem();
    await fs.write("model/src/index.ts", "// source");
    await fs.write("ui/src/main.ts", "// source");

    await run(structure(), fs, ctx());

    expect(await typesOf(fs, "model")).toBeUndefined();
    expect(await typesOf(fs, "ui")).toBeUndefined();
  });
});
