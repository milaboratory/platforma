// Root `package.json`: the initial generator and the drift-correcting body
// rules, co-located. The body re-asserts the canonical scripts, devDeps,
// peerDeps, and the final field-order projection (enforceFieldOrder is the
// LAST call).

import {
  ensureField,
  ensureScript,
  ensureDevDeps,
  ensurePeerDeps,
  removeScript,
  removeField,
  pruneKeysMatching,
  enforceAlphabeticalOrder,
  enforceFieldOrder,
} from "../engine/api";
import { canonicalPackageJsonOrder } from "./shared/key-order";

// `variant=all` builds every variant the software declares — docker-vs-binary is not a per-script
// choice. `no-software` builds placeholder software for validators.

const BUILD_SCRIPTS: Record<string, string> = {
  "build:dev-local":
    "env PL_BUILD_CHANNEL=dev PL_BUILD_VARIANT=all PL_BUILD_LOCATION=local turbo run build",
  "build:dev-remote":
    "env PL_BUILD_CHANNEL=dev PL_BUILD_VARIANT=all PL_BUILD_LOCATION=remote turbo run build",
  "build:dev-no-software": "env PL_BUILD_CHANNEL=dev PL_BUILD_VARIANT=none turbo run build",
  "build:dev-binary-existing":
    "env PL_BUILD_CHANNEL=dev PL_BUILD_USE_PUBLISHED=true turbo run build",
  "build:release":
    "env PL_BUILD_CHANNEL=release PL_BUILD_VARIANT=all PL_BUILD_LOCATION=remote turbo run build",
};

// `test` / `test:dry-run` run the build-then-test DAG in the dev-binary-local target; the live
// backend's env reaches the integration tests via the turbo `test` task's passThroughEnv.
const TEST_SCRIPTS: Record<string, string> = {
  test: `env PL_BUILD_CHANNEL=dev PL_BUILD_VARIANT=binary PL_BUILD_LOCATION=local turbo run test --concurrency 1`,
  "test:dry-run": `env PL_BUILD_CHANNEL=dev PL_BUILD_VARIANT=binary PL_BUILD_LOCATION=local turbo run test --dry-run=json`,
};

export function rootPackageJsonInitial(): Record<string, unknown> {
  // No `name`: the root is never published. Body rules re-assert
  // (removeField("name")) as a drift-corrector.
  return {
    version: "1.0.0",
    private: true,
    scripts: {
      fmt: "turbo run fmt",
      check: "turbo run check",
      ...BUILD_SCRIPTS,
      ...TEST_SCRIPTS,
      "mark-stable": "turbo run mark-stable",
      "do-pack": "turbo run do-pack",
      watch: "turbo watch build",
      changeset: "changeset",
      "version-packages": "changeset version",
      // Deprecated alias of `upgrade-sdk`; kept for compatibility.
      "update-sdk": "block-tools structure refresh --update-deps-only",
      "upgrade-sdk":
        "block-tools structure refresh --update-deps-only && pnpm i && block-tools structure refresh && pnpm i && pnpm fmt",
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

  // Canonical lifecycle script set. The live backend's env reaches the
  // integration tests via the turbo `test` task's passThroughEnv (no
  // --env-mode=loose needed).
  ensureScript("fmt", "turbo run fmt");
  ensureScript("check", "turbo run check");
  for (const [name, command] of Object.entries(BUILD_SCRIPTS)) {
    ensureScript(name, command);
  }
  for (const [name, command] of Object.entries(TEST_SCRIPTS)) {
    ensureScript(name, command);
  }
  // No bare `build` — a developer must pick a scenario (`build:dev-local`, `build:release`,
  // …). Drop the legacy plain `build` and the old single `build:dev` so migrated blocks converge.
  removeScript("build");
  removeScript("build:dev");
  ensureScript("mark-stable", "turbo run mark-stable");
  ensureScript("do-pack", "turbo run do-pack");
  ensureScript("watch", "turbo watch build");
  ensureScript("changeset", "changeset");
  ensureScript("version-packages", "changeset version");
  // `update-sdk` is a deprecated alias of `upgrade-sdk`, kept for compatibility;
  // `update` is the pre-rename name — drop it so refreshed blocks converge.
  ensureScript("update-sdk", "block-tools structure refresh --update-deps-only");
  removeScript("update");
  // Full SDK-upgrade flow: bump catalog (deps-only) → install → re-apply
  // structure against the freshly-pulled deps → install AGAIN (the structural
  // pass can add new devDeps — e.g. ts-builder/oxlint/oxfmt on a first
  // migration — that `pnpm fmt` then needs on PATH) → format. Wrapped as one
  // script. `pnpm fmt` (turbo run fmt) leaves the tree oxfmt-clean after the
  // structural rewrite so a follow-up `pnpm check` passes.
  ensureScript(
    "upgrade-sdk",
    "block-tools structure refresh --update-deps-only && pnpm i && block-tools structure refresh && pnpm i && pnpm fmt",
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
