// Model `package.json` content rules.
// Identity (name/version) stays untouched; the body enforces type/main/
// types/exports + canonical scripts + canonical dep sets, then opts in
// to canonical field order at the end.

import {
  ensureField,
  ensureScript,
  ensureDep,
  ensureDevDeps,
  ensurePeerDeps,
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

  ensureDep("@platforma-sdk/model", "sdk:");

  ensureDevDeps({
    "@milaboratories/ts-builder": "sdk:",
    "@milaboratories/ts-configs": "sdk:",
    "@platforma-sdk/block-tools": "sdk:",
  });

  ensurePeerDeps({
    "@types/node": "*",
    typescript: "*",
  });

  enforceFieldOrder([...canonicalPackageJsonOrder]);
}
