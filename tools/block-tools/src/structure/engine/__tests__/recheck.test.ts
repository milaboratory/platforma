// Post-run recheck — a non-idempotent managed body must surface as a
// `RecheckError` carrying the failing item's (scope, path, primitive)
// tuple.

import { describe, test, expect } from "vitest";
import { defineStructure, scope, managed, text } from "../api";
import { ensureField } from "../content-rules";
import { createRunContext } from "../ctx";
import { MemoryFileSystem } from "../fs/memory";
import { run, RecheckError } from "../runner";

describe("post-run recheck", () => {
  test("non-idempotent transform surfaces with (scope, path, primitive) tuple", async () => {
    // A closure counter advances on every body invocation. First run
    // writes counter=0; recheck dry-run sees the body produce
    // counter=1 → non-empty diff → RecheckError.
    let counter = 0;
    const structure = defineStructure(() => {
      scope("model", () => {
        managed("drift.json", text("{}\n"), () => {
          ensureField("counter", counter++);
        });
      });
    });

    const fs = new MemoryFileSystem();
    const ctx = createRunContext({
      blockVars: {
        facadeName: "@platforma-open/demo",
        baseName: "demo",
        npmOrg: "@platforma-open",
        orgScope: "demo",
        shortName: "demo",
      },
      modules: [{ scope: "model", name: "@platforma-open/demo.model", path: "model" }],
    });

    let thrown: unknown;
    try {
      await run(structure, fs, ctx);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(RecheckError);
    const err = thrown as RecheckError;
    expect(err.failing.scope).toBe("model");
    expect(err.failing.path).toBe("model/drift.json");
    expect(err.failing.primitive).toBe("managed");
    expect(err.message).toMatch(/not idempotent/);
  });

  test("recheck is silent when the rule set converges", async () => {
    // Idempotent body — ensureField with a fixed value.
    const structure = defineStructure(() => {
      scope("model", () => {
        managed("ok.json", text("{}\n"), () => {
          ensureField("type", "module");
        });
      });
    });
    const fs = new MemoryFileSystem();
    const ctx = createRunContext({
      blockVars: {
        facadeName: "@platforma-open/demo",
        baseName: "demo",
        npmOrg: "@platforma-open",
        orgScope: "demo",
        shortName: "demo",
      },
      modules: [{ scope: "model", name: "@platforma-open/demo.model", path: "model" }],
    });
    await expect(run(structure, fs, ctx)).resolves.toBeDefined();
  });

  test("check mode skips recheck entirely", async () => {
    let counter = 0;
    const structure = defineStructure(() => {
      scope("model", () => {
        managed("drift.json", text("{}\n"), () => {
          ensureField("counter", counter++);
        });
      });
    });
    const fs = new MemoryFileSystem();
    const ctx = createRunContext({
      blockVars: {
        facadeName: "@platforma-open/demo",
        baseName: "demo",
        npmOrg: "@platforma-open",
        orgScope: "demo",
        shortName: "demo",
      },
      modules: [{ scope: "model", name: "@platforma-open/demo.model", path: "model" }],
      dryRun: true,
    });
    // dryRun=true: no recheck, no throw, body only runs once.
    await expect(run(structure, fs, ctx)).resolves.toBeDefined();
  });
});
