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

  // The build tool differs by path: the software-build path builds/packs via block-tools and needs
  // no pl-pkg; the legacy path shells out to pl-pkg and keeps its prepublish upload step.
  const scripts = ctx.softwareBuild
    ? {
        build: BUILD_CMD,
        "do-pack": DO_PACK_CMD,
        changeset: "changeset",
        "version-packages": "changeset version",
      }
    : {
        build: "pl-pkg build",
        prepublishOnly: "pl-pkg prepublish",
        changeset: "changeset",
        "version-packages": "changeset version",
      };

  const devDependencies = ctx.softwareBuild
    ? {
        "@platforma-open/milaboratories.runenv-python-3": "catalog:",
        "@platforma-sdk/block-tools": "sdk:",
      }
    : {
        "@platforma-open/milaboratories.runenv-python-3": "catalog:",
        "@platforma-sdk/package-builder": "sdk:",
      };

  return {
    name: `${v.facadeName}.software`,
    type: "module",
    description: "Block Software",
    files: ["./dist/**/*"],
    scripts,
    "block-software": pythonBlockSoftware(),
    devDependencies,
  };
}

export function softwarePackageJsonRules(ctx: RunContext): void {
  // Software packages must never be private: `pl-pkg` gates docker image
  // auto-push on `!isPrivate`, so a private software package builds its image
  // but never pushes it — the block then 404s pulling it at runtime. Strip it
  // so a `structure refresh` heals any block that has it.
  removeField("private");

  ensureField("type", "module");
  ensureField("files", ["./dist/**/*"]);

  // Lifecycle scripts. Each path declares exactly its own build/pack scripts and strips the other
  // path's leftovers, so a block migrated between the two converges on refresh.
  if (ctx.softwareBuild) {
    ensureScript("build", BUILD_CMD);
    ensureScript("do-pack", DO_PACK_CMD);
    // build + push happen in `build`; the old `pl-pkg prepublish` upload step is gone.
    removeScript("prepublishOnly");
  } else {
    ensureScript("build", "pl-pkg build");
    ensureScript("prepublishOnly", "pl-pkg prepublish");
  }
  ensureScript("changeset", "changeset");
  ensureScript("version-packages", "changeset version");

  // Canonical devDeps. The runenv is shared; the build tool differs by path. block-tools bundles the
  // engine, so a software-build block drops the pl-pkg `@platforma-sdk/package-builder` dependency.
  ensureDevDep("@platforma-open/milaboratories.runenv-python-3", "catalog:");
  if (ctx.softwareBuild) {
    ensureDevDep("@platforma-sdk/block-tools", "sdk:");
    removeDep("@platforma-sdk/package-builder");
  } else {
    ensureDevDep("@platforma-sdk/package-builder", "sdk:");
  }

  enforceAlphabeticalOrder("dependencies");
  enforceAlphabeticalOrder("devDependencies");
  enforceAlphabeticalOrder("peerDependencies");
  enforceAlphabeticalOrder("optionalDependencies");
  enforceFieldOrder([...canonicalPackageJsonOrder]);
}
