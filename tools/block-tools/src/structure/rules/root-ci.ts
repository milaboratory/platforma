// Root-scope CI workflows — the block's GitHub Actions `build.yaml` and
// `mark-stable.yaml`. Engine-OWNED (`fixed`): rewritten verbatim on every
// refresh, generated from the block's identity (short name); everything else
// is a constant baked into the templates.
//
// Why fixed, not managed: previously each block carried a hand-copied
// workflow pinning the shared reusable workflow at `@v4` (a moving branch),
// so a breaking shared-CI change was absorbed silently and per-block edits
// drifted. Engine-owning the file makes the pin + job wiring centrally
// refreshable; the only per-block bits are derived (app-name, slug), so
// nothing author-tunable is clobbered.
//
// Standalone blocks only — `--sdk-internal` blocks (`etc/blocks/*`) carry no
// per-block workflow (the monorepo owns their CI), hence the
// `when(!isSdkInternal)` guard, matching the rest of the root scope.

import { scope, when, fixed, tpl } from "../engine/api";

/** Readable default CI label from a short name (`mixcr-clonotyping-2` →
 *  `Mixcr Clonotyping 2`). Dash/underscore words, title-cased. Human-curated
 *  casing (e.g. `MiXCR`) is not recoverable from the slug — this is a
 *  generated label, not the marketing name. */
function humanizeShortName(shortName: string): string {
  return shortName
    .split(/[-_]+/)
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function rootCiRules(): void {
  scope("root", () => {
    when(
      ({ ctx }) => !ctx.isSdkInternal,
      () => {
        fixed(
          ".github/workflows/build.yaml",
          tpl("workflows/build.tpl.yaml", (ctx) => {
            const shortName = ctx.blockVars.shortName;
            return {
              appName: `Block: ${humanizeShortName(shortName)}`,
              appNameSlug: `block-${shortName}`,
            };
          }),
        );
        fixed(
          ".github/workflows/mark-stable.yaml",
          tpl("workflows/mark-stable.tpl.yaml", (ctx) => ({
            appName: `Block: ${humanizeShortName(ctx.blockVars.shortName)} - Mark Stable`,
          })),
        );
      },
    );
  });
}
