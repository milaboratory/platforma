// Block-level (orchestrator) `package.json` content rules.
// Workspace-scope deps reflect the discovered modules at run time.

import {
  ensureField,
  ensureScript,
  ensureDevDep,
  ensureWorkspaceScopeDeps,
  enforceAlphabeticalOrder,
  enforceFieldOrder,
} from "../engine/api";
import { canonicalPackageJsonOrder } from "./shared/key-order";
import { blockComponents } from "../templates/generated/block-package-json";

export function blockPackageJsonRules(): void {
  // type:"module" intentionally omitted: the facade's index.js is the
  // CommonJS dev-block descriptor (module.exports / __dirname); ESM would
  // break it. The facade has no TS sources to compile.
  ensureField("files", ["index.d.ts", "index.js"]);

  ensureScript("build", "shx rm -rf ./block-pack && block-tools pack");
  ensureScript(
    "mark-stable",
    "block-tools mark-stable -r 's3://milab-euce1-prod-pkgs-s3-block-registry/pub/releases/?region=eu-central-1'",
  );
  ensureScript(
    "prepublishOnly",
    "block-tools pack && block-tools publish -r 's3://milab-euce1-prod-pkgs-s3-block-registry/pub/releases/?region=eu-central-1'",
  );
  ensureScript(
    "do-pack",
    "shx rm -f *.tgz && block-tools pack && pnpm pack && shx mv *.tgz package.tgz",
  );

  // One workspace dep per discovered module in the facade's scopes. The
  // facade depends on model / ui / workflow — not software (the workflow
  // owns it) and not test (a reciprocal dep would be a pnpm/turbo cycle).
  ensureWorkspaceScopeDeps("model");
  ensureWorkspaceScopeDeps("ui");
  ensureWorkspaceScopeDeps("workflow");

  ensureDevDep("@platforma-sdk/block-tools", "sdk:");
  // shx powers the cross-platform build / do-pack scripts above.
  ensureDevDep("shx", "catalog:");

  // `block.components` is fully determined by the discovered modules — keep
  // it in sync on refresh. `block.meta` is deliberately NOT touched here: it
  // is an author-owned seed (set once in the init package.json), so refresh
  // must never overwrite the author's title / description / logo.
  ensureField("block.components", blockComponents());

  enforceAlphabeticalOrder("dependencies");
  enforceAlphabeticalOrder("devDependencies");
  enforceAlphabeticalOrder("peerDependencies");
  enforceAlphabeticalOrder("optionalDependencies");
  enforceFieldOrder([...canonicalPackageJsonOrder]);
}
