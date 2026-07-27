// Kind `package.json`: the initial generator and the drift-correcting body,
// co-located. A kind is a private workspace sibling (like the model): its
// content ships to the `kinds/` registry tree via `build-kind-manifest`, not to
// npm. Identity (name/version) stays untouched; the body enforces
// type/main/exports + canonical scripts + canonical dep sets, then projects
// canonical field / dependency order (oxfmt-clean, so build->check passes with
// no prior `pnpm fmt`).
//
// The `exports` map carries BOTH `import` and `require`/`default` arms pointing
// at the single ESM `dist/kind.js`: `block-tools build-model` loads the model
// via `require()`, and the model `require`s its kind — but the block-kind build
// emits ESM only. Node's require-ESM then resolves the kind through `require`.

import {
  ensureField,
  ensureScript,
  ensureDep,
  ensureDevDeps,
  ensurePeerDeps,
  removeScript,
  enforceAlphabeticalOrder,
  enforceFieldOrder,
  type RunContext,
} from "../engine/api";
import { canonicalPackageJsonOrder } from "./shared/key-order";

const KIND_EXPORTS = {
  ".": {
    types: "./dist/kind.d.ts",
    sources: "./src/index.ts",
    import: "./dist/kind.js",
    require: "./dist/kind.js",
    default: "./dist/kind.js",
  },
};

export function kindPackageJsonInitial(ctx: RunContext): Record<string, unknown> {
  const v = ctx.blockVars;
  return {
    name: `${v.facadeName}.kind`,
    private: true,
    type: "module",
    // The block-kind build emits a single ESM bundle `dist/kind.js` plus a
    // self-contained `dist/kind.d.ts` — no CJS entry.
    main: "./dist/kind.js",
    module: "./dist/kind.js",
    types: "./dist/kind.d.ts",
    exports: KIND_EXPORTS,
    scripts: {
      fmt: "ts-builder format",
      watch: "ts-builder build --target block-kind --watch",
      build: "ts-builder build --target block-kind && block-tools build-kind-manifest",
      check: "ts-builder check --target block-kind",
    },
    dependencies: {
      "@platforma-sdk/block-kind": "sdk:",
    },
    devDependencies: {
      "@milaboratories/ts-builder": "sdk:",
      "@milaboratories/ts-configs": "sdk:",
      "@platforma-sdk/block-tools": "sdk:",
    },
    peerDependencies: {
      "@types/node": "*",
      typescript: "*",
    },
  };
}

export function kindPackageJsonRules(): void {
  // Controlled sibling — workspace-only, never published to npm. `private: true`
  // makes npm refuse to publish it; the `version` is kept (changesets-owned) and
  // is what the kind's on-wire `{name}@{version}` reference is baked from.
  ensureField("private", true);

  ensureField("type", "module");
  ensureField("main", "./dist/kind.js");
  ensureField("module", "./dist/kind.js");
  ensureField("types", "./dist/kind.d.ts");
  ensureField("exports", KIND_EXPORTS);

  ensureScript("fmt", "ts-builder format");
  ensureScript("watch", "ts-builder build --target block-kind --watch");
  ensureScript("build", "ts-builder build --target block-kind && block-tools build-kind-manifest");
  ensureScript("check", "ts-builder check --target block-kind");
  removeScript("lint");

  ensureDep("@platforma-sdk/block-kind", "sdk:");

  ensureDevDeps({
    "@milaboratories/ts-builder": "sdk:",
    "@milaboratories/ts-configs": "sdk:",
    "@platforma-sdk/block-tools": "sdk:",
  });

  ensurePeerDeps({
    "@types/node": "*",
    typescript: "*",
  });

  enforceAlphabeticalOrder("dependencies");
  enforceAlphabeticalOrder("devDependencies");
  enforceAlphabeticalOrder("peerDependencies");
  enforceAlphabeticalOrder("optionalDependencies");
  enforceFieldOrder([...canonicalPackageJsonOrder]);
}
