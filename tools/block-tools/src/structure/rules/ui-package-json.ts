// UI `package.json`: the initial generator and the drift-correcting body
// rules, co-located.
//
// Authored oxfmt-clean: the ui is one of the two scopes `ts-builder check`
// runs oxfmt on, so neither half enforces ordering beyond what oxfmt
// produces — the enforce* calls match oxfmt's order exactly, so refreshing a
// legacy block yields oxfmt-clean output and the build→check gate (oxfmt
// --check) passes without a prior `pnpm fmt`.

import {
  ensureField,
  ensureScript,
  ensureDep,
  ensureDevDep,
  ensureDevDeps,
  ensurePeerDeps,
  ensureWorkspaceScopeDeps,
  removeDep,
  removeScript,
  enforceAlphabeticalOrder,
  enforceFieldOrder,
  when,
  whenFilesExist,
  type RunContext,
} from "../engine/api";
import { scopeDepMap } from "../engine/ctx";
import { canonicalPackageJsonOrder } from "./shared/key-order";
import { COLOCATED_TEST_GLOB } from "./shared/colocated-tests";

export function uiPackageJsonInitial(ctx: RunContext): Record<string, unknown> {
  const v = ctx.blockVars;
  return {
    name: `${v.facadeName}.ui`,
    version: "1.0.0",
    type: "module",
    scripts: {
      fmt: "ts-builder format",
      dev: "ts-builder serve --target block-ui",
      watch: "ts-builder build --target block-ui --watch",
      build: "ts-builder build --target block-ui",
      check: "ts-builder check --target block-ui",
    },
    dependencies: {
      "@platforma-sdk/ui-vue": "sdk:",
      vue: "catalog:",
      // The seeded ui (app.ts) imports the block's model package; depend on
      // it — mirrors the body rule's `ensureWorkspaceScopeDeps("model")`.
      ...scopeDepMap(ctx, "model"),
    },
    devDependencies: {
      "@milaboratories/ts-builder": "sdk:",
      "@milaboratories/ts-configs": "sdk:",
    },
    peerDependencies: {
      "@types/node": "*",
      typescript: "*",
    },
  };
}

export function uiPackageJsonRules(): void {
  ensureField("type", "module");

  ensureScript("fmt", "ts-builder format");
  ensureScript("dev", "ts-builder serve --target block-ui");
  ensureScript("watch", "ts-builder build --target block-ui --watch");
  ensureScript("build", "ts-builder build --target block-ui");
  ensureScript("check", "ts-builder check --target block-ui");

  ensureDep("@platforma-sdk/ui-vue", "sdk:");
  // The seeded ui (main.ts) imports `createApp` from vue.
  ensureDep("vue", "catalog:");
  // The seeded ui (app.ts) imports the block's model package.
  ensureWorkspaceScopeDeps("model");

  ensureDevDeps({
    "@milaboratories/ts-builder": "sdk:",
    "@milaboratories/ts-configs": "sdk:",
  });

  // `vue-tsc` is owned by `ts-builder` (which runs it internally for
  // `--target block-ui`), so the ui must NOT declare its own. A direct
  // `vue-tsc` dep is the vestigial vite/vue-tsc-era artefact: it resolves
  // independently of the version ts-builder pins, which is how a block ended
  // up type-checking under a different vue-tsc than the toolchain intends.
  removeDep("vue-tsc");

  // vite-era artefacts: the canonical ui builds + dev-serves via ts-builder,
  // so a legacy `vite` dep and the `preview` (vite preview) script are dropped.
  removeDep("vite");
  removeScript("preview");
  // `@vitejs/plugin-vue` + `vite-plugin-dts` are vite-build-era plugins now
  // owned by ts-builder (it bundles the vue plugin internally). Shed the
  // leftover direct deps — paired with their catalog removal in
  // root-pnpm-workspace, so a migrated block sheds both the dep and the (now
  // dangling) `catalog:` reference.
  removeDep("@vitejs/plugin-vue");
  removeDep("vite-plugin-dts");

  // eslint → ts-builder/oxlint: linting runs inside `ts-builder check`, so the
  // standalone `lint` script and the eslint config dep are legacy leftovers.
  removeScript("lint");
  removeDep("@platforma-sdk/eslint-config");

  // `@types/node` is declared as a peer by default — mirrors the model scope
  // (the block author resolves it from the workspace root). The ui builds with
  // `--target block-ui` (types: []), so it pulls no node ambient types into the
  // build; the peer only satisfies IDE / type resolution, alongside `typescript`.
  ensurePeerDeps({
    "@types/node": "*",
    typescript: "*",
  });

  // A ui WITH co-located unit tests (`src/**/*.test.ts`) needs the vitest
  // `test` script, the `vitest` devDep, AND node ambient types promoted from
  // peer to a devDep (the single-section invariant drops the peer) so that
  // `types: ["node"]` in ui/tsconfig — wired under the same predicate —
  // resolves the tests' `node:*` imports. A test-less ui keeps `@types/node`
  // as a peer and carries no vitest, staying a refresh fixpoint.
  //
  // Skipped entirely for sdk-internal (in-monorepo) blocks: they own their test
  // wiring under the monorepo's shared infrastructure — see model-package-json.
  when(
    ({ ctx }) => !ctx.isSdkInternal,
    () =>
      when(
        whenFilesExist(COLOCATED_TEST_GLOB),
        () => {
          ensureScript("test", "vitest run --passWithNoTests");
          ensureDevDep("vitest", "catalog:");
          ensureDevDep("@types/node", "*");
        },
        () => removeDep("vitest"),
      ),
  );

  enforceAlphabeticalOrder("dependencies");
  enforceAlphabeticalOrder("devDependencies");
  enforceAlphabeticalOrder("peerDependencies");
  enforceAlphabeticalOrder("optionalDependencies");
  enforceFieldOrder([...canonicalPackageJsonOrder]);
}
