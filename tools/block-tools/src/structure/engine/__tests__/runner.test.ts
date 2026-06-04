// Engine runner — structural pass, managed pass, mode semantics.
//
// Covers:
//   - init (fresh FS): structural + managed primitives all fire.
//   - refresh (post-init same FS): idempotent — second run is no-op.
//   - check (dryRun): no writes; same changes reported as refresh would.
//   - .structure is written only in refresh default mode (not check,
//     not --update-deps-only).

import { describe, test, expect } from "vitest";
import { defineStructure, scope, managed, fixed, remove, text, generate } from "../api";
import type { Structure } from "../ir";
import type { RunContext } from "../api";
import { createRunContext } from "../ctx";
import { MemoryFileSystem } from "../fs/memory";
import { run } from "../runner";
import { ensureField } from "../content-rules";
import { STRUCTURE_META_FILE, STRUCTURE_VERSION } from "../version";

function syntheticStructure(): Structure {
  return defineStructure(() => {
    scope("root", () => {
      fixed("turbo.json", text('{ "$schema": "https://turbo.build/schema.json" }\n'));
      remove("legacy.txt");
      managed(
        "package.json",
        generate(() => ({ name: "demo", version: "1.0.0" })),
        () => {
          ensureField("type", "module");
          ensureField("scripts.build", "echo build");
        },
      );
    });
    scope("model", () => {
      fixed("tsconfig.json", text('{ "extends": "../tsconfig.base.json" }\n'));
    });
  });
}

function ctxFor(opts: Partial<RunContext> = {}): RunContext {
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
      { scope: "model", name: "@platforma-open/demo.model", path: "model" },
    ],
    ...opts,
  });
}

describe("runner — init + refresh + check", () => {
  test("init (fresh FS): structural + managed primitives all fire", async () => {
    const fs = new MemoryFileSystem();
    const ctx = ctxFor();
    const result = run(syntheticStructure(), fs, ctx);
    // Expected changes: fixed root/turbo.json + managed root/package.json
    // + fixed model/tsconfig.json. remove("legacy.txt") is no-op (file
    // never existed). Plus the .structure-version write at end (not in
    // change list).
    const paths = result.changes.map((c) => c.path).sort();
    expect(paths).toContain("turbo.json");
    expect(paths).toContain("package.json");
    expect(paths).toContain("model/tsconfig.json");
    expect(paths).not.toContain("legacy.txt");

    // Files actually written.
    expect(fs.exists("turbo.json")).toBe(true);
    expect(fs.exists("model/tsconfig.json")).toBe(true);
    const pkg = JSON.parse(fs.read("package.json"));
    expect(pkg.type).toBe("module");
    expect(pkg.scripts.build).toBe("echo build");
    // .structure-version written.
    expect(fs.exists(STRUCTURE_META_FILE)).toBe(true);
    expect(JSON.parse(fs.read(STRUCTURE_META_FILE))).toEqual({
      version: STRUCTURE_VERSION,
    });
  });

  test("refresh (second run on same FS): idempotent — zero changes", async () => {
    const fs = new MemoryFileSystem();
    const ctx = ctxFor();
    run(syntheticStructure(), fs, ctx);
    const second = run(syntheticStructure(), fs, ctx);
    expect(second.changes).toEqual([]);
  });

  test("check (dryRun): no writes; reports what refresh would do", async () => {
    const fs = new MemoryFileSystem();
    const ctx = ctxFor({ dryRun: true });
    const result = run(syntheticStructure(), fs, ctx);
    // Reports the same primitives that refresh would apply.
    const paths = result.changes.map((c) => c.path).sort();
    expect(paths).toContain("turbo.json");
    expect(paths).toContain("package.json");
    expect(paths).toContain("model/tsconfig.json");
    // No actual writes.
    expect(fs.exists("turbo.json")).toBe(false);
    expect(fs.exists(STRUCTURE_META_FILE)).toBe(false);
  });

  test("refresh removes a file that does exist", async () => {
    const fs = new MemoryFileSystem({ "legacy.txt": "x" });
    const ctx = ctxFor();
    const result = run(syntheticStructure(), fs, ctx);
    const removed = result.changes.find((c) => c.primitive === "remove");
    expect(removed).toBeDefined();
    expect(removed!.path).toBe("legacy.txt");
    expect(fs.exists("legacy.txt")).toBe(false);
  });
});

describe("runner — .structure write gated by mode", () => {
  test("refresh default mode writes .structure", async () => {
    const fs = new MemoryFileSystem();
    run(syntheticStructure(), fs, ctxFor());
    expect(fs.exists(STRUCTURE_META_FILE)).toBe(true);
  });

  test("check (dryRun) does NOT write .structure", async () => {
    const fs = new MemoryFileSystem();
    run(syntheticStructure(), fs, ctxFor({ dryRun: true }));
    expect(fs.exists(STRUCTURE_META_FILE)).toBe(false);
  });

  test("refresh --update-deps-only does NOT write .structure", async () => {
    const fs = new MemoryFileSystem();
    run(syntheticStructure(), fs, ctxFor({ updateDepsOnly: true }));
    expect(fs.exists(STRUCTURE_META_FILE)).toBe(false);
  });
});
