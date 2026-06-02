// Synthetic-fixture round trip through the IR.
//
// Exercises module-global builders (D2): `defineStructure(() => { ... })`
// with builders imported by name. Covers a scope frame, a when frame, both
// mode frames (`onUpdateDeps` and `onInitOrUpdate`), a rename. Asserts IR
// shape, the post-flatten ordered list (including the per-leaf `modes`
// set), and that two independent build invocations produce
// structurally-equal trees (the active-context machinery resets cleanly
// between runs).

import { describe, test, expect } from "vitest";
import {
  defineStructure,
  scope,
  when,
  onUpdateDeps,
  onInitOrUpdate,
  fixed,
  managed,
  remove,
  rename,
  file,
} from "../api";
import type { Structure } from "../ir";
import { flatten } from "../flatten";
import { createRunContext } from "../ctx";

function buildStructure(): Structure {
  return defineStructure(() => {
    scope("root", () => {
      fixed("turbo.json", file("root/turbo.json"));
      remove(".prettierrc");
      managed("package.json", file("root/package.json"), () => {
        /* body — step 1 stub */
      });
      when(
        ({ ctx }) => !ctx.isSdkInternal,
        () => {
          rename("test/", "test-legacy/");
        },
      );
    });
    scope("model", () => {
      fixed("tsconfig.json", file("model/tsconfig.json"));
    });
    onUpdateDeps(() => {
      scope("root", () => {
        managed("pnpm-workspace.yaml", file("root/pnpm-workspace.yaml"), () => {
          /* update-deps-only catalog bumps live here */
        });
      });
    });
    onInitOrUpdate(() => {
      scope("root", () => {
        managed("catalog.yaml", file("root/catalog.yaml"), () => {
          /* init + update-deps version resolution lives here */
        });
      });
    });
  });
}

describe("synthetic fixture", () => {
  test("IR shape matches expectation", () => {
    const s = buildStructure();
    expect(s.children.length).toBe(4);
    const rootFrame = s.children[0]!;
    expect(rootFrame.kind).toBe("scope");
    if (rootFrame.kind !== "scope") throw new Error("unreachable");
    expect(rootFrame.scope).toBe("root");
    expect(rootFrame.children.length).toBe(4);
    expect(rootFrame.children[0]!.kind).toBe("fixed");
    expect(rootFrame.children[1]!.kind).toBe("remove");
    expect(rootFrame.children[2]!.kind).toBe("managed");
    expect(rootFrame.children[3]!.kind).toBe("when");
    // Both mode frames flatten to `kind: "mode"`, distinguished by `modes`.
    const updFrame = s.children[2]!;
    const initUpdFrame = s.children[3]!;
    expect(updFrame.kind).toBe("mode");
    expect(initUpdFrame.kind).toBe("mode");
    if (updFrame.kind !== "mode" || initUpdFrame.kind !== "mode") throw new Error("unreachable");
    expect(updFrame.modes).toEqual(["updateDeps"]);
    expect(initUpdFrame.modes).toEqual(["init", "updateDeps"]);
  });

  test("flatten produces expected flat-item list (per-leaf modes tagged)", () => {
    const s = buildStructure();
    const ctx = createRunContext({
      blockVars: {
        facadeName: "@platforma-open/x.demo",
        baseName: "x.demo",
        npmOrg: "@platforma-open",
        orgScope: "x",
        shortName: "demo",
      },
      modules: [
        { scope: "root", name: "@platforma-open/x.demo", path: "" },
        { scope: "model", name: "@platforma-open/x.demo.model", path: "model" },
      ],
    });
    const flat = flatten(s, ctx);
    // 4 leaves in root scope + 1 in model + 1 in onUpdateDeps→root + 1 in
    // onInitOrUpdate→root.
    expect(flat.length).toBe(7);
    expect(flat[0]!.resolvedPath).toBe("turbo.json");
    // A normal leaf fires on default refresh/check + init, never update-deps.
    expect(flat[0]!.modes).toEqual(["default", "init"]);

    const renameItem = flat.find((f) => f.leaf.kind === "rename");
    expect(renameItem).toBeDefined();
    expect(renameItem!.resolvedPath).toBe("test/");
    expect(renameItem!.resolvedTo).toBe("test-legacy/");
    expect(renameItem!.triggers.length).toBe(1);

    const updOnly = flat.find((f) => f.resolvedPath === "pnpm-workspace.yaml");
    expect(updOnly!.modes).toEqual(["updateDeps"]);

    const initOrUpd = flat.find((f) => f.resolvedPath === "catalog.yaml");
    expect(initOrUpd!.modes).toEqual(["init", "updateDeps"]);

    // Leaves that fire in update-deps mode = both mode-framed leaves.
    const updItems = flat.filter((f) => f.modes.includes("updateDeps"));
    expect(updItems.map((f) => f.resolvedPath).sort()).toEqual([
      "catalog.yaml",
      "pnpm-workspace.yaml",
    ]);
  });

  test("two builds produce structurally-equal trees", () => {
    const a = buildStructure();
    const b = buildStructure();
    // Functions inside the tree (trigger, body, generate) won't
    // compare deep-equal across builds — strip them for the shape
    // check.
    const strip = (val: unknown): unknown => {
      if (typeof val === "function") return "[fn]";
      if (Array.isArray(val)) return val.map(strip);
      if (val && typeof val === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(val as object)) {
          out[k] = strip(v);
        }
        return out;
      }
      return val;
    };
    expect(strip(a)).toEqual(strip(b));
  });

  test("builder called outside defineStructure throws", () => {
    expect(() => fixed("oops.json", file("nope"))).toThrow(/defineStructure/);
  });
});
