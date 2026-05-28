// End-to-end runner test: `when(...)` called inside a managed body
// receives the post-structural-pass TriggerContext from the runner.
//
// Scenario mirrors the compound-migration pattern from
// `dsl-example.md` § "Mutation-Outside-Managed-Body": a rename creates
// `test-legacy/`; the managed body for `block/package.json` carries a
// `when(pathExists("test-legacy/"), ...)` block that rewrites the dep
// once the rename has landed.

import { describe, test, expect } from "vitest";
import { defineStructure, fixed, managed, rename, scope, text, generate, when } from "../api";
import type { Structure } from "../ir";
import { createRunContext } from "../ctx";
import { MemoryFileSystem } from "../fs/memory";
import { run } from "../runner";
import { ensureDep, ensureField, removeDep } from "../content-rules";

function migrationStructure(): Structure {
  return defineStructure(() => {
    // Migration: rename test/ → test-legacy/ once, idempotent via FS
    // state. Wrapped in root scope (every leaf needs a scope frame).
    scope("root", () => {
      when(
        ({ pathExists }) => pathExists("test/"),
        () => {
          rename("test/", "test-legacy/");
        },
      );
    });

    scope("block", () => {
      fixed(".keep", text("ok\n"));
      managed(
        "package.json",
        generate(() => ({ name: "demo.block", dependencies: { "old-test": "workspace:*" } })),
        () => {
          ensureField("type", "module");
          // Inner when: rewrite dep target once the rename has landed.
          // Runner builds the post-structural-pass snapshot, so
          // `pathExists("test-legacy/")` is true on the same run.
          when(
            ({ pathExists }) => pathExists("test-legacy/"),
            () => {
              removeDep("old-test");
              ensureDep("new-test", "workspace:*");
            },
          );
        },
      );
    });
  });
}

function ctxFor() {
  return createRunContext({
    blockVars: {
      facadeName: "@platforma-open/demo",
      baseName: "demo",
      npmOrg: "@platforma-open",
      orgScope: "demo",
      shortName: "demo",
    },
    modules: [
      { scope: "root", name: "@platforma-open/demo", path: "" },
      { scope: "block", name: "@platforma-open/demo.block", path: "block" },
    ],
  });
}

describe("runner: inner when() sees post-structural-pass snapshot", () => {
  test("rename + inner when fire together; deps rewritten in one refresh", async () => {
    const fs = new MemoryFileSystem();
    await fs.write("test/a.ts", "// legacy");
    await fs.write(
      "block/package.json",
      JSON.stringify({ name: "demo.block", dependencies: { "old-test": "workspace:*" } }, null, 2) +
        "\n",
    );

    const structure = migrationStructure();
    await run(structure, fs, ctxFor());

    // Rename landed.
    expect(await fs.exists("test-legacy/a.ts")).toBe(true);
    expect(await fs.exists("test/a.ts")).toBe(false);

    // Inner when fired → dep rewritten.
    const pkgRaw = await fs.read("block/package.json");
    const pkg = JSON.parse(pkgRaw) as { dependencies: Record<string, string> };
    expect(pkg.dependencies["old-test"]).toBeUndefined();
    expect(pkg.dependencies["new-test"]).toBe("workspace:*");
  });

  test("second refresh is a no-op (idempotent)", async () => {
    const fs = new MemoryFileSystem();
    await fs.write("test/a.ts", "// legacy");
    await fs.write(
      "block/package.json",
      JSON.stringify({ name: "demo.block", dependencies: { "old-test": "workspace:*" } }, null, 2) +
        "\n",
    );

    const structure = migrationStructure();
    await run(structure, fs, ctxFor());
    const snapshot1 = await fs.read("block/package.json");

    const result2 = await run(structure, fs, ctxFor());
    const snapshot2 = await fs.read("block/package.json");

    expect(snapshot2).toBe(snapshot1);
    // No managed/structural changes the second time.
    const managedOrStructural = result2.changes.filter(
      (c) => c.primitive === "managed" || c.primitive === "rename",
    );
    expect(managedOrStructural).toEqual([]);
  });

  test("inner when skips when sibling path absent", async () => {
    // No `test/` → no rename → no `test-legacy/` → inner when skips.
    const fs = new MemoryFileSystem();
    await fs.write(
      "block/package.json",
      JSON.stringify({ name: "demo.block", dependencies: { "old-test": "workspace:*" } }, null, 2) +
        "\n",
    );

    const structure = migrationStructure();
    await run(structure, fs, ctxFor());

    const pkg = JSON.parse(await fs.read("block/package.json")) as {
      dependencies: Record<string, string>;
    };
    // Original dep survives unchanged.
    expect(pkg.dependencies["old-test"]).toBe("workspace:*");
    expect(pkg.dependencies["new-test"]).toBeUndefined();
  });
});
