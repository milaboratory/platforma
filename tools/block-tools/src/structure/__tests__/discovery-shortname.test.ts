// DISCOVERY derives BlockVars from the block-scope module's package name.
// This structurer names that package `<facade>.block`, while the root
// package carries no `name` — so on refresh/check the `.block` suffix would
// leak into `shortName` unless discovery strips it (see discovery-fs.ts).
// These tests pin both shapes: the structurer-shaped block (suffix stripped)
// and a legacy block whose block package IS the bare facade (nothing to
// strip).

import { describe, test, expect } from "vitest";
import type { BlockVars } from "../engine/api";
import { simulateInit } from "../engine/testing";
import { discoverRunContext } from "../engine/discovery-fs";
import { MemoryFileSystem } from "../engine/fs/memory";

describe("DISCOVERY: shortName from the block package name", () => {
  test("strips the trailing .block for a <facade>.block-shaped block", () => {
    const vars: BlockVars = {
      facadeName: "@platforma-open/test-org.demo",
      baseName: "test-org.demo",
      npmOrg: "@platforma-open",
      orgScope: "test-org",
      shortName: "demo",
    };
    // simulateInit runs the real init then RE-DISCOVERS from the written FS,
    // so this is the genuine refresh/check derivation path.
    const { ctx } = simulateInit({ vars });
    // Sanity: the block package really is named `<facade>.block` on disk.
    const blockMod = ctx.modules.find((m) => m.scope === "block");
    expect(blockMod?.name).toBe("@platforma-open/test-org.demo.block");
    expect(ctx.blockVars.shortName).toBe("demo");
  });

  test("keeps the real shortName for a legacy bare-facade block package", () => {
    const fs = new MemoryFileSystem({
      "pnpm-workspace.yaml": "packages:\n  - block\n",
      // Nameless root — the standalone shape; classified `root` by path.
      "package.json": "{}",
      // Legacy block package: name IS the bare facade, no `.block` suffix.
      // Classified `block` via its top-level `block` field (every real block —
      // legacy shim or migrated facade — carries one).
      "block/package.json": JSON.stringify({
        name: "@platforma-open/test-org.legacy",
        files: ["index.d.ts", "index.js"],
        dependencies: { "@platforma-sdk/block-tools": "*" },
        block: { components: {}, meta: {} },
      }),
    });
    const ctx = discoverRunContext({ fs, isSdkInternal: false });
    const blockMod = ctx.modules.find((m) => m.scope === "block");
    expect(blockMod?.name).toBe("@platforma-open/test-org.legacy");
    expect(ctx.blockVars.shortName).toBe("legacy");
  });
});
