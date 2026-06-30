// Block-scope rules — the facade package at `block/`. The facade is the
// only sibling of a block that publishes: a slim 4-file `src/` surface
// (engine-owned `index.ts` + `AGENTS.ts`, author-owned `block-extra.ts` +
// `agents-extra.ts`), a facade `tsconfig.json`, and a slim publishable
// `package.json`. Workspace-scope deps in the body resolve from ctx.modules.

import {
  scope,
  fixed,
  scaffold,
  managed,
  seed,
  remove,
  file,
  tpl,
  binaryFile,
  generate,
} from "../engine/api";
import { blockPackageJsonInitial, blockPackageJsonRules } from "./block-package-json";
import { pascalCase } from "./shared/pascal-case";

export function blockRules(): void {
  scope("block", () => {
    // `remove` is idempotent (absent file → no-op), so this is safe on a block
    // that has no such entry files.
    remove("index.js");
    remove("index.d.ts");

    // Four-file source surface. `index.ts` is engine-owned and per-block
    // (model import path + `<PascalName>` aliases) → text-templated. `AGENTS.ts`
    // is engine-owned and identical for every block → static. The two `*-extra`
    // files are author scaffolds (`scaffold`: create-if-missing on every refresh,
    // never overwritten).
    fixed(
      "src/index.ts",
      tpl("block/src/index.tpl.ts", (ctx) => ({
        facadeName: ctx.blockVars.facadeName,
        pascalName: pascalCase(ctx.blockVars.shortName),
      })),
    );
    fixed("src/AGENTS.ts", file("block/src/AGENTS.ts"));
    scaffold("src/block-extra.ts", file("block/src/block-extra.ts"));
    scaffold("src/agents-extra.ts", file("block/src/agents-extra.ts"));

    fixed("tsconfig.json", file("block/tsconfig.json"));

    // Placeholder logos referenced by `block.meta` (logo + organization.logo).
    // Binary seeds: written once at init, author-owned thereafter — refresh
    // never overwrites them, so a custom logo survives. `block-tools pack`
    // embeds these into the block pack; without them pack would fail on the
    // `file:logos/...` meta references.
    seed("logos/block-logo.png", binaryFile("block/logos/block-logo.png"));
    seed("logos/organization-logo.png", binaryFile("block/logos/organization-logo.png"));

    managed(
      "package.json",
      generate((ctx) => blockPackageJsonInitial(ctx)),
      (ctx) => {
        blockPackageJsonRules(ctx);
      },
    );
  });
}
