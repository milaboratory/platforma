// Test `package.json` content rules.

import {
  ensureField,
  ensureScript,
  ensureDevDeps,
  ensurePeerDeps,
  removeDep,
  enforceAlphabeticalOrder,
  enforceFieldOrder,
} from "../engine/api";
import { canonicalPackageJsonOrder } from "./shared/key-order";

export function testPackageJsonRules(): void {
  ensureField("type", "module");

  // Type-only check (no oxlint/oxfmt — the test scope ships no lint/fmt
  // config); slots into the turbo `check` task.
  ensureScript("check", "ts-builder type-check --target block-test");
  ensureScript("test", "vitest run --passWithNoTests");

  // @platforma-sdk/test is a test-time dep → devDependencies (matches prod).
  ensureDevDeps({
    "@platforma-sdk/test": "sdk:",
    "@milaboratories/ts-builder": "sdk:",
    "@milaboratories/ts-configs": "sdk:",
    vitest: "catalog:",
  });

  // The test tsconfig (@milaboratories/ts-configs/block/test) supplies the
  // ambient types; only the `typescript` peer is needed. Drop any stray
  // `@types/node` peer a legacy block declares.
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
