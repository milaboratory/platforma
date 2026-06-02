// Unified `when()` — same symbol dispatches by active state.
//
// Outer mode (inside `defineStructure`) is covered by existing
// builders/runner tests. This file covers inner-mode dispatch:
// `when()` called inside a managed(...) body evaluates the trigger
// against the runner-supplied TriggerContext and runs / skips the
// body synchronously.

import { describe, test, expect } from "vitest";
import { when } from "../../builders";
import {
  ensureField,
  ensureCatalogVersion,
  ensureGitignoreEntries,
  removeDep,
  ensureDep,
  withManagedBody,
  withManagedLines,
  withManagedYaml,
  type JsonObject,
} from "../../content-rules";
import { parseYaml } from "../../parsers/yaml";
import { createRunContext } from "../../ctx";
import type { BlockVars, RunContext } from "../../api";
import type { TriggerContext } from "../../ir";

const vars: BlockVars = {
  facadeName: "@platforma-open/demo.x",
  baseName: "demo.x",
  npmOrg: "@platforma-open",
  orgScope: "demo",
  shortName: "x",
};

const ctx: RunContext = createRunContext({ blockVars: vars, modules: [] });

function makeTctx(
  opts: {
    paths?: ReadonlySet<string>;
    version?: number;
  } = {},
): TriggerContext {
  const paths = opts.paths ?? new Set<string>();
  return {
    ctx,
    version: opts.version ?? 1,
    pathExists: (p) => paths.has(p),
    pathMissing: (p) => !paths.has(p),
  };
}

describe("when() — inner-mode dispatch inside managed bodies", () => {
  test("predicate=true runs the body (JSON state)", () => {
    const out = withManagedBody(
      { name: "x" } as JsonObject,
      () => {
        when(
          ({ pathExists }) => pathExists("test-legacy/"),
          () => {
            ensureField("flag", "fired");
          },
        );
      },
      { triggerContext: makeTctx({ paths: new Set(["test-legacy/"]) }) },
    );
    expect(out.flag).toBe("fired");
  });

  test("predicate=false skips the body", () => {
    const out = withManagedBody(
      { name: "x" } as JsonObject,
      () => {
        when(
          ({ pathExists }) => pathExists("test-legacy/"),
          () => {
            ensureField("flag", "fired");
          },
        );
      },
      { triggerContext: makeTctx({ paths: new Set() }) },
    );
    expect(out.flag).toBeUndefined();
  });

  test("inner when works inside a YAML managed body", () => {
    const doc = parseYaml("catalog: {}\n");
    withManagedYaml(
      doc,
      () => {
        when(
          ({ ctx }) => !ctx.isSdkInternal,
          () => {
            ensureCatalogVersion("@platforma-sdk/model", "1.2.3");
          },
        );
      },
      { triggerContext: makeTctx() },
    );
    const cat = (doc.toJSON() as { catalog: Record<string, string> }).catalog;
    expect(cat["@platforma-sdk/model"]).toBe("1.2.3");
  });

  test("inner when works inside a lines managed body", () => {
    const out = withManagedLines(
      [],
      () => {
        when(
          ({ version }) => version >= 1,
          () => {
            ensureGitignoreEntries(["node_modules/"]);
          },
        );
      },
      { triggerContext: makeTctx({ version: 1 }) },
    );
    expect(out).toEqual(["node_modules/"]);
  });

  test("inner when nests: outer predicate false short-circuits inner", () => {
    const seen: string[] = [];
    withManagedBody(
      {} as JsonObject,
      () => {
        when(
          () => false,
          () => {
            seen.push("outer");
            when(
              () => true,
              () => {
                seen.push("inner");
              },
            );
          },
        );
      },
      { triggerContext: makeTctx() },
    );
    expect(seen).toEqual([]);
  });

  test("inner when nests: both true → both bodies run", () => {
    const seen: string[] = [];
    withManagedBody(
      {} as JsonObject,
      () => {
        when(
          () => true,
          () => {
            seen.push("outer");
            when(
              () => true,
              () => {
                seen.push("inner");
              },
            );
          },
        );
      },
      { triggerContext: makeTctx() },
    );
    expect(seen).toEqual(["outer", "inner"]);
  });

  test("inner when exposes ctx via the predicate", () => {
    const out = withManagedBody(
      {} as JsonObject,
      () => {
        when(
          ({ ctx }) => ctx.blockVars.shortName === "x",
          () => {
            ensureField("matched", true);
          },
        );
      },
      { triggerContext: makeTctx() },
    );
    expect(out.matched).toBe(true);
  });

  test("compound migration pattern: rewrite dep when sibling path exists", () => {
    const out = withManagedBody(
      { dependencies: { "test-old": "workspace:*" } } as JsonObject,
      () => {
        ensureField("type", "module");
        when(
          ({ pathExists }) => pathExists("test-legacy/"),
          () => {
            removeDep("test-old");
            ensureDep("test-legacy", "workspace:*");
          },
        );
      },
      { triggerContext: makeTctx({ paths: new Set(["test-legacy/"]) }) },
    );
    expect(out).toEqual({
      type: "module",
      dependencies: { "test-legacy": "workspace:*" },
    });
  });

  test("inner when inside a body throws if triggerContext was not supplied", () => {
    expect(() =>
      withManagedBody({}, () => {
        when(
          () => true,
          () => {
            ensureField("x", 1);
          },
        );
      }),
    ).toThrow(/requires a triggerContext/);
  });

  test("when() called outside any context throws", () => {
    expect(() =>
      when(
        () => true,
        () => {},
      ),
    ).toThrow(/outside defineStructure.*outside any managed/);
  });

  test("idempotent — double-run yields the same parsed state", () => {
    const body = () => {
      ensureField("type", "module");
      when(
        ({ pathExists }) => pathExists("legacy/"),
        () => {
          ensureField("legacy-flag", true);
        },
      );
    };
    const tctx = makeTctx({ paths: new Set(["legacy/"]) });
    const once = withManagedBody({} as JsonObject, body, {
      triggerContext: tctx,
    });
    const twice = withManagedBody(JSON.parse(JSON.stringify(once)) as JsonObject, body, {
      triggerContext: tctx,
    });
    expect(twice).toEqual(once);
  });
});
