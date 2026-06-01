// Software `package.json`: the initial generator and the drift-correcting
// body rules, co-located. One body, N modules — fan-out is driven by
// `ctx.modules`.
//
// Drift-correctors only: identity (name/version), `description`, and the
// `block-software` descriptor are author-owned / opaque and left untouched
// — re-asserting them would clobber real multi-software blocks on refresh.
// The body enforces the structural essentials: ESM type, the publish
// `files` glob, the lifecycle scripts, and the canonical devDeps.

import {
  ensureField,
  ensureScript,
  ensureDevDeps,
  enforceAlphabeticalOrder,
  enforceFieldOrder,
  type RunContext,
} from "../engine/api";
import { canonicalPackageJsonOrder } from "./shared/key-order";

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

export function softwarePackageJsonInitial(ctx: RunContext): Record<string, unknown> {
  const v = ctx.blockVars;
  return {
    name: `${v.facadeName}.software`,
    version: "1.0.0",
    type: "module",
    description: "Block Software",
    files: ["./dist/**/*"],
    scripts: {
      build: "pl-pkg build",
      prepublishOnly: "pl-pkg prepublish",
      changeset: "changeset",
      "version-packages": "changeset version",
    },
    "block-software": pythonBlockSoftware(),
    devDependencies: {
      "@platforma-open/milaboratories.runenv-python-3": "catalog:",
      "@platforma-sdk/package-builder": "sdk:",
    },
  };
}

export function softwarePackageJsonRules(): void {
  ensureField("type", "module");
  ensureField("files", ["./dist/**/*"]);

  ensureScript("build", "pl-pkg build");
  ensureScript("prepublishOnly", "pl-pkg prepublish");
  ensureScript("changeset", "changeset");
  ensureScript("version-packages", "changeset version");

  ensureDevDeps({
    "@platforma-open/milaboratories.runenv-python-3": "catalog:",
    "@platforma-sdk/package-builder": "sdk:",
  });

  enforceAlphabeticalOrder("dependencies");
  enforceAlphabeticalOrder("devDependencies");
  enforceAlphabeticalOrder("peerDependencies");
  enforceAlphabeticalOrder("optionalDependencies");
  enforceFieldOrder([...canonicalPackageJsonOrder]);
}
