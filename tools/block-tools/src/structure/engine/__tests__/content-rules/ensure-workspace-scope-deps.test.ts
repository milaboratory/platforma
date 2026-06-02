import { describe, test, expect } from "vitest";
import {
  ensureWorkspaceScopeDeps,
  ensureWorkspaceScopeDevDeps,
  ensureWorkspaceScopePeerDeps,
  withManagedBody,
  type JsonObject,
} from "../../content-rules";
import { createRunContext } from "../../ctx";
import type { Module, BlockVars, RunContext } from "../../api";

const vars: BlockVars = {
  facadeName: "@platforma-open/demo.feature",
  baseName: "demo.feature",
  npmOrg: "@platforma-open",
  orgScope: "demo",
  shortName: "feature",
};

const modules: Module[] = [
  { scope: "root", name: "@platforma-open/demo.feature", path: "" },
  { scope: "block", name: "@platforma-open/demo.feature.block", path: "block" },
  { scope: "model", name: "@platforma-open/demo.feature.model", path: "model" },
  { scope: "ui", name: "@platforma-open/demo.feature.ui", path: "ui" },
  { scope: "workflow", name: "@platforma-open/demo.feature.workflow", path: "workflow" },
  { scope: "test", name: "@platforma-open/demo.feature.test", path: "test" },
  {
    scope: "software",
    name: "@platforma-open/demo.feature.software-python",
    path: "software-python",
  },
  {
    scope: "software",
    name: "@platforma-open/demo.feature.software-tengo",
    path: "software-tengo",
  },
];

const ctx: RunContext = createRunContext({ blockVars: vars, modules });

function run(input: JsonObject, body: () => void): JsonObject {
  return withManagedBody(input, body, { ctx });
}

describe("ensureWorkspaceScopeDeps / DevDeps / PeerDeps", () => {
  test("adds one entry per matching module under dependencies", () => {
    const out = run({}, () => ensureWorkspaceScopeDeps("software"));
    expect(out).toEqual({
      dependencies: {
        "@platforma-open/demo.feature.software-python": "workspace:*",
        "@platforma-open/demo.feature.software-tengo": "workspace:*",
      },
    });
  });

  test("DevDeps targets devDependencies", () => {
    const out = run({}, () => ensureWorkspaceScopeDevDeps("test"));
    expect(out).toEqual({
      devDependencies: { "@platforma-open/demo.feature.test": "workspace:*" },
    });
  });

  test("PeerDeps targets peerDependencies", () => {
    const out = run({}, () => ensureWorkspaceScopePeerDeps("model"));
    expect(out).toEqual({
      peerDependencies: { "@platforma-open/demo.feature.model": "workspace:*" },
    });
  });

  test("scope with zero modules contributes nothing", () => {
    const ctxNoSoftware = createRunContext({
      blockVars: vars,
      modules: modules.filter((m) => m.scope !== "software"),
    });
    const out = withManagedBody({}, () => ensureWorkspaceScopeDeps("software"), {
      ctx: ctxNoSoftware,
    });
    expect(out).toEqual({});
  });

  test("idempotent — second run is a no-op", () => {
    const once = run({}, () => ensureWorkspaceScopeDeps("model"));
    const twice = run(JSON.parse(JSON.stringify(once)), () => ensureWorkspaceScopeDeps("model"));
    expect(twice).toEqual(once);
  });

  test("throws if no ctx is available", () => {
    expect(() => withManagedBody({}, () => ensureWorkspaceScopeDeps("model"))).toThrow(
      /needs a RunContext/,
    );
  });
});
