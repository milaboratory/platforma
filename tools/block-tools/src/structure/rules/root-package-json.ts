// Root `package.json`: the initial generator and the drift-correcting body
// rules, co-located. The body re-asserts the canonical scripts, devDeps,
// peerDeps, and the final field-order projection (enforceFieldOrder is the
// LAST call).

import {
  ensureField,
  ensureScript,
  ensureDevDeps,
  ensurePeerDeps,
  removeField,
  pruneKeysMatching,
  enforceAlphabeticalOrder,
  enforceFieldOrder,
  type RunContext,
} from "../engine/api";
import { canonicalPackageJsonOrder } from "./shared/key-order";

export function rootPackageJsonInitial(_ctx: RunContext): Record<string, unknown> {
  // No `name`: the root is never published. Body rules re-assert
  // (removeField("name")) as a drift-corrector.
  return {
    version: "1.0.0",
    private: true,
    scripts: {
      fmt: "turbo run fmt",
      check: "turbo run check",
      build: "turbo run build",
      "build:dev": "env PL_PKG_DEV=local turbo run build",
      test: "env PL_PKG_DEV=local turbo run test --concurrency 1",
      "test:dry-run": "env PL_PKG_DEV=local turbo run test --dry-run=json",
      "mark-stable": "turbo run mark-stable",
      "do-pack": "turbo run do-pack",
      watch: "turbo watch build",
      changeset: "changeset",
      "version-packages": "changeset version",
      // Deprecated in favour of `update` (the full refresh → install →
      // refresh flow); kept for compatibility.
      "update-sdk": "block-tools structure refresh --update-deps-only",
      update:
        "block-tools structure refresh --update-deps-only && pnpm i && block-tools structure refresh",
    },
    peerDependencies: {
      oxlint: "*",
      oxfmt: "*",
    },
    devDependencies: {
      "@changesets/cli": "catalog:",
      "@milaboratories/ts-builder": "sdk:",
      "@platforma-sdk/block-tools": "sdk:",
      shx: "catalog:",
      turbo: "catalog:",
    },
    packageManager: "pnpm@9.12.0",
  };
}

export function rootPackageJsonRules(): void {
  ensureField("packageManager", "pnpm@9.12.0");

  // Root is never published — it carries no `name`; delete any stray one.
  removeField("name");

  // Canonical lifecycle script set. `test` / `test:dry-run` carry the
  // PL_PKG_DEV wrapper; the live backend's env reaches the integration
  // tests via the turbo `test` task's passThroughEnv (no --env-mode=loose
  // needed).
  ensureScript("fmt", "turbo run fmt");
  ensureScript("check", "turbo run check");
  ensureScript("build", "turbo run build");
  ensureScript("build:dev", "env PL_PKG_DEV=local turbo run build");
  ensureScript("test", "env PL_PKG_DEV=local turbo run test --concurrency 1");
  ensureScript("test:dry-run", "env PL_PKG_DEV=local turbo run test --dry-run=json");
  ensureScript("mark-stable", "turbo run mark-stable");
  ensureScript("do-pack", "turbo run do-pack");
  ensureScript("watch", "turbo watch build");
  ensureScript("changeset", "changeset");
  ensureScript("version-packages", "changeset version");
  // Deprecated in favour of `update`; kept for compatibility.
  ensureScript("update-sdk", "block-tools structure refresh --update-deps-only");
  // Full SDK-update flow: bump catalog (deps-only) → install → re-apply
  // structure against the freshly-pulled deps, wrapped as one script.
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

  // Strip committed dev-machine override clutter: keys like "//pnpm",
  // "///pnpm", "--" carrying a pnpm/overrides sub-object (often absolute
  // local paths). Left in place these are unknown top-level keys that oxfmt
  // shoves past the canonical sections, breaking `oxfmt --check`.
  pruneKeysMatching((key, value): boolean => {
    if (!/^(\/\/|--)/.test(key)) return false;
    if (typeof value !== "object" || value === null) return false;
    const v = value as { pnpm?: unknown; overrides?: unknown };
    return v.pnpm !== undefined || v.overrides !== undefined;
  });

  enforceAlphabeticalOrder("dependencies");
  enforceAlphabeticalOrder("devDependencies");
  enforceAlphabeticalOrder("peerDependencies");
  enforceAlphabeticalOrder("optionalDependencies");
  enforceFieldOrder([...canonicalPackageJsonOrder]);
}
