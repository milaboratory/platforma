// Update-deps-mode catalog rules. The single `onUpdateDeps(...)` frame
// here is what makes `block-tools structure refresh --update-deps-only`
// do anything: its leaves fire only when `ctx.updateDepsOnly` is true,
// and every other rule in the structure is skipped in that mode (and
// these are skipped on a default refresh). See dsl-example.md
// § "Update-Deps Mode Block" and spec.md § "refresh".
//
// The network call lives in `bumpCatalogToLatest`, which reads prefetched
// "latest" versions from the runner's `registryLookup` (the CLI prefetches
// the catalog's package versions before the run; unit tests pass a mock).
// Wrapped in the same root-scope `when(!isSdkInternal)` guard as the rest
// of the root rules — internal blocks get their catalog from the parent
// monorepo, so catalog bumps never apply there.

import { onUpdateDeps, scope, when, managed, generate, bumpCatalogToLatest } from "../engine/api";
import { rootPnpmWorkspaceInitial } from "../templates/generated/root-pnpm-workspace";

export function rootCatalogBumpRules(): void {
  onUpdateDeps(() => {
    scope("root", () => {
      when(
        ({ ctx }) => !ctx.isSdkInternal,
        () => {
          // `initial` is never exercised in update-deps-only mode (you
          // only bump deps on an existing block), but a ContentForm is
          // required; reuse the same generator root.ts uses.
          managed(
            "pnpm-workspace.yaml",
            generate(() => rootPnpmWorkspaceInitial()),
            () => {
              bumpCatalogToLatest(/^@platforma-sdk\//);
              bumpCatalogToLatest(/^@milaboratories\//);
            },
          );
        },
      );
    });
  });
}
