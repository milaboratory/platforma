// Synthetic-fixture round trip through the IR.
//
// Two scopes (root + model), one managed file, one rename. Asserts
// that defineStructure returns the expected tree shape, that flatten
// produces the expected ordered FlatItem list, and that running the
// builder twice yields a deep-equal result (pure data — no hidden
// state).

import { describe, test, expect } from "vitest";
import { defineStructure } from "../api";
import type { Structure } from "../ir";
import { flatten } from "../flatten";
import { createRunContext } from "../ctx";

function buildStructure(): Structure {
  return defineStructure(({ scope, when, fixed, managed, remove, rename, file }) => {
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
  });
}

describe("synthetic fixture", () => {
  test("IR shape matches expectation", () => {
    const s = buildStructure();
    expect(s.children.length).toBe(2);
    const rootFrame = s.children[0]!;
    expect(rootFrame.kind).toBe("scope");
    if (rootFrame.kind !== "scope") throw new Error("unreachable");
    expect(rootFrame.scope).toBe("root");
    expect(rootFrame.children.length).toBe(4);
    expect(rootFrame.children[0]!.kind).toBe("fixed");
    expect(rootFrame.children[1]!.kind).toBe("remove");
    expect(rootFrame.children[2]!.kind).toBe("managed");
    expect(rootFrame.children[3]!.kind).toBe("when");
  });

  test("flatten produces expected flat-item list", () => {
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
    // 3 leaves in root scope + 1 rename in when + 1 leaf in model.
    expect(flat.length).toBe(5);
    expect(flat[0]!.scope).toBe("root");
    expect(flat[0]!.resolvedPath).toBe("turbo.json");
    expect(flat[3]!.leaf.kind).toBe("rename");
    expect(flat[3]!.resolvedPath).toBe("test/");
    expect(flat[3]!.resolvedTo).toBe("test-legacy/");
    expect(flat[3]!.triggers.length).toBe(1);
    expect(flat[4]!.scope).toBe("model");
    expect(flat[4]!.resolvedPath).toBe("model/tsconfig.json");
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
});
