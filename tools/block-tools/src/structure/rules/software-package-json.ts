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
  ensureDevDeps,
  enforceAlphabeticalOrder,
  enforceFieldOrder,
  type DepVersion,
  type RunContext,
} from "../engine/api";
import { canonicalPackageJsonOrder } from "./shared/key-order";

// Lifecycle scripts that build and pack the software module. The `block-tools software build` form
// runs the per-target builder; `do-pack` packs the result for local install.
function buildScripts(softwareBuild: boolean): Record<string, string> {
  if (softwareBuild) {
    return {
      build: "block-tools software build",
      prepublishOnly: "block-tools software build",
      "do-pack":
        "shx rm -f *.tgz && block-tools software build && pnpm pack && shx mv platforma-open*.tgz package.tgz",
    };
  }
  return {
    build: "pl-pkg build",
    prepublishOnly: "pl-pkg prepublish",
  };
}

// `block-tools` provides the `software build` binary the build script invokes.
function buildDevDeps(softwareBuild: boolean): Record<string, DepVersion> {
  const base: Record<string, DepVersion> = {
    "@platforma-open/milaboratories.runenv-python-3": "catalog:",
    "@platforma-sdk/package-builder": "sdk:",
  };
  return softwareBuild ? { ...base, "@platforma-sdk/block-tools": "sdk:" } : base;
}

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
      ...buildScripts(ctx.softwareBuild),
      changeset: "changeset",
      "version-packages": "changeset version",
    },
    "block-software": pythonBlockSoftware(),
    devDependencies: buildDevDeps(ctx.softwareBuild),
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

  for (const [name, command] of Object.entries(buildScripts(ctx.softwareBuild))) {
    ensureScript(name, command);
  }
  ensureScript("changeset", "changeset");
  ensureScript("version-packages", "changeset version");

  ensureDevDeps(buildDevDeps(ctx.softwareBuild));

  enforceAlphabeticalOrder("dependencies");
  enforceAlphabeticalOrder("devDependencies");
  enforceAlphabeticalOrder("peerDependencies");
  enforceAlphabeticalOrder("optionalDependencies");
  enforceFieldOrder([...canonicalPackageJsonOrder]);
}
