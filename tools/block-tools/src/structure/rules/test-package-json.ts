// Test `package.json` content rules.

import {
  ensureField,
  ensureScript,
  ensureDevDeps,
  ensurePeerDeps,
  enforceAlphabeticalOrder,
  enforceFieldOrder,
} from "../engine/api";
import { canonicalPackageJsonOrder } from "./shared/key-order";

export function testPackageJsonRules(): void {
  ensureField("type", "module");

  ensureScript("test", "vitest run --passWithNoTests");

  // @platforma-sdk/test is a test-time dep → devDependencies (matches prod).
  ensureDevDeps({
    "@platforma-sdk/test": "sdk:",
    "@milaboratories/ts-builder": "sdk:",
    "@milaboratories/ts-configs": "sdk:",
    vitest: "catalog:",
  });

  ensurePeerDeps({
    "@types/node": "*",
    typescript: "*",
  });

  // Match oxfmt: alphabetise dependency sections (no-op on absent sections).
  enforceAlphabeticalOrder("dependencies");
  enforceAlphabeticalOrder("devDependencies");
  enforceAlphabeticalOrder("peerDependencies");
  enforceAlphabeticalOrder("optionalDependencies");
  enforceFieldOrder([...canonicalPackageJsonOrder]);
}
