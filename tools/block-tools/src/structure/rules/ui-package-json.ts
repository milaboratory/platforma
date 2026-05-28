// UI `package.json` content rules.

import {
  ensureField,
  ensureScript,
  ensureDep,
  ensureDevDeps,
  ensurePeerDeps,
  enforceFieldOrder,
} from "../engine/api";
import { canonicalPackageJsonOrder } from "./shared/key-order";

export function uiPackageJsonRules(): void {
  ensureField("type", "module");

  ensureScript("fmt", "ts-builder format");
  ensureScript("watch", "ts-builder build --target block-ui --watch");
  ensureScript("build", "ts-builder build --target block-ui");
  ensureScript("check", "ts-builder check --target block-ui");

  ensureDep("@platforma-sdk/ui-vue", "catalog:");

  ensureDevDeps({
    "@milaboratories/ts-builder": "catalog:",
    "@milaboratories/ts-configs": "catalog:",
    "@platforma-sdk/block-tools": "catalog:",
  });

  ensurePeerDeps({
    "@types/node": "*",
    typescript: "*",
  });

  enforceFieldOrder([...canonicalPackageJsonOrder]);
}
