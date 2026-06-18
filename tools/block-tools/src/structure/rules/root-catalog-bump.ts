// Catalog version-resolution + seeding rules. The single `onInitOrUpdate(...)`
// frame here resolves the SDK catalog families to npm latest AND seeds any
// missing standard catalog keys (SDK families + the curated infra floor +
// the python runenv pin). Its leaves fire on `init` AND
// `refresh --update-deps-only` (mode "init" + "updateDeps") — both mean
// "write current versions" — and are skipped on a default refresh/check,
// which leaves catalog versions exactly as the author/lockfile has them.
//
// The network value lives in `ensureCatalogLatest`, which reads prefetched
// "latest" versions from the runner's `registryLookup` (the CLI / init
// constructor prefetches the SDK catalog membership list before the run;
// unit tests pass a mock). Seeding the SDK keys from the membership list
// (not the on-disk catalog) is what fixes the install failures: a
// migrated block that never carried `@milaboratories/ts-builder` etc. now
// gets them ADDED on `--update-deps-only`, no manual catalog seed required.
//
// Wrapped in the same root-scope `when(!isSdkInternal)` guard as the rest of
// the root rules — internal blocks get their catalog from the parent
// monorepo, so catalog resolution never applies there.

import {
  onInitOrUpdate,
  scope,
  when,
  managed,
  generate,
  ensureCatalogLatest,
  ensureCatalogVersion,
  pinCatalogToDependencyOf,
} from "../engine/api";
import { getActiveRunContext } from "../engine/builders";
import {
  rootPnpmWorkspaceInitial,
  SDK_CATALOG_PACKAGES,
  INFRA_CATALOG_FLOOR,
  DERIVED_CATALOG_PINS,
  RUNENV_PYTHON,
  RUNENV_PYTHON_VERSION,
} from "./root-pnpm-workspace";

export function rootCatalogBumpRules(): void {
  onInitOrUpdate(() => {
    scope("root", () => {
      when(
        ({ ctx }) => !ctx.isSdkInternal,
        () => {
          // On init, the default root rules create pnpm-workspace.yaml from
          // this same generator (the curated SDK placeholders + infra
          // floor); this leaf then overwrites the SDK entries with npm
          // latest (the floor entries are add-if-absent no-ops). On
          // update-deps the file already exists, so `initial` is not
          // exercised — but a ContentForm is required, so reuse the
          // generator.
          managed(
            "pnpm-workspace.yaml",
            generate((ctx) => rootPnpmWorkspaceInitial(ctx)),
            () => {
              // SDK families → npm latest, ADD-IF-ABSENT (seeds a migrated
              // block's missing standard keys + overwrites the init
              // placeholder).
              for (const name of SDK_CATALOG_PACKAGES) ensureCatalogLatest(name);
              // Derived catalog pins → the EXACT version their source package
              // declares (e.g. `vue` from `@platforma-sdk/ui-vue`). OVERWRITES
              // (seeds when absent, tightens a loose on-disk entry). Resolved
              // by the prefetched `derivedPinLookup`; a no-op when absent
              // (default refresh passes none). Must run AFTER ensureCatalogLatest
              // — the source package's own version is bumped there first.
              for (const pin of DERIVED_CATALOG_PINS) {
                pinCatalogToDependencyOf(pin.entry, { of: pin.of, ofVersion: pin.ofVersion });
              }
              // Curated infra floor → fixed version, ADD-IF-ABSENT (seeds
              // shx/turbo/vitest/changesets when missing; never touches a
              // version the block already pins).
              for (const [name, version] of Object.entries(INFRA_CATALOG_FLOOR)) {
                ensureCatalogVersion(name, version);
              }
              // The python runenv pin is relevant only to software-bearing
              // blocks; seed it add-if-absent when one is present.
              if (getActiveRunContext().modules.some((m) => m.scope === "software")) {
                ensureCatalogVersion(RUNENV_PYTHON, RUNENV_PYTHON_VERSION);
              }
            },
          );
        },
      );
    });
  });
}
