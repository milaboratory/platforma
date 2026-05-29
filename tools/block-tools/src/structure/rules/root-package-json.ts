// Root `package.json` content rules.
// Initial skeleton in templates/generated/root-package-json.ts; this body
// adds canonical scripts, devDeps, peerDeps, and the final field-order
// projection. enforceFieldOrder is the LAST call (explicit opt-in per
// content-rules.md).

import {
  ensureField,
  ensureScript,
  ensureDevDeps,
  ensurePeerDeps,
  enforceFieldOrder,
} from "../engine/api";
import { canonicalPackageJsonOrder } from "./shared/key-order";

export function rootPackageJsonRules(): void {
  ensureField("packageManager", "pnpm@9.12.0");

  ensureScript("fmt", "turbo run fmt");
  ensureScript("check", "turbo run check");
  ensureScript("build", "turbo run build");
  ensureScript("test", "turbo run test");
  ensureScript("update-sdk", "block-tools structure refresh --update-deps-only");

  ensureDevDeps({
    "@changesets/cli": "catalog:",
    "@milaboratories/ts-builder": "sdk:",
    "@platforma-sdk/block-tools": "sdk:",
    shx: "catalog:",
    turbo: "catalog:",
  });

  ensurePeerDeps({
    oxlint: "*",
    oxfmt: "*",
  });

  enforceFieldOrder([...canonicalPackageJsonOrder]);
}
