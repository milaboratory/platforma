// Model `package.json` content rules. Identity (name/version) stays
// untouched; the body enforces type/main/types/exports + canonical scripts
// + canonical dep sets, then projects canonical field / dependency order.
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
  enforceAlphabeticalOrder,
  enforceFieldOrder,
} from "../engine/api";
import { canonicalPackageJsonOrder } from "./shared/key-order";

export function modelPackageJsonRules(): void {
  ensureField("type", "module");
  // build emits both; main = CJS entry, module = ESM entry (prod convention).
  ensureField("main", "dist/index.cjs");
  ensureField("module", "dist/index.js");
  ensureField("types", "dist/index.d.ts");
  ensureField("exports", {
    ".": {
      types: "./dist/index.d.ts",
      sources: "./src/index.ts",
      import: "./dist/index.js",
    },
    "./dist/*": "./dist/*",
  });

  ensureScript("fmt", "ts-builder format");
  ensureScript("watch", "ts-builder build --target block-model --watch");
  ensureScript("build", "ts-builder build --target block-model && block-tools build-model");
  ensureScript("check", "ts-builder check --target block-model");
  // --passWithNoTests: real blocks put unit tests in model/ (mixcr,
  // sequence-properties); models with no test files don't fail `turbo run
  // test`.
  ensureScript("test", "vitest run --passWithNoTests");

  ensureDep("@platforma-sdk/model", "sdk:");

  ensureDevDeps({
    "@milaboratories/ts-builder": "sdk:",
    "@milaboratories/ts-configs": "sdk:",
    "@platforma-sdk/block-tools": "sdk:",
    vitest: "catalog:",
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
