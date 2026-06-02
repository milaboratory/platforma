// Test `package.json` content rules.

import {
  ensureField,
  ensureScript,
  ensureDep,
  ensureDevDeps,
  ensurePeerDeps,
  enforceFieldOrder,
} from "../engine/api";
import { canonicalPackageJsonOrder } from "./shared/key-order";

export function testPackageJsonRules(): void {
  ensureField("type", "module");

  ensureScript("test", "vitest run");

  ensureDep("@platforma-sdk/test", "catalog:");

  ensureDevDeps({
    "@milaboratories/ts-builder": "catalog:",
    "@milaboratories/ts-configs": "catalog:",
    vitest: "catalog:",
  });

  ensurePeerDeps({
    "@types/node": "*",
    typescript: "*",
  });

  enforceFieldOrder([...canonicalPackageJsonOrder]);
}
