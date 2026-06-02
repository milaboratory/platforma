// UI `package.json` content rules.
//
// The enforce* calls produce exactly oxfmt's order (canonicalPackageJsonOrder
// is derived from oxfmt), so refreshing a legacy block whose package.json is
// not yet canonically ordered yields oxfmt-clean output — the build→check
// gate (oxfmt --check, run before any fmt) passes without a prior `pnpm fmt`.

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
} from "../engine/api";
import { canonicalPackageJsonOrder } from "./shared/key-order";

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
