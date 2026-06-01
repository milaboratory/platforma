// Catalog version-resolution rules. The single `onInitOrUpdate(...)` frame
// here resolves the SDK catalog families to npm latest. Its leaves fire on
// `init` AND `refresh --update-deps-only` (mode "init" + "updateDeps") —
// both mean "fetch and write current versions" — and are skipped on a
// default refresh/check, which leaves catalog versions exactly as the
// author/lockfile has them.
//
// The network call lives in `bumpCatalogToLatest`, which reads prefetched
// "latest" versions from the runner's `registryLookup` (the CLI / init
// constructor prefetches the SDK catalog versions before the run; unit
// tests pass a mock). Wrapped in the same root-scope `when(!isSdkInternal)`
// guard as the rest of the root rules — internal blocks get their catalog
// from the parent monorepo, so catalog resolution never applies there.

import { onInitOrUpdate, scope, when, managed, generate, bumpCatalogToLatest } from "../engine/api";
import { getActiveRunContext } from "../engine/builders";
import { rootPnpmWorkspaceInitial } from "./root-pnpm-workspace";

export function rootCatalogBumpRules(): void {
  onInitOrUpdate(() => {
    scope("root", () => {
      when(
        ({ ctx }) => !ctx.isSdkInternal,
        () => {
          // On init, the default root rules create pnpm-workspace.yaml from
          // this same generator (the curated SDK floor); this leaf then
          // overwrites the SDK entries with npm latest. On update-deps the
          // file already exists, so `initial` is not exercised — but a
          // ContentForm is required, so reuse the generator.
          managed(
            "pnpm-workspace.yaml",
            generate(() => rootPnpmWorkspaceInitial(getActiveRunContext())),
            () => {
              // SDK families → exact latest (default modifier). Infra /
              // runtime entries don't match these patterns and stay floored.
              bumpCatalogToLatest(/^@platforma-sdk\//);
              bumpCatalogToLatest(/^@milaboratories\//);
            },
          );
        },
      );
    });
  });
}
