// Synthetic-fixture round trip through the IR.
//
// Exercises module-global builders (D2): `defineStructure(() => { ... })`
// with builders imported by name. Covers a scope frame, a when frame,
// an onUpdateDeps frame (D1), a rename. Asserts IR shape, the
// post-flatten ordered list (including the updateDepsOnly flag), and
// that two independent build invocations produce structurally-equal
// trees (the active-context machinery resets cleanly between runs).

import { describe, test, expect } from "vitest";
import {
  defineStructure,
  scope,
  when,
  onUpdateDeps,
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
          /* catalog bumps live here (step 3) */
        });
      });
    });
  });
}

describe("synthetic fixture", () => {
  test("IR shape matches expectation", () => {
    const s = buildStructure();
    expect(s.children.length).toBe(3);
    const rootFrame = s.children[0]!;
    expect(rootFrame.kind).toBe("scope");
    if (rootFrame.kind !== "scope") throw new Error("unreachable");
    expect(rootFrame.scope).toBe("root");
    expect(rootFrame.children.length).toBe(4);
    expect(rootFrame.children[0]!.kind).toBe("fixed");
    expect(rootFrame.children[1]!.kind).toBe("remove");
    expect(rootFrame.children[2]!.kind).toBe("managed");
    expect(rootFrame.children[3]!.kind).toBe("when");
    expect(s.children[2]!.kind).toBe("onUpdateDeps");
  });

  test("flatten produces expected flat-item list (updateDepsOnly tagged)", () => {
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
    // 4 leaves in root scope + 1 in model + 1 in onUpdateDeps→root.
    expect(flat.length).toBe(6);
    expect(flat[0]!.resolvedPath).toBe("turbo.json");
    expect(flat[0]!.updateDepsOnly).toBe(false);
    const renameItem = flat.find((f) => f.leaf.kind === "rename");
    expect(renameItem).toBeDefined();
    expect(renameItem!.resolvedPath).toBe("test/");
    expect(renameItem!.resolvedTo).toBe("test-legacy/");
    expect(renameItem!.triggers.length).toBe(1);
    const updItems = flat.filter((f) => f.updateDepsOnly);
    expect(updItems.length).toBe(1);
    expect(updItems[0]!.resolvedPath).toBe("pnpm-workspace.yaml");
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
