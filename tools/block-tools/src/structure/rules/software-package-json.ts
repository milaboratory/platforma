// Software `package.json` content rules. One body, N modules — fan-out is
// driven by `ctx.modules`.
//
// Drift-correctors only: identity (name/version), `description`, and the
// `block-software` descriptor are author-owned / opaque and left untouched
// — re-asserting them would clobber real multi-software blocks on refresh.
// The body enforces the structural essentials: ESM type, the publish
// `files` glob, the lifecycle scripts, and the canonical devDeps.

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
  ensureScript("changeset", "changeset");
  ensureScript("version-packages", "changeset version");

  ensureDevDeps({
    "@platforma-open/milaboratories.runenv-python-3": "catalog:",
    "@platforma-sdk/package-builder": "sdk:",
  });

  enforceAlphabeticalOrder("dependencies");
  enforceAlphabeticalOrder("devDependencies");
  enforceAlphabeticalOrder("peerDependencies");
  enforceAlphabeticalOrder("optionalDependencies");
  enforceFieldOrder([...canonicalPackageJsonOrder]);
}
