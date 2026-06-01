// Validation: a path cannot be declared as both `seed` and any
// engine-managed primitive (`fixed` / `managed` / `scaffold`) within
// the same scope.

import { describe, expect, test } from "vitest";
import { defineStructure, scope, seed, managed, fixed, scaffold, text, file } from "../engine/api";

describe("seed/managed disjointness", () => {
  test("seed + managed on same path throws", () => {
    expect(() =>
      defineStructure(() => {
        scope("model", () => {
          seed("src/index.ts", text("// seed\n"));
          managed("src/index.ts", file("model/index.ts"), () => {});
        });
      }),
    ).toThrow(/path 'src\/index\.ts'.*both seed and/);
  });

  test("seed + fixed on same path throws", () => {
    expect(() =>
      defineStructure(() => {
        scope("ui", () => {
          fixed("index.html", file("ui/index.html"));
          seed("index.html", text("<!doctype html>\n"));
        });
      }),
    ).toThrow(/path 'index\.html'.*both seed and/);
  });

  test("seed + scaffold on same path throws", () => {
    expect(() =>
      defineStructure(() => {
        scope("workflow", () => {
          scaffold("README.md", text("# seed README\n"));
          seed("README.md", text("# seed README\n"));
        });
      }),
    ).toThrow(/path 'README\.md'.*both seed and/);
  });

  test("seed on its own (no collision) is fine", () => {
    expect(() =>
      defineStructure(() => {
        scope("model", () => {
          seed("src/index.ts", text("// seed only\n"));
        });
      }),
    ).not.toThrow();
  });

  test("fixed + managed on same path is fine (no seed)", () => {
    // This is a structural mistake of a different kind (fixed and
    // managed both write to the same path) but is NOT in scope of
    // this validation — the seed disjointness rule is specifically
    // about seed contracts. Other collisions surface at runtime.
    expect(() =>
      defineStructure(() => {
        scope("model", () => {
          fixed("same.json", text("a\n"));
          managed("same.json", text("a\n"), () => {});
        });
      }),
    ).not.toThrow();
  });

  test("seed and managed on DIFFERENT scopes with the same relative path is fine", () => {
    expect(() =>
      defineStructure(() => {
        scope("model", () => {
          seed("src/index.ts", text("// model seed\n"));
        });
        scope("ui", () => {
          managed("src/index.ts", text("// ui managed\n"), () => {});
        });
      }),
    ).not.toThrow();
  });
});
