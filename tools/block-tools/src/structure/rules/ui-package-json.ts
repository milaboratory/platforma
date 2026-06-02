// UI `package.json` content rules.

import {
  ensureField,
  ensureScript,
  ensureDep,
  ensureDevDeps,
  ensurePeerDeps,
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
  // Canonical test script with --passWithNoTests (real blocks put UI
  // tests in ui/, e.g. samples-and-data); empty UIs don't fail.
  ensureScript("test", "vitest run --passWithNoTests");

  ensureDep("@platforma-sdk/ui-vue", "sdk:");

  ensureDevDeps({
    "@milaboratories/ts-builder": "sdk:",
    "@milaboratories/ts-configs": "sdk:",
    vitest: "catalog:",
  });

  // typescript peer: kept for IDE type resolution. IDE-only and questionable —
  // a candidate for removal later; verify in 5b whether it's still needed. (c7)
  ensurePeerDeps({
    typescript: "*",
  });
  // @types/node peer dropped (c6): commented out here and pruned from existing
  // blocks via removeDep. If 5b shows it is needed, re-enable the line below and
  // remove the removeDep call; otherwise delete both to finalize.
  // ensurePeerDep("@types/node", "*");
  removeDep("@types/node");

  // Match oxfmt: alphabetise dependency sections (no-op on absent sections).
  enforceAlphabeticalOrder("dependencies");
  enforceAlphabeticalOrder("devDependencies");
  enforceAlphabeticalOrder("peerDependencies");
  enforceAlphabeticalOrder("optionalDependencies");
  enforceFieldOrder([...canonicalPackageJsonOrder]);
}
