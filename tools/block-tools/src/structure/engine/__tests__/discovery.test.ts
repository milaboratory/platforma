// Workspace-package classification — covers all 7 detection rules
// plus the block-scope override and the unclassified-error path.

import { describe, test, expect } from "vitest";
import { classifyOne, discoverModules, DiscoveryError, type WorkspacePackage } from "../discovery";

function pkg(path: string, data: WorkspacePackage["pkg"]): WorkspacePackage {
  return { path, pkg: data };
}

describe("discovery — single-package classification", () => {
  test("rule 1: software via block-software field", () => {
    const wp = pkg("software", {
      name: "x.software",
      "block-software": {},
    });
    expect(classifyOne(wp, new Set())).toBe("software");
  });

  test("rule 1 alt: software via package-builder + runenv dep", () => {
    const wp = pkg("software-py", {
      name: "x.software-py",
      dependencies: {
        "@platforma-sdk/package-builder": "catalog:",
        "@platforma-open/runenv-python-3": "catalog:",
      },
    });
    expect(classifyOne(wp, new Set())).toBe("software");
  });

  test("rule 2: workflow via workflow-tengo dep", () => {
    const wp = pkg("workflow", {
      name: "x.workflow",
      dependencies: { "@platforma-sdk/workflow-tengo": "catalog:" },
    });
    expect(classifyOne(wp, new Set())).toBe("workflow");
  });

  test("rule 3: ui via ui-vue dep and no main", () => {
    const wp = pkg("ui", {
      name: "x.ui",
      dependencies: { "@platforma-sdk/ui-vue": "catalog:" },
    });
    expect(classifyOne(wp, new Set())).toBe("ui");
  });

  test("rule 4: block via block-tools + sibling model/ui/workflow", () => {
    const siblings = new Set(["x.model", "x.ui", "x.workflow"]);
    const wp = pkg("block", {
      name: "x.block",
      dependencies: {
        "@platforma-sdk/block-tools": "catalog:",
        "x.model": "workspace:*",
        "x.ui": "workspace:*",
      },
    });
    expect(classifyOne(wp, siblings)).toBe("block");
  });

  test("rule 4 fallback: files=[index.d.ts,index.js] + block-tools", () => {
    const wp = pkg("block", {
      name: "x.block",
      files: ["index.d.ts", "index.js"],
      dependencies: { "@platforma-sdk/block-tools": "catalog:" },
    });
    expect(classifyOne(wp, new Set())).toBe("block");
  });

  test("rule 5: model via model dep + main", () => {
    const wp = pkg("model", {
      name: "x.model",
      main: "dist/index.js",
      dependencies: { "@platforma-sdk/model": "catalog:" },
    });
    expect(classifyOne(wp, new Set())).toBe("model");
  });

  test("rule 6: test via @platforma-sdk/test dep", () => {
    const wp = pkg("test", {
      name: "x.test",
      devDependencies: { "@platforma-sdk/test": "catalog:" },
    });
    expect(classifyOne(wp, new Set())).toBe("test");
  });

  test("rule 7: root as catch-all", () => {
    const wp = pkg("", { name: "x" });
    expect(classifyOne(wp, new Set())).toBe("root");
  });

  test("override: block-scope wins over detection", () => {
    const wp = pkg("strange-dir", {
      name: "x.strange",
      "block-scope": "software",
      dependencies: { "@platforma-sdk/workflow-tengo": "catalog:" },
    });
    expect(classifyOne(wp, new Set())).toBe("software");
  });

  test("override: bad value throws DiscoveryError", () => {
    const wp = pkg("x", {
      name: "x",
      "block-scope": "nope",
    });
    expect(() => classifyOne(wp, new Set())).toThrow(DiscoveryError);
  });

  test("unclassified non-root throws DiscoveryError", () => {
    const wp = pkg("orphan", { name: "x.orphan" });
    expect(() => discoverModules([wp])).toThrow(DiscoveryError);
  });
});

describe("discovery — full workspace", () => {
  test("classifies an example workspace", () => {
    const packages: WorkspacePackage[] = [
      pkg("", { name: "x" }),
      pkg("model", {
        name: "x.model",
        main: "dist/index.js",
        dependencies: { "@platforma-sdk/model": "catalog:" },
      }),
      pkg("ui", {
        name: "x.ui",
        dependencies: { "@platforma-sdk/ui-vue": "catalog:" },
      }),
      pkg("workflow", {
        name: "x.workflow",
        dependencies: { "@platforma-sdk/workflow-tengo": "catalog:" },
      }),
      pkg("test", {
        name: "x.test",
        devDependencies: { "@platforma-sdk/test": "catalog:" },
      }),
      pkg("block", {
        name: "x.block",
        dependencies: {
          "@platforma-sdk/block-tools": "catalog:",
          "x.model": "workspace:*",
          "x.ui": "workspace:*",
          "x.workflow": "workspace:*",
        },
      }),
      pkg("software-py", {
        name: "x.software-py",
        dependencies: {
          "@platforma-sdk/package-builder": "catalog:",
          "@platforma-open/runenv-python-3": "catalog:",
        },
      }),
    ];
    const mods = discoverModules(packages);
    const byScope = Object.fromEntries(mods.map((m) => [m.scope, m]));
    expect(Object.keys(byScope).sort()).toEqual(
      ["block", "model", "root", "software", "test", "ui", "workflow"].sort(),
    );
    expect(byScope.root!.path).toBe("");
    expect(byScope.software!.path).toBe("software-py");
  });
});
