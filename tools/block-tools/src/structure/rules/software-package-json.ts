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
  removeField,
  ensureScript,
  removeScript,
  ensureDevDep,
  removeDep,
  enforceAlphabeticalOrder,
  enforceFieldOrder,
  type RunContext,
} from "../engine/api";
import { canonicalPackageJsonOrder } from "./shared/key-order";

// The software-build build/pack commands, shared by the generator and the reconciler. block-tools
// bundles the build engine, so these are the only build-tool commands a software-build block runs.
const BUILD_CMD = "block-tools software build";
const DO_PACK_CMD =
  "shx rm -f *.tgz && block-tools software build && pnpm pack && shx mv platforma-open*.tgz package.tgz";

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
    type: "module",
    description: "Block Software",
    files: ["./dist/**/*"],
    scripts: {
      build: BUILD_CMD,
      "do-pack": DO_PACK_CMD,
      changeset: "changeset",
      "version-packages": "changeset version",
    },
    "block-software": pythonBlockSoftware(),
    devDependencies: {
      "@platforma-open/milaboratories.runenv-python-3": "catalog:",
      "@platforma-sdk/block-tools": "sdk:",
    },
  };
}

export function softwarePackageJsonRules(): void {
  // Software packages must never be private: `pl-pkg` gates docker image
  // auto-push on `!isPrivate`, so a private software package builds its image
  // but never pushes it — the block then 404s pulling it at runtime. Strip it
  // so a `structure refresh` heals any block that has it.
  removeField("private");

  ensureField("type", "module");
  ensureField("files", ["./dist/**/*"]);

  // Lifecycle scripts. block-tools builds and packs; a block migrated off pl-pkg converges on
  // refresh — the old `pl-pkg prepublish` upload step is dropped (build + push happen in `build`).
  ensureScript("build", BUILD_CMD);
  ensureScript("do-pack", DO_PACK_CMD);
  removeScript("prepublishOnly");
  ensureScript("changeset", "changeset");
  ensureScript("version-packages", "changeset version");

  // Canonical devDeps. block-tools bundles the build engine, so the pl-pkg
  // `@platforma-sdk/package-builder` dependency is dropped.
  ensureDevDep("@platforma-open/milaboratories.runenv-python-3", "catalog:");
  ensureDevDep("@platforma-sdk/block-tools", "sdk:");
  removeDep("@platforma-sdk/package-builder");

  enforceAlphabeticalOrder("dependencies");
  enforceAlphabeticalOrder("devDependencies");
  enforceAlphabeticalOrder("peerDependencies");
  enforceAlphabeticalOrder("optionalDependencies");
  enforceFieldOrder([...canonicalPackageJsonOrder]);
}
