// Kind `package.json`: the initial generator and the drift-correcting body,
// co-located. A kind is a private workspace sibling (like the model): its
// content ships to the `kinds/` registry tree via `build-kind-manifest`, not to
// npm. Identity (name/version) stays untouched; the body enforces
// type/main/exports + canonical scripts + canonical dep sets, then projects
// canonical field / dependency order (oxfmt-clean, so build->check passes with
// no prior `pnpm fmt`).
//
// A kind builds TWICE, like the model: `dist/index.{js,cjs}` with dependencies
// external — what a block imports — and the self-contained `dist/kind.js` that
// the registry publishes and `build-kind-manifest` hashes. The `exports` map
// points at the externalized pair only, so a kind and the block implementing it
// share one copy of any dependency they both use; the self-contained bundle is
// read off disk by the manifest builder and needs no export.
//
// All three of `import` / `require` / `default` are spelled out: `block-tools
// build-model` loads the model via `require()`, and the model `require`s its
// kind, so the CJS arm has to resolve to real CJS.

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
    types: "./dist/index.d.ts",
    sources: "./src/index.ts",
    import: "./dist/index.js",
    require: "./dist/index.cjs",
    default: "./dist/index.js",
  },
};

export function kindPackageJsonInitial(ctx: RunContext): Record<string, unknown> {
  const v = ctx.blockVars;
  return {
    name: `${v.facadeName}.kind`,
    private: true,
    type: "module",
    // `main` is the CommonJS entry (require fallback), `module` the ESM one —
    // the model's convention. `dist/kind.js`, the self-contained bundle, is
    // deliberately not an entry: it exists for the registry, not for importers.
    main: "./dist/index.cjs",
    module: "./dist/index.js",
    types: "./dist/index.d.ts",
    exports: KIND_EXPORTS,
    scripts: {
      fmt: "ts-builder format",
      watch: "ts-builder build --target block-kind --watch",
      build: "ts-builder build --target block-kind && block-tools build-kind-manifest",
      check: "ts-builder check --target block-kind",
    },
    dependencies: {
      "@platforma-sdk/block-kind": "sdk:",
      // A kind ships a runtime params check, so it is not a types-only package. zod is
      // the default the scaffolded parser is written against; an author who validates by
      // hand can drop this, which is why it is seeded rather than asserted on refresh.
      zod: "catalog:",
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
  ensureField("main", "./dist/index.cjs");
  ensureField("module", "./dist/index.js");
  ensureField("types", "./dist/index.d.ts");
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
