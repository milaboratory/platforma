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
  removeField,
  pruneKeysMatching,
  enforceAlphabeticalOrder,
  enforceFieldOrder,
} from "../engine/api";
import { canonicalPackageJsonOrder } from "./shared/key-order";

export function rootPackageJsonRules(): void {
  ensureField("packageManager", "pnpm@9.12.0");

  // Root is never published — it carries no `name` (D2). Every real
  // canonical block root (mixcr/clonotype/antibody/sequence-properties) is
  // already nameless; the scaffold actively deletes any stray `name`.
  removeField("name");

  // Canonical lifecycle script set — learned from the boilerplate (the
  // authority `init` replaces) and the real canonical block roots. 5b
  // wrongly stripped build:dev/test:dry-run/mark-stable as "not canonical";
  // they are lifecycle-orchestration scripts with no replacement, so the
  // scaffold preserves them (the legacyCleanup removals are reverted).
  // Values match the boilerplate — `test`/`test:dry-run` carry the
  // PL_PKG_DEV wrapper; the live backend's env reaches the integration tests
  // via the turbo `test` task's passThroughEnv (no --env-mode=loose needed).
  ensureScript("fmt", "turbo run fmt");
  ensureScript("check", "turbo run check");
  ensureScript("build", "turbo run build");
  ensureScript("build:dev", "env PL_PKG_DEV=local turbo run build");
  ensureScript("test", "env PL_PKG_DEV=local turbo run test --concurrency 1");
  ensureScript("test:dry-run", "env PL_PKG_DEV=local turbo run test --dry-run=json");
  ensureScript("mark-stable", "turbo run mark-stable");
  ensureScript("watch", "turbo watch build");
  ensureScript("changeset", "changeset");
  ensureScript("version-packages", "changeset version");
  ensureScript("update-sdk", "block-tools structure refresh --update-deps-only");
  // Full SDK-update flow: bump catalog (deps-only) → install → re-apply
  // structure against the freshly-pulled deps (the two-step protocol from
  // spec.md § "refresh", wrapped as one script).
  ensureScript(
    "update",
    "block-tools structure refresh --update-deps-only && pnpm i && block-tools structure refresh",
  );

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

  // Strip dev-machine override clutter: keys like "//pnpm", "///pnpm", "--"
  // carrying a pnpm/overrides sub-object (often absolute local paths). Left
  // in place these are unknown keys that oxfmt would shove past the canonical
  // sections, breaking `oxfmt --check`. (content-rules.md § root clutter.)
  pruneKeysMatching((key, value): boolean => {
    if (!/^(\/\/|--)/.test(key)) return false;
    if (typeof value !== "object" || value === null) return false;
    const v = value as { pnpm?: unknown; overrides?: unknown };
    return v.pnpm !== undefined || v.overrides !== undefined;
  });

  // Match oxfmt: alphabetise dependency sections (no-op on absent sections).
  enforceAlphabeticalOrder("dependencies");
  enforceAlphabeticalOrder("devDependencies");
  enforceAlphabeticalOrder("peerDependencies");
  enforceAlphabeticalOrder("optionalDependencies");
  enforceFieldOrder([...canonicalPackageJsonOrder]);
}
