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
  ensureDevDeps,
  ensurePeerDeps,
  ensureWorkspaceScopeDeps,
  removeDep,
  enforceAlphabeticalOrder,
  enforceFieldOrder,
  type RunContext,
} from "../engine/api";
import { scopeDepMap } from "../engine/ctx";
import { canonicalPackageJsonOrder } from "./shared/key-order";

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
      test: "vitest run --passWithNoTests",
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
      vitest: "catalog:",
    },
    peerDependencies: {
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
  // --passWithNoTests: real blocks put UI tests in ui/ (e.g.
  // samples-and-data); empty UIs don't fail `turbo run test`.
  ensureScript("test", "vitest run --passWithNoTests");

  ensureDep("@platforma-sdk/ui-vue", "sdk:");
  // The seeded ui (main.ts) imports `createApp` from vue.
  ensureDep("vue", "catalog:");
  // The seeded ui (app.ts) imports the block's model package.
  ensureWorkspaceScopeDeps("model");

  ensureDevDeps({
    "@milaboratories/ts-builder": "sdk:",
    "@milaboratories/ts-configs": "sdk:",
    vitest: "catalog:",
  });

  // The ui builds with `--target block-ui` (types: []), so it carries no
  // browser/vitest ambient types — only the `typescript` peer for IDE type
  // resolution. Drop any stray `@types/node` peer a legacy block declares.
  ensurePeerDeps({
    typescript: "*",
  });
  removeDep("@types/node");

  enforceAlphabeticalOrder("dependencies");
  enforceAlphabeticalOrder("devDependencies");
  enforceAlphabeticalOrder("peerDependencies");
  enforceAlphabeticalOrder("optionalDependencies");
  enforceFieldOrder([...canonicalPackageJsonOrder]);
}
