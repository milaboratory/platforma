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
import { removeRetiredToolchainDeps } from "./shared/retired-deps";

export function uiPackageJsonInitial(ctx: RunContext): Record<string, unknown> {
  const v = ctx.blockVars;
  return {
    name: `${v.facadeName}.ui`,
    private: true,
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
  // Controlled sibling — workspace-only, never published, but kept versioned
  // (changesets-owned) so the packed template's lib carries a version.
  ensureField("private", true);

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

  removeRetiredToolchainDeps();
  removeScript("preview");
  removeScript("lint");

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
