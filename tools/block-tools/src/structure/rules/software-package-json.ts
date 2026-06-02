// Software `package.json` content rules. One body, N modules — fan-out
// is driven by `ctx.modules` (see dsl-example.md § "Multi-module fan-out").
//
// Drift-correctors only: identity (name/version), `description`, and the
// `block-software` descriptor are author-owned / opaque and left
// untouched — re-asserting them would clobber real multi-software blocks
// on refresh. Init→check parity holds because the generator's values for
// those fields survive the body unchanged. The body enforces the
// structural essentials: ESM type, the publish `files` glob, the
// `pl-pkg` build/prepublish scripts, and the canonical devDeps (runenv
// from the catalog, package-builder via the `sdk:` sentinel).

import {
  ensureField,
  ensureScript,
  ensureDevDeps,
  enforceAlphabeticalOrder,
  enforceFieldOrder,
} from "../engine/api";
import { canonicalPackageJsonOrder } from "./shared/key-order";

export function softwarePackageJsonRules(): void {
  ensureField("type", "module");
  ensureField("files", ["./dist/**/*"]);

  ensureScript("build", "pl-pkg build");
  ensureScript("prepublishOnly", "pl-pkg prepublish");

  ensureDevDeps({
    "@platforma-open/milaboratories.runenv-python-3": "catalog:",
    "@platforma-sdk/package-builder": "sdk:",
  });

  // Match oxfmt: alphabetise dependency sections (no-op on absent sections).
  enforceAlphabeticalOrder("dependencies");
  enforceAlphabeticalOrder("devDependencies");
  enforceAlphabeticalOrder("peerDependencies");
  enforceAlphabeticalOrder("optionalDependencies");
  enforceFieldOrder([...canonicalPackageJsonOrder]);
}
