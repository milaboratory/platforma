// Initial software `package.json` — full canonical python scaffold.
// Mirrors the boilerplate / published single-software modules
// (templates-strategy.md § "Software Module Scaffold"). Body rules in
// rules/software-package-json.ts re-assert the same fields as
// drift-correctors (Path A).
//
// init creates at most one software module, at the flat `software/` dir
// with name `${facadeName}.software` (BlockVars.softwarePlatform is
// single-valued and python-only at v1). On refresh the file already
// exists, so this generator is not invoked — multi-software blocks keep
// their own per-module names.

import type { BlockVars } from "../../engine/api";

/** The `block-software` package-builder descriptor for a python
 *  entrypoint. Kept opaque by the engine; rule authors edit it via
 *  `transformAt("block-software", ...)`. The `:3.12.10` tag inside
 *  `environment` is the runenv artifact tag (python version), distinct
 *  from the npm catalog version. */
function pythonBlockSoftware(): Record<string, unknown> {
  return {
    entrypoints: {
      main: {
        binary: {
          artifact: {
            type: "python",
            registry: "platforma-open",
            environment: "@platforma-open/milaboratories.runenv-python-3:3.12.10",
            dependencies: { toolset: "pip", requirements: "requirements.txt" },
            root: "./src",
          },
          cmd: ["python", "{pkg}/main.py"],
        },
      },
    },
  };
}

export function softwarePackageJsonInitial(v: BlockVars): Record<string, unknown> {
  return {
    name: `${v.facadeName}.software`,
    version: "1.0.0",
    type: "module",
    description: "Block Software",
    files: ["./dist/**/*"],
    scripts: {
      build: "pl-pkg build",
      prepublishOnly: "pl-pkg prepublish",
    },
    "block-software": pythonBlockSoftware(),
    devDependencies: {
      "@platforma-open/milaboratories.runenv-python-3": "catalog:",
      "@platforma-sdk/package-builder": "sdk:",
    },
  };
}
